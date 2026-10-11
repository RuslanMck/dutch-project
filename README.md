# Dutch learning kit for Claude

Набір для вивчення нідерландської з Claude (для україномовних, рівень A1/A2): власний словник, граматичні правила, картки, практика і журнал помилок, який Claude веде сам.

*English summary below.*

## Швидкий старт: налаштування одним промптом

1. У [claude.ai](https://claude.ai) створи **Project** (наприклад, «Dutch») і відкрий у ньому новий чат.
2. Скопіюй промпт нижче, встав у чат і відправ. Claude сам забере файли з репозиторію, створить твою сторінку, заповнить її і підготує решту.
3. Підтверджуй запити Claude на запис, їх буде кілька. Наприкінці виконай два ручні кроки, про які він скаже: встав інструкції проєкту і збережи скіл.

```text
Set up my Dutch learning kit from this public GitHub repo:
https://github.com/RuslanMck/dutch-project

Explain everything to me in Ukrainian. Do not change the repo.

1. Get the files: run `git clone --depth 1 https://github.com/RuslanMck/dutch-project` in your workspace. If cloning fails, ask me to download the ZIP (Code → Download ZIP) and attach it, then unpack it.
2. Publish `artifact/dutch-materials.html` as a new artifact with the `db` capability, exactly as it is (do not redesign it).
3. Import the starter data into that artifact's database with the ArtifactData tool:
   - `starter/rules.json` → collection `rules`
   - `starter/words.json` → collection `words`
   For every item use its `id` field as doc_id and write all other fields as the document (leave `id` out). Use `set` in batches of up to 50. Afterwards list both collections and tell me the counts (expected: 7 rules, 532 words).
4. In `project-instructions.md` and `skills/dutch-exercise-check/SKILL.md`, replace `<ARTIFACT_URL>` with my new artifact's link.
5. Give me the finished project instructions (the text below the line in `project-instructions.md`) in one copyable code block, and tell me to paste it into this Project's instructions field.
6. Give me the skill: if you can show a skill-proposal card, propose `dutch-exercise-check` with the updated SKILL.md; otherwise send me a ZIP of the `dutch-exercise-check` folder to upload as a skill.
7. Finish with one short line on how to start, e.g. "напиши: дай вправу на правило 5.5".
```

Якщо щось пішло не так, нижче є ручне налаштування.

## Що всередині

| Файл | Що це |
|---|---|
| `artifact/dutch-materials.html` | Сторінка «Dutch матеріали»: словник, картки, практика, правила з журналом помилок |
| `starter/words.json` | Стартовий словник: ~530 слів і фраз за темами |
| `starter/rules.json` | 7 граматичних правил українською (артиклі, займенники, модальні дієслова, множина, прикметники…) |
| `project-instructions.md` | Інструкції для Claude Project: як пояснювати, як давати вправи, як перевіряти |
| `skills/dutch-exercise-check/SKILL.md` | Скіл: перевірка вправ з номерами правил і запис помилок у сторінку |

Номери правил (1.4, 5.5…) відповідають розділам підручника *Basic Dutch: A Grammar and Workbook* (Routledge). Сам підручник у набір не входить.

## Ручне налаштування (≈10 хвилин)

Потрібен акаунт на [claude.ai](https://claude.ai).

1. **Завантаж набір.** Зелена кнопка **Code → Download ZIP**, розпакуй.
2. **Створи Project** у claude.ai (наприклад, «Dutch»).
3. **Створи свою сторінку.** У чаті цього проєкту прикріпи `artifact/dutch-materials.html`, `starter/words.json` і `starter/rules.json` та напиши:

   > Опублікуй dutch-materials.html як артефакт із можливістю `db`. Потім імпортуй у його базу: rules.json → колекція `rules`, words.json → колекція `words` (doc_id = поле `id`, саме поле `id` у документ не записуй). Пиши пакетами по 50.

   Claude кілька разів попросить підтвердити запис: це нормально, близько 12 пакетів. У результаті з'явиться твоя власна сторінка з власним посиланням.
4. **Встав інструкції.** Відкрий `project-instructions.md`, скопіюй текст під лінією в поле instructions проєкту і заміни `<ARTIFACT_URL>` посиланням на свою сторінку.
5. **Додай скіл (необов'язково, але бажано).** У `skills/dutch-exercise-check/SKILL.md` теж заміни `<ARTIFACT_URL>`, заархівуй папку `dutch-exercise-check` у ZIP і завантаж у claude.ai як скіл (у налаштуваннях скілів).

Готово. Напиши в проєкті «дай вправу на правило 5.5» і перевір, як усе працює.

## Як налаштувати під себе

- **Слова.** Додавай на вкладці «Таблиця» або просто пиши Claude «додай слово …». Непотрібні слова видаляй хрестиком.
- **Правила.** Попроси Claude: «додай правило з розділу 6.2 своїми словами». Свої правила нумеруй Д1, Д2…
- **Мова пояснень.** Усе налаштовано на українську. Для іншої мови зміни інструкції проєкту, скіл і переклади в `words.json`.
- **Прогрес.** Статуси слів (нове / вчу / знаю) і журнал помилок — тільки твої: сторінка належить тобі, ніхто інший їх не бачить, поки ти сам не поділишся посиланням.

## Оновлення

Твоя копія не оновлюється сама. Якщо тут з'являться нові слова чи правила, можеш попросити Claude імпортувати лише нові записи з `starter/`.

---

## English summary

Quickest setup: create a Claude Project and paste the prompt from "Швидкий старт" above into a chat. A starter kit for learning Dutch with Claude (Ukrainian explanations, A1/A2): a self-hosted artifact page with a dictionary, flashcards, practice and grammar rules with a mistake log; ~530 starter words and 7 rules; Project instructions; and a skill that checks exercises and logs mistakes. Download the ZIP, create a Claude Project, upload the HTML and the two JSON files and ask Claude to publish the page with the `db` capability and import the data (step 3 above), then paste the instructions and add the skill. Your copy, your progress — nothing is shared with the original.
