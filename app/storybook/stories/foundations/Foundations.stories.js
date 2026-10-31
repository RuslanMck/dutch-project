import tokens from '../../tokens/tokens.json';

// Read straight from tokens/tokens.json, so these pages update with the tokens.
export default {
  title: 'Foundations/Tokens',
  parameters: { docs: { description: { component: 'Every token from `tokens/tokens.json`. Сад tokens start with `garden-`; the rest describe the app as built today and are kept for reference.' } } },
};

const light = (v) => (typeof v === 'object' ? v.light : v);
const isGarden = (t) => t.name.startsWith('garden-');
const note = (t) => `<div style="font-size:12px;color:var(--garden-ink-soft);line-height:1.4">${t.usage ?? ''}</div>`;

const swatches = (list) => `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px">
${list.map((t) => `
  <div style="background:var(--garden-raised);border-radius:var(--garden-radius);box-shadow:var(--garden-shadow);overflow:hidden">
    <div style="height:72px;background:${light(t.value)}"></div>
    <div style="padding:10px 12px;display:grid;gap:4px">
      <b style="font-size:13px">${t.name}</b>
      <code style="font-size:12px">${light(t.value)}</code>
      ${note(t)}
    </div>
  </div>`).join('')}
</div>`;

export const Colours = {
  render: () => swatches(tokens.color.tokens.filter(isGarden)),
};

export const ColoursAppToday = {
  name: 'Colours (app today)',
  render: () => swatches(tokens.color.tokens.filter((t) => !isGarden(t))),
};

export const Typography = {
  render: () => tokens.type.groups.map((g) => `
<h3 style="margin:24px 0 8px">${g.name}</h3>
${g.styles.map((s) => `
<div style="display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--garden-line)">
  <div><b style="font-size:13px">${s.name}</b><div style="font-size:12px;color:var(--garden-ink-soft)">${s.fontSize} / ${s.fontWeight}</div></div>
  <div style="font-family:var(--font-${g.family ?? 'display'});font-size:${s.fontSize};font-weight:${s.fontWeight};line-height:${s.lineHeight}">${s.sample ?? 'de fiets'}</div>
</div>`).join('')}`).join(''),
};

export const Radius = {
  render: () => `
<div style="display:flex;flex-wrap:wrap;gap:16px">
${tokens.radius.tokens.map((t) => `
  <div style="width:150px;display:grid;gap:6px">
    <div style="height:72px;background:var(--garden-sand);border-radius:${t.value}"></div>
    <b style="font-size:13px">${t.name} · ${t.value}</b>${note(t)}
  </div>`).join('')}
</div>`,
};

export const Spacing = {
  render: () => tokens.spacing.tokens.map((t) => `
<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
  <code style="width:90px;font-size:12px">${t.name}</code>
  <div style="height:14px;width:${t.value};background:var(--garden-primary);border-radius:3px"></div>
  <span style="font-size:12px">${t.value}</span>
</div>`).join(''),
};

export const Shadows = {
  render: () => `
<div style="display:flex;flex-wrap:wrap;gap:24px">
${tokens.shadow.tokens.map((t) => `
  <div style="width:200px;display:grid;gap:10px">
    <div style="height:90px;background:var(--garden-raised);border-radius:var(--garden-radius);box-shadow:${light(t.value)}"></div>
    <b style="font-size:13px">${t.name}</b>${note(t)}
  </div>`).join('')}
</div>`,
};
