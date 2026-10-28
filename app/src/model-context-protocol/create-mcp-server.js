// Builds an MCP server with the instructions and asks each domain to register its tools. The server is
// stateless, so a fresh one is built for every request.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerMistakeTools } from '../domains/mistakes/mistake-tools.js';
import { registerPhraseTools } from '../domains/phrases/phrase-tools.js';
import { registerPracticeTools } from '../domains/practice/practice-tools.js';
import { registerRuleTools } from '../domains/rules/rule-tools.js';
import { registerStatisticsTools } from '../domains/statistics/statistics-tools.js';
import { registerTextTools } from '../domains/texts/text-tools.js';
import { registerWordOrderTools } from '../domains/word-order/word-order-tools.js';
import { registerWordTools } from '../domains/words/word-tools.js';
import { MCP_INSTRUCTIONS } from './mcp-instructions.js';

const MCP_SERVER_INFORMATION = Object.freeze({ name: 'dutch', version: '1.0.0' });

export function createMcpServer({
  wordService,
  practiceService,
  practiceResetService,
  phrasePracticeService,
  priorityService,
  ruleService,
  mistakeService,
  phraseService,
  wordOrderService,
  textService,
  statisticsService,
}) {
  const mcpServer = new McpServer({ ...MCP_SERVER_INFORMATION }, { instructions: MCP_INSTRUCTIONS });
  registerStatisticsTools({ mcpServer, statisticsService });
  registerWordTools({ mcpServer, wordService });
  registerPracticeTools({
    mcpServer,
    practiceService,
    practiceResetService,
    phrasePracticeService,
    priorityService,
    wordService,
  });
  registerRuleTools({ mcpServer, ruleService, mistakeService });
  registerMistakeTools({ mcpServer, mistakeService });
  registerPhraseTools({ mcpServer, phraseService });
  registerWordOrderTools({ mcpServer, wordOrderService });
  registerTextTools({ mcpServer, textService });
  return mcpServer;
}
