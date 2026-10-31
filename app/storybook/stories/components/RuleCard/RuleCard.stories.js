import readme from './README.md?raw';

export default {
  title: 'Components/Content/RuleCard',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col" style="max-width:520px">
<details class="rule" open><summary><span class="rule-title">5.5 Інверсія</span><span class="badge">3</span><span class="tag">Глава 5</span></summary>
<div class="rule-body"><p>Якщо речення починається не з підмета, дієслово стоїть другим, а підмет — після нього.</p><div class="ex">Vandaag <b>werk ik</b> niet.</div>
<h3 class="mh">Мої помилки</h3><div class="pat"><div class="pat-head"><span class="pat-title">Підмет перед дієсловом після часу</span><span class="pat-count">×3</span></div><div class="pat-fix">Після «vandaag» спершу дієслово.</div><ul class="cases"><li><s>Vandaag ik werk</s> → Vandaag werk ik</li></ul></div></div></details>
<details class="rule"><summary><span class="rule-title">Д1 Артиклі de / het</span><span class="tag">Додаток</span></summary></details>
</div>
`,
};
