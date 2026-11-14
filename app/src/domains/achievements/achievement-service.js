// Achievements: the medals with their progress for the learner. Matches the catalog against the facts of one read.
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_GROUPS } from './achievement-catalog.js';
import { calculateAchievementFacts } from './achievement-facts.js';

export function createAchievementService({ achievementRepository, practiceSettings, clock }) {
  // groups: { id, title } in order; achievements: each medal with unlocked and progress { current, target }. current
  // stops at the target.
  function listAchievements() {
    const { timeZone } = practiceSettings.readSettings();
    const sources = achievementRepository.readFactSources();
    const facts = calculateAchievementFacts({ now: clock.now(), timeZone, ...sources });
    return {
      groups: ACHIEVEMENT_GROUPS.map(({ id, title }) => ({ id, title })),
      achievements: ACHIEVEMENT_CATALOG.map(medal => {
        const value = readMetric(facts, medal);
        return {
          id: medal.id,
          group: medal.group,
          title: medal.title,
          description: medal.description,
          icon: medal.icon,
          unlocked: value >= medal.target,
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
