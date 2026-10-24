// Phrase business rules: adding one or several phrases (all or none), deleting, and the schedule the REST and MCP
// show (status and next_due_on in the practice time zone). Publishes 'phrases' change events after each commit.
import { NotFoundError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';
import { formatCalendarDateInTimeZone } from '../practice/practice-calendar.js';

export function createPhraseService({
  phraseRepository,
  sectionService,
  practiceSettings,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  function getPhrase(phraseId) {
    const phrase = phraseRepository.findPhraseById(phraseId);
    if (!phrase) throw new NotFoundError(`phrase ${phraseId} not found`);
    return addScheduleFields([phrase])[0];
  }

  // Newest first; limit is optional.
  function listPhrases({ limit } = {}) {
    const phrases = addScheduleFields(phraseRepository.listPhrasesNewestFirst());
    return limit ? phrases.slice(0, limit) : phrases;
  }

  function createPhrase(phraseInput) {
    const phraseId = runInTransaction(() => insertPhrase(phraseInput));
    changeEventBus.publishChange('phrases');
    return getPhrase(phraseId);
  }

  // One transaction, so a failing item leaves nothing half-added.
  function createPhrases(phraseInputs) {
    const phraseIds = runInTransaction(() => phraseInputs.map(insertPhrase));
    if (phraseIds.length) changeEventBus.publishChange('phrases');
    return phraseIds.map(getPhrase);
  }

  function deletePhrase(phraseId) {
    runInTransaction(() => {
      getPhrase(phraseId);
      phraseRepository.deletePhrase(phraseId);
    });
    changeEventBus.publishChange('phrases');
  }

  function insertPhrase({ nl, uk, context, section }) {
    return phraseRepository.createPhrase({
      dutchText: nl,
      ukrainianText: uk,
      context: mapBlankTextToNull(context),
      sectionCode: sectionService.ensureSection(mapBlankTextToNull(section)),
      addedAt: clock.now(),
    });
  }

  // Replaces due_at with next_due_on, the calendar day it is due in the practice time zone; null for New phrases.
  function addScheduleFields(phrases) {
    if (phrases.length === 0) return phrases;
    const { timeZone } = practiceSettings.readSettings();
    return phrases.map(({ due_at: dueAt, ...phrase }) => ({
      ...phrase,
      next_due_on: dueAt === null ? null : formatCalendarDateInTimeZone(dueAt, timeZone),
    }));
  }

  return Object.freeze({ getPhrase, listPhrases, createPhrase, createPhrases, deletePhrase });
}
