// Word business rules: creating with kind detection and duplicate skipping, changes, practice results and
// word errors. Publishes 'words' change events after each commit.
import { NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';
import { detectWordKind } from './expression-detection.js';

const DEFAULT_SEARCH_LIMIT = 20;
const LOOKUP_SEARCH_LIMIT = 1000;

export function createWordService({
  wordRepository,
  topicRepository,
  sectionService,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  function getWord(wordId) {
    const word = wordRepository.findWordById(wordId);
    if (!word) throw new NotFoundError(`word ${wordId} not found`);
    return word;
  }

  // Filters by status and topic, then by search text (nl or uk) and section, then applies the limit.
  function listWords({ status, topic, q, sort, section, limit } = {}) {
    let words = wordRepository.listWords({ learningStatus: status, topicName: topic, sortOrder: sort });
    if (q) words = words.filter(word => isMatchingSearchText(word, q.toLowerCase()));
    if (section !== undefined) words = words.filter(word => word.section === section);
    if (limit) words = words.slice(0, limit);
    return words;
  }

  // Case-insensitive search on nl and uk; exact nl matches first, then by added date.
  function searchWords({ query, limit = DEFAULT_SEARCH_LIMIT }) {
    const searchText = query.toLowerCase();
    const isExactMatch = word => word.nl.toLowerCase() === searchText;
    const matchingWords = wordRepository.listWords().filter(word => isMatchingSearchText(word, searchText));
    matchingWords.sort((first, second) => Number(isExactMatch(second)) - Number(isExactMatch(first)));
    return matchingWords.slice(0, limit);
  }

  function createWord(wordInput) {
    const newWord = mapWordInputToNewWord(wordInput);
    const wordId = runInTransaction(() => insertWordWithLessonErrors(newWord));
    changeEventBus.publishChange('words');
    return getWord(wordId);
  }

  // A word whose nl (case-insensitive) and article match an existing word is skipped when shouldSkipExisting.
  function createWords(wordInputs, { shouldSkipExisting = true } = {}) {
    const newWords = wordInputs.map(mapWordInputToNewWord);
    const { addedWordIds, skippedWords } = runInTransaction(() => {
      const existingWordIdByKey = new Map(wordRepository.listWordTextsAndArticles()
        .map(word => [formatDuplicateKey(word.nl, word.article), word.id]));
      const insertedWordIds = [];
      const duplicateWords = [];
      for (const newWord of newWords) {
        const duplicateKey = formatDuplicateKey(newWord.dutchText, newWord.article);
        if (shouldSkipExisting && existingWordIdByKey.has(duplicateKey)) {
          duplicateWords.push({ nl: newWord.dutchText, existing_id: existingWordIdByKey.get(duplicateKey) });
          continue;
        }
        const wordId = insertWordWithLessonErrors(newWord);
        existingWordIdByKey.set(duplicateKey, wordId);
        insertedWordIds.push(wordId);
      }
      return { addedWordIds: insertedWordIds, skippedWords: duplicateWords };
    });
    if (addedWordIds.length) changeEventBus.publishChange('words');
    return { added: addedWordIds.map(getWord), skipped: skippedWords };
  }

  // Only the given fields change. Changing nl re-detects the kind unless a kind is given.
  function updateWord(wordId, wordChanges) {
    runInTransaction(() => {
      getWord(wordId);
      wordRepository.updateWord(wordId, mapWordChangesToColumns(wordChanges));
    });
    changeEventBus.publishChange('words');
    return getWord(wordId);
  }

  function deleteWord(wordId) {
    runInTransaction(() => {
      getWord(wordId);
      wordRepository.deleteWord(wordId);
    });
    changeEventBus.publishChange('words');
  }

  function updateWordStatus(wordId, learningStatus) {
    runInTransaction(() => {
      getWord(wordId);
      wordRepository.updateWord(wordId, { learningStatus, updatedAt: clock.now() });
    });
    changeEventBus.publishChange('words');
    return getWord(wordId);
  }

  // Correct: learning becomes learned, new stays new. Wrong: the word becomes learning and gets one error.
  function recordPracticeResult(wordId, { correct, mode, answer, wrong_answer: wrongAnswerAlias }) {
    const answerText = mapBlankTextToNull(answer ?? wrongAnswerAlias);
    runInTransaction(() => {
      const word = getWord(wordId);
      const timestamp = clock.now();
      wordRepository.createPracticeAttempt({
        wordId,
        attemptedAt: timestamp,
        mode,
        answer: answerText,
        isCorrect: correct,
      });
      if (!correct) {
        wordRepository.createWordError({
          wordId,
          occurredAt: timestamp,
          source: 'practice',
          mode,
          wrongAnswer: answerText,
        });
      }
      const learningStatus = calculateStatusAfterPractice(word.status, correct);
      wordRepository.updateWord(wordId, { learningStatus, updatedAt: timestamp });
    });
    changeEventBus.publishChange('words');
    return getWord(wordId);
  }

  // Adds one error and sets the word to learning.
  function logWordError(wordId, { source, wrong_answer: wrongAnswer, mode }) {
    runInTransaction(() => {
      getWord(wordId);
      const timestamp = clock.now();
      wordRepository.createWordError({
        wordId,
        occurredAt: timestamp,
        source,
        mode: mode ?? null,
        wrongAnswer: mapBlankTextToNull(wrongAnswer),
      });
      wordRepository.updateWord(wordId, { learningStatus: 'learning', updatedAt: timestamp });
    });
    changeEventBus.publishChange('words');
    return getWord(wordId);
  }

  // Finds the word by id, or by exact nl (case-insensitive; the article picks between homographs), creates it
  // as learning when it is missing, and logs one error on it. Returns { word, created }.
  function logWordErrorByLookup({ id, nl, uk, article, source, wrong_answer: wrongAnswer, section }) {
    let word;
    let created = false;
    if (id !== undefined) {
      word = getWord(id);
    } else {
      if (!nl) throw new ValidationError('give id, or nl to find the word');
      word = findWordByDutchText(nl, article);
      if (!word) {
        if (!uk) throw new ValidationError(`word "${nl}" not found; give uk to create it`);
        word = createWord({ nl, uk, article: article ?? '', section, status: 'learning' });
        created = true;
      }
    }
    const updatedWord = logWordError(word.id, { source: source ?? 'lesson', wrong_answer: wrongAnswer });
    return { word: updatedWord, created };
  }

  function listTopics() {
    return topicRepository.listTopicsWithWordCounts();
  }

  // Returns the topic's id, or null when there is no topic name.
  function ensureTopic(topicName) {
    return topicName ? topicRepository.ensureTopic(topicName) : null;
  }

  function findWordByDutchText(dutchText, article) {
    const searchText = dutchText.trim().toLowerCase();
    const exactMatches = searchWords({ query: dutchText, limit: LOOKUP_SEARCH_LIMIT })
      .filter(word => word.nl.toLowerCase() === searchText);
    const hasArticle = article !== undefined && article !== null;
    return exactMatches.find(word => hasArticle && word.article === article) ?? exactMatches[0] ?? null;
  }

  // Inserts the word and its lesson errors; returns the new id. Runs inside the caller's transaction.
  function insertWordWithLessonErrors(newWord) {
    const timestamp = clock.now();
    const wordId = wordRepository.createWord({
      dutchText: newWord.dutchText,
      ukrainianText: newWord.ukrainianText,
      article: newWord.article,
      kind: newWord.kind,
      exampleDutch: newWord.exampleDutch,
      exampleUkrainian: newWord.exampleUkrainian,
      topicId: ensureTopic(newWord.topicName),
      sectionCode: sectionService.ensureSection(newWord.sectionCode),
      learningStatus: newWord.learningStatus,
      addedAt: timestamp,
    });
    for (let errorIndex = 0; errorIndex < newWord.lessonErrorCount; errorIndex += 1) {
      wordRepository.createWordError({ wordId, occurredAt: timestamp, source: 'lesson' });
    }
    return wordId;
  }

  function mapWordChangesToColumns(wordChanges) {
    const columnChanges = {};
    if (wordChanges.nl !== undefined) columnChanges.dutchText = wordChanges.nl;
    if (wordChanges.uk !== undefined) columnChanges.ukrainianText = wordChanges.uk;
    if (wordChanges.article !== undefined) columnChanges.article = wordChanges.article ?? '';
    if (wordChanges.kind !== undefined) columnChanges.kind = wordChanges.kind;
    else if (wordChanges.nl !== undefined) columnChanges.kind = detectWordKind(wordChanges.nl);
    if (wordChanges.example_nl !== undefined) columnChanges.exampleDutch = mapBlankTextToNull(wordChanges.example_nl);
    if (wordChanges.example_uk !== undefined) {
      columnChanges.exampleUkrainian = mapBlankTextToNull(wordChanges.example_uk);
    }
    if (wordChanges.section !== undefined) {
      columnChanges.sectionCode = sectionService.ensureSection(mapBlankTextToNull(wordChanges.section));
    }
    if (wordChanges.topic !== undefined) columnChanges.topicId = ensureTopic(mapBlankTextToNull(wordChanges.topic));
    if (wordChanges.status !== undefined) columnChanges.learningStatus = wordChanges.status;
    columnChanges.updatedAt = clock.now();
    return columnChanges;
  }

  return Object.freeze({
    getWord,
    listWords,
    searchWords,
    createWord,
    createWords,
    updateWord,
    deleteWord,
    updateWordStatus,
    recordPracticeResult,
    logWordError,
    logWordErrorByLookup,
    listTopics,
    ensureTopic,
  });
}

function mapWordInputToNewWord(wordInput) {
  return {
    dutchText: wordInput.nl,
    ukrainianText: wordInput.uk,
    article: wordInput.article ?? '',
    kind: wordInput.kind ?? detectWordKind(wordInput.nl),
    exampleDutch: mapBlankTextToNull(wordInput.example_nl),
    exampleUkrainian: mapBlankTextToNull(wordInput.example_uk),
    sectionCode: mapBlankTextToNull(wordInput.section),
    topicName: mapBlankTextToNull(wordInput.topic),
    learningStatus: wordInput.status ?? 'new',
    lessonErrorCount: wordInput.err ?? 0,
  };
}

function isMatchingSearchText(word, searchText) {
  return word.nl.toLowerCase().includes(searchText) || word.uk.toLowerCase().includes(searchText);
}

function formatDuplicateKey(dutchText, article) {
  return `${dutchText.toLowerCase()}\u0000${article}`;
}

function calculateStatusAfterPractice(learningStatus, isCorrect) {
  if (!isCorrect) return 'learning';
  return learningStatus === 'learning' ? 'learned' : learningStatus;
}
