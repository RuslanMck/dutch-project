// REST adapter for the word-order exercise, mounted under /api: parses the request with the contracts and calls the
// word-order service.
import express from 'express';

import {
  addSentencesInputSchema,
  answerInputSchema,
  generateInputSchema,
  importInputSchema,
  wordOrderPathParametersSchema,
} from '../../contracts/word-order-contracts.js';
import { readRequestBody } from '../../http/request-input.js';

export function createWordOrderRoutes({ wordOrderService }) {
  const wordOrderRouter = express.Router();

  wordOrderRouter.get('/word-order/sentences', (request, response) => {
    response.json(wordOrderService.listSentences());
  });

  wordOrderRouter.post('/word-order/sentences', (request, response) => {
    const { sentences } = addSentencesInputSchema.parse(readRequestBody(request));
    response.status(201).json(wordOrderService.addSentences(sentences, { source: 'mcp' }));
  });

  wordOrderRouter.delete('/word-order/sentences/:id', (request, response) => {
    wordOrderService.deleteSentence(wordOrderPathParametersSchema.parse(request.params).id);
    response.json({ ok: true });
  });

  wordOrderRouter.get('/word-order/set', (request, response) => {
    response.json(wordOrderService.getSentenceSet());
  });

  wordOrderRouter.post('/word-order/sentences/:id/answer', (request, response) => {
    const { id } = wordOrderPathParametersSchema.parse(request.params);
    const { tiles } = answerInputSchema.parse(readRequestBody(request));
    response.json(wordOrderService.answerSentence({ id, tiles }));
  });

  wordOrderRouter.post('/word-order/import', (request, response) => {
    const { markdown } = importInputSchema.parse(readRequestBody(request));
    response.json(wordOrderService.importMarkdown(markdown));
  });

  wordOrderRouter.post('/word-order/generate', async (request, response) => {
    const { count } = generateInputSchema.parse(readRequestBody(request));
    response.json(await wordOrderService.generateSentences({ count }));
  });

  return wordOrderRouter;
}
