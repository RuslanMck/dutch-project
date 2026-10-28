// Starts the practice over: every word and phrase goes back to New (no card, not due, not introduced, out of the
// learning decks in both directions), the practice sets are cleared and every review log, deck answer and phrase answer
// that still counts is superseded, so sessions start over and the next batch is a set of new words. Review logs,
// deck answers and word errors are kept as history. Publishes 'words' and 'phrases' after the commit of a real reset.
const NEW_LEARNING_STATUS = 'new';

export function createPracticeResetService({
  practiceRepository,
  phrasePracticeRepository,
  practiceSettings,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  // The default dry run only counts what would be reset. The scheduled rows are read inside the transaction, so the
  // counts and the writes see the same data. Returns { dry_run, words_reset, phrases_reset }.
  function resetPractice({ isDryRun = true } = {}) {
    practiceSettings.readActiveSettings();
    const summary = runInTransaction(() => {
      const scheduledWords = practiceRepository.listPracticeWords().filter(isScheduled);
      const scheduledPhrases = phrasePracticeRepository.listPracticePhrases().filter(isScheduled);
      const counts = { dry_run: isDryRun, words_reset: scheduledWords.length, phrases_reset: scheduledPhrases.length };
      if (isDryRun) return counts;
      const timestamp = clock.now();
      for (const word of scheduledWords) {
        practiceRepository.updateWordSchedule(word.id, { learningStatus: NEW_LEARNING_STATUS, updatedAt: timestamp });
      }
      for (const phrase of scheduledPhrases) {
        phrasePracticeRepository.updatePhraseSchedule(phrase.id, { learningStatus: NEW_LEARNING_STATUS });
      }
      practiceRepository.markReviewLogsSuperseded(timestamp);
      practiceRepository.markDeckAnswersSuperseded(timestamp);
      practiceRepository.clearDeck();
      phrasePracticeRepository.markPhraseReviewLogsSuperseded(timestamp);
      phrasePracticeRepository.markPhraseAnswersSuperseded(timestamp);
      practiceSettings.saveWordSet(null);
      practiceSettings.savePhraseSet(null);
      return counts;
    });
    if (!isDryRun) {
      changeEventBus.publishChange('words');
      changeEventBus.publishChange('phrases');
    }
    return summary;
  }

  return Object.freeze({ resetPractice });
}

// A word or phrase is in rotation when it has a card or was introduced; both go back to New on a reset.
function isScheduled(item) {
  return item.fsrs_card !== null || item.introduced_on !== null || item.due_at !== null;
}
