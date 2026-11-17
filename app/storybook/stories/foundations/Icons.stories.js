// Every icon the app uses, drawn with the one icon class. Keep this list in step with public/index.html and public/app.js.
export default {
  title: 'Foundations/Icons',
  parameters: { docs: { description: { component: `One family of line icons, drawn on a 24×24 grid.

- **Stroke:** 2px, round caps and joins, no fill, colour \`currentColor\`. There is no filled icon: the Вчити hub is a disc with the same line book inside.
- **Sizes:** \`garden-icon\` 22px everywhere; \`garden-icon--sm\` 18px only inline beside text (the check by «Зроблено», the row delete).
- **Colour:** \`garden-ink-soft\` at rest, \`garden-ink\` when active. Never coloured by meaning.
- **Buttons:** an icon alone is always inside \`.icon-button\` with an \`aria-label\`; its "on" state is \`garden-ink\` on a \`garden-sand\` square.
- **No text glyphs or emoji as icons** (no «×», «i», «🔀»). A new icon is drawn in the same style and added here.` } } },
};

// Each entry: the name shown under the icon, and the icon's markup (paths and circles on the 24×24 grid).
const ICONS = [
  ['Головна', '<path d="M3.5 10.5L12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5h4v5"/>'],
  ['Словник', '<path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 1h12v-3"/><path d="M9.5 12.5l2-5.5 2 5.5M10.2 10.8h2.6"/>'],
  ['Вчити', '<path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5V20"/>'],
  ['Прогрес', '<path d="M4 20h16"/><path d="M7 16v-3M12 16V9M17 16V5"/>'],
  ['Профіль', '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8"/>'],
  ['Налаштування', '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4"/>'],
  ['Нові слова', '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 10.5v6M9 13.5h6"/>'],
  ['Запам\'ятовування', '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.5 1.5"/>'],
  ['Артикль', '<path d="M3.5 12.5L11 5h8.5v8.5L12 21z"/><circle cx="15.5" cy="9" r="1.2"/>'],
  ['Важкі слова', '<path d="M9 8a3 3 0 0 1 6 0"/><path d="M7 9.5h10l1.5 10.5h-13z"/>'],
  ['Що я знаю', '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2l2.6 2.6 4.8-5.4"/>'],
  ['Порядок слів', '<path d="M4 6h9M4 12h9M4 18h6"/><path d="M18 4v15M15 16l3 3 3-3"/>'],
  ['Граматика', '<path d="M14.5 4.5l5 5L9 20H4v-5z"/><path d="M13 6l5 5"/>'],
  ['Фрази', '<path d="M4 5h11v8H9l-5 4z"/><path d="M15 9h5v8l-3-2h-6v-2"/>'],
  ['Картки', '<rect x="4" y="7" width="12" height="14" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/>'],
  ['Колоди', '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'],
  ['Ціль', '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>'],
  ['Серія', '<path d="M12 3c.8 3 5 5 5 10a5 5 0 0 1-10 0c0-2.3 1-3.7 2.2-4.8.1 2 .9 3.1 2 3.3-.4-3.2.1-5.7.8-8.5z"/>'],
  ['Тиждень', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="M8.5 14h.01M12 14h.01M15.5 14h.01"/>'],
  ['Досягнення', '<circle cx="12" cy="14.5" r="5.5"/><path d="M9 9.8L6.5 3h4l1.5 3.5L13.5 3h4L15 9.8"/>'],
  ['Правила', '<path d="M3 5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H21z"/>'],
  ['Тексти', '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>'],
  ['Вийти', '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>'],
  ['Пошук', '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>'],
  ['Додати', '<path d="M12 5v14M5 12h14"/>'],
  ['Далі', '<path d="M5 12h14M13 6l6 6-6 6"/>'],
  ['Готово', '<path d="M5 12.5l4.5 4.5L19 7.5"/>'],
  ['Перемішати', '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'],
  ['Змінити', '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>'],
  ['Видалити', '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'],
  ['Закрити', '<path d="M6 6l12 12M18 6L6 18"/>'],
];
const INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>';
const cell = (name, inner, cls = 'garden-icon') => `
  <div style="display:grid;justify-items:center;gap:8px;padding:14px 8px;background:var(--garden-raised);border-radius:var(--garden-radius-sm);color:var(--garden-ink)">
    <svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg><span style="font-size:12px;text-align:center">${name}</span>
  </div>`;

export const AllIcons = {
  render: () => `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px">
${ICONS.map(([name, inner]) => cell(name, inner)).join('')}
${cell('Пояснення', INFO)}
</div>`,
};

export const Sizes = {
  render: () => `
<div class="r">
  <svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true">${INFO}</svg><span>22px · garden-icon</span>
  <svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true">${INFO}</svg><span>18px · garden-icon--sm</span>
</div>`,
};
