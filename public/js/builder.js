/*
  !!! GENERATED FILE !!!
  This file is built by scripts/build-builder.js
  Source modules: src/client/builder/*.js
*/

// ---- 00-utils.js ----
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


// ---- 05-ui.js ----
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


// ---- 10-templates.js ----
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


// ---- 15-helpers.js ----
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


// ---- 20-constants.js ----
// src/client/builder/20-constants.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  // Field types that actually have options
  NS.OPTION_TYPES = new Set(['dropdown','multipleChoice','checkboxes']);

  // Only keep these keys when saving
  NS.CLEAN_KEYS = new Set([
    'id','type','label','options','value','placeholder','name',
    'required','doNotStore','countryIso2'
  ]);

  // Map builder types -> partial filenames
  NS.PARTIAL_FOR = {
    singleLine:     'text',
    paragraph:      'textarea',
    dropdown:       'select',
    multipleChoice: 'radios',
    checkboxes:     'checkboxes',
    number:         'number',
    name:           'name',
    email:          'email',
    phone:          'phone'
  };

  // Defaults
  NS.FIELDS_DEFAULTS = {
    label: (_t) => '',
    options: (t) => NS.OPTION_TYPES.has(t) ? 'Option 1, Option 2' : '',
    placeholder: (t) => ({
      singleLine: 'Enter text…',
      paragraph: 'Type your message…',
      dropdown: 'Select…',
      multipleChoice: '',
      checkboxes: '',
      number: '0',
      name: '',
      email: 'email@example.com',
      phone: 'Phone number'
    }[t] ?? '')
  };
})();


// ---- 25-state.js ----
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


// ---- 30-dnd.js ----
// src/client/builder/30-dnd.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  // Singleton placeholder element used during drag and drop
  NS.getPlaceholder = function getPlaceholder(){
    if (!NS._placeholderEl) {
      const el = document.createElement('div');
      el.className = 'dnd-insert';
      NS._placeholderEl = el;
    }
    return NS._placeholderEl;
  };

  NS.placePlaceholder = function placePlaceholder(targetEl, before = true){
    const ph = NS.getPlaceholder();
    if (!targetEl || !targetEl.parentNode) return;
    before ? targetEl.parentNode.insertBefore(ph, targetEl)
           : targetEl.parentNode.insertBefore(ph, targetEl.nextSibling);
  };

  NS.removePlaceholder = function removePlaceholder(){
    const ph = NS.getPlaceholder();
    if (ph.parentNode) ph.parentNode.removeChild(ph);
  };

  // Given the preview container and the index the item was dragged from,
  // compute the logical target index, accounting for the placeholder position
  NS.computeDropTarget = function computeDropTarget(previewEl, fromIndex){
    const kids = Array.from(previewEl.children);
    let rawTo = kids.indexOf(NS.getPlaceholder());
    if (rawTo < 0) rawTo = kids.length;

    let to = rawTo;
    if (fromIndex < rawTo) to = rawTo - 1;

    const isNoop = (to === fromIndex) || (rawTo === fromIndex + 1);
    return { to, isNoop };
  };

  // Immutable move within an array
  NS.move = function move(arr, from, to){
    if (from === to || from < 0 || to < 0 || from >= arr.length || to > arr.length) return arr;
    const copy = arr.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };
})();


// ---- 40-api.js ----
// src/client/builder/40-api.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  function toQuery(params){
    const u = new URLSearchParams();
    Object.entries(params || {}).forEach(([k,v]) => {
      if (v === undefined || v === null) return;
      u.append(k, String(v));
    });
    return u.toString();
  }

  async function fetchJson(url, opts){
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json() : await res.text();
    return { res, body };
  }

  NS.API = {
    async checkTitleUnique(title, excludeId){
      const qs = toQuery({ title, excludeId });
      return fetchJson(`/api/forms/check-title?${qs}`, { cache: 'no-store' });
    },
    async saveForm(payload){
      return fetchJson('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    },
    async getForm(id){
      return fetchJson(`/api/forms/${encodeURIComponent(id)}`, { cache: 'no-store' });
    },
    async deleteForm(id){
      return fetchJson(`/api/forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
  };
})();


// ---- 90-main.js ----
// src/client/builder/90-main.js
(function(){
  const NS = (window.BuilderApp = window.BuilderApp || {});

  const SELECTORS = {
    preview: '#preview',
    quickAddButtons: '#quickAddButtons',
    tabAddBtn: '#tabAdd',
    tabEditBtn: '#tabEdit',
    // minimal edit panel (subset; more later)
    editTitle: '#editTitle',
    editLabel: '#editLabel',
    editOptionsRow: '#editOptionsRow',
    editOptions: '#editOptions',
    editPlaceholder: '#editPlaceholder',
    editName: '#editName',
    editRequired: '#editRequired',
    editDoNotStore: '#editDoNotStore',
    btnEditSave: '#editSave',
    btnEditCancel: '#editCancel',
    formTitle: '#formTitle',
    btnSave: '#saveBtn'
  };

  class Builder {
    constructor(){
      this.formId = null;
      this.fields = [];
      this.selectedId = null;
      this._bootstrapped = false;
      this.isDirty = false;
      this.$ = { preview: null };
      this.persist = NS.debounce ? NS.debounce(this.persist.bind(this), 140) : this.persist.bind(this);
      this.dnd = { draggingId: null, fromIndex: -1 };
    }

    bindDom(){
      const q = (sel) => document.querySelector(sel);
      this.$.preview = q(SELECTORS.preview);
      this.$.quickAddButtons = q(SELECTORS.quickAddButtons);
      this.$.tabAddBtn = q(SELECTORS.tabAddBtn);
      this.$.tabEditBtn = q(SELECTORS.tabEditBtn);
      this.$.editLabel = q(SELECTORS.editLabel);
      this.$.editOptionsRow = q(SELECTORS.editOptionsRow);
      this.$.editOptions = q(SELECTORS.editOptions);
      this.$.editPlaceholder = q(SELECTORS.editPlaceholder);
      this.$.editName = q(SELECTORS.editName);
      this.$.editRequired = q(SELECTORS.editRequired);
      this.$.editDoNotStore = q(SELECTORS.editDoNotStore);
      this.$.btnEditSave = q(SELECTORS.btnEditSave);
      this.$.btnEditCancel = q(SELECTORS.btnEditCancel);
      this.$.formTitle = q(SELECTORS.formTitle);
      this.$.btnSave = q(SELECTORS.btnSave);
    }

    buildCard(field, idx){
      const card = document.createElement('div');
      card.className = 'mb-4 p-3 border rounded position-relative';
      card.dataset.fid = field.id;
      card.dataset.index = String(idx);
      card.draggable = true;
      card.style.cursor = 'move';
      const body = document.createElement('div');
      body.className = 'field-body';
      body.innerHTML = NS.renderFieldHTML ? NS.renderFieldHTML(field, idx) : '';
      card.appendChild(body);
      this.attachCardDnD(card);
      return card;
    }

    renderPreview(){
      const host = this.$.preview;
      if (!host) return;
      host.innerHTML = '';
      const frag = document.createDocumentFragment();
      this.fields.forEach((f, i) => frag.appendChild(this.buildCard(f, i)));
      host.appendChild(frag);
      try { NS.whenIntlReady?.(() => this.initPhoneInputs()); } catch {}
    }

    appendOne(field, idx){
      if (!this.$.preview) return;
      const card = this.buildCard(field, idx);
      this.$.preview.appendChild(card);
    }

    renderOne(fieldId){
      const idx = this.fields.findIndex(f => f.id === fieldId);
      if (idx < 0) return;
      const card = this.$.preview?.querySelector(`[data-fid="${fieldId}"]`);
      if (!card) return;
      const body = card.querySelector('.field-body');
      if (body && NS.renderFieldHTML) body.innerHTML = NS.renderFieldHTML(this.fields[idx], idx);
      try { NS.whenIntlReady?.(() => this.initPhoneInputsIn(card)); } catch {}
    }

    restore(){
      const data = NS.readLocal?.();
      if (!data) return;
      if (data.id) this.formId = data.id;
      if (Array.isArray(data.fields)) this.fields = data.fields;
      if (data.title && this.$.formTitle) this.$.formTitle.value = data.title;
    }

    persist(){
      const title = this.$.formTitle?.value || '';
      NS.writeLocal?.({ id: this.formId || null, title, fields: this.fields });
    }

    setDirty(){ if (this._bootstrapped) this.isDirty = true; }
    clearDirty(){ this.isDirty = false; }
    installUnloadGuard(){
      window.addEventListener('beforeunload', (e) => {
        if (!this.isDirty) return;
        e.preventDefault(); e.returnValue = '';
      });
    }

    addField(type){
      const def = NS.FIELDS_DEFAULTS || {};
      const field = {
        id: (NS.uuid ? NS.uuid() : String(Date.now())),
        type,
        label: typeof def.label === 'function' ? def.label(type) : '',
        options: typeof def.options === 'function' ? def.options(type) : '',
        value: '',
        placeholder: typeof def.placeholder === 'function' ? def.placeholder(type) : '',
        name: '',
        required: false,
        doNotStore: false,
        autoName: true
      };
      this.fields.push(field);
      this.persist();
      this.setDirty();
      this.appendOne(field, this.fields.length - 1);
      this.select(field.id);
    }

    select(id){
      this.selectedId = id;
      this.highlight(id);
      // minimal edit panel sync
      const f = this.fields.find(x => x.id === id);
      if (!f) return;
      if (this.$.editLabel) this.$.editLabel.value = f.label || '';
      if (this.$.editPlaceholder) this.$.editPlaceholder.value = f.placeholder || '';
      if (this.$.editName) this.$.editName.value = f.name || '';
      if (this.$.editOptions) this.$.editOptions.value = NS.needsOptions && NS.needsOptions(f.type) ? (f.options || '') : '';
      if (this.$.editOptionsRow) this.$.editOptionsRow.style.display = (NS.needsOptions && NS.needsOptions(f.type)) ? '' : 'none';
      if (this.$.editRequired) this.$.editRequired.checked = !!f.required;
      if (this.$.editDoNotStore) this.$.editDoNotStore.checked = !!f.doNotStore;
      NS.UI?.showTab?.(this.$.tabEditBtn);
    }

    highlight(id){
      this.$.preview?.querySelectorAll('[data-fid]')?.forEach(el => {
        if (el.dataset.fid === id) el.classList.add('border-primary','shadow-sm'), el.classList.remove('border-light');
        else el.classList.add('border-light'), el.classList.remove('border-primary','shadow-sm');
      });
    }

    attachCardDnD(card){
      card.addEventListener('dragstart', (e) => this.onDragStart(e, card));
      card.addEventListener('dragover',  (e) => this.onDragOver(e, card));
      card.addEventListener('dragleave', (e) => this.onDragLeave(e, card));
      card.addEventListener('drop',      (e) => this.onDrop(e, card));
      card.addEventListener('dragend',   ()  => this.onDragEnd());
    }

    onDragStart(e, el){
      this.dnd.draggingId = el.dataset.fid;
      this.dnd.fromIndex  = Number(el.dataset.index);
      el.classList.add('opacity-50');
      if (this.$.btnSave) { this.$.btnSave.textContent = 'Saving...'; }
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dnd.draggingId);
      } catch (_) {}
    }

    onDragOver(e, el){
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      NS.placePlaceholder?.(el, before);
    }

    onDragLeave(_e, _el){ /* no-op */ }

    onDrop(e, _el){
      e.preventDefault();
      const from = this.dnd.fromIndex;
      if (from < 0) { NS.removePlaceholder?.(); return; }
      const { to, isNoop } = NS.computeDropTarget ? NS.computeDropTarget(this.$.preview, from) : { to: from, isNoop: true };
      if (Number.isInteger(to) && to >= 0 && !isNoop && from !== to) {
        this.fields = NS.move ? NS.move(this.fields, from, to) : this.fields;
        this.persist();
        this.setDirty();
        this.renderPreview();
        if (this.dnd.draggingId) {
          this.select(this.dnd.draggingId);
          const el = this.$.preview?.querySelector(`[data-fid="${this.dnd.draggingId}"]`);
          NS.UI?.flash?.(el);
        }
      }
      NS.removePlaceholder?.();
    }

    onDragEnd(){
      this.$.preview?.querySelectorAll('[data-index]')?.forEach(el => el.classList.remove('opacity-50'));
      NS.removePlaceholder?.();
      this.dnd.draggingId = null;
      this.dnd.fromIndex  = -1;
    }

    onContainerDragOver(e){
      e.preventDefault();
      const last = this.$.preview?.lastElementChild;
      const ph = NS.getPlaceholder?.();
      if (!last) {
        if (ph && ph.parentNode !== this.$.preview) this.$.preview.appendChild(ph);
        return;
      }
      const rect = last.getBoundingClientRect();
      const below = e.clientY > (rect.top + rect.height / 2);
      if (below && ph && (ph.parentNode !== this.$.preview || ph.nextSibling !== null)) {
        this.$.preview.appendChild(ph);
      }
    }

    onContainerDrop(e){
      e.preventDefault();
      const from = this.dnd.fromIndex;
      if (from < 0) { NS.removePlaceholder?.(); return; }
      const { to, isNoop } = NS.computeDropTarget ? NS.computeDropTarget(this.$.preview, from) : { to: from, isNoop: true };
      if (Number.isInteger(to) && to >= 0 && !isNoop && from !== to) {
        this.fields = NS.move ? NS.move(this.fields, from, to) : this.fields;
        this.persist();
        this.setDirty();
        this.renderPreview();
        if (this.dnd.draggingId) this.select(this.dnd.draggingId);
      }
      NS.removePlaceholder?.();
    }

    bindEvents(){
      // Quick Add
      this.$.quickAddButtons?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-type]');
        if (!btn) return;
        const type = btn.getAttribute('data-type');
        if (type) this.addField(type);
      });

      // Select by clicking in preview (outside inputs)
      this.$.preview?.addEventListener('click', (e) => {
        const interactive = e.target.closest('input, select, textarea, button, label');
        if (interactive) return;
        const item = e.target.closest('[data-fid]');
        if (item) this.select(item.dataset.fid);
      });

      // Container DnD hooks
      this.$.preview?.addEventListener('dragover', (e) => this.onContainerDragOver(e));
      this.$.preview?.addEventListener('drop', (e) => this.onContainerDrop(e));

      // Live edits (subset)
      const relayout = () => {
        if (!this.selectedId) return;
        this.renderOne(this.selectedId);
      };
      this.$.editLabel?.addEventListener('input', () => {
        const f = this.fields.find(x => x.id === this.selectedId);
        if (!f) return;
        f.label = this.$.editLabel.value || '';
        if (f.autoName) { f.name = (NS.toSafeSnake ? NS.toSafeSnake(f.label) : f.label); if (this.$.editName) this.$.editName.value = f.name; }
        this.persist();
        this.setDirty();
        relayout();
      });
      this.$.editName?.addEventListener('input', () => {
        const f = this.fields.find(x => x.id === this.selectedId);
        if (!f) return;
        const v = this.$.editName.value || '';
        if (v.length > 0) { f.autoName = false; f.name = v; }
        this.persist();
        this.setDirty();
        relayout();
      });
      this.$.editPlaceholder?.addEventListener('input', () => {
        const f = this.fields.find(x => x.id === this.selectedId);
        if (!f) return;
        f.placeholder = this.$.editPlaceholder.value || '';
        this.persist();
        this.setDirty();
        relayout();
      });
      this.$.editOptions?.addEventListener('input', () => {
        const f = this.fields.find(x => x.id === this.selectedId);
        if (!f) return;
        if (NS.needsOptions && NS.needsOptions(f.type)) {
          f.options = this.$.editOptions.value || '';
        }
        this.persist();
        relayout();
      });
      [this.$.editRequired, this.$.editDoNotStore].forEach(el => el?.addEventListener('input', () => {
        const f = this.fields.find(x => x.id === this.selectedId);
        if (!f) return;
        if (el === this.$.editRequired)   f.required = !!this.$.editRequired.checked;
        if (el === this.$.editDoNotStore) f.doNotStore = !!this.$.editDoNotStore.checked;
        this.persist();
        this.setDirty();
        relayout();
      }));
      // Title input: persist and live-uniqueness check (debounced)
      this.$.formTitle?.addEventListener('input', () => {
        this.persist();
        this.checkTitleUnique?.();
      });

      // Save to DB
      this.$.btnSave?.addEventListener('click', (e) => this.handleSaveToDB(e));
      this.$.btnEditCancel?.addEventListener('click', (e) => { e.preventDefault?.(); this.deleteSelected(); });
    }

    async init(){
      // Preload templates; then bind and do a minimal render
      try { await NS.preloadTemplates?.(); } catch (e) { console.warn('preloadTemplates failed:', e); }
      this.bindDom();
      // capture deep-link id (/builder/:id) if present
      try {
        const m = location.pathname.match(/\/builder\/([^/]+)/);
        if (m && m[1]) this.formId = m[1];
      } catch {}
      this.restore();
      this.renderPreview();
      this.bindEvents();
      // init phone inputs after initial render
      try { NS.whenIntlReady?.(() => this.initPhoneInputs()); } catch {}
      this.installUnloadGuard();
      if (this.fields.length) {
        this.select(this.fields[this.fields.length - 1].id);
      } else {
        NS.UI?.showTab?.(this.$.tabAddBtn);
      }
      this._bootstrapped = true;
      return this;
    }

    getTab(btn){
      const Tab = window.bootstrap?.Tab || (window.bootstrap && window.bootstrap.Tab);
      return Tab ? Tab.getOrCreateInstance(btn) : null;
    }

    showTab(btn){
      if (!btn) return;
      const inst = this.getTab(btn);
      inst ? inst.show() : btn.click?.();
    }

    // ---- Save & validation ----
    hasValidOptions(field){
      if (!NS.needsOptions) return true;
      if (!NS.needsOptions(field.type)) return true;
      const opts = NS.parseOptions ? NS.parseOptions(field.options) : [];
      return opts.length > 0;
    }

    cleanField(f){
      const out = {};
      const KEYS = NS.CLEAN_KEYS || new Set();
      for (const k of KEYS) if (f[k] !== undefined) out[k] = f[k];
      if ((NS.OPTION_TYPES && NS.OPTION_TYPES.has(out.type)) || (NS.needsOptions && NS.needsOptions(out.type))) {
        if (Array.isArray(out.options)) out.options = out.options.join(', ');
        out.options = String(out.options || '').trim();
      } else {
        delete out.options;
      }
      return out;
    }

    setTitleValidity(ok, speak = false){
      const el = this.$.formTitle;
      if (!el) return;
      if (ok) {
        el.setCustomValidity('');
      } else {
        el.setCustomValidity('Form name already exists. Choose another.');
        if (speak) { el.reportValidity?.(); el.focus?.(); }
      }
    }

    checkTitleUnique = (() => {
      const fn = async () => {
        const title = (this.$.formTitle?.value || '').trim();
        if (!title) { this.setTitleValidity(true); return true; }
        try {
          const { body } = await (NS.API?.checkTitleUnique?.(title, this.formId) || {});
          const ok = !!body?.unique;
          this.setTitleValidity(ok);
          return ok;
        } catch {
          this.setTitleValidity(true);
          return true;
        }
      };
      let t; return () => { clearTimeout(t); t = setTimeout(fn, 200); };
    })();

    async handleSaveToDB(e){
      e?.preventDefault?.();
      const title = (this.$.formTitle?.value || '').trim();
      if (!title) { alert('Form must have a title before saving.'); this.$.formTitle?.focus(); return; }

      // On create, do a soft uniqueness check
      if (!this.formId && NS.API?.checkTitleUnique) {
        try {
          const { body } = await NS.API.checkTitleUnique(title);
          if (!body?.unique) { this.$.formTitle?.reportValidity?.(); this.$.formTitle?.focus(); return; }
        } catch {}
      }

      // Field validation
      for (const f of this.fields) {
        if (!String(f.label || '').trim()) { alert('Each field must have a Display Label.'); this.select(f.id); return; }
        if (!String(f.name || '').trim())  { alert('Each field must have an Internal Field Name.'); this.select(f.id); return; }
        if (!this.hasValidOptions(f)) { alert('This field needs options (comma-separated).'); this.select(f.id); return; }
      }

      const payload = {
        id: this.formId || undefined,
        title,
        fields: this.fields.map(f => this.cleanField(f))
      };

      if (this.$.btnSave) { this.$.btnSave.disabled = true; this.$.btnSave.textContent = 'Saving…'; }
      try {
        const { res, body } = await (NS.API?.saveForm?.(payload) || {});
        if (!res?.ok) {
          const msg = (body && body.error) ? body.error : 'Failed to save form.';
          alert(msg);
          return;
        }
        const newId = body?.form?.id || body?.id || null;
        if (newId) {
          this.formId = newId;
          this.persist();
        }
        if (this.$.btnSave) { this.$.btnSave.textContent = 'Saved'; setTimeout(() => { this.$.btnSave.textContent = 'Save'; }, 900); }
      } catch (err) {
        console.error('Failed saving form:', err);
        alert('Failed to save form. See console for details.');
      } finally {
        if (this.$.btnSave) this.$.btnSave.disabled = false;
      }
    }

    // ---- Phone inputs (intl-tel-input) ----
    initPhoneInputsIn(rootEl){
      if (!window.intlTelInput || !rootEl) return;
      const nodes = rootEl.querySelectorAll?.('.js-intl-tel, input[type="tel"]') || [];
      nodes.forEach(input => this._initOnePhone(input));
    }

    initPhoneInputs(){
      if (!window.intlTelInput) return;
      const nodes = this.$.preview?.querySelectorAll('.js-intl-tel, input[type="tel"]') || [];
      nodes.forEach(input => this._initOnePhone(input));
    }

    _initOnePhone(input){
      const existing = window.intlTelInputGlobals?.getInstance?.(input);
      if (existing) existing.destroy();

      const card = input.closest('[data-fid]');
      const field = this.fields.find(f => f.id === card?.dataset?.fid);

      const iti = window.intlTelInput(input, {
        initialCountry: field?.countryIso2 || 'id',
        preferredCountries: ['id','us'],
        utilsScript: window.INTL_UTILS_URL || "https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js"
      });

      const wrap = input.closest('.iti') || input.parentElement;
      if (wrap) {
        wrap.style.width = '100%';
        wrap.style.setProperty('--iti-path', '/vendor/intl-tel-input/build/img/');
      }

      input.addEventListener('countrychange', () => {
        try {
          const iso2 = iti.getSelectedCountryData()?.iso2;
          if (field && iso2) { field.countryIso2 = iso2; this.persist(); }
        } catch {}
      });
    }
  }

  NS.Builder = Builder;
  NS.startBuilder = async function startBuilder(){
    const b = new Builder();
    await b.init();
    return b;
  };
})();

// ---- 99-boot.js ----
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


