// The MCP server instructions: what the database holds and the lesson workflows Claude follows.
export const MCP_INSTRUCTIONS = [
  "This is the learner's Dutch (NL) → Ukrainian (UK) learning database. "
    + 'The web app is in Ukrainian; the data is stored as given.',
  "Words and expressions share the words table; kind ('word' | 'expression') is detected automatically.",
  "article is 'de', 'het' or '' (none). section is the textbook chapter code, e.g. '6.1'. "
    + 'status goes new → learning → learned.',
  "Rule codes such as '5.5' or 'Д1' are what feedback must cite: they are the rule numbers shown in the app.",
  '',
  'Workflows:',
  '1. Exercise check: for every grammar mistake call log_mistake with the rule_code it breaks '
    + '(call list_rules if unsure;',
  '   pass rule_code null when no rule fits). If a pattern for the same kind of mistake already exists',
  '   (list_mistake_patterns), pass its pattern_id; otherwise pass a short title and a one-line fix in Ukrainian.',
  '   For every word the learner got wrong, call log_word_error (it creates the word if it is missing).',
  "   Words the learner marks DNK (did not know) go to add_words with status 'new'.",
  '2. Translating sentences or dialogues: new words go to add_words (with section and example_nl/example_uk);',
  '   stable phrases go to add_phrases with context = the dialogue name.',
  '3. Always search_words before adding, to avoid duplicates. add_words also skips exact duplicates',
  "   (same nl and article) and reports them in 'skipped'.",
  'Changes appear live in the web app.',
].join('\n');
