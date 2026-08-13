/**
 * ThemeManager — light/dark mode with system preference + localStorage.
 */
var ThemeManager = (function () {
  var STORAGE_KEY = 'scheduler-theme';
  var MEDIA_QUERY = '(prefers-color-scheme: dark)';

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function store(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) { /* private mode */ }
  }

  function systemPreference() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
    }
    return 'light';
  }

  function resolve() {
    var stored = getStored();
    if (stored === 'light' || stored === 'dark') return stored;
    return systemPreference();
  }

  function apply(theme) {
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    updateToggle(theme);
  }

  function updateToggle(theme) {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var isDark = theme === 'dark';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function set(theme) {
    if (theme !== 'light' && theme !== 'dark') return;
    store(theme);
    apply(theme);
  }

  function toggle() {
    set(resolve() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    apply(resolve());

    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggle);
    }

    if (typeof window !== 'undefined' && window.matchMedia) {
      var mq = window.matchMedia(MEDIA_QUERY);
      var onChange = function () {
        if (!getStored()) apply(systemPreference());
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', onChange);
      } else if (mq.addListener) {
        mq.addListener(onChange);
      }
    }
  }

  // Apply early to reduce FOUC when this script loads before body paint
  if (typeof document !== 'undefined') {
    apply(resolve());
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  return {
    init: init,
    set: set,
    toggle: toggle,
    resolve: resolve,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}
