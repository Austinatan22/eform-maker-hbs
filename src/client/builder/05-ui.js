// src/client/builder/05-ui.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  const UI = {};

  // Flash an element by toggling a CSS class briefly
  UI.flash = function flash(el, className = 'drop-flash', ms = 450){
    if (!el) return;
    try {
      el.classList.add(className);
      setTimeout(() => el.classList.remove(className), ms);
    } catch (_) {}
  };

  // Bootstrap Tab helpers (safe if BS not loaded)
  UI.getTab = function getTab(btn){
    const Tab = window.bootstrap?.Tab || (window.bootstrap && window.bootstrap.Tab);
    return Tab ? Tab.getOrCreateInstance(btn) : null;
  };
  UI.showTab = function showTab(btn){
    if (!btn) return;
    const inst = UI.getTab(btn);
    inst ? inst.show() : btn.click?.();
  };

  // Quick query helpers
  UI.qs = function qs(sel, root){ return (root || document).querySelector(sel); };
  UI.qsa = function qsa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); };

  NS.UI = UI;
})();

