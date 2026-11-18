A thin strip under the page header that says the app works offline, or that answers are waiting to be sent. It is shown only when there is something to say; otherwise it is hidden.

- default — the light strip (`garden-sand`) with ink text.
- `.offline-banner__action` — the one action, a button «Надіслати» (send the waiting answers now) or a link «Увійти» (sign in to send them).

A weak signal counts as offline too: when the phone reports online but an answer post outlasts `ANSWER_POST_TIMEOUT_MS` (6 s, `public/api.js`), the answer goes to the device and the strip shows it waiting.

Use it for the connection state and the answers that wait on the device. Don't use it for an error of one action (Notice) or a success (Message).

Accessibility: the strip is `role="status"`, so the text is announced once when it appears. The action is a real button or link with its own name; the banner never takes focus.

Markup from `public/index.html` (`#offline-banner`) and `public/app.js` (`renderOfflineBanner`); texts from `formatOfflineBanner` in `public/logic.js`. Styled by `storybook/styles/garden.css`.
