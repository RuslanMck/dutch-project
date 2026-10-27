// Word business rules: creating with kind detection and duplicate skipping, changes, status (which follows the FSRS
// schedule once practice is set up), word errors and lookup-or-create for MCP. Publishes 'words' change events after
// each commit.
import { NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';
import { describeCardState, parseCard } from '../practice/fsrs-scheduling.js';
import { findStartOfDay, formatCalendarDateInTimeZone } from '../practice/practice-calendar.js';
import { detectWordKind } from './expression-detection.js';

const DEFAULT_SEARCH_LIMIT = 20;
const LOOKUP_SEARCH_LIMIT = 1000;
const FSRS_STATUS_MESSAGE = 'status follows the FSRS schedule; only "new" can be set';

export function createWordService({
  wordRepository,
  topicRepository,
  sectionService,
  priorityService,
  practiceSettings,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  function getWord(wordId) {
    const word = wordRepository.findWordById(wordId);
    if (!word) throw new NotFoundError(`word ${wordId} not found`);
    return addScheduleFields([word])[0];
  }

  // Filters by status, topic, priority, due time and card state, then by search text (nl or uk) and section, then
  // applies the limit. dueBefore is a timestamp in milliseconds.
  function listWords({ status, topic, q, sort, section, limit, state, priority, dueBefore } = {}) {
    let words = addScheduleFields(wordRepository.listWords({
      learningStatus: status,
      topicName: topic,
      priority,
      dueBefore,
      sortOrder: sort,
    }));
    if (state) words = words.filter(word => word.state === state);
    if (q) words = words.filter(word => isMatchingSearchText(word, q.toLowerCase()));
    if (section !== undefined) words = words.filter(word => word.section === section);
    if (limit) words = words.slice(0, limit);
    return words;
  }

  // UTC milliseconds of 00:00 on the calendar date (YYYY-MM-DD) in the practice time zone.
  function calculateStartOfCalendarDay(calendarDate) {
    return findStartOfDay(calendarDate, practiceSettings.readSettings().timeZone);
  }

  // Case-insensitive search on nl and uk; exact nl matches first, then by added date.
  function searchWords({ query, limit = DEFAULT_SEARCH_LIMIT }) {
    const searchText = query.toLowerCase();
    const isExactMatch = word => word.nl.toLowerCase() === searchText;
    const matchingWords = wordRepository.listWords().filter(word => isMatchingSearchText(word, searchText));
    matchingWords.sort((first, second) => Number(isExactMatch(second)) - Number(isExactMatch(first)));
    return addScheduleFields(matchingWords.slice(0, limit));
  }

  // The word enters the priority ranking in the same transaction, so its priority is never missing.
  function createWord(wordInput) {
    const newWord = mapWordInputToNewWord(wordInput);
    const wordId = runInTransaction(() => {
      const insertedWordId = insertWordWithLessonErrors(newWord);
      priorityService.assignNewWordRanking([insertedWordId]);
      return insertedWordId;
    });
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
      priorityService.assignNewWordRanking(insertedWordIds);
      return { addedWordIds: insertedWordIds, skippedWords: duplicateWords };
    });
    if (addedWordIds.length) changeEventBus.publishChange('words');
    return { added: addedWordIds.map(getWord), skipped: skippedWords };
  }

  // Only the given fields change. Changing nl re-detects the kind unless a kind is given. Changing nl or section
  // re-ranks the word and recalculates its priority.
  function updateWord(wordId, wordChanges) {
    runInTransaction(() => {
      getWord(wordId);
      wordRepository.updateWord(wordId, mapWordChangesToColumns(wordChanges));
      if (wordChanges.nl !== undefined || wordChanges.section !== undefined) {
        priorityService.assignNewWordRanking([wordId]);
      }
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
    return updateWord(wordId, { status: learningStatus });
  }

  // Writes the attempt and, when wrong, one error. The status never changes here: it follows the FSRS schedule.
  function recordPracticeResult(wordId, { correct, mode, answer, wrong_answer: wrongAnswerAlias }) {
    const answerText = mapBlankTextToNull(answer ?? wrongAnswerAlias);
    runInTransaction(() => {
      getWord(wordId);
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
    });
    changeEventBus.publishChange('words');
    return getWord(wordId);
  }

  // Adds the practice error of a wrong grade. Runs inside the caller's transaction (grading) and publishes nothing:
  // the caller publishes after its own commit.
  function recordPracticeError({ wordId, occurredAt, wrongAnswer }) {
    wordRepository.createWordError({ wordId, occurredAt, source: 'practice', mode: 'translate', wrongAnswer });
  }

  // Adds one error. The schedule and the status do not change: grading in practice is what moves a word.
  function logWordError(wordId, { source, wrong_answer: wrongAnswer, mode }) {
    runInTransaction(() => {
      getWord(wordId);
      wordRepository.createWordError({
        wordId,
        occurredAt: clock.now(),
        source,
        mode: mode ?? null,
        wrongAnswer: mapBlankTextToNull(wrongAnswer),
      });
    });
    changeEventBus.publishChange('words');
    return getWord(wordId);
  }

  // Finds the word by id, or by exact nl (case-insensitive; the article picks between homographs), creates it
  // as new when it is missing, and logs one error on it. Returns { word, created }.
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
        word = createWord({ nl, uk, article: article ?? '', section, status: 'new' });
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

  // Adds the schedule as REST and MCP show it: the FSRS state of the card and the calendar day the word is due. The
  // card itself is internal and is left out of the result.
  function addScheduleFields(words) {
    if (words.length === 0) return words;
    const { timeZone } = practiceSettings.readSettings();
    return words.map(({ fsrs_card: fsrsCard, ...word }) => ({
      ...word,
      state: describeCardState(parseCard(fsrsCard)),
      next_due_on: word.due_at === null ? null : formatCalendarDateInTimeZone(word.due_at, timeZone),
    }));
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
      learningStatus: resolveNewWordStatus(newWord.learningStatus),
      addedAt: timestamp,
    });
    for (let errorIndex = 0; errorIndex < newWord.lessonErrorCount; errorIndex += 1) {
      wordRepository.createWordError({ wordId, occurredAt: timestamp, source: 'lesson' });
    }
    return wordId;
  }

  // Once FSRS is set up, a new word starts as new and enters rotation through the daily quota.
  function resolveNewWordStatus(requestedStatus) {
    return practiceSettings.isFsrsActive() ? 'new' : requestedStatus;
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
    if (wordChanges.status !== undefined) Object.assign(columnChanges, mapStatusChangeToColumns(wordChanges.status));
    columnChanges.updatedAt = clock.now();
    return columnChanges;
  }

  // Before FSRS is set up, a status is set directly. After it, status follows the schedule: 'new' takes the word out
  // of rotation by clearing its card and its learning-deck place, and learning or learned come only from grading.
  function mapStatusChangeToColumns(learningStatus) {
    if (!practiceSettings.isFsrsActive()) return { learningStatus };
    if (learningStatus !== 'new') throw new ValidationError(FSRS_STATUS_MESSAGE);
    return {
      learningStatus,
      fsrsCard: null,
      dueAt: null,
      introducedOn: null,
      deckRequiredCorrect: null,
      deckCorrectCount: 0,
      deckEnteredByLapse: 0,
    };
  }

  return Object.freeze({
    getWord,
    listWords,
    calculateStartOfCalendarDay,
    searchWords,
    createWord,
    createWords,
    updateWord,
    deleteWord,
    updateWordStatus,
    recordPracticeResult,
    recordPracticeError,
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
