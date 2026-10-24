# public

Browser code and static files of the web app, served by Express without a build step. Only browser modules live here; they never import from `src/`. UI text is Ukrainian.

## Files

| File | What it does |
|---|---|
| `index.html` | The app page: header, tab navigation and the static shells of the six tabs (table, flashcards, practice, rules, phrases, texts). |
| `login.html` | The password sign-in page shown before the session cookie exists. |
| `app.js` | UI controller: loads the collections, renders every tab, runs the FSRS translation practice session (batch, grades, summary; one session per Amsterdam calendar day, kept in sessionStorage) and the article drill, keeps user input across re-renders and binds events. |
| `api.js` | REST client (same-origin cookie, a 401 goes to `/login`), the practice calls (batch, grades, stats) and the live-update subscription to `/api/events`. |
| `logic.js` | Pure helpers with no DOM access: HTML escaping, answer checking for the article drill (`checkAnswer`), FSRS translation grading (`gradeTranslationAnswer`: `good`, `hard`, `again`) on answers made comparable by `normalizeAnswerText` (case, typographic quotes, punctuation, spaces) with Levenshtein distance, rule-body rendering. |
| `app.css` | Styles for the app and login pages, with light and dark themes. |
| `icon.svg` | App icon, used as the favicon and in the web manifest. |
| `manifest.webmanifest` | Web app manifest, so the page can be installed on a phone home screen. |
