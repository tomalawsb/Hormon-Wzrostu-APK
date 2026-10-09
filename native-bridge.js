// Web-only bridge for GitHub Pages.
// Native Android functions are intentionally unavailable in the browser.
window.NativeBridge = Object.freeze({
  isNative: false,
  platform: 'web'
});
