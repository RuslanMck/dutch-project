// Phrase business rules: adding one or several phrases (all or none) and deleting. Publishes 'phrases' change
// events after each commit.
import { NotFoundError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';

export function createPhraseService({ phraseRepository, sectionService, runInTransaction, changeEventBus, clock }) {
  function getPhrase(phraseId) {
    const phrase = phraseRepository.findPhraseById(phraseId);
    if (!phrase) throw new NotFoundError(`phrase ${phraseId} not found`);
    return phrase;
  }

  // Newest first; limit is optional.
  function listPhrases({ limit } = {}) {
    const phrases = phraseRepository.listPhrasesNewestFirst();
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

  return Object.freeze({ getPhrase, listPhrases, createPhrase, createPhrases, deletePhrase });
}
