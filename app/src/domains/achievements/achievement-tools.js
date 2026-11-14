// MCP adapter for the achievements: one read-only tool that returns the same list as GET /api/achievements.
import { READ_ONLY_TOOL_ANNOTATIONS, registerJsonTool } from '../../model-context-protocol/mcp-tool-registration.js';

export function registerAchievementTools({ mcpServer, achievementService }) {
  registerJsonTool(mcpServer, 'list_achievements', {
    title: 'List achievements',
    description: 'The learner\'s achievements (medals) by group: unlocked or not, and progress (current of target). '
      + 'Groups: words learned, day streaks, answers, practice days, daily goal, perfect sets, speed, word order, '
      + 'rule exercises, drills, habits and word categories. Read-only.',
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, () => achievementService.listAchievements());
}
