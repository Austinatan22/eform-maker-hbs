// src/client/builder/25-state.js
(function () {
  const NS = (window.BuilderApp = window.BuilderApp || {});

  NS.LS_KEY = 'eform-maker-hbs';

  function safeParse(json, fallback) {
    try { return JSON.parse(json); } catch { return fallback; }
  }

  NS.readLocal = function readLocal(formId) {
    try {
      const key = formId ? `${NS.LS_KEY}-${formId}` : NS.LS_KEY;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return safeParse(raw, null);
    } catch { return null; }
  };

  NS.writeLocal = function writeLocal(data, formId) {
    try {
      const key = formId ? `${NS.LS_KEY}-${formId}` : NS.LS_KEY;
      localStorage.setItem(key, JSON.stringify(data || {}));
      return true;
    } catch { return false; }
  };

  NS.clearLocal = function clearLocal(formId) {
    try {
      const key = formId ? `${NS.LS_KEY}-${formId}` : NS.LS_KEY;
      localStorage.removeItem(key);
    } catch { }
  };
})();

