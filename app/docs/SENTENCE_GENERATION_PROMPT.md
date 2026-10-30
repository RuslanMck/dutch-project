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
- Other correct orders: if another word order is also natural Dutch, keep the sentence and list that order in the
  `Інші порядки` column (see Output). The sentence itself is the most neutral order. Every other order uses exactly the
  same words (each as often as in the sentence) and the same schema segments: each segment stays together as one block,
  and the blocks may come in another order. A clause that moves can be several segments, as long as each of them stays
  whole (`Omdat ik dorst heb, neem ik een drankje.` fits `omdat + ik + dorst + heb + neem + ik + een drankje`). An
  order that only differs in capitals or punctuation is not another order. At most 5 other orders.
- Wrong forms: each sentence gets 2 or 3 wrong forms (at most 5) for the `Хибні форми` column. They are shown as extra
  tiles, so they must look tempting: single words that look like a word of the sentence but are wrong in it. Use the
  verb in another person or tense (`gaat`, `ga` or `ging` for `gaan`), an adjective with or without -e (`mooie` for
  `mooi`), singular or plural (`huizen` for `huis`), `het` for a de-word or `de` for a het-word. Each must make the
  sentence wrong wherever it is put: never a word that could stand in a correct sentence (not `wij` for `we`, not `een`
  for `het`, not a synonym), and never a word of the sentence itself.
- No quotes, numbers or names. No commas in the sentence itself; an other order may have the comma after a fronted
  clause. End with `.` or `?`.
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

| # | Українською | Nederlands | Правило | Схема | Інші порядки | Хибні форми |
|---|---|---|---|---|---|---|
| 1 | Завтра ми йдемо на ринок. | Morgen gaan we naar de markt. | inversion | Morgen (час) + gaan (дієслово) + we (підмет) + naar de markt (місце) | We gaan morgen naar de markt. | gaat; ga; het |
| 2 | Я п'ю каву. | Ik drink koffie. | v2 | Ik (підмет) + drink (дієслово) + koffie (додаток) |  | drinkt; drinken |
```

The `Правило` column is one of: `v2`, `inversion`, `question`, `modal`, `separable`, `negation`, `subordinate`,
`perfect`. The `Схема` column is the schema in the form above. The `Інші порядки` column holds the other natural orders
of the sentence separated by `;` (spaces around it optional), or stays empty (or `—`) when there is only one order. The
`Хибні форми` column holds the wrong forms separated by `;`.

Then ask me: «Зберегти ці речення в додаток?». When I say yes, call `add_sentences` with all of them: for each sentence
`nl`, `uk`, `rule`, `structure`, `alt_orders` and `wrong_forms`, the schema as an array of `{ text, role }` objects in order, for example
`[{"text":"Morgen","role":"час"},{"text":"gaan","role":"дієслово"},{"text":"we","role":"підмет"},{"text":"naar de markt","role":"місце"}]`,
and `alt_orders` as an array of strings: the `Інші порядки` cell split on `;` (`[]` when the cell is empty), for example
`["We gaan morgen naar de markt."]`, and `wrong_forms` as an array of strings from the `Хибні форми` cell, for example
`["gaat", "ga", "het"]`.
Tell me how many were added, how many were skipped as duplicates, and any warning (a schema that does not match its sentence is
dropped and the sentence is still added; so is a bad wrong form). A sentence with an other order that does not match (other words, a duplicate, or
a broken schema) is skipped with the reason: fix that order and add it again.

**Schemas for sentences saved earlier**

When I ask for it (or when I ask for sentences and some saved ones have no schema): call `list_sentences` with limit 500
and, for each sentence whose `structure` is null, call `update_sentence` with its `id` and `structure` (the same array of
`{ text, role }` as above, built from its `nl`). Tell me how many got a schema.
