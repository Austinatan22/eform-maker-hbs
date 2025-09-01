// src/client/builder/25-state.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  NS.LS_KEY = 'eform-maker-hbs';

  function safeParse(json, fallback){
    try { return JSON.parse(json); } catch { return fallback; }
  }

  NS.readLocal = function readLocal(){
    try {
      const raw = localStorage.getItem(NS.LS_KEY);
      if (!raw) return null;
      return safeParse(raw, null);
    } catch { return null; }
  };

  NS.writeLocal = function writeLocal(data){
    try {
      localStorage.setItem(NS.LS_KEY, JSON.stringify(data || {}));
      return true;
    } catch { return false; }
  };

  NS.clearLocal = function clearLocal(){
    try { localStorage.removeItem(NS.LS_KEY); } catch {}
  };
})();

