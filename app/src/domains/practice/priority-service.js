// Practice priorities: recalculates each word's priority, ranks words by the frequency list, previews priorities for
// a chapter and imports the frequency list. Publishes 'words' after each write.
import { NotFoundError } from '../../errors/domain-errors.js';
import {
  calculateFrequencyRank,
  calculatePriority,
  compareQueueOrder,
  parseChapterNumber,
} from './priority-calculation.js';

const PREVIEW_EXAMPLE_LIMIT = 10;

export function createPriorityService({
  practiceRepository,
  frequencyRepository,
  practiceSettings,
  runInTransaction,
  changeEventBus,
}) {
  // Recalculates the priority of the given words (all words when no ids are given). Returns how many changed.
  function recalculatePriorities({ wordIds } = {}) {
    const changedWordCount = runInTransaction(() => recalculatePrioritiesInTransaction({ wordIds }));
    changeEventBus.publishChange('words');
    return changedWordCount;
  }

  // The same recalculation for a caller that already holds a transaction (the FSRS migration). Publishes nothing: the
  // caller publishes after its own commit.
  function recalculatePrioritiesInTransaction({ wordIds } = {}) {
    const { currentChapter } = practiceSettings.readSettings();
    const words = wordIds
      ? wordIds.map(wordId => practiceRepository.findPracticeWordById(wordId)).filter(Boolean)
      : practiceRepository.listPracticeWords();
    let changedWordCount = 0;
    for (const word of words) {
      if (refreshPriority(word, { currentChapter, frequencyRank: word.frequency_rank })) changedWordCount += 1;
    }
    return changedWordCount;
  }

  // Gives a word just added its frequency rank and priority. Runs inside the caller's transaction and publishes
  // nothing: the caller publishes after its own commit.
  function assignNewWordRanking(wordIds) {
    const { currentChapter } = practiceSettings.readSettings();
    for (const wordId of wordIds) {
      const word = getPracticeWordOrThrow(wordId);
      const frequencyRank = calculateFrequencyRank(word.nl, frequencyRepository.findRankByForm);
      practiceRepository.updateWordFrequencyRank(wordId, frequencyRank);
      refreshPriority(word, { currentChapter, frequencyRank });
    }
  }

  // priority: 1, 2, 3 for a manual override, or null to clear it and go back to the computed priority.
  function setWordPriority(wordId, priority) {
    runInTransaction(() => {
      const word = getPracticeWordOrThrow(wordId);
      const { currentChapter } = practiceSettings.readSettings();
      const priorityOverride = priority ?? null;
      const computedPriority = calculatePriority({
        priorityOverride,
        chapterNumber: parseChapterNumber(word.section_code),
        frequencyRank: word.frequency_rank,
        currentChapter,
      });
      practiceRepository.updateWordPriority(wordId, { priority: computedPriority, priorityOverride });
    });
    changeEventBus.publishChange('words');
  }

  // Saves the chapter, recalculates every word and returns the preview for the new chapter.
  function setCurrentChapter(chapter) {
    runInTransaction(() => {
      practiceSettings.saveCurrentChapter(chapter);
      const { currentChapter } = practiceSettings.readSettings();
      for (const word of practiceRepository.listPracticeWords()) {
        refreshPriority(word, { currentChapter, frequencyRank: word.frequency_rank });
      }
    });
    changeEventBus.publishChange('words');
    return previewPriorities({ chapter });
  }

  // Priorities New words would get with the given chapter as current. Writes nothing.
  function previewPriorities({ chapter } = {}) {
    const { currentChapter } = practiceSettings.readSettings();
    const previewChapter = chapter ?? currentChapter;
    const newWords = practiceRepository.listPracticeWords().filter(word => word.fsrs_card === null);
    const queueEntries = newWords.map(word => mapToPreviewEntry(word, previewChapter)).sort(compareQueueOrder);
    const counts = { 1: 0, 2: 0, 3: 0 };
    const examples = { 1: [], 2: [], 3: [] };
    for (const queueEntry of queueEntries) {
      counts[queueEntry.priority] += 1;
      if (examples[queueEntry.priority].length < PREVIEW_EXAMPLE_LIMIT) {
        examples[queueEntry.priority].push(mapToPreviewExample(queueEntry));
      }
    }
    return {
      chapter: previewChapter,
      counts,
      unranked_count: newWords.filter(word => word.frequency_rank === null).length,
      examples,
    };
  }

  // entries: [{ wordForm, frequencyRank }]. Replaces the whole list, or only adds and updates the given forms.
  // Every word is then re-ranked and its priority recalculated. Returns the counts.
  function importFrequencyList(entries, { shouldReplaceExisting = false } = {}) {
    const importSummary = runInTransaction(() => {
      if (shouldReplaceExisting) frequencyRepository.replaceAllFrequencies(entries);
      else frequencyRepository.upsertFrequencies(entries);
      return rerankAllWords();
    });
    changeEventBus.publishChange('words');
    return { imported: entries.length, ...importSummary };
  }

  function rerankAllWords() {
    const { currentChapter } = practiceSettings.readSettings();
    let rankedWordCount = 0;
    let unrankedWordCount = 0;
    for (const word of practiceRepository.listPracticeWords()) {
      const frequencyRank = calculateFrequencyRank(word.nl, frequencyRepository.findRankByForm);
      if (frequencyRank !== word.frequency_rank) practiceRepository.updateWordFrequencyRank(word.id, frequencyRank);
      refreshPriority(word, { currentChapter, frequencyRank });
      if (frequencyRank === null) unrankedWordCount += 1;
      else rankedWordCount += 1;
    }
    return { words_ranked: rankedWordCount, words_unranked: unrankedWordCount };
  }

  // Writes the priority the word should have now. Returns true when the stored priority changed.
  function refreshPriority(word, { currentChapter, frequencyRank }) {
    const priority = calculatePriority({
      priorityOverride: word.priority_override,
      chapterNumber: parseChapterNumber(word.section_code),
      frequencyRank,
      currentChapter,
    });
    if (priority === word.priority) return false;
    practiceRepository.updateWordPriority(word.id, { priority });
    return true;
  }

  function getPracticeWordOrThrow(wordId) {
    const word = practiceRepository.findPracticeWordById(wordId);
    if (!word) throw new NotFoundError(`word ${wordId} not found`);
    return word;
  }

  return Object.freeze({
    recalculatePriorities,
    recalculatePrioritiesInTransaction,
    assignNewWordRanking,
    setWordPriority,
    setCurrentChapter,
    previewPriorities,
    importFrequencyList,
  });
}

function mapToPreviewEntry(word, previewChapter) {
  const chapterNumber = parseChapterNumber(word.section_code);
  const priority = calculatePriority({
    priorityOverride: word.priority_override,
    chapterNumber,
    frequencyRank: word.frequency_rank,
    currentChapter: previewChapter,
  });
  return {
    id: word.id,
    nl: word.nl,
    uk: word.uk,
    section: word.section_code,
    priority,
    chapterNumber,
    frequencyRank: word.frequency_rank,
  };
}

function mapToPreviewExample(queueEntry) {
  return {
    id: queueEntry.id,
    nl: queueEntry.nl,
    uk: queueEntry.uk,
    section: queueEntry.section,
    frequency_rank: queueEntry.frequencyRank,
  };
}
