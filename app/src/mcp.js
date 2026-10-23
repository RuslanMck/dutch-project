// Remote MCP server (Streamable HTTP, stateless). Mounted at /mcp in server.js, before cookie auth,
// so this router does its own authentication:
//   POST /mcp/<MCP_SECRET>            claude.ai connector (secret in the path)
//   POST /mcp  Authorization: Bearer  Claude Code / scripts (API_TOKEN)
// Every tool is a thin wrapper around src/repo.js; this file contains no SQL. Tool arguments are described by the
// shared contracts in src/contracts/, so MCP and REST validate the same shapes.
import express from 'express';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { listMistakePatternsQuerySchema, logMistakeToolInputSchema } from './contracts/mistake-contracts.js';
import { addPhrasesInputSchema, listPhrasesInputSchema } from './contracts/phrase-contracts.js';
import { createRuleToolInputSchema, ruleReferenceSchema, updateRuleInputSchema } from './contracts/rule-contracts.js';
import { identifierSchema } from './contracts/shared-contracts.js';
import { createTextInputSchema } from './contracts/text-contracts.js';
import {
  addWordsInputSchema,
  listWordsToolInputSchema,
  logWordErrorByLookupInputSchema,
  searchWordsInputSchema,
  setWordStatusInputSchema,
  updateWordInputSchema,
} from './contracts/word-contracts.js';
import * as repo from './repo.js';
import { getDb } from './db.js';
import { mapToDomainError } from './errors/domain-errors.js';

const INSTRUCTIONS = `This is the learner's Dutch (NL) → Ukrainian (UK) learning database. The web app is in Ukrainian; the data is stored as given.
Words and expressions share the words table; kind ('word' | 'expression') is detected automatically.
article is 'de', 'het' or '' (none). section is the textbook chapter code, e.g. '6.1'. status goes new → learning → learned.
Rule codes such as '5.5' or 'Д1' are what feedback must cite: they are the rule numbers shown in the app.

Workflows:
1. Exercise check: for every grammar mistake call log_mistake with the rule_code it breaks (call list_rules if unsure;
   pass rule_code null when no rule fits). If a pattern for the same kind of mistake already exists
   (list_mistake_patterns), pass its pattern_id; otherwise pass a short title and a one-line fix in Ukrainian.
   For every word the learner got wrong, call log_word_error (it creates the word if it is missing).
   Words the learner marks DNK (did not know) go to add_words with status 'new'.
2. Translating sentences or dialogues: new words go to add_words (with section and example_nl/example_uk);
   stable phrases go to add_phrases with context = the dialogue name.
3. Always search_words before adding, to avoid duplicates. add_words also skips exact duplicates
   (same nl and article) and reports them in 'skipped'.
Changes appear live in the web app.`;

const SECRET_MIN_LENGTH = 32;

// ---------------------------------------------------------------- auth

const sha256 = s => crypto.createHash('sha256').update(String(s)).digest();

// Timing-safe comparison of two strings (digests make the lengths equal).
function sameSecret(given, expected) {
  return crypto.timingSafeEqual(sha256(given), sha256(expected));
}

function secretOk(given) {
  const expected = process.env.MCP_SECRET ?? '';
  return expected.length >= SECRET_MIN_LENGTH && typeof given === 'string' && sameSecret(given, expected);
}

function bearerOk(req) {
  const expected = process.env.API_TOKEN ?? '';
  const h = req.headers.authorization;
  if (!expected || !h) return false;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m) && sameSecret(m[1].trim(), expected);
}

const unauthorized = res => res.status(401).json({ error: 'unauthorized' });

const requireSecret = (req, res, next) => (secretOk(req.params.secret) ? next() : unauthorized(res));
const requireBearer = (req, res, next) => (bearerOk(req) ? next() : unauthorized(res));

const methodNotAllowed = (req, res) => {
  res.set('Allow', 'POST');
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
};

// ---------------------------------------------------------------- server

// Shape returned to Claude for word lists: enough to act on, no timestamps or legacy ids.
const compactWord = w => ({
  id: w.id,
  nl: w.nl,
  uk: w.uk,
  article: w.article,
  kind: w.kind,
  section: w.section,
  topic: w.topic,
  status: w.status,
  error_count: w.error_count,
  example_nl: w.example_nl,
  example_uk: w.example_uk,
});

const compactRule = r => ({
  id: r.id,
  code: r.code,
  category: r.category,
  title: r.title,
  error_count: r.error_count,
});

const compactText = t => ({ id: t.id, title: t.title, section: t.section, added_at: t.added_at });

const ok = result => ({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
const fail = err => ({ isError: true, content: [{ type: 'text', text: mapToDomainError(err).message }] });

// Registers one tool. The handler's return value is JSON-encoded; thrown errors become isError results.
function defineTool(server, name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return ok(await handler(args ?? {}));
    } catch (err) {
      return fail(err);
    }
  });
}

const READ_ONLY = { readOnlyHint: true };
const DESTRUCTIVE = { destructiveHint: true };

function registerTools(server) {
  defineTool(server, 'stats', {
    title: 'Database statistics',
    description: 'Counts of words (by status, expressions), rules, mistake patterns, cases, phrases, texts, and the textbook sections in use.',
    annotations: READ_ONLY,
  }, () => repo.stats());

  defineTool(server, 'search_words', {
    title: 'Search words',
    description: 'Case-insensitive search on Dutch and Ukrainian text. Exact Dutch matches come first. Use before add_words to avoid duplicates.',
    inputSchema: searchWordsInputSchema.shape,
    annotations: READ_ONLY,
  }, ({ query, limit }) => repo.findWords(query, { limit: limit ?? 20 }).map(compactWord));

  defineTool(server, 'list_words', {
    title: 'List words',
    description: 'List dictionary words, oldest first (or by error count). Filters: status, topic, section (textbook chapter). Returns compact rows.',
    inputSchema: listWordsToolInputSchema.shape,
    annotations: READ_ONLY,
  }, ({ status, topic, section, sort, limit }) => {
    // repo.listWords has no section filter, so filter here and apply the limit after it.
    const rows = repo.listWords({ status, topic, sort })
      .filter(w => section === undefined || w.section === section);
    return rows.slice(0, limit ?? 100).map(compactWord);
  });

  defineTool(server, 'add_words', {
    title: 'Add words',
    description: 'Add several dictionary words in one call. Words are created with status "new" unless given. '
      + 'An entry whose nl and article match an existing word is skipped (reported in "skipped") unless skip_existing is false. '
      + 'Returns {added, skipped}.',
    inputSchema: addWordsInputSchema.shape,
  }, ({ words, skip_existing }) => {
    const { added, skipped } = repo.addWords(words, { skipExisting: skip_existing ?? true });
    return { added: added.map(compactWord), skipped };
  });

  defineTool(server, 'update_word', {
    title: 'Update word',
    description: 'Change fields of one word by id. Only the given fields change. Empty string or null clears example_nl, example_uk, section, topic. Changing nl re-detects kind unless kind is given.',
    inputSchema: { id: identifierSchema, ...updateWordInputSchema.shape },
  }, ({ id, ...patch }) => compactWord(repo.updateWord(id, patch)));

  defineTool(server, 'delete_word', {
    title: 'Delete word',
    description: 'Permanently delete one word by id, with its error history.',
    inputSchema: { id: identifierSchema },
    annotations: DESTRUCTIVE,
  }, ({ id }) => repo.deleteWord(id));

  defineTool(server, 'set_word_status', {
    title: 'Set word status',
    description: 'Set a word to new, learning or learned.',
    inputSchema: { id: identifierSchema, ...setWordStatusInputSchema.shape },
  }, ({ id, status }) => compactWord(repo.setWordStatus(id, status)));

  defineTool(server, 'log_word_error', {
    title: 'Log word error',
    description: 'Record that a word was got wrong: adds one error and sets the word to "learning". '
      + 'Give id, or nl (exact, case-insensitive; article helps choose between homographs). '
      + 'If no word matches, one is created from nl, uk (required then), article, section and status "learning", and the error is logged on it. '
      + 'Returns {word, created}.',
    inputSchema: logWordErrorByLookupInputSchema.shape,
  }, ({ id, nl, uk, article, source, wrong_answer, section }) => {
    const src = source ?? 'lesson';
    let word;
    let created = false;
    if (id !== undefined) {
      word = repo.getWord(id);
    } else {
      if (!nl) throw new Error('give id, or nl to find the word');
      const needle = nl.trim().toLowerCase();
      const exact = repo.findWords(nl, { limit: 1000 }).filter(w => w.nl.toLowerCase() === needle);
      word = exact.find(w => article !== undefined && article !== null && w.article === article) ?? exact[0];
      if (!word) {
        if (!uk) throw new Error(`word "${nl}" not found; give uk to create it`);
        word = repo.addWord({ nl, uk, article: article ?? '', section, status: 'learning' });
        created = true;
      }
    }
    const updated = repo.logWordError(word.id, { source: src, wrong_answer });
    return { word: compactWord(updated), created };
  });

  defineTool(server, 'list_rules', {
    title: 'List grammar rules',
    description: 'All grammar rules in textbook order, without bodies. Use get_rule for the full text.',
    annotations: READ_ONLY,
  }, () => repo.listRules().map(compactRule));

  defineTool(server, 'get_rule', {
    title: 'Get grammar rule',
    description: 'One grammar rule with its full body and the mistake patterns filed under it. Look it up by numeric id or by code such as "5.5".',
    inputSchema: { id_or_code: ruleReferenceSchema },
    annotations: READ_ONLY,
  }, ({ id_or_code }) => {
    const rule = repo.getRule(id_or_code);
    return { ...rule, patterns: repo.listPatterns({ rule_id: rule.id }) };
  });

  defineTool(server, 'add_rule', {
    title: 'Add grammar rule',
    description: 'Add a grammar rule. The body is mini-markdown: blocks are separated by blank lines. '
      + 'A block is a table if every line starts with "|" (a line of |---| separators is dropped; the first row is the header); '
      + 'a list if every line starts with "- "; an example box if every line starts with ">"; otherwise a paragraph (lines are joined). '
      + 'Inline formatting: **bold** only. Do not use other markdown or HTML.',
    inputSchema: createRuleToolInputSchema.shape,
  }, args => repo.addRule(args));

  defineTool(server, 'update_rule', {
    title: 'Update grammar rule',
    description: 'Change fields of one rule by id. Only the given fields change. The body uses the same mini-markdown as add_rule.',
    inputSchema: { id: identifierSchema, ...updateRuleInputSchema.omit({ section: true }).shape },
  }, ({ id, ...patch }) => repo.updateRule(id, patch));

  defineTool(server, 'list_mistake_patterns', {
    title: 'List mistake patterns',
    description: 'Recurring mistake patterns with their cases, most frequent first. Filter by rule_code; "other" lists patterns that fit no rule. Check here before log_mistake to reuse a pattern_id.',
    inputSchema: listMistakePatternsQuerySchema.pick({ rule_code: true }).shape,
    annotations: READ_ONLY,
  }, ({ rule_code }) => repo.listPatterns({ rule_code }));

  defineTool(server, 'log_mistake', {
    title: 'Log mistake',
    description: 'Record one grammar mistake. Pass pattern_id to add a case to an existing pattern. '
      + 'Otherwise the case goes to the pattern with the same rule_code and the same title (case-insensitive), or a new pattern is created, '
      + 'which needs title (short) and fix (one line). rule_code null means no rule fits ("other"). Returns the pattern.',
    inputSchema: logMistakeToolInputSchema.shape,
  }, args => repo.logMistake({ ...args, source: args.source ?? 'exercise' }));

  defineTool(server, 'add_phrases', {
    title: 'Add phrases',
    description: 'Add stable Dutch phrases (dialogue lines, shop talk) in one call. context is the source, e.g. the dialogue name. All phrases are added or none are.',
    inputSchema: addPhrasesInputSchema.shape,
  }, ({ phrases }) => {
    // One transaction, so a bad item leaves nothing half-added. Each repo call still validates its own input.
    const added = getDb().transaction(() => phrases.map(p => repo.addPhrase(p)))();
    return { added };
  });

  defineTool(server, 'list_phrases', {
    title: 'List phrases',
    description: 'Phrases, newest first.',
    inputSchema: listPhrasesInputSchema.shape,
    annotations: READ_ONLY,
  }, ({ limit }) => repo.listPhrases().slice(0, limit ?? 100));

  defineTool(server, 'delete_phrase', {
    title: 'Delete phrase',
    description: 'Permanently delete one phrase by id.',
    inputSchema: { id: identifierSchema },
    annotations: DESTRUCTIVE,
  }, ({ id }) => repo.deletePhrase(id));

  defineTool(server, 'add_text', {
    title: 'Add text',
    description: 'Add a bilingual text, e.g. a textbook dialogue. body format: one Dutch line, then its Ukrainian line; '
      + 'pairs are separated by a blank line. A speaker prefix such as "Jasper:" / "Яспер:" may start a line. Returns the text.',
    inputSchema: createTextInputSchema.shape,
  }, args => repo.addText(args));

  defineTool(server, 'list_texts', {
    title: 'List texts',
    description: 'Texts without bodies, newest first. Use get_text for a body.',
    annotations: READ_ONLY,
  }, () => repo.listTexts().map(compactText));

  defineTool(server, 'get_text', {
    title: 'Get text',
    description: 'One text by id, including its body.',
    inputSchema: { id: identifierSchema },
    annotations: READ_ONLY,
  }, ({ id }) => repo.getText(id));
}

function buildServer() {
  const server = new McpServer({ name: 'dutch', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  registerTools(server);
  return server;
}

// Stateless: a fresh server and transport per POST; nothing is kept between requests.
async function handleMcp(req, res) {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('mcp: request failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
}

export const mcpRouter = express.Router();

mcpRouter.post('/:secret', requireSecret, handleMcp);
mcpRouter.post('/', requireBearer, handleMcp);

mcpRouter.get('/:secret', requireSecret, methodNotAllowed);
mcpRouter.delete('/:secret', requireSecret, methodNotAllowed);
mcpRouter.get('/', requireBearer, methodNotAllowed);
mcpRouter.delete('/', requireBearer, methodNotAllowed);
