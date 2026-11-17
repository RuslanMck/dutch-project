import readme from './README.md?raw';

export default {
  title: 'Components/Forms/WordSheetEdit',
  parameters: { docs: { description: { component: readme } } },
};

// The edit form of a word (inside the word sheet after «Змінити»): the Dutch word, the article, the meaning, the
// topic, the chapter and the two examples, then «Скасувати» and «Зберегти».
const editForm = ({ values = {}, wide = true } = {}) => {
  const v = { nl: 'fiets', article: 'de', uk: 'велосипед', section: '6.1', example_nl: 'Ik ga met de fiets naar school.', example_uk: 'Я їду до школи на велосипеді.', ...values };
  const option = (value, label, selected) => `<option value="${value}"${selected ? ' selected' : ''}>${label}</option>`;
  return `
<form class="form sheet__edit" autocomplete="off" style="max-width:520px">
  <label class="field">
    <span>Слово</span>
    <input name="nl" required autocapitalize="none" autocorrect="off" spellcheck="false" value="${v.nl}">
  </label>
  <label class="field">
    <span>Артикль</span>
    <select name="article">
      ${option('', '—', !v.article)}
      ${option('de', 'de', v.article === 'de')}
      ${option('het', 'het', v.article === 'het')}
    </select>
  </label>
  <label class="field wide">
    <span>Переклад</span>
    <input name="uk" required value="${v.uk}">
  </label>
  <label class="field">
    <span>Тема</span>
    <select name="category" class="category-select">
      ${option('', '—', true)}
      ${option('transport', 'Транспорт', false)}
    </select>
  </label>
  <label class="field">
    <span>Глава</span>
    <input name="section" inputmode="decimal" placeholder="6.1" value="${v.section}">
  </label>
  <label class="field wide">
    <span>Приклад NL</span>
    <input name="example_nl" autocapitalize="none" autocorrect="off" spellcheck="false" value="${v.example_nl}">
  </label>
  <label class="field wide">
    <span>Приклад UK</span>
    <input name="example_uk" value="${v.example_uk}">
  </label>
  <div class="sheet__actions sheet__actions--pair wide">
    <button class="ghost" type="button">Скасувати</button>
    <button class="primary" type="submit">Зберегти</button>
  </div>
</form>`;
};

// The edit form with a word filled in.
export const Overview = {
  render: () => editForm(),
};

// A new word on the add sheet: the fields are empty, the priority is «Авто» (the hidden input keeps the value).
export const Add = {
  render: () => `
<div style="max-width:520px">
  <div class="sheet__head"><h2 class="sheet__title">Додати слово</h2></div>
  <form class="form sheet__edit" autocomplete="off">
    <label class="field">
      <span>Слово</span>
      <input name="nl" required autocapitalize="none" autocorrect="off" spellcheck="false">
    </label>
    <label class="field">
      <span>Переклад</span>
      <input name="uk" required>
    </label>
    <label class="field">
      <span>Артикль</span>
      <select name="article">
        <option value="">—</option>
        <option value="de">de</option>
        <option value="het">het</option>
      </select>
    </label>
    <label class="field">
      <span>Тема</span>
      <select name="category" class="category-select">
        <option value="">—</option>
      </select>
    </label>
    <label class="field">
      <span>Глава</span>
      <input name="section" inputmode="decimal" placeholder="6.1">
    </label>
    <label class="field wide">
      <span>Приклад NL</span>
      <input name="example_nl" autocapitalize="none" autocorrect="off" spellcheck="false">
    </label>
    <label class="field wide">
      <span>Приклад UK</span>
      <input name="example_uk">
    </label>
    <div class="field wide">
      <span>Пріоритет</span>
      <div class="segmented segmented--three" role="group" aria-label="Пріоритет">
        <button type="button" data-priority="auto" aria-pressed="true">Авто</button>
        <button type="button" data-priority="first" aria-pressed="false">Вчити першим</button>
        <button type="button" data-priority="later" aria-pressed="false">Пізніше</button>
      </div>
      <input type="hidden" name="priority" value="auto">
    </div>
    <p class="muted wide" role="status"></p>
    <div class="sheet__actions sheet__actions--pair wide">
      <button class="ghost" type="button">Скасувати</button>
      <button class="primary" type="submit">Додати</button>
    </div>
  </form>
</div>
`,
};

// A word with no article and no example: the article is «—» and the example fields are empty.
export const NoArticle = {
  render: () => editForm({ values: { nl: 'lezen', article: '', uk: 'читати', section: '', example_nl: '', example_uk: '' } }),
};

// A long example in both languages: the wide fields wrap and the actions stay in one row.
export const LongExample = {
  render: () => editForm({ values: { nl: 'overeenkomst', article: 'de', uk: 'угода, договір', example_nl: 'De overeenkomst moet vóór het einde van de maand worden ondertekend door beide partijen.', example_uk: 'Угоду треба підписати обидвом сторонам до кінця місяця.' } }),
};
