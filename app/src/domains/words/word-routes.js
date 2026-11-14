// REST adapter for words and topics, mounted under /api: parses the request with the contracts and calls the word
// service.
import express from 'express';

import {
  categorizeWordsInputSchema,
  createWordInputSchema,
  listWordsQuerySchema,
  logWordErrorInputSchema,
  recordPracticeResultInputSchema,
  suggestWordsInputSchema,
  updateWordInputSchema,
  wordPathParametersSchema,
  wordPriorityTagInputSchema,
} from '../../contracts/word-contracts.js';
import { readRequestBody, removeBlankQueryValues } from '../../http/request-input.js';

export function createWordRoutes({ wordService }) {
  const wordRouter = express.Router();

  wordRouter.get('/words', (request, response) => {
    const listQuery = listWordsQuerySchema.parse(removeBlankQueryValues(request.query));
    const { due_before: dueBefore, ...wordFilters } = listQuery;
    response.json(wordService.listWords({ ...wordFilters, dueBefore }));
  });

  wordRouter.post('/words', (request, response) => {
    response.status(201).json(wordService.createWord(createWordInputSchema.parse(readRequestBody(request))));
  });

  wordRouter.patch('/words/:id', (request, response) => {
    const { id } = wordPathParametersSchema.parse(request.params);
    response.json(wordService.updateWord(id, updateWordInputSchema.parse(readRequestBody(request))));
  });

  wordRouter.put('/words/:id/priority', (request, response) => {
    const { id } = wordPathParametersSchema.parse(request.params);
    const { tag } = wordPriorityTagInputSchema.parse(readRequestBody(request));
    response.json(wordService.setWordPriorityTag(id, tag));
  });

  wordRouter.post('/words/categorize', async (request, response) => {
    const { limit } = categorizeWordsInputSchema.parse(readRequestBody(request));
    response.json(await wordService.categorizeWords({ limit }));
  });

  wordRouter.post('/words/suggestions', async (request, response) => {
    const { limit } = suggestWordsInputSchema.parse(readRequestBody(request));
    response.json(await wordService.suggestWords({ limit }));
  });

  wordRouter.delete('/words/:id', (request, response) => {
    wordService.deleteWord(wordPathParametersSchema.parse(request.params).id);
    response.json({ ok: true });
  });

  wordRouter.post('/words/:id/result', (request, response) => {
    const { id } = wordPathParametersSchema.parse(request.params);
    const practiceResult = recordPracticeResultInputSchema.parse(readRequestBody(request));
    response.json(wordService.recordPracticeResult(id, practiceResult));
  });

  wordRouter.post('/words/:id/errors', (request, response) => {
    const { id } = wordPathParametersSchema.parse(request.params);
    response.json(wordService.logWordError(id, logWordErrorInputSchema.parse(readRequestBody(request))));
  });

  wordRouter.get('/topics', (request, response) => response.json(wordService.listTopics()));

  return wordRouter;
}
