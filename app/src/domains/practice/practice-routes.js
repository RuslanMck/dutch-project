// REST adapter for the practice, mounted under /api: parses each request with the practice contracts and calls the
// practice, phrase practice and priority services.
import express from 'express';

import {
  drillAnswerInputSchema,
  drillWordsQuerySchema,
  gradePhraseInputSchema,
  gradeWordInputSchema,
  practiceBatchQuerySchema,
  previewPrioritiesQuerySchema,
  spareWordsQuerySchema,
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
      direction: gradeInput.direction,
      answeredAt: gradeInput.answered_at,
      clientAnswerId: gradeInput.client_answer_id,
      setWordIds: gradeInput.set_word_ids,
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
      direction: gradeInput.direction,
    }));
  });

  // Read only: the summary of the current set.
  practiceRouter.get('/practice/round-summary', (request, response) => {
    response.json(practiceService.getRoundSummary());
  });

  practiceRouter.get('/practice/stats', (request, response) => {
    response.json(practiceService.calculatePracticeStatistics());
  });

  // Read only: the drill grades nothing, so it writes nothing.
  practiceRouter.get('/practice/struggling-words', (request, response) => {
    response.json(practiceService.listStrugglingWords());
  });

  // Read only: the words of a custom drill, in the order of ids; unknown ids are skipped.
  practiceRouter.get('/practice/drill-words', (request, response) => {
    const drillInput = drillWordsQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(practiceService.getDrillWords({ wordIds: drillInput.ids }));
  });

  // Read only: the words the next set will most likely draw from, for the phone to keep offline.
  practiceRouter.get('/practice/spare-words', (request, response) => {
    const spareInput = spareWordsQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(practiceService.getSpareWords({ sessionId: spareInput.session_id }));
  });

  // A checked answer of a custom drill: logged for the statistics, the schedule does not move.
  practiceRouter.post('/practice/drill-answers', (request, response) => {
    const drillInput = drillAnswerInputSchema.parse(readRequestBody(request));
    response.status(201).json(practiceService.recordDrillAnswer({
      wordId: drillInput.word_id,
      direction: drillInput.direction,
      isCorrect: drillInput.is_correct,
      answer: drillInput.answer ?? '',
      source: drillInput.source,
      answeredAt: drillInput.answered_at,
      clientAnswerId: drillInput.client_answer_id,
    }));
  });

  practiceRouter.get('/practice/priorities/preview', (request, response) => {
    const previewInput = previewPrioritiesQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(priorityService.previewPriorities({ chapter: previewInput.chapter }));
  });

  return practiceRouter;
}
