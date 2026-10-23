// Sections are created on demand when a rule, word, phrase or text names one.
// Codes that start with 'Д' are the learner's own rules, not textbook sections.
const OWN_RULE_SECTION_PREFIX = 'Д';

export function createSectionService({ sectionRepository }) {
  // Returns the code, or null when there is none, so callers can store it as the section reference.
  function ensureSection(sectionCode) {
    if (!sectionCode) return null;
    sectionRepository.ensureSection({
      code: sectionCode,
      isTextbook: !sectionCode.startsWith(OWN_RULE_SECTION_PREFIX),
    });
    return sectionCode;
  }

  return Object.freeze({ ensureSection });
}
