// src/client/builder/00-utils.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  NS.uuid = function uuid(){
    return 'fld_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  };

  NS.debounce = function debounce(fn, ms=160){
    let t; return function(...a){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), ms); };
  };

  NS.toSafeSnake = function toSafeSnake(s){
    return String(s || '')
      .trim()
      .replace(/[\s\-]+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  };

  NS.toSafeUpperSnake = function toSafeUpperSnake(s){
    return NS.toSafeSnake(s).toUpperCase();
  };
})();

