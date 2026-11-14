// REST adapter for statistics, mounted under /api.
import express from 'express';

import {
  activityQuerySchema,
  calendarQuerySchema,
  dailyGoalBodySchema,
  weekQuerySchema,
} from '../../contracts/statistics-contracts.js';
import { readRequestBody, removeBlankQueryValues } from '../../http/request-input.js';

export function createStatisticsRoutes({ statisticsService }) {
  const statisticsRouter = express.Router();
  statisticsRouter.get('/stats', (request, response) => response.json(statisticsService.calculateStatistics()));
  statisticsRouter.get('/stats/activity', (request, response) => {
    const activityInput = activityQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(statisticsService.calculateActivity({ period: activityInput.period }));
  });
  statisticsRouter.get('/stats/calendar', (request, response) => {
    const calendarInput = calendarQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(statisticsService.calculateCalendar({ days: calendarInput.days }));
  });
  statisticsRouter.get('/stats/week', (request, response) => {
    const weekInput = weekQuerySchema.parse(removeBlankQueryValues(request.query));
    response.json(statisticsService.calculateWeek({ week: weekInput.week }));
  });
  statisticsRouter.get('/goal', (request, response) => response.json(statisticsService.calculateDailyGoal()));
  statisticsRouter.put('/goal', (request, response) => {
    const goalInput = dailyGoalBodySchema.parse(readRequestBody(request));
    response.json(statisticsService.saveDailyGoal({ goal: goalInput.goal }));
  });
  return statisticsRouter;
}
