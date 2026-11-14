// Achievements: the medals with their progress for the learner. Matches the catalog against the facts of one read.
// A medal reached for the first time is saved with the instant, and a saved medal stays unlocked for good.
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_GROUPS } from './achievement-catalog.js';
import { calculateAchievementFacts } from './achievement-facts.js';

export function createAchievementService({ achievementRepository, practiceSettings, clock }) {
  // groups: { id, title } in order; achievements: each medal with unlocked, unlocked_at (milliseconds or null) and
  // progress { current, target }. current stops at the target, and is the target for a saved medal.
  function listAchievements() {
    const now = clock.now();
    const { timeZone } = practiceSettings.readSettings();
    const sources = achievementRepository.readFactSources();
    const facts = calculateAchievementFacts({ now, timeZone, ...sources });
    const unlockedAtById = achievementRepository.listUnlocks();
    const newlyReachedIds = ACHIEVEMENT_CATALOG
      .filter(medal => !unlockedAtById.has(medal.id) && readMetric(facts, medal) >= medal.target)
      .map(medal => medal.id);
    achievementRepository.saveUnlocks(newlyReachedIds, now);
    for (const achievementId of newlyReachedIds) unlockedAtById.set(achievementId, now);
    return {
      groups: ACHIEVEMENT_GROUPS.map(({ id, title }) => ({ id, title })),
      achievements: ACHIEVEMENT_CATALOG.map(medal => {
        const unlockedAt = unlockedAtById.get(medal.id) ?? null;
        const value = unlockedAt === null ? readMetric(facts, medal) : medal.target;
        return {
          id: medal.id,
          group: medal.group,
          title: medal.title,
          description: medal.description,
          icon: medal.icon,
          unlocked: unlockedAt !== null,
          unlocked_at: unlockedAt,
          progress: { current: Math.min(value, medal.target), target: medal.target },
        };
      }),
    };
  }

  return Object.freeze({ listAchievements });
}

function readMetric(facts, medal) {
  if (medal.metric === 'category_words') return facts.category_words[medal.category] ?? 0;
  return facts[medal.metric];
}
