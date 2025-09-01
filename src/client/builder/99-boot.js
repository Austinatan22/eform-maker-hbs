// src/client/builder/99-boot.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  function boot(){
    // Only boot modular Builder if explicitly requested
    if (!window.BUILDER_USE_MODULAR) return;
    try { NS.startBuilder?.(); } catch (e) { console.error('Modular Builder failed to start:', e); }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else
    boot();
})();

