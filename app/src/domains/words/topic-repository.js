// SQL for dictionary topics. No business rules.
export function createTopicRepository({ database }) {
  const ensureTopicStatement = database.prepare(`
    INSERT OR IGNORE INTO topics (name, sort_order)
    VALUES (@name, (SELECT COALESCE(MAX(topics.sort_order), 0) + 1 FROM topics))
  `);
  const selectTopicIdByNameStatement = database.prepare('SELECT id FROM topics WHERE name = @name').pluck();
  const selectTopicsWithWordCountsStatement = database.prepare(`
    SELECT topics.id, topics.name, COUNT(words.id) AS word_count
    FROM topics
    LEFT JOIN words ON words.topic_id = topics.id
    GROUP BY topics.id
    ORDER BY topics.sort_order, topics.id
  `);

  // Returns the topic's id, creating the topic at the end of the order when it is new.
  function ensureTopic(topicName) {
    ensureTopicStatement.run({ name: topicName });
    return selectTopicIdByNameStatement.get({ name: topicName });
  }

  function listTopicsWithWordCounts() {
    return selectTopicsWithWordCountsStatement.all();
  }

  return Object.freeze({ ensureTopic, listTopicsWithWordCounts });
}
