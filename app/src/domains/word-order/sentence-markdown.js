// Reads the sentence table of a Markdown file (the format of docs/SENTENCE_GENERATION_PROMPT.md): the Dutch and
// Ukrainian columns and the optional rule and schema columns. Pure: text in, sentences, row errors and warnings out.
import { normalizeRule } from './word-order-tiles.js';

const NEDERLANDS_HEADER = 'nederlands';
const UKRAINIAN_HEADER = 'українською';
const RULE_HEADER = 'правило';
const SCHEMA_HEADER = 'схема';
const UNREADABLE_SCHEMA_REASON = 'схему не розібрано, речення додано без неї';
// The segments are split on a plus with optional spaces around it: `Ik (підмет)+ga (дієслово)` works. A segment that
// still holds a plus (a plus with no role after the text) does not match SCHEMA_SEGMENT_PATTERN and is refused.
const SCHEMA_SEGMENT_SEPARATOR_PATTERN = /\s*\+\s*/;
const SCHEMA_SEGMENT_PATTERN = /^(.+?)\s*\(([^()]+)\)$/;
const MISSING_TABLE_ERROR = 'не знайдено таблицю з колонками «Українською» і «Nederlands»';
const SEPARATOR_CELL_PATTERN = /^:?-+:?$/;
const SURROUNDING_MARKUP_PATTERN = /^[\s`*_]+|[\s`*_]+$/g;

// Returns { sentences: [{ nl, uk, rule, structure }], errors: [string], warnings: [{ nl, reason }] }. structure is an
// array of { text, role } or null; a schema cell that does not read as segments gives a warning and no structure.
export function parseSentenceMarkdown(markdownText) {
  const lines = String(markdownText ?? '').split(/\r?\n/);
  const table = findSentenceTable(lines);
  if (!table) {
    return Object.freeze({
      sentences: Object.freeze([]),
      errors: Object.freeze([MISSING_TABLE_ERROR]),
      warnings: Object.freeze([]),
    });
  }
  const sentences = [];
  const errors = [];
  const warnings = [];
  table.dataRows.forEach((cells, rowIndex) => {
    const nl = cells[table.columns.nlIndex] ?? '';
    const uk = cells[table.columns.ukIndex] ?? '';
    if (!nl || !uk) {
      errors.push(`рядок ${rowIndex + 1}: ${describeMissingCells(nl, uk)}`);
      return;
    }
    const schemaText = table.columns.schemaIndex === -1 ? '' : cells[table.columns.schemaIndex] ?? '';
    const structure = parseStructureText(schemaText);
    if (schemaText !== '' && structure === null) warnings.push(Object.freeze({ nl, reason: UNREADABLE_SCHEMA_REASON }));
    sentences.push(Object.freeze({
      nl,
      uk,
      rule: normalizeRule(cells[table.columns.ruleIndex]),
      structure,
    }));
  });
  return Object.freeze({
    sentences: Object.freeze(sentences),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  });
}

// Reads a schema cell: segments joined by ' + ' (the spaces are optional), each `<Dutch> (<role>)`, e.g.
// `Deze week (час) + ben (дієслово) + ik (підмет) + jarig (прикметник)`. The role is the last (...) of a segment, so
// Dutch text may hold brackets too. Backticks and emphasis marks around a text or role are dropped. Returns
// [{ text, role }], or null when the text is empty or any segment does not read that way. The segments are checked
// against the sentence by the service.
export function parseStructureText(schemaText) {
  const body = String(schemaText ?? '').trim();
  if (body === '') return null;
  const segments = [];
  for (const part of body.split(SCHEMA_SEGMENT_SEPARATOR_PATTERN)) {
    const match = part.trim().match(SCHEMA_SEGMENT_PATTERN);
    if (!match) return null;
    const text = match[1].replace(SURROUNDING_MARKUP_PATTERN, '');
    const role = match[2].replace(SURROUNDING_MARKUP_PATTERN, '');
    if (text === '' || role === '') return null;
    segments.push(Object.freeze({ text, role }));
  }
  return Object.freeze(segments);
}

// The first table whose header has both the Dutch and the Ukrainian column.
function findSentenceTable(lines) {
  for (let lineIndex = 0; lineIndex + 1 < lines.length; lineIndex++) {
    if (!isTableRow(lines[lineIndex]) || !isSeparatorRow(lines[lineIndex + 1])) continue;
    const columns = findColumns(splitRow(lines[lineIndex]));
    if (columns) return { columns, dataRows: readDataRows(lines, lineIndex + 2) };
  }
  return null;
}

function readDataRows(lines, firstDataLineIndex) {
  const dataRows = [];
  for (let lineIndex = firstDataLineIndex; lineIndex < lines.length && isTableRow(lines[lineIndex]); lineIndex++) {
    dataRows.push(splitRow(lines[lineIndex]));
  }
  return dataRows;
}

function findColumns(headerCells) {
  const lowerCaseHeaders = headerCells.map(cell => cell.toLowerCase());
  const nlIndex = lowerCaseHeaders.indexOf(NEDERLANDS_HEADER);
  const ukIndex = lowerCaseHeaders.indexOf(UKRAINIAN_HEADER);
  if (nlIndex === -1 || ukIndex === -1) return null;
  return Object.freeze({
    nlIndex,
    ukIndex,
    ruleIndex: lowerCaseHeaders.indexOf(RULE_HEADER),
    schemaIndex: lowerCaseHeaders.indexOf(SCHEMA_HEADER),
  });
}

// Cells are split on the pipes that are not escaped; an escaped pipe (\|) is a literal pipe. Each cell loses its
// surrounding backticks and Markdown emphasis (** * __ _), so `v2`, **Ik bel je op.** and **Nederlands** read plainly.
function splitRow(line) {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map(cell => cell.replaceAll('\\|', '|').replace(SURROUNDING_MARKUP_PATTERN, ''));
}

function isTableRow(line) {
  return line.trim().startsWith('|');
}

function isSeparatorRow(line) {
  if (!isTableRow(line)) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every(cell => SEPARATOR_CELL_PATTERN.test(cell));
}

function describeMissingCells(nl, uk) {
  if (!nl && !uk) return 'порожні нідерландське і українське речення';
  if (!nl) return 'порожнє нідерландське речення';
  return 'порожнє українське речення';
}
