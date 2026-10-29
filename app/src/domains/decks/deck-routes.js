// REST adapter for custom decks, mounted under /api: parses each request with the deck contracts and calls the deck
// service. /decks/word-catalog is registered before /decks/:id so it is not read as a deck id.
import express from 'express';

import {
  createDeckInputSchema,
  deckPathParametersSchema,
  updateDeckInputSchema,
} from '../../contracts/deck-contracts.js';
import { readRequestBody } from '../../http/request-input.js';

export function createDeckRoutes({ deckService }) {
  const deckRouter = express.Router();

  deckRouter.get('/decks', (request, response) => response.json(deckService.listDecks()));

  deckRouter.get('/decks/word-catalog', (request, response) => response.json(deckService.listWordCatalog()));

  deckRouter.post('/decks', (request, response) => {
    response.status(201).json(deckService.createDeck(createDeckInputSchema.parse(readRequestBody(request))));
  });

  deckRouter.get('/decks/:id', (request, response) => {
    response.json(deckService.getDeck(deckPathParametersSchema.parse(request.params).id));
  });

  deckRouter.patch('/decks/:id', (request, response) => {
    const deckId = deckPathParametersSchema.parse(request.params).id;
    response.json(deckService.updateDeck(deckId, updateDeckInputSchema.parse(readRequestBody(request))));
  });

  deckRouter.delete('/decks/:id', (request, response) => {
    deckService.deleteDeck(deckPathParametersSchema.parse(request.params).id);
    response.json({ ok: true });
  });

  return deckRouter;
}
