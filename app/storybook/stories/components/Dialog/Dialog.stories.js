import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/Dialog',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="dialog" style="display:block;position:static;margin:0">
  <h2 class="dialog__title">Видалити слово?</h2>
  <p class="dialog__text">«de fiets — велосипед» буде видалено разом з історією.</p>
  <div class="dialog__actions"><button type="button">Скасувати</button><button class="danger" type="button">Видалити</button></div>
</div>
`,
};
