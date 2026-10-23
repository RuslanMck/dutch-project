// Mistake business rules: resolving the rule a mistake belongs to, reusing a pattern with the same rule and
// title, and adding cases. Publishes 'mistakes' change events after each commit.
import { NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import { formatLocalCalendarDate } from '../../time/calendar-date-formatting.js';
import { mapBlankTextToNull } from '../blank-text.js';

// Rule references that mean "no rule fits" (the "Інші помилки" group).
const NO_RULE_REFERENCES = new Set(['', 'other', 'null']);

export function createMistakeService({ mistakeRepository, ruleService, runInTransaction, changeEventBus, clock }) {
  function getPattern(patternId) {
    const pattern = mistakeRepository.findPatternById(patternId);
    if (!pattern) throw new NotFoundError(`mistake pattern ${patternId} not found`);
    return pattern;
  }

  // rule_id: a number (or digit string), or 'null' / 'other'. rule_code: a code, or 'other' / 'null'.
  // Most frequent patterns first, then the most recent.
  function listPatterns({ rule_id: ruleId, rule_code: ruleCode } = {}) {
    return mistakeRepository.listPatterns({
      ruleIdFilter: parseRuleIdFilter(ruleId),
      ruleCodeFilter: ruleCode === undefined || ruleCode === null ? undefined : mapRuleCodeFilter(ruleCode),
    });
  }

  function createPattern({ rule_id: ruleId, rule_code: ruleCode, title, fix }) {
    const patternId = runInTransaction(() => mistakeRepository.createPattern({
      ruleId: resolveRuleId(ruleId, ruleCode),
      title,
      fix: mapBlankTextToNull(fix),
      createdAt: clock.now(),
    }));
    changeEventBus.publishChange('mistakes');
    return getPattern(patternId);
  }

  function deletePattern(patternId) {
    runInTransaction(() => {
      ensurePatternExists(patternId);
      mistakeRepository.deletePattern(patternId);
    });
    changeEventBus.publishChange('mistakes');
  }

  function addMistakeCase(patternId, caseInput) {
    runInTransaction(() => {
      ensurePatternExists(patternId);
      addCaseToPattern(patternId, caseInput, clock.now());
    });
    changeEventBus.publishChange('mistakes');
    return getPattern(patternId);
  }

  function deleteMistakeCase(caseId) {
    runInTransaction(() => {
      if (!mistakeRepository.hasCase(caseId)) throw new NotFoundError(`mistake case ${caseId} not found`);
      mistakeRepository.deleteCase(caseId);
    });
    changeEventBus.publishChange('mistakes');
  }

  // With pattern_id, the case goes to that pattern. Otherwise it goes to the pattern with the same rule and the
  // same title (case-insensitive), or to a new pattern. Returns the pattern.
  function logMistake(mistakeInput) {
    const patternId = runInTransaction(() => {
      const timestamp = clock.now();
      if (mistakeInput.pattern_id !== undefined && mistakeInput.pattern_id !== null) {
        ensurePatternExists(mistakeInput.pattern_id);
        addCaseToPattern(mistakeInput.pattern_id, mistakeInput, timestamp);
        return mistakeInput.pattern_id;
      }
      if (!mistakeInput.title) throw new ValidationError('title is required when pattern_id is not given');
      const ruleId = resolveRuleId(null, mistakeInput.rule_code);
      const wantedTitle = mistakeInput.title.toLowerCase();
      const matchingPattern = mistakeRepository.listPatternTitlesByRuleId(ruleId)
        .find(pattern => pattern.title.toLowerCase() === wantedTitle);
      const targetPatternId = matchingPattern?.id ?? mistakeRepository.createPattern({
        ruleId,
        title: mistakeInput.title,
        fix: mapBlankTextToNull(mistakeInput.fix),
        createdAt: timestamp,
      });
      addCaseToPattern(targetPatternId, mistakeInput, timestamp);
      return targetPatternId;
    });
    changeEventBus.publishChange('mistakes');
    return getPattern(patternId);
  }

  function ensurePatternExists(patternId) {
    if (!mistakeRepository.hasPattern(patternId)) throw new NotFoundError(`mistake pattern ${patternId} not found`);
  }

  // The case date defaults to today (local calendar date).
  function addCaseToPattern(patternId, { wrong, right, date, source }, timestamp) {
    mistakeRepository.createCase({
      patternId,
      wrongText: wrong,
      rightText: right,
      occurredOn: date ?? formatLocalCalendarDate(new Date(clock.now())),
      source: source ?? null,
      createdAt: timestamp,
    });
  }

  // A given rule id must exist and wins over the code. Returns null when no rule fits.
  function resolveRuleId(ruleId, ruleCode) {
    if (ruleId !== undefined && ruleId !== null) {
      const rule = ruleService.findRuleById(ruleId);
      if (!rule) throw new ValidationError(`unknown rule_id ${ruleId}`);
      return rule.id;
    }
    if (ruleCode === undefined || ruleCode === null || NO_RULE_REFERENCES.has(ruleCode)) return null;
    const rule = ruleService.findFirstRuleByCode(ruleCode);
    if (!rule) throw new ValidationError(`unknown rule code ${ruleCode}`);
    return rule.id;
  }

  return Object.freeze({
    getPattern,
    listPatterns,
    createPattern,
    deletePattern,
    addMistakeCase,
    deleteMistakeCase,
    logMistake,
  });
}

// undefined: no filter; null: patterns outside the rules; a number: that rule.
function parseRuleIdFilter(ruleId) {
  if (ruleId === undefined || ruleId === null) return undefined;
  if (ruleId === 'null' || ruleId === 'other') return null;
  if (typeof ruleId === 'number' || /^\d+$/.test(ruleId)) return Number(ruleId);
  throw new ValidationError('rule_id must be a number or "null"');
}

function mapRuleCodeFilter(ruleCode) {
  return ruleCode === 'other' || ruleCode === 'null' ? null : ruleCode;
}
