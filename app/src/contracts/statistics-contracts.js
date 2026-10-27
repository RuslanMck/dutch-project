// Input contracts for the statistics: the period of the learning activity.
import { z } from 'zod';

export const ACTIVITY_PERIODS = Object.freeze(['day', 'week', 'month', 'year', 'all']);

export const activityQuerySchema = z.object({
  period: z.enum(ACTIVITY_PERIODS).default('week')
    .describe('day: today; week: the last 7 days; month: the last 30 days; year: the last 12 months; all: all time'),
}).strict();
