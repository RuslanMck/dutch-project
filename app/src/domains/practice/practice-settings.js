// Practice settings in camelCase: reads them, saves the current chapter and records the FSRS migration.
const FSRS_MIGRATED_AT_SETTING_NAME = 'fsrs_migrated_at';

export function createPracticeSettings({ practiceRepository }) {
  // fsrsMigratedAt is null until migrate_to_fsrs has run for real.
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
    });
  }

  function saveCurrentChapter(chapter) {
    practiceRepository.saveSetting('current_chapter', chapter);
  }

  function isFsrsActive() {
    return readSettings().fsrsMigratedAt !== null;
  }

  // timestamp: milliseconds of the migration; its presence switches the practice to FSRS.
  function markFsrsMigrated(timestamp) {
    practiceRepository.saveSetting(FSRS_MIGRATED_AT_SETTING_NAME, timestamp);
  }

  return Object.freeze({ readSettings, saveCurrentChapter, isFsrsActive, markFsrsMigrated });
}
