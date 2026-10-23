// MCP adapter for mistakes: registers the mistake-pattern tools.
import { listMistakePatternsQuerySchema, logMistakeToolInputSchema } from '../../contracts/mistake-contracts.js';
import { READ_ONLY_TOOL_ANNOTATIONS, registerJsonTool } from '../../model-context-protocol/mcp-tool-registration.js';

// Mistakes logged through MCP come from exercise checks unless Claude says otherwise.
const DEFAULT_MISTAKE_SOURCE = 'exercise';

export function registerMistakeTools({ mcpServer, mistakeService }) {
  registerJsonTool(mcpServer, 'list_mistake_patterns', {
    title: 'List mistake patterns',
    description: 'Recurring mistake patterns with their cases, most frequent first. '
      + 'Filter by rule_code; "other" lists patterns that fit no rule. '
      + 'Check here before log_mistake to reuse a pattern_id.',
    inputSchema: listMistakePatternsQuerySchema.pick({ rule_code: true }).shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ rule_code: ruleCode }) => mistakeService.listPatterns({ rule_code: ruleCode }));

  registerJsonTool(mcpServer, 'log_mistake', {
    title: 'Log mistake',
    description: 'Record one grammar mistake. Pass pattern_id to add a case to an existing pattern. '
      + 'Otherwise the case goes to the pattern with the same rule_code and the same title (case-insensitive), '
      + 'or a new pattern is created, '
      + 'which needs title (short) and fix (one line). rule_code null means no rule fits ("other"). '
      + 'Returns the pattern.',
    inputSchema: logMistakeToolInputSchema.shape,
  }, mistakeInput => mistakeService.logMistake({
    ...mistakeInput,
    source: mistakeInput.source ?? DEFAULT_MISTAKE_SOURCE,
  }));
}
