// REST adapter for phrases, mounted under /api: parses the request with the contracts and calls the phrase service.
import express from 'express';

import { createPhraseInputSchema, phrasePathParametersSchema } from '../../contracts/phrase-contracts.js';
import { readRequestBody } from '../../http/request-input.js';

export function createPhraseRoutes({ phraseService }) {
  const phraseRouter = express.Router();

  phraseRouter.get('/phrases', (request, response) => response.json(phraseService.listPhrases()));

  phraseRouter.post('/phrases', (request, response) => {
    response.status(201).json(phraseService.createPhrase(createPhraseInputSchema.parse(readRequestBody(request))));
  });

  phraseRouter.delete('/phrases/:id', (request, response) => {
    phraseService.deletePhrase(phrasePathParametersSchema.parse(request.params).id);
    response.json({ ok: true });
  });

  return phraseRouter;
}
