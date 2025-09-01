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
      // DnD handled by SortableJS on the container
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

    deleteSelected(){
      const id = this.selectedId;
      if (!id) return;
      const idx = this.fields.findIndex(f => f.id === id);
      if (idx < 0) return;
      this.fields.splice(idx, 1);
      this.persist();
      this.setDirty();
      this.renderPreview();
      if (this.fields.length > 0) {
        const next = this.fields[Math.min(idx, this.fields.length - 1)];
        if (next) this.select(next.id);
      } else {
        this.selectedId = null;
        if (this.$.editLabel) this.$.editLabel.value = '';
        if (this.$.editPlaceholder) this.$.editPlaceholder.value = '';
        if (this.$.editName) this.$.editName.value = '';
        if (this.$.editOptions) this.$.editOptions.value = '';
        if (this.$.editRequired) this.$.editRequired.checked = false;
        if (this.$.editDoNotStore) this.$.editDoNotStore.checked = false;
        NS.UI?.showTab?.(this.$.tabAddBtn);
      }
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
      // Full render ensures SortableJS picks up the new node and indexes are normalized
      this.renderPreview();
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

    onDrop(e, el){
      e.preventDefault();
      const from = this.dnd.fromIndex;
      if (from < 0) { NS.removePlaceholder?.(); return; }
      const preview = this.$.preview;
      const ph = NS.getPlaceholder?.();
      const hasPh = !!(ph && ph.parentNode === preview);
      let to = from, isNoop = true;
      if (hasPh && NS.computeDropTarget) {
        ({ to, isNoop } = NS.computeDropTarget(preview, from));
      } else {
        // Fast drop before any dragover: compute by pointer Y relative to element or container
        const kids = Array.from(preview.children).filter(k => k !== ph);
        const idxEl = kids.indexOf(el);
        let rawTo;
        if (idxEl >= 0) {
          const rect = el.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          rawTo = before ? idxEl : idxEl + 1;
        } else if (NS.computeIndexByY) {
          rawTo = NS.computeIndexByY(preview, e.clientY);
        } else {
          rawTo = from;
        }
        to = from < rawTo ? rawTo - 1 : rawTo;
        isNoop = (to === from);
      }
      if (Number.isInteger(to) && to >= 0 && !isNoop && from !== to) {
        this.fields = NS.move ? NS.move(this.fields, from, to) : this.fields;
        this.persist();
        this.setDirty();
        this.renderPreview();
        if (this.dnd.draggingId) {
          this.select(this.dnd.draggingId);
          const el2 = this.$.preview?.querySelector(`[data-fid="${this.dnd.draggingId}"]`);
          NS.UI?.flash?.(el2);
        }
        if (this.$.btnSave) { this.$.btnSave.disabled = false; this.$.btnSave.textContent = 'Save'; }
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
      if (!this.$.preview) return;
      const idx = NS.computeIndexByY ? NS.computeIndexByY(this.$.preview, e.clientY) : null;
      if (idx !== null && idx !== undefined) {
        NS.placePlaceholderAtIndex?.(this.$.preview, idx);
      }
    }

    onContainerDrop(e){
      e.preventDefault();
      const from = this.dnd.fromIndex;
      if (from < 0) { NS.removePlaceholder?.(); return; }
      const preview = this.$.preview;
      const ph = NS.getPlaceholder?.();
      const hasPh = !!(ph && ph.parentNode === preview);
      let to = from, isNoop = true;
      if (hasPh && NS.computeDropTarget) {
        ({ to, isNoop } = NS.computeDropTarget(preview, from));
      } else {
        let rawTo = NS.computeIndexByY ? NS.computeIndexByY(preview, e.clientY) : from;
        to = from < rawTo ? rawTo - 1 : rawTo;
        isNoop = (to === from);
      }
      if (Number.isInteger(to) && to >= 0 && !isNoop && from !== to) {
        this.fields = NS.move ? NS.move(this.fields, from, to) : this.fields;
        this.persist();
        this.setDirty();
        this.renderPreview();
        if (this.dnd.draggingId) {
          this.select(this.dnd.draggingId);
          const el2 = this.$.preview?.querySelector(`[data-fid=\"${this.dnd.draggingId}\"]`);
          NS.UI?.flash?.(el2);
        }
        if (this.$.btnSave) { this.$.btnSave.disabled = false; this.$.btnSave.textContent = 'Save'; }
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

      // Container DnD hooks (fallback only if SortableJS not present)
      if (typeof window.Sortable === 'undefined') {
        this.$.preview?.addEventListener('dragover', (e) => this.onContainerDragOver(e));
        this.$.preview?.addEventListener('drop', (e) => this.onContainerDrop(e));
      }

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
      this.initSortable?.();
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

    initSortable(){
      if (this._sortableReady) return;
      const host = this.$.preview;
      if (!host || typeof window.Sortable === 'undefined') return;
      try {
        // eslint-disable-next-line no-new
        new window.Sortable(host, {
          animation: 150,
          draggable: '[data-fid]',
          filter: 'input,textarea,select,button,label',
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          dragClass: 'dragging',
          fallbackOnBody: true,
          swapThreshold: 0.5,
          onStart: (evt) => {
            const el = evt.item;
            this.dnd.draggingId = el?.dataset?.fid || null;
            this.dnd.fromIndex = evt.oldIndex ?? -1;
          },
          onEnd: (evt) => {
            const from = (evt.oldIndex ?? -1);
            const to   = (evt.newIndex ?? -1);
            this.dnd.draggingId = null;
            this.dnd.fromIndex  = -1;
            if (from < 0 || to < 0 || from === to) return;
            if (from >= this.fields.length || to >= this.fields.length) return;
            const id = this.fields[from]?.id;
            const [moved] = this.fields.splice(from, 1);
            this.fields.splice(to, 0, moved);
            this.persist();
            this.setDirty();
            this.renderPreview();
            if (id) {
              this.select(id);
              const el = this.$.preview?.querySelector(`[data-fid=\"${id}\"]`);
              NS.UI?.flash?.(el);
            }
            if (this.$.btnSave) { this.$.btnSave.disabled = false; this.$.btnSave.textContent = 'Save'; }
          }
        });
        this._sortableReady = true;
      } catch (e) {
        console.warn('Sortable init failed', e);
      }
    }
  }

  NS.Builder = Builder;
  NS.startBuilder = async function startBuilder(){
    const b = new Builder();
    await b.init();
    return b;
  };
})();
