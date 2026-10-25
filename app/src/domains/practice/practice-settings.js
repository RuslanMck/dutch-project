// Practice settings in camelCase: reads them, saves the current chapter and the extra new words, and records the FSRS
// migration.
const FSRS_MIGRATED_AT_SETTING_NAME = 'fsrs_migrated_at';
const EXTRA_NEW_WORDS_SETTING_NAME = 'extra_new_words';
const EMPTY_EXTRA_NEW_WORDS = Object.freeze({ calendar_date: null, count: 0 });

export function createPracticeSettings({ practiceRepository }) {
  // fsrsMigratedAt is null until migrate_to_fsrs has run for real. extraNewWords is the count added for calendarDate;
  // it is empty until addExtraNewWords has run.
  function readSettings() {
    const settingByName = practiceRepository.listSettings();
    const storedExtraNewWords = settingByName[EXTRA_NEW_WORDS_SETTING_NAME] ?? EMPTY_EXTRA_NEW_WORDS;
    return Object.freeze({
      currentChapter: settingByName.current_chapter,
      newPerDay: settingByName.new_per_day,
      phraseNewPerDay: settingByName.phrase_new_per_day,
      tierQuota: Object.freeze({ ...settingByName.tier_quota }),
      desiredRetention: settingByName.desired_retention,
      learnedThresholdDays: settingByName.learned_threshold_days,
      timeZone: settingByName.timezone,
      fsrsMigratedAt: settingByName[FSRS_MIGRATED_AT_SETTING_NAME] ?? null,
      extraNewWords: Object.freeze({
        calendarDate: storedExtraNewWords.calendar_date,
        count: storedExtraNewWords.count,
      }),
    });
  }

  function saveCurrentChapter(chapter) {
    practiceRepository.saveSetting('current_chapter', chapter);
  }

  // calendarDate: 'YYYY-MM-DD' in the practice time zone; count: the extra new words that day, in total.
  function saveExtraNewWords({ calendarDate, count }) {
    practiceRepository.saveSetting(EXTRA_NEW_WORDS_SETTING_NAME, { calendar_date: calendarDate, count });
  }

  function isFsrsActive() {
    return readSettings().fsrsMigratedAt !== null;
  }

  // timestamp: milliseconds of the migration; its presence switches the practice to FSRS.
  function markFsrsMigrated(timestamp) {
    practiceRepository.saveSetting(FSRS_MIGRATED_AT_SETTING_NAME, timestamp);
  }

  return Object.freeze({ readSettings, saveCurrentChapter, saveExtraNewWords, isFsrsActive, markFsrsMigrated });
}
