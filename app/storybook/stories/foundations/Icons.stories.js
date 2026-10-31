// Every icon the app uses, drawn with the one icon class. Keep this list in step with public/index.html and public/app.js.
export default {
  title: 'Foundations/Icons',
  parameters: { docs: { description: { component: `One family of line icons, drawn on a 24×24 grid.

- **Stroke:** 2px, round caps and joins, no fill, colour \`currentColor\`. One exception is the filled ▶ in the bottom bar (\`garden-icon--filled\`).
- **Sizes:** \`garden-icon\` 22px everywhere; \`garden-icon--sm\` 18px only inline beside text (the «i» by a label, the row delete).
- **Colour:** \`garden-ink-soft\` at rest, \`garden-ink\` when active. Never coloured by meaning.
- **Buttons:** an icon alone is always inside \`.icon-button\` with an \`aria-label\`; its "on" state is \`garden-ink\` on a \`garden-sand\` square.
- **No text glyphs or emoji as icons** (no «×», «i», «🔀»). A new icon is drawn in the same style and added here.` } } },
};

const ICONS = [["Головна", "M3 11l9-8 9 8M5 10v10h14V10"], ["Колоди", "M7 4h12v14H7zM4 7v13h12"], ["Статистика", "M5 20V10M12 20V4M19 20v-7"], ["Профіль", "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4-6 8-6s7 2 8 6"], ["Пошук", "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4"], ["Правила", "M5 4h9a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h9"], ["Слова", "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"], ["Тексти", "M5 5h14M5 10h14M5 15h9M5 20h6"], ["Порядок слів", "M7 7h12l-3-3M17 17H5l3 3"], ["Фрази", "M4 5h16v11H9l-5 4z"], ["Важкі слова", "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z"], ["Далі", "M5 12h14M13 6l6 6-6 6"], ["Перемішати", "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"], ["Видалити", "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"], ["Закрити / прибрати", "M6 6l12 12M18 6L6 18"]];
const INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>';
const cell = (name, inner, cls = 'garden-icon') => `
  <div style="display:grid;justify-items:center;gap:8px;padding:14px 8px;background:var(--garden-raised);border-radius:var(--garden-radius-sm);color:var(--garden-ink)">
    <svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg><span style="font-size:12px;text-align:center">${name}</span>
  </div>`;

export const AllIcons = {
  render: () => `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px">
${ICONS.map(([name, path]) => cell(name, `<path d="${path}"/>`)).join('')}
${cell('Пояснення', INFO)}
${cell('Практика (▶)', '<path d="M8 5v14l11-7z"/>', 'garden-icon garden-icon--filled')}
</div>`,
};

export const Sizes = {
  render: () => `
<div class="r">
  <svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true">${INFO}</svg><span>22px · garden-icon</span>
  <svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true">${INFO}</svg><span>18px · garden-icon--sm</span>
</div>`,
};
