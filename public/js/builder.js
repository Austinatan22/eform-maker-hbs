/* =========================================================================
 * eForm Maker – Builder (browser, no modules)
 * - Preloads & compiles Handlebars partials once; then sync renders (fast)
 * - Incremental re-render of only the edited field (no full refresh)
 * - DnD, edit panel, phone flags (intl-tel-input) in preview
 * - Sanitized save payload (fixes saving issues)
 * - LocalStorage persistence
 * - Unsaved-changes warning (dirty-state + beforeunload guard)
 * - UPDATED:
 *    • suffix no longer auto-follows label
 *    • live duplicate-suffix validation per form (blocks Save)
 * ========================================================================= */

(() => {
  const LS_KEY = 'eform-maker-hbs';

  const SELECTORS = {
    preview:        '#preview',

    // Quick Add
    quickAddButtons:'#quickAddButtons',

    // Edit panel
    editTitle:      '#editTitle',
    editLabel:      '#editLabel',
    editOptions:    '#editOptions',
    editOptionsRow: '#editOptionsRow',
    editValue:      '#editValue',
    editPlaceholder:'#editPlaceholder',
    editName:       '#editName',
    editPrefix:     '#editPrefix',   // read-only; derived from title
    editSuffix:     '#editSuffix',
    editClass:      '#editClass',
    editRequired:   '#editRequired',
    editDoNotStore: '#editDoNotStore',
    editDataSource: '#editDataSource',
    btnEditSave:    '#editSave',
    btnEditCancel:  '#editCancel',

    // Form
    formTitle:      '#formTitle',
    btnSave:        '#saveBtn',

    // Tabs
    tabAddBtn:      '#tabAdd',
    tabEditBtn:     '#tabEdit'
  };

  // Field types that actually have options
  const OPTION_TYPES = new Set(['dropdown','multipleChoice','checkboxes']);

  // Only keep these keys when saving (strip cached html & internals)
  const CLEAN_KEYS = new Set([
    'id','type','label','options','value','placeholder','name','prefix','suffix',
    'customClass','required','doNotStore','countryIso2','dataSource'
  ]);

  // Map builder types -> partial filenames
  const PARTIAL_FOR = {
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

  // ---------- utils ----------
  const uuid = () => 'fld_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

  const debounce = (fn, ms=160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };

  const getTab = (btn) => {
    const Tab = window.bootstrap?.Tab || (window.bootstrap && window.bootstrap.Tab);
    return Tab ? Tab.getOrCreateInstance(btn) : null;
  };

  const deriveDbPrefixFromTitle = (title) =>
    String(title || 'FORM').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');

  // wait until intl-tel-input is available (handles refresh race)
  function whenIntlReady(cb, tries = 40) {
    if (window.intlTelInput) return cb();
    if (tries <= 0) return;
    setTimeout(() => whenIntlReady(cb, tries - 1), 50); // ~2 seconds total
  }

  // Convert Display Label to internal + suffix variants
  function toSafeSnake(s) {
    return String(s || '')
      .trim()
      .replace(/[\s\-]+/g, '_')       // spaces/dashes -> underscore
      .replace(/[^a-zA-Z0-9_]/g, '')  // strip non-alnum/underscore
      .replace(/_+/g, '_')            // collapse ___
      .replace(/^_+|_+$/g, '')        // trim _
      .toLowerCase();
  }

  function toSafeUpperSnake(s) {
    return toSafeSnake(s).toUpperCase();
  }

  function parseOptions(str = '') {
    return String(str)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  function needsOptions(type) {
    return type === 'dropdown' || type === 'multipleChoice' || type === 'checkboxes';
  }

  function hasValidOptionsOrDataSource(field) {
    if (!needsOptions(field.type)) return true;
    const hasOptions = parseOptions(field.options).length > 0;
    const hasDataSource = !!String(field.dataSource || '').trim();
    return hasOptions || hasDataSource;
  }

  // ---------- template loader (preload & compile once; then sync render) ----------
  const TEMPLATES = Object.create(null); // { 'text': compiledFn, ... }

  async function preloadTemplates() {
    const names = [...new Set(Object.values(PARTIAL_FOR))];
    const fetches = names.map(async (n) => {
      const res = await fetch(`/tpl/fields/${n}.hbs`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Load template failed: ${n}`);
      const src  = await res.text();
      TEMPLATES[n] = Handlebars.compile(src);
    });
    await Promise.all(fetches);
  }

  function renderFieldHTML(field, idx, formTitle) {
    const partialName = PARTIAL_FOR[field.type] || 'text';
    const tmpl = TEMPLATES[partialName];
    if (!tmpl) return ''; // should not happen after preload
    return tmpl({
      name:        field.name || field.id || `f_${idx}`,
      label:       field.label || '',
      required:    !!field.required,
      placeholder: field.placeholder || '',
      customClass: field.customClass || '',
      options: String(field.options || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      prefix: deriveDbPrefixFromTitle(formTitle || '')
    });
  }

  function cleanField(f) {
    const out = {};
    for (const k of CLEAN_KEYS) if (f[k] !== undefined) out[k] = f[k];

    // Normalize options: string with commas for option types; remove otherwise
    if (OPTION_TYPES.has(out.type)) {
      if (Array.isArray(out.options)) out.options = out.options.join(', ');
      out.options = String(out.options || '').trim();
    } else {
      delete out.options;
    }
    return out;
  }

  // ---------- defaults ----------
  const FIELDS_DEFAULTS = {
    label: (_t) => '',
    options: (t) => OPTION_TYPES.has(t) ? 'Option 1, Option 2' : '',
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

  // ---------- Builder ----------
  class Builder {
    constructor() {
      this.formId = null; // current form id (for upserts)
      this.fields = [];
      this.selectedId = null;

      this.dnd = { draggingId: null, fromIndex: -1 };
      this.placeholderEl = null;

      // Dirty tracking & bootstrap gate
      this.isDirty = false;
      this._bootstrapped = false;

      this.$ = this.bindDom();
      this.persist = debounce(this.persist.bind(this), 140);
    }

    // ---- Dirty helpers ----
    setDirty() { if (this._bootstrapped) this.isDirty = true; }
    clearDirty() { this.isDirty = false; }
    installUnloadGuard() {
      window.addEventListener('beforeunload', (e) => {
        if (!this.isDirty) return;
        e.preventDefault();
        e.returnValue = '';
      });
    }

    bindDom() {
      const grab = (sel) => document.querySelector(sel);
      const o = {};
      for (const [k, sel] of Object.entries(SELECTORS)) o[k] = grab(sel);
      return o;
    }

    // ---------- init ----------
    async init() {
      // restore first (so we know how many fields to render)
      this.restore();

      // deep-link /builder/:id
      const m = location.pathname.match(/\/builder\/([^/]+)/);
      if (m && m[1]) this.formId = m[1];  // <- overwrite unconditionally

      // preload shared field templates up-front (compile once)
      await preloadTemplates();

      this.bindEvents();
      this.renderPreview();            // fast, sync render
      this.updateEditPanel();
      this.updateDerivedPrefix();

      if (this.fields.length) {
        this.select(this.fields[this.fields.length - 1].id, { focusEdit: true });
      } else {
        this.showTab(this.$.tabAddBtn);
      }

      // init flags after full preview is in the DOM
      whenIntlReady(() => this.initPhoneInputs());

      // Unload guard starts after initial render/restore
      this.installUnloadGuard();
      // Start tracking dirty from here on (ignore init/restore noise)
      this._bootstrapped = true;
    }

    bindEvents() {
      // Quick Add
      this.$.quickAddButtons?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-type]');
        if (!btn) return;
        const type = btn.getAttribute('data-type');
        if (type) this.addField(type);
      });

      // Edit panel actions
      this.$.btnEditSave?.addEventListener('click', (e) => { e.preventDefault(); this.applyEdits(); });
      this.$.btnEditCancel?.addEventListener('click', (e) => { e.preventDefault(); this.deleteSelected(); });

      // Live edit inputs → incremental re-render of just the current field
      [
        this.$.editLabel, this.$.editOptions, this.$.editValue, this.$.editPlaceholder,
        this.$.editName,  this.$.editSuffix, this.$.editClass, this.$.editDataSource
      ].forEach(el => el?.addEventListener('input', () => { this.applyEdits({ incremental: true }); this.setDirty(); }));

      // Keep auto-fill behavior in sync with label edits (ONLY for name now)
      this.$.editLabel?.addEventListener('input', () => {
        this.applyEdits({ incremental: true });
        this.setDirty();
      });

      this.$.editLabel?.addEventListener('blur', () => {
        const f = this.current();
        if (!f) return;
        // Only auto-fill for Internal Name; DO NOT auto-fill suffix anymore
        if (f.autoName) {
          f.name = toSafeSnake(this.$.editLabel.value);
          if (this.$.editName) this.$.editName.value = f.name;
        }
        this.persist();
        this.setDirty();
        this.renderOne(f.id);
      });

      // Field Name (internal) — input: break follow when user types; blur: re-enable if empty
      this.$.editName?.addEventListener('input', () => {
        const f = this.current();
        if (!f) return;
        const v = this.$.editName.value ?? '';
        if (v.length > 0) {
          f.autoName = false;            // user is customizing
          f.name = v;
        }
        this.persist();
        this.setDirty();
        this.renderOne(f?.id);
      });

      this.$.editName?.addEventListener('blur', () => {
        const f = this.current();
        if (!f) return;
        const v = (this.$.editName.value || '').trim();
        if (v === '') {
          f.autoName = true;
          f.name = toSafeSnake(this.$.editLabel?.value || f.label || '');
          this.$.editName.value = f.name;
          this.persist();
          this.setDirty();
          this.renderOne(f.id);
        }
      });

      // DB Suffix — now always manual; validate uniqueness as user types
      this.$.editSuffix?.addEventListener('input', () => {
        const f = this.current();
        if (!f) return;
        f.autoSuffix = false;          // permanently manual now
        f.suffix = this.$.editSuffix.value ?? '';
        this.validateSuffixUnique(f);
        this.persist();
        this.setDirty();
        this.renderOne(f?.id);
      });

      // No auto-follow behavior for suffix on blur anymore

      // Flags
      [this.$.editRequired, this.$.editDoNotStore]
        .forEach(el => el?.addEventListener('input', () => { this.applyEdits({ incremental: true }); this.setDirty(); }));

      // Title updates (affects derived prefix) — no full re-render
      this.$.formTitle?.addEventListener('input', () => {
        this.updateDerivedPrefix();
        this.persist();
        this.setDirty();
        if (this.selectedId) this.renderOne(this.selectedId);
      });

      // Save to DB
      this.$.btnSave?.addEventListener('click', (e) => this.handleSaveToDB(e));

      // Preview: container DnD & click select via delegation
      this.$.preview?.addEventListener('dragover', (e) => this.onContainerDragOver(e));
      this.$.preview?.addEventListener('drop', (e) => this.onContainerDrop(e));
      this.$.preview?.addEventListener('click', (e) => {
        const interactive = e.target.closest('input, select, textarea, button, label');
        if (interactive) return;
        const item = e.target.closest('[data-fid]');
        if (item) this.select(item.dataset.fid, { focusEdit: true });
      });

      this.$.formTitle?.addEventListener('input', () => {
        this.updateDerivedPrefix();
        this.persist();
        this.setDirty();
        if (this.selectedId) this.renderOne(this.selectedId);
        // Live check (quiet)
        this.checkTitleUnique();
      });
    }
    

    // ---------- operations ----------
    addField(type) {
      const field = {
        id: uuid(),
        type,
        label: FIELDS_DEFAULTS.label(type),
        options: FIELDS_DEFAULTS.options(type),
        value: '',
        placeholder: FIELDS_DEFAULTS.placeholder(type),
        name: '',
        prefix: '',
        suffix: '',
        customClass: '',
        required: false,
        doNotStore: false,
        dataSource: '',
        // Follow label for name only; suffix is manual now
        autoName: true,
        autoSuffix: false
      };
      this.fields.push(field);
      this.persist();
      this.setDirty();

      // append only the new field (faster than full re-render)
      this.appendOne(field, this.fields.length - 1);
      whenIntlReady(() => this.initPhoneInputsIn(
        this.$.preview.querySelector(`[data-fid="${field.id}"]`)
      ));

      this.select(field.id, { focusEdit: true });
    }

    deleteSelected() {
      if (!this.selectedId) return;
      const idx = this.indexById(this.selectedId);
      if (idx < 0) return;
      this.fields.splice(idx, 1);
      this.selectedId = null;
      this.persist();
      this.setDirty();
      this.renderPreview();
      whenIntlReady(() => this.initPhoneInputs());
      this.showTab(this.$.tabAddBtn);
      this.updateEditPanel();
    }

    applyEdits({ incremental = false } = {}) {
      const f = this.current();
      if (!f) return;

      f.label       = this.$.editLabel?.value ?? f.label;
      f.value       = this.$.editValue?.value ?? f.value;
      f.placeholder = this.$.editPlaceholder?.value ?? f.placeholder;
      f.name        = this.$.editName?.value ?? f.name;

      f.prefix      = deriveDbPrefixFromTitle(this.$.formTitle?.value || '');
      f.suffix      = this.$.editSuffix?.value ?? f.suffix;
      f.customClass = this.$.editClass?.value ?? f.customClass;

      if (OPTION_TYPES.has(f.type)) {
        f.options   = this.$.editOptions?.value ?? f.options;
      } else {
        f.options = '';
      }

      f.required    = !!this.$.editRequired?.checked;
      f.doNotStore  = !!this.$.editDoNotStore?.checked;

      if (this.$.editDataSource) f.dataSource = this.$.editDataSource.value || '';

      this.validateSuffixUnique(f);

      this.persist();
      this.setDirty();

      if (incremental) {
        this.renderOne(this.selectedId);
      } else {
        this.renderPreview();
        whenIntlReady(() => this.initPhoneInputs());
      }

      this.highlight(this.selectedId);
    }

    // -- NEW: check if current suffix is unique within this form
    validateSuffixUnique(forField) {
      const suffixEl = this.$.editSuffix;
      if (!suffixEl || !forField) return true;
      const entered = String(suffixEl.value || '').trim();
      const conflict = this.fields.find(f =>
        f.id !== forField.id &&
        String(f.suffix || '').trim().toUpperCase() === entered.toUpperCase()
      );
      if (conflict && entered) {
        suffixEl.setCustomValidity('This DB Suffix already exists in this form.');
        suffixEl.reportValidity();
        return false;
      }
      suffixEl.setCustomValidity('');
      return true;
    }

    // ---------- selection & panel ----------
    select(id, opts = { focusEdit: false }) {
      this.selectedId = id;
      this.highlight(id);
      this.updateEditPanel();
      this.showTab(this.$.tabEditBtn);

      if (opts.focusEdit) {
        setTimeout(() => {
          this.$.editLabel?.focus();
          this.$.editLabel?.select?.();
        }, 0);
      }
    }

    current() { return this.fields.find(f => f.id === this.selectedId) || null; }
    indexById(id) { return this.fields.findIndex(f => f.id === id); }

    updateEditPanel() {
      const f = this.current();

      if (!f) {
        if (this.$.editTitle) this.$.editTitle.textContent = 'No field selected';
        if (this.$.editOptionsRow) this.$.editOptionsRow.style.display = 'none';
        [
          this.$.editLabel, this.$.editOptions, this.$.editValue, this.$.editPlaceholder,
          this.$.editName,  this.$.editPrefix,  this.$.editSuffix, this.$.editClass, this.$.editDataSource
        ].forEach(el => el && (el.value = ''));
        if (this.$.editRequired) this.$.editRequired.checked = false;
        if (this.$.editDoNotStore) this.$.editDoNotStore.checked = false;
        return;
      }

      if (this.$.editTitle) this.$.editTitle.textContent = `Editing: ${f.label || '(Untitled)'}`;
      const set = (el, v) => { if (el) el.value = v ?? ''; };

      set(this.$.editLabel,       f.label);
      set(this.$.editValue,       f.value);
      set(this.$.editPlaceholder, f.placeholder);
      set(this.$.editName,        f.name);
      set(this.$.editClass,       f.customClass);
      set(this.$.editSuffix,      f.suffix);
      set(this.$.editDataSource,  f.dataSource || '');

      if (this.$.editPrefix) this.$.editPrefix.value = deriveDbPrefixFromTitle(this.$.formTitle?.value || '');

      if (this.$.editOptionsRow) {
        if (OPTION_TYPES.has(f.type)) {
          this.$.editOptionsRow.style.display = '';
          set(this.$.editOptions, f.options || '');
        } else {
          this.$.editOptionsRow.style.display = 'none';
          set(this.$.editOptions, '');
        }
      }

      if (this.$.editRequired)   this.$.editRequired.checked   = !!f.required;
      if (this.$.editDoNotStore) this.$.editDoNotStore.checked = !!f.doNotStore;

      // show any existing suffix error
      this.validateSuffixUnique(f);
    }

    updateDerivedPrefix() {
      const p = deriveDbPrefixFromTitle(this.$.formTitle?.value || '');
      if (this.$.editPrefix) this.$.editPrefix.value = p;
      this.fields.forEach(f => { f.prefix = p; });
    }

    showTab(btn) {
      if (!btn) return;
      const inst = getTab(btn);
      inst ? inst.show() : btn.click?.();
    }

    // ---------- rendering ----------
    renderPreview() {
      const host = this.$.preview;
      if (!host) return;
      host.innerHTML = '';

      const frag = document.createDocumentFragment();

      this.fields.forEach((f, i) => {
        frag.appendChild(this.buildCard(f, i));
      });

      host.appendChild(frag);
    }

    appendOne(field, idx) {
      const card = this.buildCard(field, idx);
      this.$.preview.appendChild(card);
    }

    renderOne(fieldId) {
      const idx = this.indexById(fieldId);
      if (idx < 0) return;
      const card = this.$.preview.querySelector(`[data-fid="${fieldId}"]`);
      if (!card) return;

      // update body only
      const body = card.querySelector('.field-body');
      if (body) body.innerHTML = renderFieldHTML(this.fields[idx], idx, this.$.formTitle?.value || '');

      // re-init phone for this card (if needed)
      whenIntlReady(() => this.initPhoneInputsIn(card));
    }

    buildCard(f, i) {
      const card = document.createElement('div');
      card.className = 'mb-4 p-3 border rounded position-relative';
      card.dataset.fid = f.id;
      card.dataset.index = String(i);
      card.draggable = true;
      card.style.cursor = 'move';

      const body = document.createElement('div');
      body.className = 'field-body';
      body.innerHTML = renderFieldHTML(f, i, this.$.formTitle?.value || '');
      card.appendChild(body);

      if (f.id === this.selectedId) card.classList.add('border-primary','shadow-sm');
      else card.classList.add('border-light');

      // DnD on the card
      card.addEventListener('dragstart', (e) => this.onDragStart(e, card));
      card.addEventListener('dragover',  (e) => this.onDragOver(e, card));
      card.addEventListener('dragleave', (e) => this.onDragLeave(e, card));
      card.addEventListener('drop',      (e) => this.onDrop(e, card));
      card.addEventListener('dragend',   ()  => this.onDragEnd());

      return card;
    }

    highlight(id) {
      this.$.preview?.querySelectorAll('[data-fid]').forEach(el => {
        if (el.dataset.fid === id) el.classList.add('border-primary','shadow-sm'), el.classList.remove('border-light');
        else el.classList.add('border-light'), el.classList.remove('border-primary','shadow-sm');
      });
    }

    // ---------- intl-tel-input ----------
    initPhoneInputsIn(rootEl) {
      if (!window.intlTelInput) return;
      const inputs = rootEl.querySelectorAll?.('.js-intl-tel, input[type="tel"]') || [];
      inputs.forEach(input => this._initOnePhone(input));
    }

    initPhoneInputs() {
      if (!window.intlTelInput) return;
      const inputs = this.$.preview?.querySelectorAll('.js-intl-tel, input[type="tel"]') || [];
      inputs.forEach(input => this._initOnePhone(input));
    }

    _initOnePhone(input) {
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
          if (field && iso2) { field.countryIso2 = iso2; this.persist(); this.setDirty(); }
        } catch {}
      });
    }

    // ---------- DnD ----------
    getPlaceholder() {
      if (!this.placeholderEl) {
        this.placeholderEl = document.createElement('div');
        this.placeholderEl.className = 'dnd-insert';
      }
      return this.placeholderEl;
    }

    placePlaceholder(targetEl, before = true) {
      const ph = this.getPlaceholder();
      if (!targetEl || !targetEl.parentNode) return;
      before ? targetEl.parentNode.insertBefore(ph, targetEl)
             : targetEl.parentNode.insertBefore(ph, targetEl.nextSibling);
    }

    removePlaceholder() {
      const ph = this.getPlaceholder();
      if (ph.parentNode) ph.parentNode.removeChild(ph);
    }

    computeDropTarget(fromIndex) {
      const kids = Array.from(this.$.preview.children);
      let rawTo = kids.indexOf(this.getPlaceholder());
      if (rawTo < 0) rawTo = kids.length;

      let to = rawTo;
      if (fromIndex < rawTo) to = rawTo - 1;

      const isNoop = (to === fromIndex) || (rawTo === fromIndex + 1);
      return { to, isNoop };
    }

    onDragStart(e, el) {
      this.dnd.draggingId = el.dataset.fid;
      this.dnd.fromIndex  = Number(el.dataset.index);
      el.classList.add('opacity-50');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dnd.draggingId);
      } catch (_e) {}
    }

    onDragOver(e, el) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      this.placePlaceholder(el, before);
    }

    onDragLeave(_e, _el) { /* no-op */ }

    onDrop(e, _el) {
      e.preventDefault();
      const from = this.dnd.fromIndex;
      if (from < 0) { this.removePlaceholder(); return; }

      const { to, isNoop } = this.computeDropTarget(from);
      if (Number.isInteger(to) && to >= 0 && !isNoop && from !== to) {
        this.fields = this.move(this.fields, from, to);
        this.persist();
        this.setDirty();
        this.renderPreview();
        whenIntlReady(() => this.initPhoneInputs());
        if (this.dnd.draggingId) {
          this.select(this.dnd.draggingId, { focusEdit: true });
          this.flashCard(this.dnd.draggingId);
        }
      }
      this.removePlaceholder();
    }

    onContainerDragOver(e) {
      e.preventDefault();
      const last = this.$.preview.lastElementChild;
      const ph = this.getPlaceholder();
      if (!last) {
        if (ph.parentNode !== this.$.preview) this.$.preview.appendChild(ph);
        return;
      }
      const rect = last.getBoundingClientRect();
      const below = e.clientY > (rect.top + rect.height / 2);
      if (below && (ph.parentNode !== this.$.preview || ph.nextSibling !== null)) {
        this.$.preview.appendChild(ph);
      }
    }

    onContainerDrop(e) {
      e.preventDefault();
      const from = this.dnd.fromIndex;
      if (from < 0) { this.removePlaceholder(); return; }

      const { to, isNoop } = this.computeDropTarget(from);
      if (Number.isInteger(to) && to >= 0 && !isNoop && from !== to) {
        this.fields = this.move(this.fields, from, to);
        this.persist();
        this.setDirty();
        this.renderPreview();
        whenIntlReady(() => this.initPhoneInputs());
        if (this.dnd.draggingId) {
          this.select(this.dnd.draggingId, { focusEdit: true });
          this.flashCard(this.dnd.draggingId);
        }
      }
      this.removePlaceholder();
    }

    onDragEnd() {
      this.$.preview?.querySelectorAll('[data-index]').forEach(el => el.classList.remove('opacity-50'));
      this.removePlaceholder();
      this.dnd.draggingId = null;
      this.dnd.fromIndex  = -1;
    }

    move(arr, from, to) {
      if (from === to || from < 0 || to < 0 || from >= arr.length || to > arr.length) return arr;
      const copy = arr.slice();
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    }

    flashCard(fieldId) {
      const el = this.$.preview?.querySelector(`[data-fid="${fieldId}"]`);
      if (!el) return;
      el.classList.add('drop-flash');
      setTimeout(() => el.classList.remove('drop-flash'), 450);
    }

    // ---------- persistence ----------
    persist() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          id: this.formId || null,
          title: this.$.formTitle?.value || '',
          fields: this.fields
        }));
      } catch (_e) {}
    }

    restore() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data?.id) this.formId = data.id;
        if (data?.title && this.$.formTitle) this.$.formTitle.value = data.title;
        if (Array.isArray(data?.fields)) this.fields = data.fields;
      } catch (_e) {}
    }

    // ---------- Save to DB ----------
    async handleSaveToDB(e) {
      e?.preventDefault?.();

  const title = (this.$.formTitle?.value || '').trim();
  if (!title) {
    alert('Form must have a title before saving.');
    this.$.formTitle?.focus();
    return;
  }

  // ✅ Only run the remote title-uniqueness check on CREATE.
  // On UPDATE, rely on the server (it excludes the current ID correctly).
  if (!this.formId) {
    const params = new URLSearchParams({ title });
    try {
      const res  = await fetch(`/api/forms/check-title?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json?.unique) {
        this.$.formTitle?.reportValidity?.();
        this.$.formTitle?.focus();
        return;
      }
    } catch {
      // network hiccup: let the server be the source of truth
    }
  }
  // Validate all fields
  for (const f of this.fields) {
    if (!String(f.label || '').trim()) {
      alert('Each field must have a Display Label.');
      this.select(f.id, { focusEdit: true });
      return;
    }
    if (!String(f.name || '').trim()) {
      alert('Each field must have an Internal Field Name.');
      this.select(f.id, { focusEdit: true });
      return;
    }
    if (!hasValidOptionsOrDataSource(f)) {
      alert('This field needs options (comma-separated) or a data source.');
      this.select(f.id, { focusEdit: true });
      return;
    }
  }
  
  // ensure derived prefix up-to-date on all fields
  const prefix = deriveDbPrefixFromTitle(this.$.formTitle?.value || '');
  this.fields.forEach(f => { f.prefix = prefix; });

      // Fail fast on duplicate suffix within this form
      {
        const seen = new Set();
        for (const f of this.fields) {
          const sx = String(f.suffix || '').trim().toUpperCase();
          const key = `${prefix}__${sx}`;
          if (!sx) {
            alert('Each field must have a DB Suffix.');
            this.select(f.id, { focusEdit: true });
            return;
          }
          if (seen.has(key)) {
            alert(`Duplicate DB Suffix "${f.suffix}" within this form. Each suffix must be unique.`);
            this.select(f.id, { focusEdit: true });
            return;
          }
          seen.add(key);
        }
      }

      const payload = {
        id: this.formId || undefined, // upsert if present
        title: (this.$.formTitle?.value || '').trim(),
        fields: this.fields.map(cleanField)
      };

      if (this.$.btnSave) { this.$.btnSave.disabled = true; this.$.btnSave.textContent = 'Saving…'; }

      try {
  const res = await fetch('/api/forms', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });

  // Handle common validation/uniqueness errors gracefully
  if (!res.ok) {
    let msg = 'Failed to save form.';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // body wasn't JSON; keep default msg
    }

    // Title duplicate → 409
    if (res.status === 409) {
      // show an inline validity error on the title input
      this.setTitleValidity(false);
      this.$.formTitle?.focus();
      alert(msg);                // or replace with your toast/snackbar
      return;                    // don't throw; handled
    }

    // Field duplicate / bad request → 400
    if (res.status === 400) {
      alert(msg);                // already descriptive from server
      return;
    }

    // Other statuses → generic
    throw new Error(`HTTP ${res.status}`);
  }

  // OK path
  const json = await res.json();
  const newId = json?.form?.id || json?.id || null;
  if (newId) {
    this.formId = newId;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        id: this.formId,
        title: payload.title,
        fields: payload.fields
      }));
    } catch {}
  }

  if (this.$.btnSave) { this.$.btnSave.textContent = 'Saved'; setTimeout(() => { this.$.btnSave.textContent = 'Save'; }, 900); }
  this.clearDirty();
      } catch (err) {
        console.error('Failed saving form:', err);
        alert('Failed to save form. See console for details.');
      } finally {
        if (this.$.btnSave) this.$.btnSave.disabled = false;
      }

          }

          // show/hide validation message on the title input
          setTitleValidity(ok, speak = false) {
            const el = this.$.formTitle;
            if (!el) return;
            if (ok) {
              el.setCustomValidity('');
            } else {
              el.setCustomValidity('Form name already exists. Choose another.');
              if (speak) {
                el.reportValidity?.();
                el.focus?.();
              }
            }
          }

          // debounced remote check against the server
          checkTitleUnique = (() => {
            const fn = async () => {
              const title = (this.$.formTitle?.value || '').trim();
              if (!title) { this.setTitleValidity(true); return true; } // don't warn mid-typing
              const params = new URLSearchParams({ title });
              if (this.formId) params.append('excludeId', this.formId);
              try {
                const res = await fetch(`/api/forms/check-title?${params.toString()}`, { cache: 'no-store' });
                const json = await res.json();
                const ok = !!json?.unique;
                this.setTitleValidity(ok);
                return ok;
              } catch {
                // on network error, let the server decide on save
                this.setTitleValidity(true);
                return true;
              }
            };
            // debounce wrapper
            let t; 
            return () => { clearTimeout(t); t = setTimeout(fn, 200); };
          })();
  }

  // ---------- boot ----------
  const start = async () => { await new Builder().init(); };
  (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', start)
    : start();
})();