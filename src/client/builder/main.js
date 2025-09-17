// src/client/builder/main.js
import { uuid, debounce, toSafeSnake, generateUniqueFieldName } from './utils.js';
import { flash, showTab } from './ui.js';
import { preloadTemplates, renderFieldHTML } from './templates.js';
import { parseOptions, needsOptions, whenIntlReady } from './helpers.js';
import { OPTION_TYPES, CLEAN_KEYS, PARTIAL_FOR, FIELDS_DEFAULTS } from './constants.js';
import { readLocal, writeLocal, clearLocal } from './state.js';
import {
    getPlaceholder,
    placePlaceholder,
    computeIndexByY,
    placePlaceholderAtIndex,
    removePlaceholder,
    computeDropTarget,
    move
} from './dnd.js';
import { API } from './api.js';

const SELECTORS = {
    preview: '#preview',
    quickAddButtons: '#quickAddButtons',
    presetButtons: '#presetButtons',
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
    formTitleDisplay: '#formTitleDisplay',
    btnSave: '#saveBtn'
};

export class Builder {
    constructor() {
        this.formId = null;
        this.fields = [];
        this.selectedId = null;
        this._bootstrapped = false;
        this.isDirty = false;
        this.$ = { preview: null };
        this.persist = debounce(this.persist.bind(this), 140);
        this.dnd = { draggingId: null, fromIndex: -1 };
        this.isNewForm = false; // Track if this is a new form (draft mode)
        this.isTemplate = false; // Track if this is template mode
    }

    bindDom() {
        const q = (sel) => document.querySelector(sel);
        this.$.preview = q(SELECTORS.preview);
        this.$.quickAddButtons = q(SELECTORS.quickAddButtons);
        this.$.presetButtons = q(SELECTORS.presetButtons);
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
        this.$.formTitleDisplay = q(SELECTORS.formTitleDisplay);
        this.$.btnSave = q(SELECTORS.btnSave);

    }

    buildCard(field, idx) {
        const card = document.createElement('div');
        // Use Vuexy card styling for preview items
        card.className = 'card mb-4 position-relative border-light';
        card.dataset.fid = field.id;
        card.dataset.index = String(idx);
        card.style.cursor = 'move';
        // Actions (duplicate / delete) in top-right
        const actions = document.createElement('div');
        actions.className = 'field-actions position-absolute top-0 end-0 mt-2 me-3 d-flex gap-1';
        const btnDup = document.createElement('button');
        btnDup.type = 'button';
        btnDup.className = 'btn btn-icon btn-text-secondary rounded-pill action-btn action-dup';
        btnDup.title = 'Duplicate';
        btnDup.innerHTML = '<i class="icon-base ti tabler-copy icon-20px"></i>';
        btnDup.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.duplicateField(field.id); });
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'btn btn-icon btn-text-danger rounded-pill action-btn action-del';
        btnDel.title = 'Delete';
        btnDel.innerHTML = '<i class="icon-base ti tabler-trash icon-20px"></i>';
        btnDel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.deleteField(field.id); });
        actions.appendChild(btnDup);
        actions.appendChild(btnDel);
        const body = document.createElement('div');
        body.className = 'card-body field-body';
        body.innerHTML = renderFieldHTML(field, idx, PARTIAL_FOR);
        // Provide realistic defaults so native segmented editors (yyyy, mm, dd, hh, mm)
        // behave like Vuexy examples when clicked in preview
        try { this._applyPreviewDefaults(body); } catch { }
        card.appendChild(actions);
        card.appendChild(body);
        // DnD handled by SortableJS on the container
        return card;
    }

    renderPreview() {
        const host = this.$.preview;
        if (!host) return;
        host.innerHTML = '';
        const frag = document.createDocumentFragment();
        this.fields.forEach((f, i) => {
            const card = this.buildCard(f, i);
            frag.appendChild(card);
        });
        host.appendChild(frag);
        try { whenIntlReady(() => this.initPhoneInputs()); } catch { }
        try {
            // Delay Quill initialization to ensure DOM is ready
            setTimeout(() => this.initRichTextEditors(), 100);
        } catch { }
    }

    appendOne(field, idx) {
        if (!this.$.preview) return;
        const card = this.buildCard(field, idx);
        this.$.preview.appendChild(card);
    }

    renderOne(fieldId) {
        const idx = this.fields.findIndex(f => f.id === fieldId);
        if (idx < 0) return;
        const card = this.$.preview?.querySelector(`[data-fid="${fieldId}"]`);
        if (!card) return;
        const body = card.querySelector('.field-body');
        if (body) {
            // Check if this is a rich text field to preserve Quill instance
            const field = this.fields[idx];
            const isRichText = field.type === 'richText';
            let existingQuill = null;
            let existingContent = '';

            if (isRichText) {
                // Preserve existing Quill instance and content
                const existingEditor = body.querySelector('.rich-text-editor');
                if (existingEditor && existingEditor._quill) {
                    existingQuill = existingEditor._quill;
                    existingContent = existingQuill.root.innerHTML;
                }
            }

            body.innerHTML = renderFieldHTML(this.fields[idx], idx, PARTIAL_FOR);
            try { this._applyPreviewDefaults(body); } catch { }

            if (isRichText && existingQuill && existingContent) {
                // Immediately restore the Quill content to prevent visual flash
                const newEditor = body.querySelector('.rich-text-editor .quill-editor');
                if (newEditor) {
                    newEditor.innerHTML = existingContent;
                }
            }
        }
        try { whenIntlReady(() => this.initPhoneInputsIn(card)); } catch { }
        try {
            // Delay Quill initialization to ensure DOM is ready
            setTimeout(() => this.initRichTextEditorsIn(card), 100);
        } catch { }
    }

    // Set sample values on date/time inputs in the preview so segment-click editing works
    _applyPreviewDefaults(root) {
        if (!root) return;
        const pad = (n) => String(n).padStart(2, '0');
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = pad(now.getMonth() + 1);
        const dd = pad(now.getDate());
        const HH = pad(now.getHours());
        const MI = pad(now.getMinutes());
        const SS = pad(now.getSeconds());

        const dateStr = `${yyyy}-${mm}-${dd}`;
        const timeStr = `${HH}:${MI}:${SS}`; // Vuexy demo shows seconds
        const dtStr = `${yyyy}-${mm}-${dd}T${HH}:${MI}`;

        const setIfEmpty = (sel, val) => {
            const el = root.querySelector(sel);
            if (el && !el.value) el.value = val;
        };

        setIfEmpty('input[type="date"]', dateStr);
        setIfEmpty('input[type="time"]', timeStr);
        setIfEmpty('input[type="datetime-local"]', dtStr);
    }

    deleteSelected() {
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
            this.clearFieldEditForm();
            showTab(this.$.tabAddBtn);
        }
    }

    deleteField(id) {
        const idx = this.fields.findIndex(f => f.id === id);
        if (idx < 0) return;
        const isSelected = this.selectedId === id;
        this.fields.splice(idx, 1);
        this.persist();
        this.setDirty();
        this.renderPreview();
        if (this.fields.length > 0) {
            const next = this.fields[Math.min(idx, this.fields.length - 1)];
            if (next) this.select(next.id);
        } else {
            this.selectedId = null;
            if (isSelected) {
                this.clearFieldEditForm();
                showTab(this.$.tabAddBtn);
            }
        }
    }

    duplicateField(id) {
        const idx = this.fields.findIndex(f => f.id === id);
        if (idx < 0) return;
        const orig = this.fields[idx];
        const copy = { ...orig };
        copy.id = uuid();
        // Create a unique internal name by appending an incrementing number
        const raw = String(orig.name || '').trim();
        if (raw) {
            const baseSafe = toSafeSnake(raw);
            const m = baseSafe.match(/^(.*?)(\d+)$/);
            const stem = m ? m[1] : baseSafe;
            let i = m ? (parseInt(m[2], 10) || 0) + 1 : 1;
            const names = new Set(this.fields.map(f => f.name));
            let candidate = `${stem}${i}`;
            while (names.has(candidate)) { i++; candidate = `${stem}${i}`; }
            copy.name = candidate;
        } else {
            copy.name = '';
        }
        // Keep label unchanged
        copy.label = (orig.label || '');
        // Insert after original
        this.fields.splice(idx + 1, 0, copy);
        this.persist();
        this.setDirty();
        this.renderPreview();
        this.select(copy.id);
    }

    restore() {
        // For existing forms/templates, always try to load from preloaded data first
        // For new forms, load from localStorage for draft functionality
        let data = null;

        if (this.isNewForm) {
            // For new forms, try form-specific key first, then general key
            data = readLocal(this.formId);
            if (!data) {
                data = readLocal(null); // This will use the general key 'eform-maker-hbs'
            }
        } else {
            // For existing forms/templates, always use preloaded data from general key
            data = readLocal(null); // This will use the general key 'eform-maker-hbs'
            // If no preload data found for existing form/template, wait a bit and try again
            if (!data) {
                setTimeout(() => {
                    const retryData = readLocal(null);
                    if (retryData) {
                        this.loadFormData(retryData);
                    }
                }, 200);
                return;
            }
        }

        if (!data) {
            return;
        }

        this.loadFormData(data);
    }

    loadFormData(data) {
        if (data.id) this.formId = data.id;

        // Handle both form and template data structures
        const title = data.title || data.name || '';
        if (title) {
            if (this.$.formTitle) this.$.formTitle.value = title;
            if (this.$.formTitleDisplay) this.$.formTitleDisplay.textContent = title;
            // Update page title for templates
            if (this.isTemplate) {
                document.title = `Editing Template: ${title}`;
            }
        }
        if (Array.isArray(data.fields)) {
            const existingNames = new Set();
            const uniqueName = (raw) => generateUniqueFieldName(raw, existingNames);
            this.fields = data.fields.map((f, idx) => {
                const type = f?.type;
                const id = (f && f.id && String(f.id).trim()) ? String(f.id) : uuid();
                const label = String(f?.label || '');
                const nameIn = String(f?.name || '').trim();
                const name = nameIn ? (existingNames.has(nameIn) ? uniqueName(nameIn) : (existingNames.add(nameIn), nameIn))
                    : uniqueName(label || type || 'field');
                const placeholder = (f?.placeholder != null)
                    ? String(f.placeholder)
                    : (typeof FIELDS_DEFAULTS.placeholder === 'function' ? FIELDS_DEFAULTS.placeholder(type) : '');
                const options = (f?.options != null) ? String(f.options) : (typeof FIELDS_DEFAULTS.options === 'function' ? FIELDS_DEFAULTS.options(type) : '');
                return {
                    id,
                    type,
                    label,
                    name,
                    placeholder,
                    required: !!f?.required,
                    doNotStore: !!f?.doNotStore,
                    options
                };
            });
        }
        if (data.title && this.$.formTitle) {
            this.$.formTitle.value = data.title;
            if (this.$.formTitleDisplay) this.$.formTitleDisplay.textContent = data.title;
        }

        // Re-render the preview with the loaded data
        this.renderPreview();
    }

    persist() {
        // Only persist to localStorage for new forms (draft mode) or when explicitly saving
        // This prevents unwanted auto-save behavior for existing forms
        if (this.isNewForm || !this.formId) {
            const title = this.$.formTitle?.value || '';
            writeLocal({ id: this.formId || null, title, fields: this.fields }, this.formId);
        }
    }

    setDirty() { if (this._bootstrapped) this.isDirty = true; }
    clearDirty() { this.isDirty = false; }

    clearFieldEditForm() {
        if (this.$.editLabel) this.$.editLabel.value = '';
        if (this.$.editPlaceholder) this.$.editPlaceholder.value = '';
        if (this.$.editName) this.$.editName.value = '';
        if (this.$.editOptions) this.$.editOptions.value = '';
        if (this.$.editRequired) this.$.editRequired.checked = false;
        if (this.$.editDoNotStore) this.$.editDoNotStore.checked = false;
    }
    installUnloadGuard() {
        window.addEventListener('beforeunload', (e) => {
            if (!this.isDirty) return;
            e.preventDefault(); e.returnValue = '';
        });
    }

    addField(type) {
        const label = typeof FIELDS_DEFAULTS.label === 'function' ? FIELDS_DEFAULTS.label(type) : (type || '');
        // Generate a unique internal name based on label/type
        const baseRaw = label || type || 'field';
        const base = toSafeSnake(baseRaw);
        const existing = this.fields.map(f => f.name);
        const name = generateUniqueFieldName(base, existing);
        const field = {
            id: uuid(),
            type,
            label,
            options: typeof FIELDS_DEFAULTS.options === 'function' ? FIELDS_DEFAULTS.options(type) : '',
            value: '',
            placeholder: typeof FIELDS_DEFAULTS.placeholder === 'function' ? FIELDS_DEFAULTS.placeholder(type) : '',
            name,
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

    addPresetField(type, preset = {}) {
        const label = (preset.label && String(preset.label).trim()) || (typeof FIELDS_DEFAULTS.label === 'function' ? FIELDS_DEFAULTS.label(type) : (type || ''));
        const baseRaw = label || type || 'field';
        const base = toSafeSnake(baseRaw);
        const existing = this.fields.map(f => f.name);
        const name = generateUniqueFieldName(base, existing);
        const options = preset.options != null ? String(preset.options) : (typeof FIELDS_DEFAULTS.options === 'function' ? FIELDS_DEFAULTS.options(type) : '');
        const field = {
            id: uuid(),
            type,
            label,
            options,
            value: '',
            placeholder: preset.placeholder != null ? String(preset.placeholder) : (typeof FIELDS_DEFAULTS.placeholder === 'function' ? FIELDS_DEFAULTS.placeholder(type) : ''),
            name,
            required: !!preset.required,
            doNotStore: false,
            autoName: true
        };
        this.fields.push(field);
        this.persist();
        this.setDirty();
        this.renderPreview();
        this.select(field.id);
    }

    select(id) {
        this.selectedId = id;
        this.highlight(id);
        // minimal edit panel sync
        const f = this.fields.find(x => x.id === id);
        if (!f) return;

        // Update the edit title to show field type
        if (this.$.editTitle) {
            const fieldTypeName = f.type;
            this.$.editTitle.textContent = `Editing ${fieldTypeName} Field`;
        }

        if (this.$.editLabel) this.$.editLabel.value = f.label || '';
        if (this.$.editPlaceholder) this.$.editPlaceholder.value = f.placeholder || '';
        if (this.$.editName) this.$.editName.value = f.name || '';
        if (this.$.editOptions) this.$.editOptions.value = needsOptions(f.type) ? (f.options || '') : '';
        if (this.$.editOptionsRow) this.$.editOptionsRow.style.display = needsOptions(f.type) ? '' : 'none';
        if (this.$.editRequired) this.$.editRequired.checked = !!f.required;
        if (this.$.editDoNotStore) this.$.editDoNotStore.checked = !!f.doNotStore;
        showTab(this.$.tabEditBtn);
    }

    highlight(id) {
        this.$.preview?.querySelectorAll('[data-fid]')?.forEach(el => {
            if (el.dataset.fid === id) el.classList.add('border-primary', 'shadow-sm'), el.classList.remove('border-light');
            else el.classList.add('border-light'), el.classList.remove('border-primary', 'shadow-sm');
        });
    }

    attachCardDnD(card) {
        card.addEventListener('dragstart', (e) => this.onDragStart(e, card));
        card.addEventListener('dragover', (e) => this.onDragOver(e, card));
        card.addEventListener('dragleave', (e) => this.onDragLeave(e, card));
        card.addEventListener('drop', (e) => this.onDrop(e, card));
        card.addEventListener('dragend', () => this.onDragEnd());
    }

    onDragStart(e, el) {
        this.dnd.draggingId = el.dataset.fid;
        this.dnd.fromIndex = Number(el.dataset.index);
        el.classList.add('opacity-50');
        try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.dnd.draggingId);
        } catch (_) { }
    }

    onDragOver(e, el) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        placePlaceholder(el, before);
    }

    onDragLeave(_e, _el) { /* no-op */ }

    onDrop(e, el) {
        e.preventDefault();
        const from = this.dnd.fromIndex;
        if (from < 0) { removePlaceholder(); return; }
        const preview = this.$.preview;
        const ph = getPlaceholder();
        const hasPh = !!(ph && ph.parentNode === preview);
        let to = from, isNoop = true;
        if (hasPh) {
            ({ to, isNoop } = computeDropTarget(preview, from));
        } else {
            // Fast drop before any dragover: compute by pointer Y relative to element or container
            const kids = Array.from(preview.children).filter(k => k !== ph);
            const idxEl = kids.indexOf(el);
            let rawTo;
            if (idxEl >= 0) {
                const rect = el.getBoundingClientRect();
                const before = (e.clientY - rect.top) < rect.height / 2;
                rawTo = before ? idxEl : idxEl + 1;
            } else {
                rawTo = computeIndexByY(preview, e.clientY);
            }
            to = from < rawTo ? rawTo - 1 : rawTo;
            isNoop = (to === from);
        }
        if (Number.isInteger(to) && to >= 0 && !isNoop && from !== to) {
            this.fields = move(this.fields, from, to);
            this.persist();
            this.setDirty();
            this.renderPreview();
            if (this.dnd.draggingId) {
                this.select(this.dnd.draggingId);
                const el2 = this.$.preview?.querySelector(`[data-fid="${this.dnd.draggingId}"]`);
                flash(el2);
            }
            if (this.$.btnSave) {
                this.$.btnSave.disabled = false;
                this.$.btnSave.textContent = 'Save';
            }
        }
        removePlaceholder();
    }

    onDragEnd() {
        this.$.preview?.querySelectorAll('[data-index]')?.forEach(el => el.classList.remove('opacity-50'));
        removePlaceholder();
        this.dnd.draggingId = null;
        this.dnd.fromIndex = -1;
    }

    onContainerDragOver(e) {
        e.preventDefault();
        if (!this.$.preview) return;
        const idx = computeIndexByY(this.$.preview, e.clientY);
        if (idx !== null && idx !== undefined) {
            placePlaceholderAtIndex(this.$.preview, idx);
        }
    }

    onContainerDrop(e) {
        e.preventDefault();
        const from = this.dnd.fromIndex;
        if (from < 0) { removePlaceholder(); return; }
        const preview = this.$.preview;
        const ph = getPlaceholder();
        const hasPh = !!(ph && ph.parentNode === preview);
        let to = from, isNoop = true;
        if (hasPh) {
            ({ to, isNoop } = computeDropTarget(preview, from));
        } else {
            let rawTo = computeIndexByY(preview, e.clientY);
            to = from < rawTo ? rawTo - 1 : rawTo;
            isNoop = (to === from);
        }
        if (Number.isInteger(to) && to >= 0 && !isNoop && from !== to) {
            this.fields = move(this.fields, from, to);
            this.persist();
            this.setDirty();
            this.renderPreview();
            if (this.dnd.draggingId) {
                this.select(this.dnd.draggingId);
                const el2 = this.$.preview?.querySelector(`[data-fid="${this.dnd.draggingId}"]`);
                flash(el2);
            }
            if (this.$.btnSave) {
                this.$.btnSave.disabled = false;
                this.$.btnSave.textContent = 'Save';
            }
        }
        removePlaceholder();
    }

    bindEvents() {
        // Quick Add
        this.$.quickAddButtons?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-type]');
            if (!btn) return;
            const type = btn.getAttribute('data-type');
            if (!type) return;
            const label = btn.getAttribute('data-label');
            const options = btn.getAttribute('data-options');
            const placeholder = btn.getAttribute('data-placeholder');
            const required = btn.getAttribute('data-required');
            if (label || options || placeholder || required) {
                this.addPresetField(type, { label, options, placeholder, required: required === 'true' });
            } else {
                this.addField(type);
            }
        });

        // Presets
        this.$.presetButtons?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-type]');
            if (!btn) return;
            const type = btn.getAttribute('data-type');
            if (!type) return;
            const label = btn.getAttribute('data-label');
            const options = btn.getAttribute('data-options');
            const placeholder = btn.getAttribute('data-placeholder');
            const required = btn.getAttribute('data-required');
            this.addPresetField(type, { label, options, placeholder, required: required === 'true' });
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
            if (f.autoName) { f.name = toSafeSnake(f.label); if (this.$.editName) this.$.editName.value = f.name; }
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
            if (needsOptions(f.type)) {
                f.options = this.$.editOptions.value || '';
            }
            this.persist();
            relayout();
        });
        [this.$.editRequired, this.$.editDoNotStore].forEach(el => el?.addEventListener('input', () => {
            const f = this.fields.find(x => x.id === this.selectedId);
            if (!f) return;
            if (el === this.$.editRequired) f.required = !!this.$.editRequired.checked;
            if (el === this.$.editDoNotStore) f.doNotStore = !!this.$.editDoNotStore.checked;
            this.persist();
            this.setDirty();
            relayout();
        }));
        // Title input: persist and live-uniqueness check (debounced)
        this.$.formTitle?.addEventListener('input', () => {
            if (this.$.formTitleDisplay) this.$.formTitleDisplay.textContent = this.$.formTitle.value;
            this.persist();
            this.checkTitleUnique?.();
        });

        // Make form title display clickable to edit
        this.$.formTitleDisplay?.addEventListener('click', (e) => {
            if (this.$.formTitle) {
                this.$.formTitle.style.display = 'block';
                this.$.formTitleDisplay.style.display = 'none';
                this.$.formTitle.focus();
                this.$.formTitle.select();
            }
        });

        // Handle Enter key to finish editing
        this.$.formTitle?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.$.formTitle.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                // Restore original value if user presses Escape
                if (this.$.formTitleDisplay) {
                    this.$.formTitle.value = this.$.formTitleDisplay.textContent;
                }
                this.$.formTitle.blur();
            }
        });

        // Hide input when focus is lost
        this.$.formTitle?.addEventListener('blur', () => {
            if (this.$.formTitle && this.$.formTitleDisplay) {
                this.$.formTitle.style.display = 'none';
                this.$.formTitleDisplay.style.display = 'block';
            }
        });

        // Save to DB
        this.$.btnSave?.addEventListener('click', (e) => this.handleSaveToDB(e));
        this.$.btnEditCancel?.addEventListener('click', (e) => { e.preventDefault?.(); this.deleteSelected(); });
    }

    async init() {
        // Preload templates; then bind and do a minimal render
        try { await preloadTemplates(PARTIAL_FOR); } catch (e) { /* preloadTemplates failed - handled silently */ }
        this.bindDom();
        // capture deep-link id (/builder/:id or /builder/template/:id) if present
        try {
            const templateMatch = location.pathname.match(/\/builder\/template\/([^/]+)/);
            const formMatch = location.pathname.match(/\/builder\/([^/]+)/);

            if (templateMatch && templateMatch[1]) {
                this.formId = templateMatch[1];
                this.isTemplate = true;
                this.isNewForm = false; // Editing existing template
            } else if (formMatch && formMatch[1]) {
                this.formId = formMatch[1];
                this.isTemplate = false;
                this.isNewForm = false; // Editing existing form
            } else {
                this.isTemplate = false;
                this.isNewForm = true; // Creating new form
            }
        } catch {
            this.isTemplate = false;
            this.isNewForm = true; // Default to new form if path parsing fails
        }
        this.restore();
        this.renderPreview();
        this.bindEvents();
        this.initSortable?.();
        // init phone inputs after initial render
        try { whenIntlReady(() => this.initPhoneInputs()); } catch { }
        this.installUnloadGuard();
        if (this.fields.length) {
            this.select(this.fields[this.fields.length - 1].id);
        } else {
            showTab(this.$.tabAddBtn);
        }
        this._bootstrapped = true;
        return this;
    }

    getTab(btn) {
        const Tab = window.bootstrap?.Tab || (window.bootstrap && window.bootstrap.Tab);
        return Tab ? Tab.getOrCreateInstance(btn) : null;
    }

    showTab(btn) {
        if (!btn) return;
        const inst = this.getTab(btn);
        inst ? inst.show() : btn.click?.();
    }

    // ---- Save & validation ----
    hasValidOptions(field) {
        if (!needsOptions(field.type)) return true;
        const opts = parseOptions(field.options);
        return opts.length > 0;
    }

    cleanField(f) {
        const out = {};
        for (const k of CLEAN_KEYS) if (f[k] !== undefined) out[k] = f[k];
        if (OPTION_TYPES.has(out.type) || needsOptions(out.type)) {
            if (Array.isArray(out.options)) out.options = out.options.join(', ');
            out.options = String(out.options || '').trim();
        } else {
            delete out.options;
        }
        return out;
    }

    setTitleValidity(ok, speak = false) {
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
                const { body } = await API.checkTitleUnique(title, this.formId);
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

    async handleSaveToDB(e) {
        e?.preventDefault?.();
        const title = (this.$.formTitle?.value || '').trim();
        if (!title) {
            const entityType = this.isTemplate ? 'template' : 'form';
            alert(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} must have a title before saving.`);
            this.$.formTitle?.focus();
            return;
        }

        // Soft uniqueness check (both create and update)
        try {
            const checkMethod = this.isTemplate ? API.checkTemplateNameUnique : API.checkTitleUnique;
            const { body } = await checkMethod(title, this.formId || undefined);
            if (!body?.unique) {
                // Mark invalid and stop
                this.$.formTitle?.reportValidity?.();
                this.$.formTitle?.focus();
                return;
            }
        } catch (error) {
            // Title uniqueness check failed - handled silently
            // Continue with save attempt - server will handle validation
        }

        // Field validation
        for (const f of this.fields) {
            if (!String(f.label || '').trim()) { alert('Each field must have a Display Label.'); this.select(f.id); return; }
            if (!String(f.name || '').trim()) { alert('Each field must have an Internal Field Name.'); this.select(f.id); return; }
            if (!this.hasValidOptions(f)) { alert('This field needs options (comma-separated).'); this.select(f.id); return; }
        }

        // Uniqueness of field names within this form
        {
            const seen = new Set();
            for (const f of this.fields) {
                const key = String(f.name || '');
                if (seen.has(key)) {
                    alert(`Field names must be unique. Duplicate: "${key}"`);
                    this.select(f.id);
                    return;
                }
                seen.add(key);
            }
        }

        const payload = {
            id: this.formId || undefined,
            ...(this.isTemplate ? { name: title } : { title: title }), // Templates use 'name', forms use 'title'
            fields: this.fields.map(f => this.cleanField(f))
        };

        // Save operation in progress

        if (this.$.btnSave) {
            this.$.btnSave.disabled = true;
            this.$.btnSave.textContent = this.isTemplate ? 'Saving Template…' : 'Saving…';
        }
        try {
            const saveMethod = this.isTemplate ? API.saveTemplate : API.saveForm;
            const { res, body } = await saveMethod(payload);
            if (!res?.ok) {
                let msg = (body && body.error) ? body.error : `Failed to save ${this.isTemplate ? 'template' : 'form'}.`;

                // Show detailed validation errors if available
                if (body && body.details && Array.isArray(body.details)) {
                    msg += '\n\nValidation errors:\n' + body.details.join('\n');
                } else if (body && body.details && typeof body.details === 'object') {
                    msg += '\n\nValidation errors:\n' + Object.entries(body.details).map(([key, value]) => `${key}: ${value}`).join('\n');
                }

                // Save failed - error details handled by UI
                alert(msg);
                return;
            }
            const newId = body?.template?.id || body?.form?.id || body?.id || null;
            if (newId) {
                const wasNewForm = this.isNewForm; // Store the original state
                this.formId = newId;
                this.isNewForm = false; // Form is now saved, no longer a draft
                // For new forms, clear localStorage since they're now saved to database
                // For existing forms, don't clear preload data as it's needed for proper loading
                if (wasNewForm) {
                    clearLocal(this.formId);
                    clearLocal(null); // Clear the general preload key
                }
            }
            // Mark the builder as clean after a successful save so navigation doesn't warn
            this.clearDirty();
            if (this.$.btnSave) {
                this.$.btnSave.textContent = this.isTemplate ? 'Template Saved' : 'Saved';
                setTimeout(() => {
                    this.$.btnSave.textContent = 'Save';
                    // For templates, redirect to templates page after successful save
                    if (this.isTemplate) {
                        setTimeout(() => {
                            window.location.href = '/templates';
                        }, 1000);
                    }
                }, 900);
            }
        } catch (err) {
            // Save operation failed - error handled by UI
            alert(`Failed to save ${this.isTemplate ? 'template' : 'form'}. See console for details.`);
        } finally {
            if (this.$.btnSave) {
                this.$.btnSave.disabled = false;
                this.$.btnSave.textContent = 'Save';
            }
        }
    }

    // ---- Phone inputs (intl-tel-input) ----
    initPhoneInputsIn(rootEl) {
        if (!window.intlTelInput || !rootEl) return;
        const nodes = rootEl.querySelectorAll?.('.js-intl-tel, input[type="tel"]') || [];
        nodes.forEach(input => this._initOnePhone(input));
    }

    initPhoneInputs() {
        if (!window.intlTelInput) return;
        const nodes = this.$.preview?.querySelectorAll('.js-intl-tel, input[type="tel"]') || [];
        nodes.forEach(input => this._initOnePhone(input));
    }

    _initOnePhone(input) {
        const existing = window.intlTelInputGlobals?.getInstance?.(input);
        if (existing) existing.destroy();

        const card = input.closest('[data-fid]');
        const field = this.fields.find(f => f.id === card?.dataset?.fid);

        const iti = window.intlTelInput(input, {
            initialCountry: 'id',
            preferredCountries: ['id', 'us'],
            utilsScript: window.INTL_UTILS_URL || "https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js"
        });

        const wrap = input.closest('.iti') || input.parentElement;
        if (wrap) {
            wrap.style.width = '100%';
            wrap.style.setProperty('--iti-path', '/vendor/intl-tel-input/build/img/');
        }

        input.addEventListener('countrychange', () => {
            // Country selection handling removed - countryIso2 field no longer used
        });
    }

    // ---- Rich Text Editors (Quill) ----
    initRichTextEditorsIn(rootEl) {
        if (!window.Quill) {
            // Rich text: Quill not available globally
            return;
        }
        if (!rootEl) {
            // Rich text: No root element provided
            return;
        }
        const nodes = rootEl.querySelectorAll?.('.rich-text-editor') || [];
        // Rich text: Found ${nodes.length} rich text editors in root element
        nodes.forEach((editor, index) => {
            // Rich text: Initializing editor ${index + 1}
            this._initOneRichText(editor);
        });
    }

    initRichTextEditors() {
        if (!window.Quill) {
            // Rich text: Quill not available globally in initRichTextEditors
            return;
        }
        const nodes = this.$.preview?.querySelectorAll('.rich-text-editor') || [];
        // Rich text: Found ${nodes.length} rich text editors in preview
        nodes.forEach((editor, index) => {
            // Rich text: Initializing editor ${index + 1} in preview
            this._initOneRichText(editor);
        });
    }

    _initOneRichText(editorEl) {
        const card = editorEl.closest('[data-fid]');
        const field = this.fields.find(f => f.id === card?.dataset?.fid);
        if (!field) {
            // Rich text: No field found for editor
            return;
        }

        // Destroy existing Quill instance if any
        const existingQuill = editorEl._quill;
        if (existingQuill) {
            existingQuill.destroy();
            delete editorEl._quill;
        }

        const editorContainer = editorEl.querySelector('.quill-editor');
        const toolbar = editorEl.querySelector('.quill-toolbar');
        const hiddenTextarea = editorEl.querySelector('textarea[name]');

        const textareaByName = editorEl.querySelector(`textarea[name="${field.name}"]`);
        const anyTextarea = editorEl.querySelector('textarea');

        if (!editorContainer) return;

        const finalTextarea = hiddenTextarea || textareaByName || anyTextarea;
        if (!finalTextarea) return;

        if (!window.Quill) return;

        try {
            // Create Quill instance
            const quill = new window.Quill(editorContainer, {
                theme: 'snow',
                modules: {
                    toolbar: toolbar
                },
                placeholder: field.placeholder || 'Type something...'
            });

            // Store reference
            editorEl._quill = quill;

            // Sync with hidden textarea for form submission
            quill.on('text-change', () => {
                const content = quill.root.innerHTML;
                finalTextarea.value = content;

                // Update field data
                if (field) {
                    field.value = content;
                    this.persist();
                }
            });

            // Set initial content if field has value
            if (field.value) {
                quill.root.innerHTML = field.value;
                finalTextarea.value = field.value;
            }

            // Rich text editor initialized successfully
        } catch (error) {
            // Rich text initialization error - handled silently
        }
    }

    initSortable() {
        if (this._sortableReady) return;
        const host = this.$.preview;
        if (!host || typeof window.Sortable === 'undefined') return;
        try {
            // eslint-disable-next-line no-new
            new window.Sortable(host, {
                animation: 150,
                draggable: '[data-fid]',
                // Allow interacting with form controls inside cards without blocking focus/click
                filter: 'input,textarea,select,button,label,a',
                preventOnFilter: false,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'dragging',
                fallbackOnBody: true,
                swapThreshold: 0.5,
                onStart: (evt) => {
                    const el = evt.item;
                    this.dnd.draggingId = el?.dataset?.fid || null;
                    this.dnd.fromIndex = (evt.oldIndex != null ? evt.oldIndex : -1);
                },
                onEnd: (evt) => {
                    const from = (evt.oldIndex != null ? evt.oldIndex : -1);
                    const to = (evt.newIndex != null ? evt.newIndex : -1);
                    this.dnd.draggingId = null;
                    this.dnd.fromIndex = -1;
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
                        const el = this.$.preview?.querySelector(`[data-fid="${id}"]`);
                        flash(el);
                    }
                    if (this.$.btnSave) {
                        this.$.btnSave.disabled = false;
                        this.$.btnSave.textContent = 'Save';
                    }
                }
            });
            this._sortableReady = true;
        } catch (e) {
            // Sortable init failed - handled silently
        }
    }
}

export async function startBuilder() {
    try {
        const b = new Builder();
        await b.init();
        return b;
    } catch (error) {
        // Log error for debugging
        console.error('Failed to start Builder:', error);

        // Show user-friendly error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 15px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            max-width: 400px;
        `;
        errorDiv.innerHTML = `
            <strong>Builder Error</strong><br>
            Failed to initialize the form builder. Please refresh the page and try again.
            <button onclick="this.parentElement.remove()" style="
                background: none;
                border: none;
                color: white;
                float: right;
                font-size: 18px;
                cursor: pointer;
                margin-left: 10px;
            ">×</button>
        `;
        document.body.appendChild(errorDiv);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 10000);

        throw error; // Re-throw for caller handling
    }
}
