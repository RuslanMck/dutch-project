// MCP adapter for statistics: registers the stats tool.
import { READ_ONLY_TOOL_ANNOTATIONS, registerJsonTool } from '../../model-context-protocol/mcp-tool-registration.js';

export function registerStatisticsTools({ mcpServer, statisticsService }) {
  registerJsonTool(mcpServer, 'stats', {
    title: 'Database statistics',
    description: 'Counts of words (by status, expressions, and by FSRS state with the number due today), rules, '
      + 'mistake patterns, cases, phrases, texts, and the textbook sections in use.',
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, () => statisticsService.calculateStatistics());
}
