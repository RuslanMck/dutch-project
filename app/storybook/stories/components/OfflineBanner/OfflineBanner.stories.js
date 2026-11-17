import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/OfflineBanner',
  parameters: { docs: { description: { component: readme } } },
};

// The banner under the page header (formatOfflineBanner in logic.js). Each state has its own text and action.
const banner = ({ text, action = '' }) => `
<div class="offline-banner" role="status">
  <span class="offline-banner__text">${text}</span>
  ${action}
</div>`;

const sendButton = '<button class="offline-banner__action" type="button">Надіслати</button>';
const loginLink = '<a class="offline-banner__action" href="/login">Увійти</a>';

// No connection: the words say what is shown, when it was saved and how many answers wait.
export const Overview = {
  render: () => banner({ text: 'Офлайн · показано збережене · оновлено 09:14 · не надіслано: 2' }),
};

// Back online with answers still on the phone: one tap sends them.
export const Pending = {
  render: () => banner({ text: 'Не надіслано відповідей: 3', action: sendButton }),
};

// The session ended: the banner links to the sign-in page.
export const NeedsLogin = {
  render: () => banner({ text: 'Увійди, щоб надіслати відповіді (2)', action: loginLink }),
};

// Offline with nothing waiting: only the state text, no action.
export const OfflineOnly = {
  render: () => banner({ text: 'Офлайн · показано збережене · оновлено 09:14' }),
};
