// REST adapter for statistics, mounted under /api.
import express from 'express';

import { activityQuerySchema } from '../../contracts/statistics-contracts.js';
import { removeBlankQueryValues } from '../../http/request-input.js';

export function createStatisticsRoutes({ statisticsService }) {
  const statisticsRouter = express.Router();
  statisticsRouter.get('/stats', (request, response) => response.json(statisticsService.calculateStatistics()));
  statisticsRouter.get('/stats/activity', (request, response) => {
    const activityInput = activityQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(statisticsService.calculateActivity({ period: activityInput.period }));
  });
  return statisticsRouter;
}
