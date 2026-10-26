// MCP adapter for the practice: registers the practice tools. Arguments are parsed by the MCP SDK with the practice
// contracts; each tool calls the practice, phrase practice or priority service.
import {
  addExtraNewWordsInputSchema,
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
    description: 'Words to practise now for one session: reviews that are due (most overdue first) and new words '
      + '(at most 10 a day, split by priority). New words wait while any word is overdue: counts.new_words_blocked '
      + 'is true then, and they come back once the overdue words are graded. Show each word by its uk and ask for the '
      + 'Dutch; grade the first answer with grade_word. Returns {session_id, reviews, new_words, counts}, each word '
      + '{id, uk, nl, article, kind, state, priority}.',
    inputSchema: practiceBatchToolInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ session_id: sessionId, max_reviews: maxReviews }) => practiceService.getPracticeBatch({
    sessionId,
    maxReviews,
  }));

  registerJsonTool(mcpServer, 'grade_word', {
    title: 'Grade word',
    description: 'Record the first answer to a word in this session and schedule its next review. Grades: '
      + '"good" fully right; the article is optional, so a missing or wrong de/het still counts as good (say what the '
      + 'right article is). "hard" right word with a spelling slip, or a correct Dutch synonym; "again" wrong or not '
      + 'known. Only the first grade per word per session counts: a second one is refused. "again" and "hard" also '
      + 'log a word error. Returns {word, grade, state, status, interval_days, next_due_on}.',
    inputSchema: gradeWordToolInputSchema.shape,
  }, ({ id, grade, answer, session_id: sessionId }) => practiceService.gradeWord({
    wordId: id,
    grade,
    answer,
    sessionId,
  }));

  registerJsonTool(mcpServer, 'get_phrase_batch', {
    title: 'Get phrase batch',
    description: 'Phrases to practise now for one session: phrase reviews that are due (most overdue first) and at '
      + 'most 5 new phrases a day, oldest first. No new phrase is offered while a phrase is overdue '
      + '(counts.new_phrases_blocked). Show each phrase by its uk and ask for the Dutch; grade the first '
      + 'answer with grade_phrase. Returns {session_id, reviews, new_phrases, counts}, each phrase {id, nl, uk, '
      + 'context, state, status}.',
    inputSchema: practiceBatchToolInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ session_id: sessionId, max_reviews: maxReviews }) => phrasePracticeService.getPhraseBatch({
    sessionId,
    maxReviews,
  }));

  registerJsonTool(mcpServer, 'grade_phrase', {
    title: 'Grade phrase',
    description: 'Record the first answer to a phrase in this session and schedule its next review. Grades: "good" '
      + 'fully right; "hard" right phrase with a small slip; "again" wrong or not known. Only the first grade per '
      + 'phrase per session counts: a second one is refused. Phrases log no word errors. Returns {phrase, grade, '
      + 'state, status, interval_days, next_due_on}.',
    inputSchema: gradePhraseToolInputSchema.shape,
  }, ({ id, grade, session_id: sessionId }) => phrasePracticeService.gradePhrase({
    phraseId: id,
    grade,
    sessionId,
  }));

  registerJsonTool(mcpServer, 'add_extra_new_words', {
    title: 'Add extra new words',
    description: 'Give the learner more new words today, on top of the regular 10, when they ask for more (for example '
      + 'after today\'s words are done: offer "ще 10 нових слів?"). Adds count (1 to 50, default 10) for today only; '
      + 'it resets tomorrow. Refused while any word is overdue or the regular new words of today are not used up yet. '
      + 'After a success, call get_practice_batch again with the same session_id to get the words. Returns '
      + '{extra_new_words_today, new_today_remaining}.',
    inputSchema: addExtraNewWordsInputSchema.shape,
  }, ({ count }) => practiceService.addExtraNewWords({ count }));

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
    description: 'Start the practice over: every word and phrase goes back to New and today\'s extra new words are '
      + 'cleared, so the next batch holds only the day\'s new words. Review history and error counts are kept. '
      + 'Use only '
      + 'when the learner asks for a fresh start. The default dry run only reports the counts; run with dry_run false '
      + 'after the learner agrees. Returns {dry_run, words_reset, phrases_reset}.',
    inputSchema: resetPracticeInputSchema.shape,
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
  }, ({ dry_run: isDryRun }) => practiceResetService.resetPractice({ isDryRun: isDryRun ?? true }));

  registerJsonTool(mcpServer, 'practice_stats', {
    title: 'Practice statistics',
    description: 'Practice numbers: reviews due today and tomorrow, overdue words, whether new words are held back by '
      + 'them (new_words_blocked), words introduced today, extra new words added today, New words waiting per '
      + 'priority, words per state (new, learning, review, relearning) and the share of "good" grades over the last 7 '
      + 'and 30 days '
      + '(null when there were none). The phrases key holds the same kind of numbers for phrases, with '
      + 'new_phrases_blocked.',
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
