// MCP adapter for grammar rules: registers the rule tools. get_rule also lists the rule's mistake patterns.
import {
  createRuleToolInputSchema,
  ruleReferenceSchema,
  updateRuleInputSchema,
} from '../../contracts/rule-contracts.js';
import { identifierSchema } from '../../contracts/shared-contracts.js';
import { READ_ONLY_TOOL_ANNOTATIONS, registerJsonTool } from '../../model-context-protocol/mcp-tool-registration.js';

export function registerRuleTools({ mcpServer, ruleService, mistakeService }) {
  registerJsonTool(mcpServer, 'list_rules', {
    title: 'List grammar rules',
    description: 'All grammar rules in textbook order, without bodies. Use get_rule for the full text.',
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, () => ruleService.listRules().map(mapRuleToCompactRule));

  registerJsonTool(mcpServer, 'get_rule', {
    title: 'Get grammar rule',
    description: 'One grammar rule with its full body and the mistake patterns filed under it. '
      + 'Look it up by numeric id or by code such as "5.5".',
    inputSchema: { id_or_code: ruleReferenceSchema },
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ id_or_code: ruleReference }) => {
    const rule = ruleService.getRule(ruleReference);
    return { ...rule, patterns: mistakeService.listPatterns({ rule_id: rule.id }) };
  });

  registerJsonTool(mcpServer, 'add_rule', {
    title: 'Add grammar rule',
    description: 'Add a grammar rule. The body is mini-markdown: blocks are separated by blank lines. '
      + 'A block is a table if every line starts with "|" '
      + '(a line of |---| separators is dropped; the first row is the header); '
      + 'a list if every line starts with "- "; an example box if every line starts with ">"; '
      + 'otherwise a paragraph (lines are joined). '
      + 'Inline formatting: **bold** only. Do not use other markdown or HTML.',
    inputSchema: createRuleToolInputSchema.shape,
  }, ruleInput => ruleService.createRule(ruleInput));

  registerJsonTool(mcpServer, 'update_rule', {
    title: 'Update grammar rule',
    description: 'Change fields of one rule by id. Only the given fields change. '
      + 'The body uses the same mini-markdown as add_rule.',
    inputSchema: { id: identifierSchema, ...updateRuleInputSchema.omit({ section: true }).shape },
  }, ({ id, ...ruleChanges }) => ruleService.updateRule(id, ruleChanges));
}

// The shape returned to Claude for rule lists: no body.
function mapRuleToCompactRule(rule) {
  return {
    id: rule.id,
    code: rule.code,
    category: rule.category,
    title: rule.title,
    error_count: rule.error_count,
  };
}
