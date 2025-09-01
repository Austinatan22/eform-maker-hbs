// src/client/builder/15-helpers.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  NS.parseOptions = function parseOptions(str = ''){
    return String(str)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  };

  NS.needsOptions = function needsOptions(type){
    return type === 'dropdown' || type === 'multipleChoice' || type === 'checkboxes';
  };

  NS.whenIntlReady = function whenIntlReady(cb, tries = 40){
    if (window.intlTelInput) return cb();
    if (tries <= 0) return;
    setTimeout(() => NS.whenIntlReady(cb, tries - 1), 50);
  };
})();

