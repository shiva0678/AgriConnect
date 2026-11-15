import { getPriceAssistantData, getPriceAssistantVocabulary } from '../models/priceAssistantModel.js';
import { AppError } from '../utils/AppError.js';
import { generateGeminiExplanation } from './geminiPriceAssistantService.js';

export const MAX_PRICE_ASSISTANT_QUESTION_LENGTH = 1000;

function normalizePhrase(value) {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function findMentionedValues(question, values) {
  const normalizedQuestion = ` ${normalizePhrase(question)} `;
  return values
    .map((value) => ({
      value,
      index: normalizedQuestion.indexOf(` ${normalizePhrase(value)} `),
      length: normalizePhrase(value).length,
    }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index || right.length - left.length)
    .map((match) => match.value);
}

export function extractPriceAssistantFilters(question, vocabulary) {
  return {
    commodities: findMentionedValues(question, vocabulary.commodities),
    markets: findMentionedValues(question, vocabulary.markets),
    districts: findMentionedValues(question, vocabulary.districts),
    states: findMentionedValues(question, vocabulary.states),
  };
}

function mentionsCurrentPrice(question) {
  return /\b(today|today['’]s|current(?:ly)?|right now|as of now|latest|most recent|up[ -]to[ -]date|live)\b/i.test(question);
}

function mentionsFuturePrices(question) {
  return /\b(forecast|predict(?:ion)?|future|next week|next month|tomorrow|expected to|going to|likely to)\b/i.test(question)
    || (/\bwill\b/i.test(question)
      && /\b(?:price|prices|cost|rise|fall|increase|decrease|go up|go down|reach)\b/i.test(question));
}

function mentionsTrend(question) {
  return /\b(trend|over time|seasonal|seasonality|pattern|rising|falling|increas(?:e|ing)|decreas(?:e|ing))\b/i.test(question);
}

function isBroadQuestion(question) {
  return /\b(all|overall|overview|dataset|available records|highest|lowest|maximum|minimum|average|modal price|price statistics|price data|across markets|market comparison|compare prices|price range|trend|trends|today|today['’]s|current(?:ly)?|right now|as of now|forecast|predict(?:ion)?|future|next week|next month|tomorrow)\b/i.test(question)
    || /\bwhat (?:are|is) (?:the )?prices\b/i.test(question);
}

function normalizePrices(data) {
  const price = (value) => value === null || value === undefined ? null : Number(value);
  const record = (row) => row && ({
    ...row,
    min_price: price(row.min_price),
    max_price: price(row.max_price),
    modal_price: price(row.modal_price),
  });

  return {
    summary: {
      recordCount: Number(data.summary.record_count),
      distinctDateCount: Number(data.summary.distinct_date_count),
      minimumModalPrice: price(data.summary.minimum_modal_price),
      maximumModalPrice: price(data.summary.maximum_modal_price),
      averageModalPrice: price(data.summary.average_modal_price),
      minimumReportedMinPrice: price(data.summary.minimum_reported_min_price),
      maximumReportedMaxPrice: price(data.summary.maximum_reported_max_price),
    },
    marketBreakdown: data.marketBreakdown.map((row) => ({
      market: row.market,
      district: row.district,
      state: row.state,
      averageModalPrice: price(row.average_modal_price),
      minimumModalPrice: price(row.minimum_modal_price),
      maximumModalPrice: price(row.maximum_modal_price),
      recordCount: Number(row.record_count),
    })),
    observations: data.observations.map(record),
    lowestObservation: record(data.lowestObservation),
    highestObservation: record(data.highestObservation),
  };
}

function buildAnswerContext(question, filters, data, dataAsOf) {
  const isCurrentQuestion = mentionsCurrentPrice(question);
  const isFutureQuestion = mentionsFuturePrices(question);
  const isTrendQuestion = mentionsTrend(question);

  if (isCurrentQuestion) {
    return 'The database contains historical observations only and cannot establish today’s prices.';
  }

  if (isFutureQuestion) {
    return 'The database does not support reliable future price predictions.';
  }

  if (data.summary.recordCount === 0) {
    return 'No matching price records were found for the recognized filters.';
  }

  if (isTrendQuestion && data.summary.distinctDateCount <= 1) {
    return 'The matching records contain only one observation date and cannot establish a genuine price trend or seasonal pattern.';
  }

  return null;
}

function appendDataLimitations(answer, data, dataAsOf) {
  const notes = [];
  if (dataAsOf) {
    notes.push(`Source observation date: ${dataAsOf}.`);
  } else {
    notes.push('No observation date is available for this result.');
  }
  if (data.summary.recordCount > 0 && data.summary.distinctDateCount <= 1) {
    notes.push('These records cover a single observation date and do not establish trends, seasonal patterns, or future prices.');
  }

  return notes.length ? `${answer.trim()}\n\n${notes.join(' ')}` : answer.trim();
}

export function createPriceAssistantService({
  getVocabulary = getPriceAssistantVocabulary,
  getData = getPriceAssistantData,
  generateExplanation = generateGeminiExplanation,
  env = process.env,
} = {}) {
  return async function answerPriceQuestion(rawQuestion) {
    if (typeof rawQuestion !== 'string' || !rawQuestion.trim()) {
      throw new AppError(400, 'question must be a non-empty string.');
    }
    const question = rawQuestion.trim();
    if (question.length > MAX_PRICE_ASSISTANT_QUESTION_LENGTH) {
      throw new AppError(400, `question cannot exceed ${MAX_PRICE_ASSISTANT_QUESTION_LENGTH} characters.`);
    }

    try {
      const vocabulary = await getVocabulary();
      const filters = extractPriceAssistantFilters(question, vocabulary);
      const hasRecognizedFilter = Object.values(filters).some((values) => values.length > 0);
      filters.matchNothing = !hasRecognizedFilter && !isBroadQuestion(question);
      const rawData = await getData(filters);
      const data = normalizePrices(rawData);
      const dataAsOf = rawData.summary.data_as_of || rawData.summary.dataset_as_of || null;
      const supportingData = {
        filters,
        ...data,
      };
      const source = {
        table: 'price_history',
        observationDate: dataAsOf,
        recordCount: data.summary.recordCount,
      };
      const deterministicAnswer = buildAnswerContext(question, filters, data, dataAsOf);

      if (deterministicAnswer) {
        return {
          answer: appendDataLimitations(deterministicAnswer, data, dataAsOf),
          dataAsOf,
          source,
          supportingData,
        };
      }

      const answer = await generateExplanation({
        apiKey: env.GEMINI_API_KEY,
        modelName: env.GEMINI_MODEL,
        question,
        facts: supportingData,
        dataAsOf,
      });

      if (typeof answer !== 'string' || !answer.trim()) {
        throw new AppError(503, 'The Price Assistant could not generate an explanation. Please try again later.');
      }

      return {
        answer: appendDataLimitations(answer, data, dataAsOf),
        dataAsOf,
        source,
        supportingData,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, 'Unable to retrieve price assistant information.');
    }
  };
}

export const answerPriceQuestion = createPriceAssistantService();