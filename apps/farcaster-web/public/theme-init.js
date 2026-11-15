// Applies the saved theme before the app loads, so there is no flash.
(function () {
  var STORAGE_KEY = 'user-saved-theme';
  var root = document.documentElement;
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var saved = 'system';

  try {
    saved = localStorage.getItem(STORAGE_KEY) || 'system';
  } catch (e) {
    // Storage unavailable: follow the system setting.
  }

  var effective =
    saved === 'dark' || saved === 'light'
      ? saved
      : prefersDark
        ? 'dark'
        : 'light';

  root.classList.toggle('dark', effective === 'dark');
  root.classList.toggle('light', effective === 'light');
  root.setAttribute('data-theme', saved);
})();
