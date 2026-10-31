import readme from './README.md?raw';

export default {
  title: 'Components/Study/SentenceSchema',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="word-order__schema-row">
<span class="word-order__segment role-subject"><span class="word-order__segment-text">Ik</span><span class="word-order__segment-role">підмет</span></span><span class="word-order__sep">·</span>
<span class="word-order__segment role-verb"><span class="word-order__segment-text">werk</span><span class="word-order__segment-role">дієслово</span></span><span class="word-order__sep">·</span>
<span class="word-order__segment role-adverbial"><span class="word-order__segment-text">vandaag</span><span class="word-order__segment-role">час</span></span><span class="word-order__sep">·</span>
<span class="word-order__segment role-negation"><span class="word-order__segment-text">niet</span><span class="word-order__segment-role">заперечення</span></span>
</div><p class="word-order__schema-text muted">5.5 · Дієслово на другому місці, «niet» після часу.</p>
`,
};
