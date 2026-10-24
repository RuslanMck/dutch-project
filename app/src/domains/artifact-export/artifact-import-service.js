// Idempotent import of a claude.ai artifact export (dutch-export.json): rows are matched by legacy_id, so a
// second run updates what changed and adds only what is missing. Publishes every collection afterwards. Refused once
// practice is on FSRS: the import would overwrite the status and add words that are never ranked.
import { ConflictError, ValidationError } from '../../errors/domain-errors.js';
import { detectWordKind } from '../words/expression-detection.js';
import { parseCalendarDateToTimestamp, parseRuleTopic, splitExample } from './artifact-import-mapping.js';
import { formatImportReport } from './import-report-formatting.js';

const IMPORTED_COLLECTIONS = Object.freeze(['words', 'rules', 'mistakes', 'phrases', 'texts']);
const OTHER_RULE_REFERENCE = 'other';
const FSRS_IMPORT_REFUSAL_MESSAGE = 'the artifact import is disabled after the FSRS migration: '
  + 'it would overwrite the schedule';

export function createArtifactImportService({
  artifactImportRepository,
  sectionService,
  wordService,
  practiceSettings,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  // Returns { counts, report }: row counts after the import and the plain-text report.
  function importArtifactExport(exportDocument) {
    if (practiceSettings.isFsrsActive()) throw new ConflictError(FSRS_IMPORT_REFUSAL_MESSAGE);
    const collections = exportDocument?.collections;
    if (!collections || typeof collections !== 'object') {
      throw new ValidationError('export has no "collections" object');
    }
    const exportedWords = collections.words ?? [];
    const exportedRules = collections.rules ?? [];
    const exportedTexts = collections.texts ?? [];
    const importedAt = clock.now();
    const issues = { unknownRules: [], countMismatch: [], unparsedRules: [] };

    runInTransaction(() => {
      importSections({ exportedRules, exportedWords, exportedTexts });
      const ruleIdByLegacyId = importRules(exportedRules, importedAt, issues);
      importWords(exportedWords, importedAt);
      importPhrases(collections.phrases ?? [], importedAt);
      importTexts(exportedTexts, importedAt);
      importMistakePatterns(collections.mistakes ?? [], ruleIdByLegacyId, importedAt, issues);
    });
    for (const collection of IMPORTED_COLLECTIONS) changeEventBus.publishChange(collection);

    const counts = artifactImportRepository.countImportedRows();
    return { counts, report: formatImportReport({ exportedWords, issues, counts }) };
  }

  // Textbook sections named by rules (parsed topics), words and texts.
  function importSections({ exportedRules, exportedWords, exportedTexts }) {
    for (const exportedRule of exportedRules) {
      const { code, isParsed } = parseRuleTopic(exportedRule);
      if (isParsed) sectionService.ensureSection(code);
    }
    for (const exportedWord of exportedWords) sectionService.ensureSection(exportedWord.ch ?? null);
    for (const exportedText of exportedTexts) sectionService.ensureSection(exportedText.ch ?? null);
  }

  function importRules(exportedRules, importedAt, issues) {
    const ruleIdByLegacyId = new Map();
    for (const exportedRule of exportedRules) {
      const { code, category, isParsed } = parseRuleTopic(exportedRule);
      if (!isParsed) issues.unparsedRules.push(exportedRule.id);
      const ruleId = artifactImportRepository.upsertRule({
        legacyId: exportedRule.id,
        code,
        category,
        title: exportedRule.title,
        body: exportedRule.body ?? '',
        sortOrder: exportedRule.order ?? 0,
        sectionCode: isParsed ? code : null,
        importedAt,
      });
      ruleIdByLegacyId.set(exportedRule.id, ruleId);
    }
    return ruleIdByLegacyId;
  }

  // Topics are created in order of first appearance. The legacy error count becomes 'legacy_import' errors.
  function importWords(exportedWords, importedAt) {
    for (const exportedWord of exportedWords) {
      const { exampleDutch, exampleUkrainian } = splitExample(exportedWord.ex);
      const wordId = artifactImportRepository.upsertWord({
        legacyId: exportedWord.id,
        dutchText: exportedWord.nl,
        ukrainianText: exportedWord.uk,
        article: exportedWord.art ?? '',
        kind: detectWordKind(exportedWord.nl),
        exampleDutch,
        exampleUkrainian,
        topicId: wordService.ensureTopic(exportedWord.topic),
        sectionCode: exportedWord.ch ?? null,
        learningStatus: exportedWord.status ?? 'new',
        addedAt: exportedWord.added ?? importedAt,
        importedAt,
      });
      synchronizeLegacyErrors(wordId, Number(exportedWord.err ?? 0));
    }
  }

  // The word's 'legacy_import' errors must equal the export's count: adds or removes the difference.
  function synchronizeLegacyErrors(wordId, legacyErrorCount) {
    const legacyErrorIds = artifactImportRepository.listLegacyImportErrorIds(wordId);
    for (let errorIndex = legacyErrorIds.length; errorIndex < legacyErrorCount; errorIndex += 1) {
      artifactImportRepository.createLegacyImportError(wordId);
    }
    for (const surplusErrorId of legacyErrorIds.slice(legacyErrorCount)) {
      artifactImportRepository.deleteWordError(surplusErrorId);
    }
  }

  function importPhrases(exportedPhrases, importedAt) {
    for (const exportedPhrase of exportedPhrases) {
      artifactImportRepository.upsertPhrase({
        legacyId: exportedPhrase.id,
        dutchText: exportedPhrase.nl,
        ukrainianText: exportedPhrase.uk,
        context: exportedPhrase.ctx ?? null,
        addedAt: exportedPhrase.added ?? importedAt,
      });
    }
  }

  function importTexts(exportedTexts, importedAt) {
    for (const exportedText of exportedTexts) {
      artifactImportRepository.upsertText({
        legacyId: exportedText.id,
        title: exportedText.title,
        sectionCode: exportedText.ch ?? null,
        body: exportedText.body,
        addedAt: exportedText.added ?? importedAt,
      });
    }
  }

  // Rule "other" becomes rule_id NULL. A case is identified by pattern, wrong text, right text and date.
  function importMistakePatterns(exportedPatterns, ruleIdByLegacyId, importedAt, issues) {
    for (const exportedPattern of exportedPatterns) {
      const exportedCases = exportedPattern.cases ?? [];
      if (exportedPattern.count !== undefined && exportedPattern.count !== exportedCases.length) {
        issues.countMismatch.push({
          id: exportedPattern.id,
          count: exportedPattern.count,
          cases: exportedCases.length,
        });
      }
      let ruleId = null;
      if (exportedPattern.rule && exportedPattern.rule !== OTHER_RULE_REFERENCE) {
        ruleId = ruleIdByLegacyId.get(exportedPattern.rule) ?? null;
        if (ruleId === null) issues.unknownRules.push({ pattern: exportedPattern.id, rule: exportedPattern.rule });
      }
      const patternId = artifactImportRepository.upsertMistakePattern({
        legacyId: exportedPattern.id,
        ruleId,
        title: exportedPattern.title,
        fix: exportedPattern.fix ?? null,
        createdAt: exportedPattern.last ?? importedAt,
      });
      for (const exportedCase of exportedCases) importMistakeCase(patternId, exportedCase, importedAt);
    }
  }

  function importMistakeCase(patternId, exportedCase, importedAt) {
    const mistakeCase = { patternId, wrongText: exportedCase.w, rightText: exportedCase.r, occurredOn: exportedCase.d };
    if (artifactImportRepository.hasMistakeCase(mistakeCase)) return;
    artifactImportRepository.createMistakeCase({
      ...mistakeCase,
      createdAt: parseCalendarDateToTimestamp(exportedCase.d) ?? importedAt,
    });
  }

  return Object.freeze({ importArtifactExport });
}
