// Practice settings in camelCase: reads them, saves the current chapter and the intake blocks of new words and
// phrases, and records the FSRS migration.
const FSRS_MIGRATED_AT_SETTING_NAME = 'fsrs_migrated_at';
const NEW_WORD_BLOCK_SETTING_NAME = 'new_word_block';
const NEW_PHRASE_BLOCK_SETTING_NAME = 'new_phrase_block';

export function createPracticeSettings({ practiceRepository }) {
  // fsrsMigratedAt is null until migrate_to_fsrs has run for real. newWordBlock and newPhraseBlock are the current
  // intake blocks ({ openedOn, size, introducedAtOpen }), null until the first new item is started or after a reset.
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
      newWordBlock: mapStoredBlock(settingByName[NEW_WORD_BLOCK_SETTING_NAME]),
      newPhraseBlock: mapStoredBlock(settingByName[NEW_PHRASE_BLOCK_SETTING_NAME]),
    });
  }

  function saveCurrentChapter(chapter) {
    practiceRepository.saveSetting('current_chapter', chapter);
  }

  // storedBlock: { opened_on, size, introduced_at_open } (see mapToStoredBlock in intake-block.js), or null to clear
  // it.
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
    saveCurrentChapter,
    saveNewWordBlock,
    saveNewPhraseBlock,
    isFsrsActive,
    markFsrsMigrated,
  });
}

function mapStoredBlock(storedBlock) {
  if (!storedBlock) return null;
  return Object.freeze({
    openedOn: storedBlock.opened_on,
    size: storedBlock.size,
    introducedAtOpen: Object.freeze({ ...storedBlock.introduced_at_open }),
  });
}
