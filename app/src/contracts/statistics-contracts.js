// Input contracts for the statistics: the period of the learning activity, the calendar, the week recap and the daily
// goal. REST query values arrive as text, so their numbers are read with z.coerce.
import { z } from 'zod';

export const ACTIVITY_PERIODS = Object.freeze(['day', 'week', 'month', 'year', 'all']);
export const WEEK_VALUES = Object.freeze(['current', 'previous']);
export const CALENDAR_DAYS_MINIMUM = 7;
export const CALENDAR_DAYS_MAXIMUM = 371;
export const CALENDAR_DAYS_DEFAULT = 84;
export const DAILY_GOAL_MINIMUM = 5;
export const DAILY_GOAL_MAXIMUM = 500;
export const DAILY_GOAL_DEFAULT = 20;

export const activityQuerySchema = z.object({
  period: z.enum(ACTIVITY_PERIODS).default('week')
    .describe('day: today; week: this calendar week, Monday to Sunday; month: the last 30 days; year: the last 12 months; all: all time'),
}).strict();

export const calendarQuerySchema = z.object({
  days: z.coerce.number().int().min(CALENDAR_DAYS_MINIMUM).max(CALENDAR_DAYS_MAXIMUM).default(CALENDAR_DAYS_DEFAULT)
    .describe('how many days, ending today; 7 to 371'),
}).strict();

export const weekQuerySchema = z.object({
  week: z.enum(WEEK_VALUES).default('current')
    .describe('current: Monday of this week to today; previous: the last Monday to Sunday'),
}).strict();

export const dailyGoalBodySchema = z.object({
  goal: z.number().int().min(DAILY_GOAL_MINIMUM).max(DAILY_GOAL_MAXIMUM)
    .describe('answers per day the learner aims for; 5 to 500'),
}).strict();
