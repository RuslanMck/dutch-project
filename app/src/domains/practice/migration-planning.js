// The one-time migration to FSRS, planned without writing: learning words are spread over the next four days, most
// errors first, learned words are due in 21 days and new words stay new. Pure: the caller passes the words, the
// settings and today.
import { addDaysToCalendarDate, findStartOfDay } from './practice-calendar.js';

const LEARNING_MIGRATION_DAY_COUNT = 4;
const LEARNED_MIGRATION_DAY_COUNT = 21;

// Returns the assignments the real run would write: learning words (most errors first) spread over the migration days.
export function planMigration(wordRows, { settings, today }) {
  const learningRows = wordRows
    .filter(word => word.status === 'learning')
    .sort((first, second) => second.error_count - first.error_count || first.id - second.id);
  const learnedRows = wordRows.filter(word => word.status === 'learned');
  const learningAssignments = learningRows.map((word, index) => {
    const dayOffset = Math.floor((index * LEARNING_MIGRATION_DAY_COUNT) / learningRows.length);
    const calendarDate = addDaysToCalendarDate(today, dayOffset);
    return buildAssignment({ word, group: 'learning', calendarDate, settings });
  });
  const learnedDate = addDaysToCalendarDate(today, LEARNED_MIGRATION_DAY_COUNT);
  const learnedAssignments = learnedRows.map(word => buildAssignment({
    word,
    group: 'learned',
    calendarDate: learnedDate,
    settings,
  }));
  const learningDueByDay = {};
  for (let dayOffset = 0; dayOffset < LEARNING_MIGRATION_DAY_COUNT; dayOffset += 1) {
    learningDueByDay[addDaysToCalendarDate(today, dayOffset)] = 0;
  }
  for (const assignment of learningAssignments) {
    learningDueByDay[assignment.calendarDate] += 1;
  }
  return {
    learningAssignments,
    learnedAssignments,
    newWordCount: wordRows.filter(word => word.status === 'new').length,
    learningDueByDay,
    learnedDueOn: learnedDate,
  };
}

function buildAssignment({ word, group, calendarDate, settings }) {
  return { word, group, calendarDate, dueAt: findStartOfDay(calendarDate, settings.timeZone) };
}

export function summarizeMigration(plan, { isDryRun }) {
  return {
    dry_run: isDryRun,
    learning: plan.learningAssignments.length,
    learned: plan.learnedAssignments.length,
    new: plan.newWordCount,
    learning_due_by_day: plan.learningDueByDay,
    learned_due_on: plan.learnedDueOn,
  };
}
