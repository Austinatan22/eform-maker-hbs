// src/client/builder/00-utils.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  NS.uuid = function uuid(){
    const ALPH = '0123456789abcdefghijklmnopqrstuvwxyz';
    const n = 8; // random part length
    const buf = new Uint8Array(n);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(buf);
    } else {
      for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    let rand = '';
    for (let i = 0; i < n; i++) rand += ALPH[buf[i] % 36];
    return 'field_' + rand;
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
