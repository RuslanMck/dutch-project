// Achievements: the medals with their progress for the learner. Matches the catalog against the facts of one read.
// A medal reached for the first time is saved with the instant, and a saved medal stays unlocked for good.
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_GROUPS, META_GROUP_ID } from './achievement-catalog.js';
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
    // The other medals first, then the meta medals, which count them.
    const newlyReachedIds = findNewlyReached(BASE_MEDALS, facts, unlockedAtById);
    for (const achievementId of newlyReachedIds) unlockedAtById.set(achievementId, now);
    Object.assign(facts, calculateMetaFacts(unlockedAtById));
    const newlyReachedMetaIds = findNewlyReached(META_MEDALS, facts, unlockedAtById);
    for (const achievementId of newlyReachedMetaIds) unlockedAtById.set(achievementId, now);
    achievementRepository.saveUnlocks([...newlyReachedIds, ...newlyReachedMetaIds], now);
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

const BASE_MEDALS = ACHIEVEMENT_CATALOG.filter(medal => medal.group !== META_GROUP_ID);
const META_MEDALS = ACHIEVEMENT_CATALOG.filter(medal => medal.group === META_GROUP_ID);
const BASE_GROUP_IDS = ACHIEVEMENT_GROUPS.map(group => group.id).filter(groupId => groupId !== META_GROUP_ID);

function findNewlyReached(medals, facts, unlockedAtById) {
  return medals
    .filter(medal => !unlockedAtById.has(medal.id) && readMetric(facts, medal) >= medal.target)
    .map(medal => medal.id);
}

// The meta metrics from the unlocked medals of the other groups.
function calculateMetaFacts(unlockedAtById) {
  const unlockedBase = BASE_MEDALS.filter(medal => unlockedAtById.has(medal.id));
  const isGroupFull = groupId => BASE_MEDALS.filter(medal => medal.group === groupId).every(medal => unlockedAtById.has(medal.id));
  return {
    collected: unlockedBase.length,
    full_groups: BASE_GROUP_IDS.filter(isGroupFull).length,
    groups_with_medal: new Set(unlockedBase.map(medal => medal.group)).size,
    topics_with_five: unlockedBase.filter(medal => medal.metric === 'category_words' && medal.target === 5).length,
  };
}

function readMetric(facts, medal) {
  if (medal.metric === 'category_words') return facts.category_words[medal.category] ?? 0;
  return facts[medal.metric];
}
