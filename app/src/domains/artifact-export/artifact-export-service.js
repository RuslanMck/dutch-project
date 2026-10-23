// Builds the full export in the claude.ai artifact's shape (the shape of dutch-export.json), so it can be
// imported again. Rows created in the app get ids such as 'word-12'.
import { formatLocalCalendarDate } from '../../time/calendar-date-formatting.js';

const EXPORT_SOURCE = 'dutch-app export (VPS)';
const EXPORT_NOTE = 'Every document is {id, ...fields as stored}. Timestamps (added, last) are ms since epoch.';

export function createArtifactExportService({ artifactExportRepository, ruleService, wordService, clock }) {
  function exportCollections() {
    const rules = ruleService.listRules();
    const exportIdByRuleId = new Map(rules.map(rule => [rule.id, formatExportId(rule.legacy_id, 'rule', rule.id)]));
    return {
      exported_at: formatToday(),
      source: EXPORT_SOURCE,
      note: EXPORT_NOTE,
      collections: {
        words: wordService.listWords().map(mapWordToExport),
        rules: rules.map(rule => mapRuleToExport(rule, exportIdByRuleId)),
        mistakes: exportMistakePatterns(exportIdByRuleId),
        phrases: artifactExportRepository.listPhrases().map(mapPhraseToExport),
        texts: artifactExportRepository.listTexts().map(mapTextToExport),
      },
    };
  }

  function formatExportFileName() {
    return `dutch-export-${formatToday()}.json`;
  }

  function exportMistakePatterns(exportIdByRuleId) {
    const casesByPatternId = new Map();
    for (const mistakeCase of artifactExportRepository.listMistakeCases()) {
      if (!casesByPatternId.has(mistakeCase.pattern_id)) casesByPatternId.set(mistakeCase.pattern_id, []);
      casesByPatternId.get(mistakeCase.pattern_id).push(mistakeCase);
    }
    return artifactExportRepository.listMistakePatterns().map(pattern => {
      const patternCases = casesByPatternId.get(pattern.id) ?? [];
      return {
        id: formatExportId(pattern.legacy_id, 'pattern', pattern.id),
        rule: pattern.rule_id === null ? 'other' : exportIdByRuleId.get(pattern.rule_id),
        title: pattern.title,
        fix: pattern.fix,
        count: patternCases.length,
        last: patternCases.length ? Math.max(...patternCases.map(mistakeCase => mistakeCase.created_at)) : null,
        cases: patternCases.map(mistakeCase => ({
          d: mistakeCase.occurred_on,
          r: mistakeCase.right_text,
          w: mistakeCase.wrong_text,
        })),
      };
    });
  }

  function formatToday() {
    return formatLocalCalendarDate(new Date(clock.now()));
  }

  return Object.freeze({ exportCollections, formatExportFileName });
}

function formatExportId(legacyId, prefix, id) {
  return legacyId ?? `${prefix}-${id}`;
}

function mapWordToExport(word) {
  const exportedWord = {
    id: formatExportId(word.legacy_id, 'word', word.id),
    added: word.added_at,
    art: word.article,
    nl: word.nl,
    uk: word.uk,
    status: word.status,
    ex: [word.example_nl, word.example_uk].filter(Boolean).join(' — '),
  };
  if (word.section) exportedWord.ch = word.section;
  if (word.topic) exportedWord.topic = word.topic;
  if (word.error_count) exportedWord.err = word.error_count;
  return exportedWord;
}

function mapRuleToExport(rule, exportIdByRuleId) {
  return {
    id: exportIdByRuleId.get(rule.id),
    title: rule.title,
    topic: rule.category ? `${rule.code} · ${rule.category}` : rule.code,
    order: rule.sort_order,
    body: rule.body,
  };
}

function mapPhraseToExport(phrase) {
  return {
    id: formatExportId(phrase.legacy_id, 'phrase', phrase.id),
    added: phrase.added_at,
    ctx: phrase.context,
    nl: phrase.nl,
    uk: phrase.uk,
  };
}

function mapTextToExport(text) {
  const exportedText = {
    id: formatExportId(text.legacy_id, 'text', text.id),
    added: text.added_at,
    body: text.body,
    title: text.title,
  };
  if (text.section) exportedText.ch = text.section;
  return exportedText;
}
