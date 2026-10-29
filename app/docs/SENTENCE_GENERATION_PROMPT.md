# Prompt: sentences for the word-order exercise

Paste the text below into a chat of your Claude Project (the one connected to the app's MCP server). It writes a
`.md` file of sentences for the «Порядок слів» exercise. You can then let Claude save them with `add_sentences`, or
import the file on the «Порядок слів» page.

---

Make 20 new sentences for my word-order exercise (Duolingo-style: I see the Ukrainian sentence and put the Dutch words
in the right order).

**First look up what I know**

1. Call `list_words` with status `learned`, then with status `learning`, and then with sort `due` and limit 200. These are my
   words.
2. Call `list_sentences` with limit 500, so you don't repeat a sentence that is already saved.

**Rules for each sentence**

- Level A1–A2. 4 to 9 words. One clause, or a main clause plus one short subordinate clause.
- Every sentence uses at least one of my `learning` or `learned` words. The other words are from my word list, or
  small grammar words (ik, jij, je, hij, zij, we, de, het, een, is, zijn, heb, niet, geen, en, maar, ook, nog, er, al,
  om, in, op, met, voor, naar, van, dat, omdat, als, wat, waar, hoe).
- Spread the sentences over the Dutch word-order rules, at least 2 sentences each:
  - verb second in a main clause: `Ik drink koffie.`
  - inversion after a time or place word: `Morgen gaan we naar de markt.`
  - a question with the verb first: `Heb je een mes?`
  - modal verb + infinitive at the end: `We willen bij het raam zitten.`
  - separable verb: `Ik bel je morgen op.`
  - `niet` / `geen` in the right place
  - verb at the end after `omdat`, `dat` or `als`: `Ik blijf thuis omdat ik ziek ben.`
  - perfect tense with the participle at the end: `Ik heb de rekening betaald.`
- Only one correct word order. If two orders are both natural Dutch, choose another sentence.
- No commas, quotes, numbers or names. End with `.` or `?`.
- The Ukrainian is a natural translation, not word by word. Use the informal «ти» unless the sentence is clearly polite.

**Schema of each sentence**

Each sentence also gets its schema («Схема»): the Dutch sentence split into ordered segments, each with its role in
Ukrainian. The segments, joined by single spaces, must give exactly the sentence's words in the same order (no word
missing, repeated or moved; the same punctuation rules as the sentence). Use these roles:
`підмет`, `дієслово`, `модальне дієслово`, `допоміжне дієслово`, `інфінітив`, `дієприкметник`,
`відокремлювана частина`, `додаток`, `прикметник`, `час`, `місце`, `спосіб`, `причина`, `заперечення`, `сполучник`,
`питальне слово`, `частка`.

Use `частка` for particles and modal words such as misschien, ook, toch, maar, even, wel, eens (a word that only
adds tone or emphasis, not a time, place or manner).

The schema has the form `Deze week (час) + ben (дієслово) + ik (підмет) + jarig (прикметник)`. For example:

- `Ik drink koffie.`: `Ik (підмет) + drink (дієслово) + koffie (додаток)`
- `Morgen gaan we naar de markt.`: `Morgen (час) + gaan (дієслово) + we (підмет) + naar de markt (місце)`
- `We willen bij het raam zitten.`: `We (підмет) + willen (модальне дієслово) + bij het raam (місце) + zitten (інфінітив)`
- `Ik heb de rekening betaald.`: `Ik (підмет) + heb (допоміжне дієслово) + de rekening (додаток) + betaald (дієприкметник)`
- `Ik bel je morgen op.`: `Ik (підмет) + bel (дієслово) + je (додаток) + morgen (час) + op (відокремлювана частина)`

**Output**

A `.md` file named `sentences-YYYY-MM-DD.md` with exactly this table (the app reads this format):

```markdown
# Порядок слів — YYYY-MM-DD

| # | Українською | Nederlands | Правило | Схема |
|---|---|---|---|---|
| 1 | Завтра ми йдемо на ринок. | Morgen gaan we naar de markt. | inversion | Morgen (час) + gaan (дієслово) + we (підмет) + naar de markt (місце) |
```

The `Правило` column is one of: `v2`, `inversion`, `question`, `modal`, `separable`, `negation`, `subordinate`,
`perfect`. The `Схема` column is the schema in the form above.

Then ask me: «Зберегти ці речення в додаток?». When I say yes, call `add_sentences` with all of them: for each sentence
`nl`, `uk`, `rule` and `structure`, the schema as an array of `{ text, role }` objects in order, for example
`[{"text":"Morgen","role":"час"},{"text":"gaan","role":"дієслово"},{"text":"we","role":"підмет"},{"text":"naar de markt","role":"місце"}]`.
Tell me how many were added, how many were skipped as duplicates, and any warning (a schema that does not match its sentence is
dropped and the sentence is still added).

**Schemas for sentences saved earlier**

When I ask for it (or when I ask for sentences and some saved ones have no schema): call `list_sentences` with limit 500
and, for each sentence whose `structure` is null, call `update_sentence` with its `id` and `structure` (the same array of
`{ text, role }` as above, built from its `nl`). Tell me how many got a schema.
