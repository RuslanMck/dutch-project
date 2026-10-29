// Custom deck business rules: create, read, update and delete decks of words, and the word catalog the picker shows
// (answer totals, difficulty and the last practice day). A deck never changes a word's schedule. Publishes 'decks'
// after each commit.
import { ConflictError, NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';
import { formatCalendarDateInTimeZone } from '../practice/practice-calendar.js';
import { classifyDifficulty } from '../practice/round-summary.js';

const DUPLICATE_NAME_MESSAGE = 'Колода з такою назвою вже є';
const EMPTY_DECK_MESSAGE = 'a deck needs at least one word';
const MAXIMUM_DECK_WORDS = 1000;
const DECK_FULL_MESSAGE = `у колоді може бути щонайбільше ${MAXIMUM_DECK_WORDS} слів`;

export function createDeckService({ deckRepository, practiceSettings, runInTransaction, changeEventBus, clock }) {
  function listDecks() {
    return deckRepository.listDeckRows();
  }

  // The deck with its words (catalog rows) in the order added.
  function getDeck(deckId) {
    const deck = findDeckRowOrThrow(deckId);
    const { timeZone } = practiceSettings.readSettings();
    return { ...deck, words: deckRepository.listDeckWordRows(deckId).map(row => mapCatalogRow(row, timeZone)) };
  }

  // Every word, by nl, with the fields the picker filters and sorts on.
  function listWordCatalog() {
    const { timeZone } = practiceSettings.readSettings();
    return { words: deckRepository.listCatalogRows().map(row => mapCatalogRow(row, timeZone)) };
  }

  // wordIds: the words of the deck (at least one; repeats are ignored). Every id must be a word.
  function createDeck({ name: givenName, description, word_ids: wordIds }) {
    const name = normalizeDeckName(givenName);
    const deckId = runInTransaction(() => {
      assertNameAvailable(name, null);
      const uniqueWordIds = uniqueIds(wordIds);
      assertDeckSize(uniqueWordIds.length);
      assertWordsExist(uniqueWordIds);
      const timestamp = clock.now();
      const newDeckId = deckRepository.insertDeck({
        name,
        description: mapBlankTextToNull(description),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      deckRepository.insertDeckWords(newDeckId, uniqueWordIds, timestamp);
      return newDeckId;
    });
    changeEventBus.publishChange('decks');
    return getDeck(deckId);
  }

  // An absent field is left alone. word_ids replaces the deck's words; add_word_ids and remove_word_ids change them
  // and cannot be combined with word_ids. description null or '' clears it. A deck may not end with no words.
  function updateDeck(deckId, {
    name: givenName,
    description,
    word_ids: wordIds,
    add_word_ids: addWordIds,
    remove_word_ids: removeWordIds,
  } = {}) {
    const name = givenName === undefined ? undefined : normalizeDeckName(givenName);
    if (wordIds !== undefined && (addWordIds !== undefined || removeWordIds !== undefined)) {
      throw new ValidationError('word_ids replaces the words; do not combine it with add_word_ids or remove_word_ids');
    }
    runInTransaction(() => {
      const existingDeck = findDeckRowOrThrow(deckId);
      if (name !== undefined) assertNameAvailable(name, deckId);
      const timestamp = clock.now();
      if (wordIds !== undefined) {
        const uniqueWordIds = uniqueIds(wordIds);
        assertWordsExist(uniqueWordIds);
        deckRepository.deleteAllDeckWords(deckId);
        deckRepository.insertDeckWords(deckId, uniqueWordIds, timestamp);
      }
      if (removeWordIds !== undefined) deckRepository.deleteDeckWords(deckId, uniqueIds(removeWordIds));
      if (addWordIds !== undefined) {
        const uniqueWordIds = uniqueIds(addWordIds);
        assertWordsExist(uniqueWordIds);
        deckRepository.insertDeckWords(deckId, uniqueWordIds, timestamp);
      }
      const wordCount = deckRepository.countDeckWords(deckId);
      if (wordCount === 0) throw new ValidationError(EMPTY_DECK_MESSAGE);
      assertDeckSize(wordCount);
      deckRepository.updateDeck(deckId, {
        name: name ?? existingDeck.name,
        description: description === undefined ? existingDeck.description : mapBlankTextToNull(description),
        updatedAt: timestamp,
      });
    });
    changeEventBus.publishChange('decks');
    return getDeck(deckId);
  }

  function deleteDeck(deckId) {
    runInTransaction(() => {
      findDeckRowOrThrow(deckId);
      deckRepository.deleteDeck(deckId);
    });
    changeEventBus.publishChange('decks');
  }

  function findDeckRowOrThrow(deckId) {
    const deck = deckRepository.findDeckRow(deckId);
    if (!deck) throw new NotFoundError(`deck ${deckId} not found`);
    return deck;
  }

  // Names are unique ignoring case. Compared in JavaScript, because SQLite's NOCASE folds only ASCII letters. Both
  // sides are NFC, so the same Ukrainian or Dutch letters typed in another form are the same name.
  function assertNameAvailable(name, exceptDeckId) {
    const wantedName = name.toLowerCase();
    const isTaken = deckRepository.listDeckNames()
      .some(deck => deck.id !== exceptDeckId && normalizeDeckName(deck.name).toLowerCase() === wantedName);
    if (isTaken) throw new ConflictError(DUPLICATE_NAME_MESSAGE);
  }

  // More than MAXIMUM_DECK_WORDS words in one deck is refused, so a deck stays a list a learner can drill.
  function assertDeckSize(wordCount) {
    if (wordCount > MAXIMUM_DECK_WORDS) throw new ValidationError(DECK_FULL_MESSAGE);
  }

  function assertWordsExist(wordIds) {
    const existingIds = new Set(deckRepository.findExistingWordIds(wordIds));
    const missingIds = wordIds.filter(wordId => !existingIds.has(wordId));
    if (missingIds.length) throw new ValidationError(`unknown word ids: ${missingIds.join(', ')}`);
  }

  return Object.freeze({
    listDecks,
    getDeck,
    listWordCatalog,
    createDeck,
    updateDeck,
    deleteDeck,
  });
}

function uniqueIds(wordIds) {
  return [...new Set(wordIds)];
}

// Trimmed and in NFC, so a name typed with composed or decomposed letters is stored one way.
function normalizeDeckName(name) {
  return name.normalize('NFC').trim();
}

// One catalog row: difficulty is null when the word was never answered, else the round summary's classification of
// its mistakes; last_practiced_on is the calendar day of its latest answer in the practice time zone.
function mapCatalogRow(row, timeZone) {
  const isAnswered = row.answer_count !== null;
  return {
    id: row.id,
    nl: row.nl,
    uk: row.uk,
    article: row.article,
    section: row.section,
    status: row.status,
    difficulty: isAnswered ? classifyDifficulty(row.mistake_count) : null,
    mistake_count: row.mistake_count ?? 0,
    answer_count: row.answer_count ?? 0,
    last_practiced_on: row.last_answered_at === null
      ? null
      : formatCalendarDateInTimeZone(row.last_answered_at, timeZone),
  };
}
