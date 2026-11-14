// REST adapter for the achievements, mounted under /api.
import express from 'express';

export function createAchievementRoutes({ achievementService }) {
  const achievementRouter = express.Router();

  achievementRouter.get('/achievements', (request, response) => {
    response.json(achievementService.listAchievements());
  });

  return achievementRouter;
}
