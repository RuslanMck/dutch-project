// REST adapter for words and topics, mounted under /api: parses the request with the contracts and calls the word
// service.
import express from 'express';

import {
  createWordInputSchema,
  listWordsQuerySchema,
  logWordErrorInputSchema,
  recordPracticeResultInputSchema,
  updateWordInputSchema,
  wordPathParametersSchema,
} from '../../contracts/word-contracts.js';
import { readRequestBody, removeBlankQueryValues } from '../../http/request-input.js';

export function createWordRoutes({ wordService }) {
  const wordRouter = express.Router();

  wordRouter.get('/words', (request, response) => {
    response.json(wordService.listWords(listWordsQuerySchema.parse(removeBlankQueryValues(request.query))));
  });

  wordRouter.post('/words', (request, response) => {
    response.status(201).json(wordService.createWord(createWordInputSchema.parse(readRequestBody(request))));
  });

  wordRouter.patch('/words/:id', (request, response) => {
    const { id } = wordPathParametersSchema.parse(request.params);
    response.json(wordService.updateWord(id, updateWordInputSchema.parse(readRequestBody(request))));
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
