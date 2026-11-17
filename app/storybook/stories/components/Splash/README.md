The loading screen of the app: the windmill turns and the tulips grow while the first data loads, with the name, a small progress bar and the caption «Ловлю вітер…». It covers the whole screen and fades out when the first data is on screen.

- default — the full-screen paper background (`garden-paper`), the logo, the name, the moving bar and the caption.
- `.splash--gone` — the fading state: opacity goes to 0 and the screen stops taking taps; the app then removes it.

Use it only for the first load of the app. Don't use it for a load inside a page (use Skeleton) or for a short wait on a button (the button shows its own state).

Accessibility: the splash is `role="status"` with the label «Завантаження», so a screen reader announces the wait. The logo is decorative (`aria-hidden`); the name and the caption are the text. The fade ends the status for everyone.

Markup from `public/index.html` (`#splash`) and `public/app.js` (`hideSplash`); styled by `storybook/styles/garden.css`. The story wrapper only places the fixed screen inside the frame.
