// The quick known check: lists the next New words to ask about and records the answers. A word the learner knows gets a
// learned review card (as the FSRS migration gives a learned word) due in 14 to 28 days, status learned, and does not
// count as an answer, a statistic or an achievement. A word not known stays New; it is remembered in known_check_seen
// so the next check shows other words. Words of today's open set are left out. Publishes 'words' after a write.
import { ValidationError } from '../../errors/domain-errors.js';
import { buildMigrationCard, serializeCard } from './fsrs-scheduling.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from './practice-calendar.js';
import { listKnownCheckCandidates, spreadKnownCheckDays } from './known-check-planning.js';

const DEFAULT_LIMIT = 20;
const BOTH_LISTS_MESSAGE = 'одне слово не може бути і знайомим, і незнайомим';

export function createKnownCheckService({
  practiceRepository, practiceSettings, runInTransaction, changeEventBus, clock,
}) {
  // The next New words to ask about, at most limit (the words already shown are left out). remaining: the words
  // after these.
  function getKnownCheck({ limit = DEFAULT_LIMIT } = {}) {
    const settings = practiceSettings.readActiveSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const candidates = listKnownCheckCandidates({
      wordRows: practiceRepository.listPracticeWords(),
      currentChapter: settings.currentChapter,
      seenWordIds: settings.knownCheckSeen,
      openSetWordIds: openSetWordIdsOf(settings, today),
    });
    const words = candidates.slice(0, limit).map(mapToKnownCheckWord);
    return { words, remaining: candidates.length - words.length };
  }

  // knownIds: the words the learner knows; unknownIds: the ones he does not. Ids that are not New words (or are in
  // today's open set) are ignored. Returns the counts and the New words still to ask about.
  function recordKnownCheck({ knownIds = [], unknownIds = [] }) {
    const knownIdSet = new Set(knownIds);
    if (unknownIds.some(wordId => knownIdSet.has(wordId))) throw new ValidationError(BOTH_LISTS_MESSAGE);
    const settings = practiceSettings.readActiveSettings();
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const result = runInTransaction(() => {
      const openSetWordIds = openSetWordIdsOf(settings, today);
      const newWordRows = listKnownCheckCandidates({
        wordRows: practiceRepository.listPracticeWords(),
      currentChapter: settings.currentChapter,
        seenWordIds: [],
        openSetWordIds,
        includeSeen: true,
      });
      const knownWordRows = newWordRows.filter(wordRow => knownIdSet.has(wordRow.id));
      const unknownWordIds = newWordRows.filter(wordRow => unknownIds.includes(wordRow.id)).map(wordRow => wordRow.id);
      const dayOffsets = spreadKnownCheckDays(knownWordRows.length);
      knownWordRows.forEach((wordRow, index) => {
        const dueAt = findStartOfDay(addDaysToCalendarDate(today, dayOffsets[index]), settings.timeZone);
        const card = buildMigrationCard({ group: 'learned', dueAt, timestamp });
        practiceRepository.updateWordSchedule(wordRow.id, {
          fsrsCard: serializeCard(card),
          dueAt,
          // Not introduced through practice: today's introductions and the statistics leave it out.
          introducedOn: null,
          learningStatus: 'learned',
          updatedAt: timestamp,
        });
      });
      const seenWordIds = [...new Set([...settings.knownCheckSeen, ...unknownWordIds])];
      if (unknownWordIds.length) practiceSettings.saveKnownCheckSeen(seenWordIds);
      if (knownWordRows.length) {
        practiceSettings.saveKnownCheckKnown([...new Set([...settings.knownCheckKnown, ...knownWordRows.map(wordRow => wordRow.id)])]);
      }
      const remaining = listKnownCheckCandidates({
        wordRows: practiceRepository.listPracticeWords(),
        currentChapter: settings.currentChapter,
        seenWordIds,
        openSetWordIds,
      }).length;
      return { known: knownWordRows.length, unknown: unknownWordIds.length, remaining };
    });
    if (result.known > 0 || result.unknown > 0) changeEventBus.publishChange('words');
    return result;
  }

  // The ids of today's open set, or none when no set of today is open.
  function openSetWordIdsOf(settings, today) {
    const practiceSet = settings.wordSet;
    if (!practiceSet || practiceSet.openedOn !== today) return [];
    return practiceSet.itemIds;
  }

  return Object.freeze({ getKnownCheck, recordKnownCheck });
}

function mapToKnownCheckWord(wordRow) {
  return { id: wordRow.id, nl: wordRow.nl, article: wordRow.article, uk: wordRow.uk, kind: wordRow.kind };
}
