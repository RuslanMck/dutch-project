// Grammar rule business rules: lookup by id or code, default section and display order, and what happens to
// mistake patterns when a rule is deleted. Publishes 'rules' (and 'mistakes') change events.
import { NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';

const SORT_ORDER_STEP = 10;

export function createRuleService({ ruleRepository, sectionService, runInTransaction, changeEventBus, clock }) {
  // ruleReference: a numeric id (number or digit string) or a code such as '5.5'.
  function getRule(ruleReference) {
    const referenceText = String(ruleReference ?? '').trim();
    if (!referenceText) throw new ValidationError('rule id or code required');
    const rule = /^\d+$/.test(referenceText)
      ? ruleRepository.findRuleById(Number(referenceText))
      : ruleRepository.findFirstRuleByCode(referenceText);
    if (!rule) throw new NotFoundError(`rule ${referenceText} not found`);
    return rule;
  }

  function findRuleById(ruleId) {
    return ruleRepository.findRuleById(ruleId);
  }

  function findFirstRuleByCode(code) {
    return ruleRepository.findFirstRuleByCode(code);
  }

  function listRules() {
    return ruleRepository.listRules();
  }

  // Without a section, the rule's code is its section. Without a sort order, it goes after the last rule.
  function createRule(ruleInput) {
    const ruleId = runInTransaction(() => {
      const sectionCode = ruleInput.section === undefined ? ruleInput.code : mapBlankTextToNull(ruleInput.section);
      return ruleRepository.createRule({
        legacyId: mapBlankTextToNull(ruleInput.legacy_id),
        code: ruleInput.code,
        category: mapBlankTextToNull(ruleInput.category),
        title: ruleInput.title,
        body: ruleInput.body,
        sortOrder: ruleInput.sort_order ?? ruleRepository.findMaximumSortOrder() + SORT_ORDER_STEP,
        sectionCode: sectionService.ensureSection(sectionCode),
        createdAt: clock.now(),
      });
    });
    changeEventBus.publishChange('rules');
    return getRule(ruleId);
  }

  // Only the given fields change.
  function updateRule(ruleId, ruleChanges) {
    runInTransaction(() => {
      getRule(ruleId);
      ruleRepository.updateRule(ruleId, mapRuleChangesToColumns(ruleChanges));
    });
    changeEventBus.publishChange('rules');
    return getRule(ruleId);
  }

  // The rule's mistake patterns fall back to "other" (rule_id NULL, by the foreign key).
  function deleteRule(ruleId) {
    runInTransaction(() => {
      getRule(ruleId);
      ruleRepository.deleteRule(ruleId);
    });
    changeEventBus.publishChange('rules');
    changeEventBus.publishChange('mistakes');
  }

  function mapRuleChangesToColumns(ruleChanges) {
    const columnChanges = {};
    if (ruleChanges.code !== undefined) columnChanges.code = ruleChanges.code;
    if (ruleChanges.category !== undefined) columnChanges.category = mapBlankTextToNull(ruleChanges.category);
    if (ruleChanges.title !== undefined) columnChanges.title = ruleChanges.title;
    if (ruleChanges.body !== undefined) columnChanges.body = ruleChanges.body;
    if (ruleChanges.sort_order !== undefined) columnChanges.sortOrder = ruleChanges.sort_order;
    if (ruleChanges.section !== undefined) {
      columnChanges.sectionCode = sectionService.ensureSection(mapBlankTextToNull(ruleChanges.section));
    }
    columnChanges.updatedAt = clock.now();
    return columnChanges;
  }

  return Object.freeze({
    getRule,
    findRuleById,
    findFirstRuleByCode,
    listRules,
    createRule,
    updateRule,
    deleteRule,
  });
}
