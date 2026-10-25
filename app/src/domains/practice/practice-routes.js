// REST adapter for the practice, mounted under /api: parses each request with the practice contracts and calls the
// practice, phrase practice and priority services.
import express from 'express';

import {
  addExtraNewWordsInputSchema,
  gradePhraseInputSchema,
  gradeWordInputSchema,
  practiceBatchQuerySchema,
  previewPrioritiesQuerySchema,
} from '../../contracts/practice-contracts.js';
import { readRequestBody, removeBlankQueryValues } from '../../http/request-input.js';

export function createPracticeRoutes({ practiceService, priorityService, phrasePracticeService }) {
  const practiceRouter = express.Router();

  practiceRouter.get('/practice/batch', (request, response) => {
    const batchInput = practiceBatchQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(practiceService.getPracticeBatch({
      sessionId: batchInput.session_id,
      maxReviews: batchInput.max_reviews,
    }));
  });

  practiceRouter.post('/practice/grades', (request, response) => {
    const gradeInput = gradeWordInputSchema.parse(readRequestBody(request));
    response.json(practiceService.gradeWord({
      wordId: gradeInput.word_id,
      grade: gradeInput.grade,
      answer: gradeInput.answer,
      sessionId: gradeInput.session_id,
    }));
  });

  practiceRouter.get('/practice/phrases/batch', (request, response) => {
    const batchInput = practiceBatchQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(phrasePracticeService.getPhraseBatch({
      sessionId: batchInput.session_id,
      maxReviews: batchInput.max_reviews,
    }));
  });

  practiceRouter.post('/practice/phrases/grades', (request, response) => {
    const gradeInput = gradePhraseInputSchema.parse(readRequestBody(request));
    response.json(phrasePracticeService.gradePhrase({
      phraseId: gradeInput.phrase_id,
      grade: gradeInput.grade,
      sessionId: gradeInput.session_id,
    }));
  });

  practiceRouter.post('/practice/extra-new-words', (request, response) => {
    const extraInput = addExtraNewWordsInputSchema.parse(readRequestBody(request));
    response.json(practiceService.addExtraNewWords({ count: extraInput.count }));
  });

  practiceRouter.get('/practice/stats', (request, response) => {
    response.json(practiceService.calculatePracticeStatistics());
  });

  practiceRouter.get('/practice/priorities/preview', (request, response) => {
    const previewInput = previewPrioritiesQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(priorityService.previewPriorities({ chapter: previewInput.chapter }));
  });

  return practiceRouter;
}
