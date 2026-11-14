// Practice settings in camelCase: reads them, saves the current chapter and the practice sets, and records the FSRS
// migration. Also the one guard that refuses practice before the migration.
import { DAILY_GOAL_DEFAULT } from '../../contracts/statistics-contracts.js';
import { ConflictError } from '../../errors/domain-errors.js';
import { mapFromStoredSet } from './practice-set.js';

const FSRS_MIGRATED_AT_SETTING_NAME = 'fsrs_migrated_at';
const WORD_SET_SETTING_NAME = 'word_set';
const PHRASE_SET_SETTING_NAME = 'phrase_set';
const DAILY_GOAL_SETTING_NAME = 'daily_goal';
const KNOWN_CHECK_SEEN_SETTING_NAME = 'known_check_seen';
export const KNOWN_CHECK_KNOWN_SETTING_NAME = 'known_check_known';
const PRIORITY_RULES_VERSION_SETTING_NAME = 'priority_rules_version';
const FSRS_NOT_SET_UP_MESSAGE = 'FSRS practice is not set up yet: run migrate_to_fsrs';

export function createPracticeSettings({ practiceRepository }) {
  // fsrsMigratedAt is null until migrate_to_fsrs has run for real. newPerDay is the set size, for words and phrases.
  // dailyGoal is the answers per day the learner aims for (DAILY_GOAL_DEFAULT until it is saved).
  // wordSet and phraseSet are the pinned sets ({ openedOn, openedAt, itemIds }), null when none is stored.
  // knownCheckSeen: the ids of the words the learner marked unknown in the quick known check (none when not stored).
  // priorityRulesVersion is 1 until the priorities were recalculated with the current rules (priority-service).
  function readSettings() {
    const settingByName = practiceRepository.listSettings();
    return Object.freeze({
      currentChapter: settingByName.current_chapter,
      newPerDay: settingByName.new_per_day,
      tierQuota: Object.freeze({ ...settingByName.tier_quota }),
      desiredRetention: settingByName.desired_retention,
      learnedThresholdDays: settingByName.learned_threshold_days,
      timeZone: settingByName.timezone,
      dailyGoal: settingByName[DAILY_GOAL_SETTING_NAME] ?? DAILY_GOAL_DEFAULT,
      fsrsMigratedAt: settingByName[FSRS_MIGRATED_AT_SETTING_NAME] ?? null,
      wordSet: mapFromStoredSet(settingByName[WORD_SET_SETTING_NAME]),
      phraseSet: mapFromStoredSet(settingByName[PHRASE_SET_SETTING_NAME]),
      knownCheckSeen: settingByName[KNOWN_CHECK_SEEN_SETTING_NAME] ?? [],
      knownCheckKnown: settingByName[KNOWN_CHECK_KNOWN_SETTING_NAME] ?? [],
      priorityRulesVersion: settingByName[PRIORITY_RULES_VERSION_SETTING_NAME] ?? 1,
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

  function savePriorityRulesVersion(version) {
    practiceRepository.saveSetting(PRIORITY_RULES_VERSION_SETTING_NAME, version);
  }

  // storedSet: { opened_on, opened_at, item_ids } (see mapToStoredSet in practice-set.js), or null to clear it.
  function saveWordSet(storedSet) {
    practiceRepository.saveSetting(WORD_SET_SETTING_NAME, storedSet);
  }

  function savePhraseSet(storedSet) {
    practiceRepository.saveSetting(PHRASE_SET_SETTING_NAME, storedSet);
  }

  // wordIds: the ids (an array of numbers) the known check has shown as unknown so far.
  // The words marked known in the check: not learned through practice, so the achievements leave them out.
  function saveKnownCheckKnown(wordIds) {
    practiceRepository.saveSetting(KNOWN_CHECK_KNOWN_SETTING_NAME, wordIds);
  }

  function saveKnownCheckSeen(wordIds) {
    practiceRepository.saveSetting(KNOWN_CHECK_SEEN_SETTING_NAME, wordIds);
  }

  // goal: an integer already checked by the contract.
  function saveDailyGoal(goal) {
    practiceRepository.saveSetting(DAILY_GOAL_SETTING_NAME, goal);
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
    savePriorityRulesVersion,
    saveWordSet,
    savePhraseSet,
    saveDailyGoal,
    saveKnownCheckSeen,
    saveKnownCheckKnown,
    isFsrsActive,
    markFsrsMigrated,
  });
}
