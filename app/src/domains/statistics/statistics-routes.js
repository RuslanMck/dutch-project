// REST adapter for statistics, mounted under /api.
import express from 'express';

export function createStatisticsRoutes({ statisticsService }) {
  const statisticsRouter = express.Router();
  statisticsRouter.get('/stats', (request, response) => response.json(statisticsService.calculateStatistics()));
  return statisticsRouter;
}
