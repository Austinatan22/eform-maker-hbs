// src/client/builder/10-templates.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  // Compiled Handlebars partials keyed by partial name
  NS.TEMPLATES = Object.create(null);

  // Preload and compile field partial templates once
  NS.preloadTemplates = async function preloadTemplates(){
    const map = NS.PARTIAL_FOR || {};
    const names = [...new Set(Object.values(map))];
    const fetches = names.map(async (n) => {
      const res = await fetch(`/tpl/fields/${n}.hbs`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Load template failed: ${n}`);
      const src  = await res.text();
      NS.TEMPLATES[n] = Handlebars.compile(src);
    });
    await Promise.all(fetches);
  };

  // Render one field to HTML using a precompiled partial
  NS.renderFieldHTML = function renderFieldHTML(field, idx){
    const partialName = (NS.PARTIAL_FOR && NS.PARTIAL_FOR[field.type]) || 'text';
    const tmpl = NS.TEMPLATES[partialName];
    if (!tmpl) return '';
    const options = String(field.options || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return tmpl({
      name:        field.name || field.id || `f_${idx}`,
      label:       field.label || '',
      required:    !!field.required,
      placeholder: field.placeholder || '',
      options
    });
  };
})();

