// Renders markup with its own stylesheet inside a shadow root. Tokens still
// reach it (custom properties inherit through the shadow boundary), but
// garden.css class rules don't.
export function shadowFrame(css, html) {
  const host = document.createElement('div');
  host.attachShadow({ mode: 'open' }).innerHTML = `<style>${css}</style>${html}`;
  return host;
}
