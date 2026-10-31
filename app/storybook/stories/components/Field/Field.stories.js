import readme from './README.md?raw';

export default {
  title: 'Components/Forms/Field',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<form class="form col" style="max-width:520px">
  <label class="field"><span>Слово</span><input value="fiets"></label>
  <label class="field"><span>Переклад</span><input value="велосипед"></label>
  <label class="field"><span>Артикль</span><select><option>de</option></select></label>
  <label class="field"><span>Глава</span><input placeholder="6.1"></label>
  <button class="primary wide" type="submit">Додати</button>
</form>
`,
};
