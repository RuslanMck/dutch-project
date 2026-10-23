// Text business rules: create, change and delete bilingual texts. Publishes 'texts' change events after each
// commit.
import { NotFoundError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';

export function createTextService({ textRepository, sectionService, runInTransaction, changeEventBus, clock }) {
  function getText(textId) {
    const text = textRepository.findTextById(textId);
    if (!text) throw new NotFoundError(`text ${textId} not found`);
    return text;
  }

  // Newest first.
  function listTexts() {
    return textRepository.listTextsNewestFirst();
  }

  function createText({ title, body, section }) {
    const textId = runInTransaction(() => textRepository.createText({
      title,
      sectionCode: sectionService.ensureSection(mapBlankTextToNull(section)),
      body,
      addedAt: clock.now(),
    }));
    changeEventBus.publishChange('texts');
    return getText(textId);
  }

  // Only the given fields change.
  function updateText(textId, { title, body, section }) {
    runInTransaction(() => {
      getText(textId);
      const columnChanges = {};
      if (title !== undefined) columnChanges.title = title;
      if (body !== undefined) columnChanges.body = body;
      if (section !== undefined) columnChanges.sectionCode = sectionService.ensureSection(mapBlankTextToNull(section));
      textRepository.updateText(textId, columnChanges);
    });
    changeEventBus.publishChange('texts');
    return getText(textId);
  }

  function deleteText(textId) {
    runInTransaction(() => {
      getText(textId);
      textRepository.deleteText(textId);
    });
    changeEventBus.publishChange('texts');
  }

  return Object.freeze({ getText, listTexts, createText, updateText, deleteText });
}
