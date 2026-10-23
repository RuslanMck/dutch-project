// REST adapter for texts, mounted under /api: parses the request with the contracts and calls the text service.
import express from 'express';

import {
  createTextInputSchema,
  textPathParametersSchema,
  updateTextInputSchema,
} from '../../contracts/text-contracts.js';
import { readRequestBody } from '../../http/request-input.js';

export function createTextRoutes({ textService }) {
  const textRouter = express.Router();

  textRouter.get('/texts', (request, response) => response.json(textService.listTexts()));

  textRouter.get('/texts/:id', (request, response) => {
    response.json(textService.getText(textPathParametersSchema.parse(request.params).id));
  });

  textRouter.post('/texts', (request, response) => {
    response.status(201).json(textService.createText(createTextInputSchema.parse(readRequestBody(request))));
  });

  textRouter.patch('/texts/:id', (request, response) => {
    const { id } = textPathParametersSchema.parse(request.params);
    response.json(textService.updateText(id, updateTextInputSchema.parse(readRequestBody(request))));
  });

  textRouter.delete('/texts/:id', (request, response) => {
    textService.deleteText(textPathParametersSchema.parse(request.params).id);
    response.json({ ok: true });
  });

  return textRouter;
}
