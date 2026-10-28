// Practice settings in camelCase: reads them, saves the current chapter and the practice sets, and records the FSRS
// migration. Also the one guard that refuses practice before the migration.
import { ConflictError } from '../../errors/domain-errors.js';
import { mapFromStoredSet } from './practice-set.js';

const FSRS_MIGRATED_AT_SETTING_NAME = 'fsrs_migrated_at';
const WORD_SET_SETTING_NAME = 'word_set';
const PHRASE_SET_SETTING_NAME = 'phrase_set';
const FSRS_NOT_SET_UP_MESSAGE = 'FSRS practice is not set up yet: run migrate_to_fsrs';

export function createPracticeSettings({ practiceRepository }) {
  // fsrsMigratedAt is null until migrate_to_fsrs has run for real. newPerDay is the set size, for words and phrases.
  // wordSet and phraseSet are the pinned sets ({ openedOn, openedAt, itemIds }), null when none is stored.
  function readSettings() {
    const settingByName = practiceRepository.listSettings();
    return Object.freeze({
      currentChapter: settingByName.current_chapter,
      newPerDay: settingByName.new_per_day,
      tierQuota: Object.freeze({ ...settingByName.tier_quota }),
      desiredRetention: settingByName.desired_retention,
      learnedThresholdDays: settingByName.learned_threshold_days,
      timeZone: settingByName.timezone,
      fsrsMigratedAt: settingByName[FSRS_MIGRATED_AT_SETTING_NAME] ?? null,
      wordSet: mapFromStoredSet(settingByName[WORD_SET_SETTING_NAME]),
      phraseSet: mapFromStoredSet(settingByName[PHRASE_SET_SETTING_NAME]),
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

  // storedSet: { opened_on, opened_at, item_ids } (see mapToStoredSet in practice-set.js), or null to clear it.
  function saveWordSet(storedSet) {
    practiceRepository.saveSetting(WORD_SET_SETTING_NAME, storedSet);
  }

  function savePhraseSet(storedSet) {
    practiceRepository.saveSetting(PHRASE_SET_SETTING_NAME, storedSet);
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
    saveWordSet,
    savePhraseSet,
    isFsrsActive,
    markFsrsMigrated,
  });
}
