import { AppError } from '../utils/AppError.js';
import { answerPriceQuestion } from '../services/priceAssistantService.js';

export function createPriceAssistantController(answerQuestion = answerPriceQuestion) {
  return async function postPriceAssistantController(request, response, next) {
    try {
      const result = await answerQuestion(request.body?.question);
      response.status(200).json({
        success: true,
        answer: result.answer,
        dataAsOf: result.dataAsOf,
        source: result.source,
        supportingData: result.supportingData,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      next(new AppError(500, 'Unable to answer the price question.'));
    }
  };
}

export const postPriceAssistantController = createPriceAssistantController();