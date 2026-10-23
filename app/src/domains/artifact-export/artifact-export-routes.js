// REST adapter for the export, mounted under /api: GET /export downloads all data as dutch-export-<date>.json.
import express from 'express';

export function createArtifactExportRoutes({ artifactExportService }) {
  const artifactExportRouter = express.Router();
  artifactExportRouter.get('/export', (request, response) => {
    response.attachment(artifactExportService.formatExportFileName());
    response.json(artifactExportService.exportCollections());
  });
  return artifactExportRouter;
}
