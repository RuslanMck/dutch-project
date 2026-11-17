import readme from './README.md?raw';
import tokens from '../../../tokens/tokens.json';

export default {
  title: 'Components/Forms/ThemePicker',
  parameters: { docs: { description: { component: readme } } },
};

const CHECK = '<svg class="garden-icon garden-icon--sm theme-option__check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const THEMES = Object.entries(tokens.colorThemes.list);

// The same markup public/index.html has for each theme, built from tokens.json so the list never drifts.
const renderOption = ([id, theme], checkedId) => `
        <label class="theme-option" data-theme="${id}">
          <input class="theme-option__input" type="radio" name="theme" value="${id}"${id === checkedId ? ' checked' : ''}>
          <span class="theme-option__swatches" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          <span class="theme-option__text">
            <span class="theme-option__name">${theme.name}</span>
            <span class="theme-option__mood">${theme.description}</span>
          </span>
          ${CHECK}
        </label>`;

const renderPicker = (checkedId) => `
<div style="max-width:480px">
      <fieldset class="theme-picker">
        <legend class="theme-picker__title">Тема</legend>
        <p class="muted theme-picker__hint">Кольори застосунку. Тема зберігається на цьому пристрої.</p>
${renderOption(THEMES[0], checkedId)}
        <p class="theme-picker__group">Осінній гарбуз</p>
${THEMES.slice(1).map((theme) => renderOption(theme, checkedId)).join('')}
      </fieldset>
</div>`;

export const Overview = {
  render: () => renderPicker(tokens.colorThemes.default),
};

export const Chosen = {
  args: { theme: 'cinnamon-oat' },
  argTypes: { theme: { control: 'select', options: THEMES.map(([id]) => id) } },
  render: ({ theme }) => renderPicker(theme),
};

export const OneOption = {
  render: () => `<div style="max-width:360px">${renderOption(THEMES[5], THEMES[5][0])}</div>`,
};
