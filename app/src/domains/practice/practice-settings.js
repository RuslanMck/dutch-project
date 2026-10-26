// Practice settings in camelCase: reads them, saves the current chapter and the intake blocks, and records the FSRS
// migration. Also the one guard that refuses practice before the migration.
import { ConflictError } from '../../errors/domain-errors.js';
import { mapFromStoredBlock } from './intake-block.js';

const FSRS_MIGRATED_AT_SETTING_NAME = 'fsrs_migrated_at';
const NEW_WORD_BLOCK_SETTING_NAME = 'new_word_block';
const NEW_PHRASE_BLOCK_SETTING_NAME = 'new_phrase_block';
const FSRS_NOT_SET_UP_MESSAGE = 'FSRS practice is not set up yet: run migrate_to_fsrs';

export function createPracticeSettings({ practiceRepository }) {
  // fsrsMigratedAt is null until migrate_to_fsrs has run for real. newWordBlock and newPhraseBlock are the intake
  // blocks ({ openedOn, itemIds, extraCount }), null when none is stored.
  function readSettings() {
    const settingByName = practiceRepository.listSettings();
    return Object.freeze({
      currentChapter: settingByName.current_chapter,
      newPerDay: settingByName.new_per_day,
      phraseNewPerDay: settingByName.phrase_new_per_day,
      tierQuota: Object.freeze({ ...settingByName.tier_quota }),
      desiredRetention: settingByName.desired_retention,
      learnedThresholdDays: settingByName.learned_threshold_days,
      timeZone: settingByName.timezone,
      fsrsMigratedAt: settingByName[FSRS_MIGRATED_AT_SETTING_NAME] ?? null,
      newWordBlock: mapFromStoredBlock(settingByName[NEW_WORD_BLOCK_SETTING_NAME]),
      newPhraseBlock: mapFromStoredBlock(settingByName[NEW_PHRASE_BLOCK_SETTING_NAME]),
    });
  }

  // The settings of an active practice. Every practice read and write goes through it, so one refusal covers them all.
  function readActiveSettings() {
    const settings = readSettings();
    if (settings.fsrsMigratedAt === null) throw new ConflictError(FSRS_NOT_SET_UP_MESSAGE);
    return settings;
  }

  function saveCurrentChapter(chapter) {
    practiceRepository.saveSetting('current_chapter', chapter);
  }

  // storedBlock: { opened_on, item_ids, extra_count } (see mapToStoredBlock in intake-block.js), or null to clear it.
  function saveNewWordBlock(storedBlock) {
    practiceRepository.saveSetting(NEW_WORD_BLOCK_SETTING_NAME, storedBlock);
  }

  function saveNewPhraseBlock(storedBlock) {
    practiceRepository.saveSetting(NEW_PHRASE_BLOCK_SETTING_NAME, storedBlock);
  }

  function isFsrsActive() {
    return readSettings().fsrsMigratedAt !== null;
  }

  // timestamp: milliseconds of the migration; its presence switches the practice to FSRS.
  function markFsrsMigrated(timestamp) {
    practiceRepository.saveSetting(FSRS_MIGRATED_AT_SETTING_NAME, timestamp);
  }

  return Object.freeze({
    readSettings,
    readActiveSettings,
    saveCurrentChapter,
    saveNewWordBlock,
    saveNewPhraseBlock,
    isFsrsActive,
    markFsrsMigrated,
  });
}
