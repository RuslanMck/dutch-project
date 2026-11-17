import tokens from '../../tokens/tokens.json';

// Read straight from tokens/tokens.json, so these pages update with the tokens.
export default {
  title: 'Foundations/Tokens',
  parameters: { docs: { description: { component: 'Every token from `tokens/tokens.json`. Сад tokens start with `garden-`; the rest describe the app as built today and are kept for reference.' } } },
};

const readLightValue = (value) => (typeof value === 'object' ? value.light : value);
const isGardenToken = (token) => token.name.startsWith('garden-');
const renderUsage = (token) => `<div style="font-size:12px;color:var(--garden-ink-soft);line-height:1.4">${token.usage ?? ''}</div>`;

const renderSwatches = (tokenList) => `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px">
${tokenList.map((token) => `
  <div style="background:var(--garden-raised);border-radius:var(--garden-radius);box-shadow:var(--garden-shadow);overflow:hidden">
    <div style="height:72px;background:${readLightValue(token.value)}"></div>
    <div style="padding:10px 12px;display:grid;gap:4px">
      <b style="font-size:13px">${token.name}</b>
      <code style="font-size:12px">${readLightValue(token.value)}</code>
      ${renderUsage(token)}
    </div>
  </div>`).join('')}
</div>`;

export const Colours = {
  render: () => renderSwatches(tokens.color.tokens.filter(isGardenToken)),
};

export const ColoursAppToday = {
  name: 'Colours (app today)',
  render: () => renderSwatches(tokens.color.tokens.filter((token) => !isGardenToken(token))),
};

// Each colour theme from tokens.colorThemes, drawn inside its own [data-theme] box.
export const Themes = {
  render: () => `
<p style="max-width:620px;font-size:14px">${tokens.colorThemes.usage}</p>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
${Object.entries(tokens.colorThemes.list).map(([id, theme]) => `
  <div data-theme="${id}" style="background:var(--garden-paper);color:var(--garden-ink);border-radius:var(--garden-radius);box-shadow:var(--garden-shadow);padding:12px;display:grid;gap:8px">
    <b>${theme.name}</b> <code style="font-size:12px">${id}</code>
    <div style="font-size:12px;color:var(--garden-ink-soft)">${theme.description}</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
    ${Object.entries(theme.values).map(([name, value]) => `
      <div style="display:grid;gap:2px;font-size:10px"><span style="height:28px;border-radius:var(--garden-radius-sm);background:${value};box-shadow:inset 0 0 0 1px var(--garden-line)"></span>${name.replace('garden-', '')}</div>`).join('')}
    </div>
  </div>`).join('')}
</div>`,
};

export const Typography = {
  render: () => tokens.type.groups.map((group) => `
<h3 style="margin:24px 0 8px">${group.name}</h3>
${group.styles.map((style) => `
<div style="display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--garden-line)">
  <div><b style="font-size:13px">${style.name}</b><div style="font-size:12px;color:var(--garden-ink-soft)">${style.fontSize} / ${style.fontWeight}</div></div>
  <div style="font-family:var(--font-${group.family ?? 'display'});font-size:${style.fontSize};font-weight:${style.fontWeight};line-height:${style.lineHeight}">${style.sample ?? 'de fiets'}</div>
</div>`).join('')}`).join(''),
};

export const Weights = {
  render: () => `
<p style="max-width:560px;font-size:14px">Manrope in three weights, chosen by role, never by taste. If you can't name the role, it's <b>regular</b>.</p>
${Object.entries(tokens.type.weights).map(([name, weight]) => `
<div style="display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--garden-line)">
  <div><b style="font-size:13px">--garden-weight-${name}</b><div style="font-size:12px;color:var(--garden-ink-soft)">${weight.value} · ${weight.usage}</div></div>
  <div style="font-size:20px;font-weight:${weight.value}">Залишилось: 10 · de fiets · Перевірити</div>
</div>`).join('')}`,
};

export const Radius = {
  render: () => `
<div style="display:flex;flex-wrap:wrap;gap:16px">
${tokens.radius.tokens.map((token) => `
  <div style="width:150px;display:grid;gap:6px">
    <div style="height:72px;background:var(--garden-sand);border-radius:${token.value}"></div>
    <b style="font-size:13px">${token.name} · ${token.value}</b>${renderUsage(token)}
  </div>`).join('')}
</div>`,
};

export const Spacing = {
  render: () => tokens.spacing.tokens.map((token) => `
<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
  <code style="width:90px;font-size:12px">${token.name}</code>
  <div style="height:14px;width:${token.value};background:var(--garden-primary);border-radius:3px"></div>
  <span style="font-size:12px">${token.value}</span>
</div>`).join(''),
};

export const Shadows = {
  render: () => `
<div style="display:flex;flex-wrap:wrap;gap:24px">
${tokens.shadow.tokens.map((token) => `
  <div style="width:200px;display:grid;gap:10px">
    <div style="height:90px;background:var(--garden-raised);border-radius:var(--garden-radius);box-shadow:${readLightValue(token.value)}"></div>
    <b style="font-size:13px">${token.name}</b>${renderUsage(token)}
  </div>`).join('')}
</div>`,
};
