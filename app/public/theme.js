// Puts the chosen colour theme on <html> before the page draws, so the default colours never flash first.
// The theme is chosen in Налаштування (app.js) and kept per device; an unknown name simply matches no theme rule.
(() => {
  try {
    const theme = localStorage.getItem('theme');
    if (theme && /^[a-z-]+$/.test(theme)) document.documentElement.dataset.theme = theme;
  } catch { /* storage unavailable: the default theme */ }
})();
