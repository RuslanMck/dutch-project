// MCP adapter for the practice: registers the practice tools. Arguments are parsed by the MCP SDK with the practice
// contracts; each tool calls the practice, phrase practice or priority service.
import {
  gradePhraseToolInputSchema,
  gradeWordToolInputSchema,
  importFrequencyListInputSchema,
  migrateToFsrsInputSchema,
  practiceBatchToolInputSchema,
  previewPrioritiesInputSchema,
  resetPracticeInputSchema,
  setCurrentChapterInputSchema,
  setWordPriorityInputSchema,
} from '../../contracts/practice-contracts.js';
import {
  DESTRUCTIVE_TOOL_ANNOTATIONS,
  READ_ONLY_TOOL_ANNOTATIONS,
  registerJsonTool,
} from '../../model-context-protocol/mcp-tool-registration.js';
import { mapWordToCompactWord } from '../words/compact-word-mapping.js';

export function registerPracticeTools({
  mcpServer,
  practiceService,
  practiceResetService,
  phrasePracticeService,
  priorityService,
  wordService,
}) {
  registerJsonTool(mcpServer, 'get_practice_batch', {
    title: 'Get practice batch',
    description: 'Words to practise now: one set of at most 10 words (counts.set_size). Old words fill it first: '
      + 'words still being learned, then reviews due today (most overdue first); new words fill only the room '
      + 'left, so a set can be 10 new, 6 new and 4 old, or 10 old. Every card of the set is practised in two '
      + 'rounds. Round 1, direction uk_nl: show each card whose directions_left has uk_nl by its uk and ask for the '
      + 'Dutch. Round 2, direction nl_uk, once round 1 is done: show each card whose directions_left has nl_uk by '
      + 'its nl with the article and ask for the Ukrainian, in a new order (not the order of round 1, and not the '
      + 'card just answered). Grade each answer with grade_word and its direction, repeats too, and ask a word '
      + 'again until grade_word says it is no longer in the deck. A word is learned only when both directions are '
      + 'done. When the set is done, the same call with the same session_id gives the next set. Returns {session_id, '
      + 'reviews, new_words, counts (with deck_size)}, each word {id, uk, nl, article, kind, state, priority, '
      + 'directions_left (uk_nl and/or nl_uk still to answer in this set), deck {in_deck, times_left, uk_nl: '
      + '{in_deck, required_correct, correct_count, times_left}, nl_uk: {same fields}}}.',
    inputSchema: practiceBatchToolInputSchema.shape,
  }, ({ session_id: sessionId, max_reviews: maxReviews }) => practiceService.getPracticeBatch({
    sessionId,
    maxReviews,
  }));

  registerJsonTool(mcpServer, 'grade_word', {
    title: 'Grade word',
    description: 'Record an answer to a word in one direction: "uk_nl" (round 1, the Ukrainian was shown and the '
      + 'Dutch answered; the default) or "nl_uk" (round 2, the Dutch was shown and the Ukrainian answered). Grades: '
      + '"good" fully right; the article is optional, so a missing or wrong de/het still counts as good (say what '
      + 'the right article is). "hard" (uk_nl only) a spelling slip of one letter or a correct Dutch synonym; for '
      + 'nl_uk the Ukrainian is "good" when it is right (any fitting translation, judge the meaning), otherwise '
      + '"again"; "again" wrong or not known. The first answer per word per session schedules its FSRS review and, '
      + 'for again and hard, logs a word error. Every answer, repeats too, moves the word in the learning deck: each '
      + 'direction needs required_correct right answers (2, plus 1 for each again or hard, up to 6); a mistake keeps '
      + 'the right answers given. A review answered right is done; answered wrong it joins the session with 3 to go. '
      + 'Returns {word, grade, direction, is_repeat, state, status, interval_days, next_due_on, deck {in_deck, '
      + 'times_left, uk_nl and nl_uk (each {in_deck, required_correct, correct_count, times_left}), has_learned, '
      + 'has_learned_direction}}: tell the learner "повторень до вивчення: times_left" of the answered direction; '
      + 'when has_learned_direction and not has_learned, that direction is learned and the other one is still to go; '
      + 'when has_learned, that the word is learned.',
    inputSchema: gradeWordToolInputSchema.shape,
  }, ({ id, grade, answer, session_id: sessionId, direction }) => practiceService.gradeWord({
    wordId: id,
    grade,
    answer,
    sessionId,
    direction,
  }));

  registerJsonTool(mcpServer, 'get_phrase_batch', {
    title: 'Get phrase batch',
    description: 'Phrases to practise now: one set of at most 10 phrases. Due phrases fill it first (most overdue '
      + 'first), new phrases (oldest first) only the room left. Every phrase of the set is practised in two rounds: '
      + 'round 1, direction uk_nl, shows the uk of each phrase whose directions_left has uk_nl and asks for the Dutch; '
      + 'round 2, direction nl_uk, shows the nl of each phrase whose directions_left has nl_uk and asks for the '
      + 'Ukrainian, in a new order. Grade each answer with grade_phrase and its direction. A phrase is finished when '
      + 'both directions are graded; once every phrase of the set is finished, the same call with the same session_id '
      + 'gives the next set. Returns {session_id, reviews, new_phrases, counts}, each phrase {id, nl, uk, context, '
      + 'state, status, directions_left}.',
    inputSchema: practiceBatchToolInputSchema.shape,
  }, ({ session_id: sessionId, max_reviews: maxReviews }) => phrasePracticeService.getPhraseBatch({
    sessionId,
    maxReviews,
  }));

  registerJsonTool(mcpServer, 'grade_phrase', {
    title: 'Grade phrase',
    description: 'Record the answer to a phrase in one direction in this session: "uk_nl" (round 1, the Ukrainian was '
      + 'shown; the default) or "nl_uk" (round 2, the Dutch was shown). Grades: "good" fully right; "hard" right '
      + 'phrase with a small slip; "again" wrong or not known. Only the first grade per phrase and direction per '
      + 'session counts: a second one in the same direction is refused. Phrases log no word errors. Returns {phrase, '
      + 'direction, grade, state, status, interval_days, next_due_on}.',
    inputSchema: gradePhraseToolInputSchema.shape,
  }, ({ id, grade, session_id: sessionId, direction }) => phrasePracticeService.gradePhrase({
    phraseId: id,
    grade,
    sessionId,
    direction,
  }));

  registerJsonTool(mcpServer, 'set_current_chapter', {
    title: 'Set current chapter',
    description: 'Set the textbook chapter the learner is on. Words of this chapter and the one before become '
      + 'priority 1; other New words are prioritised by frequency. Manual priorities stay. Returns the preview for the '
      + 'new chapter: {chapter, counts, unranked_count, examples}.',
    inputSchema: setCurrentChapterInputSchema.shape,
  }, ({ chapter }) => priorityService.setCurrentChapter(chapter));

  registerJsonTool(mcpServer, 'set_word_priority', {
    title: 'Set word priority',
    description: 'Set one word to priority 1, 2 or 3 by hand; the setting survives chapter changes. Pass null to clear '
      + 'the manual priority and go back to the computed one. Returns the word as the word tools return it, with '
      + 'priority_override (null when none).',
    inputSchema: setWordPriorityInputSchema.shape,
  }, ({ id, priority }) => {
    priorityService.setWordPriority(id, priority);
    return mapWordToCompactWord(wordService.getWord(id));
  });

  registerJsonTool(mcpServer, 'import_frequency_list', {
    title: 'Import frequency list',
    description: 'Import word frequencies, rank 1 = most frequent, as {form, rank} entries (at most 20000 per call). '
      + 'replace_existing true replaces the whole list; by default only the given forms change. Every word is '
      + 're-ranked and its priority recalculated. Returns {imported, words_ranked, words_unranked}.',
    inputSchema: importFrequencyListInputSchema.shape,
  }, ({ entries, replace_existing: shouldReplaceExisting }) => priorityService.importFrequencyList(
    entries.map(entry => ({ wordForm: entry.form, frequencyRank: entry.rank })),
    { shouldReplaceExisting: shouldReplaceExisting ?? false },
  ));

  registerJsonTool(mcpServer, 'preview_priorities', {
    title: 'Preview priorities',
    description: 'Preview which priority the New words would get for a chapter (default: the current chapter). '
      + 'Changes nothing. Returns {chapter, counts, unranked_count, examples}, where examples lists up to 10 words per '
      + 'priority in queue order.',
    inputSchema: previewPrioritiesInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ chapter }) => priorityService.previewPriorities({ chapter }));

  registerJsonTool(mcpServer, 'migrate_to_fsrs', {
    title: 'Migrate practice to FSRS',
    description: 'One-time switch of the practice to the FSRS schedule. Learning words are spread over the next '
      + '4 days, learned words are due in 21 days, new words stay new. The default dry run only reports the counts '
      + 'and writes nothing; run with dry_run false only after the learner agrees. Returns {dry_run, learning, '
      + 'learned, new, learning_due_by_day, learned_due_on}.',
    inputSchema: migrateToFsrsInputSchema.shape,
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
  }, ({ dry_run: isDryRun }) => practiceService.migrateToFsrs({ isDryRun: isDryRun ?? true }));

  registerJsonTool(mcpServer, 'reset_practice', {
    title: 'Reset practice',
    description: 'Start the practice over: every word and phrase goes back to New and the practice sets are '
      + 'cleared, so the next batch is a set of new words. Review history and error counts are kept. '
      + 'Use only '
      + 'when the learner asks for a fresh start. The default dry run only reports the counts; run with dry_run false '
      + 'after the learner agrees. Returns {dry_run, words_reset, phrases_reset}.',
    inputSchema: resetPracticeInputSchema.shape,
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
  }, ({ dry_run: isDryRun }) => practiceResetService.resetPractice({ isDryRun: isDryRun ?? true }));

  registerJsonTool(mcpServer, 'practice_stats', {
    title: 'Practice statistics',
    description: 'Practice numbers: reviews due today and tomorrow, overdue words, words introduced today, the set '
      + 'size and the words of the set still to practise (set_words_left, is_set_open), New words waiting per '
      + 'priority, words per state (new, learning, review, relearning) and the share of "good" grades over the last 7 '
      + 'and 30 days '
      + '(null when there were none). The phrases key holds the same kind of numbers for phrases.',
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, () => practiceService.calculatePracticeStatistics());

  registerJsonTool(mcpServer, 'get_struggling_words', {
    title: 'Get struggling words',
    description: 'Words to drill: the words whose latest graded answer was again or hard, most errors first. A '
      + 'follow-up drill that changes nothing: quiz these words with the learner and do NOT call grade_word or '
      + 'log_word_error for them; the schedule only changes in real practice. Returns {words, count}, each word {id, '
      + 'uk, nl, article, kind, state, priority, error_count, last_grade, last_reviewed_on}.',
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, () => practiceService.listStrugglingWords());
}
