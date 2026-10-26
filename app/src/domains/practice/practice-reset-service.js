// Starts the practice over: every word and phrase goes back to New (no card, not due, not introduced) and the intake
// blocks (with any extra new words) are cleared, so the next batch holds only the day's new words. Review logs and
// word errors are kept as history. Publishes 'words' and 'phrases' after the commit.
import { ConflictError } from '../../errors/domain-errors.js';

const FSRS_NOT_SET_UP_MESSAGE = 'FSRS practice is not set up yet: run migrate_to_fsrs';
const NEW_LEARNING_STATUS = 'new';

export function createPracticeResetService({
  practiceRepository,
  phrasePracticeRepository,
  practiceSettings,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  // The default dry run only counts what would be reset. Returns { dry_run, words_reset, phrases_reset }.
  function resetPractice({ isDryRun = true } = {}) {
    if (!practiceSettings.isFsrsActive()) throw new ConflictError(FSRS_NOT_SET_UP_MESSAGE);
    const scheduledWords = practiceRepository.listPracticeWords().filter(isScheduled);
    const scheduledPhrases = phrasePracticeRepository.listPracticePhrases().filter(isScheduled);
    const summary = { dry_run: isDryRun, words_reset: scheduledWords.length, phrases_reset: scheduledPhrases.length };
    if (isDryRun) return summary;
    const timestamp = clock.now();
    runInTransaction(() => {
      for (const word of scheduledWords) {
        practiceRepository.updateWordSchedule(word.id, { learningStatus: NEW_LEARNING_STATUS, updatedAt: timestamp });
      }
      for (const phrase of scheduledPhrases) {
        phrasePracticeRepository.updatePhraseSchedule(phrase.id, { learningStatus: NEW_LEARNING_STATUS });
      }
      practiceSettings.saveNewWordBlock(null);
      practiceSettings.saveNewPhraseBlock(null);
    });
    changeEventBus.publishChange('words');
    changeEventBus.publishChange('phrases');
    return summary;
  }

  return Object.freeze({ resetPractice });
}

// A word or phrase is in rotation when it has a card or was introduced; both go back to New on a reset.
function isScheduled(item) {
  return item.fsrs_card !== null || item.introduced_on !== null || item.due_at !== null;
}
