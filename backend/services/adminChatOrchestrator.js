import { AppError } from '../utils/AppError.js';
import {
  createAdminChatContext,
  mergeAdminChatFollowUp,
  validateAdminChatContext,
  validateAdminChatIntent,
} from '../utils/adminChatIntentValidator.js';
import {
  answerAdminGeneralQuestion,
  classifyAdminChatQuestion,
  getAdminChatAuditModelName,
} from './adminChatGeminiService.js';
import { executeAdminChatAnalyticsIntent } from '../models/adminChatAnalyticsModel.js';

const UNSUPPORTED_ANSWER = 'I can help with AgriConnect questions and supported platform analytics.';

function getPersistedContext(context) {
  if (
    context === null
    || context === undefined
    || (
      typeof context === 'object'
      && !Array.isArray(context)
      && Object.keys(context).length === 0
    )
  ) {
    return null;
  }
  try {
    return validateAdminChatContext(context);
  } catch {
    throw new AppError(500, 'Stored administrator chat context is invalid.');
  }
}

function formatRelativePeriod(range) {
  if (!range) return null;
  if (range.type === 'custom') {
    return `from ${range.from} through ${range.to}`;
  }
  const labels = {
    today: 'today',
    last_7_days: 'in the last 7 days',
    last_30_days: 'in the last 30 days',
    this_month: 'this month',
    last_month: 'last month',
  };
  return labels[range.value];
}

function formatCountScope(result, intent) {
  const { filters } = intent;
  let subject;
  let dateVerb;

  if (result.entity === 'users') {
    const roleLabels = { farmer: 'farmers', buyer: 'buyers' };
    subject = roleLabels[filters.role] || 'users';
    if (filters.status) subject = `${filters.status} ${subject}`;
    dateVerb = 'registered';
  } else if (result.entity === 'crops') {
    if (filters.status === 'available') {
      subject = 'available crops';
    } else if (filters.status) {
      subject = `${filters.status.replace('_', ' ')} crops`;
    } else if (filters.category) {
      subject = `crops in ${filters.category}`;
    } else {
      subject = 'crops';
    }
    dateVerb = 'added';
  } else {
    subject = filters.orderStatus
      ? `${filters.orderStatus} orders`
      : 'orders';
    dateVerb = 'created';
  }

  if (filters.category && result.entity === 'crops' && filters.status) {
    subject += ` in ${filters.category}`;
  }
  const period = formatRelativePeriod(filters.dateRange);
  if (period) subject += ` ${dateVerb} ${period}`;

  const locations = filters.location
    ? [filters.location.state, filters.location.district].filter(Boolean)
    : [];
  if (locations.length) subject += ` in ${locations.join(', ')}`;

  return subject;
}

function formatAggregateResult(result, intent) {
  if (result.operation === 'compare_periods') {
    return `The ${result.entity} count was ${result.current.count} `
      + `from ${result.current.from} through ${result.current.to}, and `
      + `${result.previous.count} from ${result.previous.from} through ${result.previous.to}.`;
  }
  if (result.metric === 'gross_delivered_order_value') {
    return `Gross delivered order value was ${result.current.value} `
      + `from ${result.current.from} through ${result.current.to}, and `
      + `${result.previous.value} from ${result.previous.from} through ${result.previous.to}. `
      + 'This is not platform revenue.';
  }
  if (result.operation === 'delivered_order_value') {
    return `Gross delivered order value is ${result.grossDeliveredOrderValue}. `
      + 'This is not platform revenue.';
  }
  return `The aggregate count for ${formatCountScope(result, intent)} is ${result.count}.`;
}

export function createAdminChatOrchestrator({
  classify = classifyAdminChatQuestion,
  executeAnalytics = executeAdminChatAnalyticsIntent,
  answerGeneral = answerAdminGeneralQuestion,
  env = process.env,
} = {}) {
  const modelName = getAdminChatAuditModelName(env);

  return async function processAdminChatQuestion({
    question,
    previousContext: rawPreviousContext,
    onIntent,
  }) {
    const previousContext = getPersistedContext(rawPreviousContext);
    const rawIntent = await classify({ question, previousContext });
    const validatedIntent = validateAdminChatIntent(rawIntent);
    const intent = validatedIntent.intent === 'follow_up'
      ? mergeAdminChatFollowUp(validatedIntent, previousContext)
      : validatedIntent;
    if (typeof onIntent === 'function') {
      onIntent(intent);
    }

    let result = null;
    let assistantContent;
    if (intent.intent === 'analytics' || intent.intent === 'follow_up') {
      result = await executeAnalytics(intent);
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new AppError(503, 'Unable to retrieve administrator analytics right now.');
      }
      assistantContent = formatAggregateResult(result, intent);
    } else if (intent.intent === 'general') {
      assistantContent = answerGeneral(question);
    } else if (intent.intent === 'clarification') {
      assistantContent = intent.clarificationQuestion;
    } else {
      assistantContent = UNSUPPORTED_ANSWER;
    }

    if (typeof assistantContent !== 'string' || !assistantContent.trim()) {
      throw new AppError(503, 'Unable to prepare administrator chat response.');
    }

    const nextContext = createAdminChatContext(intent) || previousContext || null;
    return {
      intent,
      assistantContent: assistantContent.trim(),
      result,
      nextContext,
      modelName,
    };
  };
}

export const processAdminChatQuestion = createAdminChatOrchestrator();
