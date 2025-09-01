// app.js (ESM)
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { engine } from 'express-handlebars';
import { sequelize } from './db.js';
import { Op, fn, col } from 'sequelize';
import { Form } from './models/Form.js';
import { FormSubmission } from './models/FormSubmission.js';
import { FormField } from './models/FormField.js';
import crypto from 'crypto';

// Node 18+ has global fetch; for Node 16 uncomment the next line:
// import fetch from 'node-fetch';

// ---------------------------------------------------------------------
// Paths / __dirname
// ---------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const VIEWS_DIR = path.join(ROOT, 'views');
const LAYOUTS_DIR = path.join(VIEWS_DIR, 'layouts');
const PARTIALS_DIR = path.join(VIEWS_DIR, 'partials');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Ensure SQLite 'data' dir exists if your db.js stores there (harmless otherwise)
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------
// App
// ---------------------------------------------------------------------
const app = express();

// Static assets (/assets, /css, /js, etc. under /public)
app.use(express.static(PUBLIC_DIR));

// Expose field partials for the builder to fetch (e.g. /tpl/fields/phone.hbs)
app.use('/tpl', express.static(path.join(VIEWS_DIR, 'partials')));

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------
// Handlebars
// ---------------------------------------------------------------------
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: LAYOUTS_DIR,
  partialsDir: PARTIALS_DIR,
  helpers: {
    section(name, options) {
      const root = options.data.root;
      root._sections ??= {};
      root._sections[name] = options.fn(this);
      return null;
    },
    isActive(pathname, current) {
      return pathname === current ? 'active' : '';
    }
  }
}));
app.set('view engine', 'hbs');
app.set('views', VIEWS_DIR);

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------
const prefixFromTitle = (title) =>
  (title || 'FORM').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

const safeKey = (k) => String(k || '').replace(/[^a-zA-Z0-9_]/g, '_');

// Map builder field.type -> partial path (under views/partials/fields)
const PARTIAL_FOR = {
  singleLine: 'fields/text',
  paragraph: 'fields/textarea',
  dropdown: 'fields/select',
  multipleChoice: 'fields/radios',
  checkboxes: 'fields/checkboxes',
  number: 'fields/number',
  name: 'fields/name',
  email: 'fields/email',
  phone: 'fields/phone'
};

// Convert a raw field into the VM expected by partials/hosted-form
const toVM = (f, idx, formTitle = '') => {
  const vm = {
    name: f.name || f.id || `f_${idx}`,
    label: f.label || '',
    required: !!f.required,
    placeholder: f.placeholder || '',
    options: String(f.options || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  };
  return vm;
};

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(date));
}

// ---------------------- Validation helpers (server-side) ----------------------
const NEEDS_OPTS = new Set(['dropdown', 'multipleChoice', 'checkboxes']);
const parseOpts = (s = '') => String(s).split(',').map(x => x.trim()).filter(Boolean);
const isNonEmpty = (v) => !!String(v || '').trim();

function isValidField(f) {
  if (!f) return false;
  if (!isNonEmpty(f.label)) return false;
  if (!isNonEmpty(f.name)) return false;
  if (NEEDS_OPTS.has(f.type)) {
    const hasOptions = parseOpts(f.options).length > 0;
    if (!hasOptions) return false;
  }
  return true;
}

function sanitizeFields(fields = []) {
  return fields.map(f => {
    const cleaned = { ...f };
    // Normalize options for option-based fields
    if (NEEDS_OPTS.has(cleaned.type)) {
      if (Array.isArray(cleaned.options)) {
        cleaned.options = cleaned.options.map(x => String(x).trim()).filter(Boolean).join(', ');
      } else {
        cleaned.options = parseOpts(cleaned.options).join(', ');
      }
    } else {
      delete cleaned.options;
    }
    // Drop any builder-only flags if present
    delete cleaned.autoName;
    delete cleaned.autoSuffix;
    return cleaned;
  });
}

const rid = () => crypto.randomBytes(9).toString('base64url');

// Trim + normalize, but don't collapse spaces
const normalizeTitle = (t) => String(t || '').normalize('NFKC').trim();

/** true if some OTHER row already has this title (case-insensitive) */
async function isTitleTaken(title, excludeId = null) {
  const tnorm = normalizeTitle(title);
  let sql = `SELECT id FROM forms WHERE title = ? COLLATE NOCASE LIMIT 1`;
  let repl = [tnorm];

  if (excludeId) {
    sql = `SELECT id FROM forms WHERE title = ? COLLATE NOCASE AND id <> ? LIMIT 1`;
    repl = [tnorm, String(excludeId)];
  }

  const [rows] = await sequelize.query(sql, { replacements: repl });
  return Array.isArray(rows) && rows.length > 0;
}

// Lowercased, URL-safe slug from title
const formIdFromTitle = (title) => {
  const base = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'form';
};

// Short base62 random suffix (8–10 chars)
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shortRand = (n = 8) =>
  Array.from(crypto.randomBytes(n)).map(b => B62[b % 62]).join('');

// Compose a readable id: "<slug>-<suffix>"
const makeReadableId = (title, maxLen = 64) => {
  const slug = formIdFromTitle(title);
  return `${slug}-${shortRand(8)}`.slice(0, maxLen);
};

// ---------------------------------------------------------------------
// Routes (Builder UI)
// ---------------------------------------------------------------------
app.get('/', (_req, res) => res.redirect('/forms'));

// Forms dashboard
app.get('/forms', async (_req, res) => {
  try {
    const rows = await Form.findAll({ order: [['updatedAt', 'DESC']] });
    const forms = rows.map(r => ({
      id: r.id,
      title: r.title || '(Untitled)',
      createdAt: formatDate(r.createdAt),
      updatedAt: formatDate(r.updatedAt)
    }));
    res.render('forms', {
      title: 'Forms',
      currentPath: '/forms',
      forms
    });
  } catch (err) {
    console.error('List page error:', err);
    res.status(500).send('Server error');
  }
});

// Builder deep-link (preloads a form, then opens the builder page)
app.get('/builder/:id', async (req, res) => {
  try {
    // app.get('/builder/:id', …)
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).send('Form not found');

    // ✅ make it plain
    const formPlain = form.get({ plain: true });
    const fields = (formPlain.fields || [])
      .sort((a,b)=>a.position-b.position)
      .map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options, countryIso2: f.countryIso2
      }));

    const preload = JSON.stringify({ title: formPlain.title || '', fields });

    res.render('builder', {
      title: `Editing: ${formPlain.title || '(Untitled)'}`,
      currentPath: '/builder',
      form: formPlain,              // <- pass plain object
      preloadJson: preload
    });

  } catch (err) {
    console.error('Open builder error:', err);
    res.status(500).send('Server error');
  }
});

// ---------------------------------------------------------------------
// Forms API (CRUD)
// ---------------------------------------------------------------------


  // Create or update
  app.post('/api/forms', async (req, res) => {
  const { id, title = '', fields = [] } = req.body || {};

  if (!title.trim()) return res.status(400).json({ error: 'Form title is required.' });
  if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });

  const clean = sanitizeFields(fields);
  for (const f of clean) {
    if (!isValidField(f)) {
      return res.status(400).json({
        error: 'Invalid field definition: label and name are required; option-based fields need options.'
      });
    }
  }

  // Keep your case-insensitive unique title rule
  if (await isTitleTaken(title, id ? String(id) : null)) {
    return res.status(409).json({ error: 'Form title already exists. Choose another.' });
  }


  try {
    await sequelize.transaction(async (t) => {
      let form;

      if (!id) {
        // ---------- CREATE: generate readable PK (slug + random) ----------
        let newId;
        for (let tries = 0; tries < 5; tries++) {
          const candidate = makeReadableId(title);
          const hit = await Form.findByPk(candidate, { transaction: t });
          if (!hit) { newId = candidate; break; }
        }
        if (!newId) throw new Error('Could not generate unique form id');

        form = await Form.create({ id: newId, title }, { transaction: t });
      } else {
        // ---------- UPDATE: keep PK stable, only change title ----------
        form = await Form.findByPk(id, { transaction: t });
        if (!form) return res.status(404).json({ error: 'Not found' });

        form.title = title;
        await form.save({ transaction: t });

        // Replace fields under the same formId
        await FormField.destroy({ where: { formId: form.id }, transaction: t });
      }

      // Insert fresh fields
      const rows = clean.map((f, idx) => ({
        id: f.id && String(f.id).trim() ? f.id : crypto.randomBytes(9).toString('base64url'),
        formId: form.id,
        type: f.type,
        label: f.label,
        name: f.name,
        placeholder: f.placeholder || '',
        required: !!f.required,
        doNotStore: !!f.doNotStore,
        countryIso2: f.countryIso2 || '',
        options: f.options || '',
        position: idx
      }));

      await FormField.bulkCreate(rows, { transaction: t });

      res.json({ ok: true, form: { id: form.id, title: form.title, fields: rows } });
    });
  } catch (err) {
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Uniqueness constraint failed.' });
    }
    console.error('Create/update form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});



// List
app.get('/api/forms', async (_req, res) => {
  try {
    const rows = await Form.findAll({ order: [['updatedAt', 'DESC']], include: [{ model: FormField, as: 'fields' }] });
    const forms = rows.map(r => ({
      id: r.id,
      title: r.title,
      fields: (r.fields || []).sort((a,b)=>a.position-b.position).map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options, countryIso2: f.countryIso2
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
    res.json({ ok: true, forms });
  } catch (err) {
    console.error('List forms error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Read one
app.get('/api/forms/:id', async (req, res) => {
  try {
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).json({ error: 'Not found' });
    const fields = (form.fields || []).sort((a,b)=>a.position-b.position).map(f => ({
      id: f.id, type: f.type, label: f.label, name: f.name,
      placeholder: f.placeholder,
      required: f.required, doNotStore: f.doNotStore,
      options: f.options, countryIso2: f.countryIso2
    }));
    res.json({ ok: true, form: { id: form.id, title: form.title, fields } });
  } catch (err) {
    console.error('Read form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update
app.put('/api/forms/:id', async (req, res) => {
  const { title, fields } = req.body || {};
  try {
    const form = await Form.findByPk(req.params.id);
    if (!form) return res.status(404).json({ error: 'Not found' });

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: 'Form title is required.' });
    }

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ error: 'Form title is required.' });
      }
      if (await isTitleTaken(title, String(req.params.id))) {
        return res.status(409).json({ error: 'Form title already exists. Choose another.' });
      }
      form.title = title;
    }


    if (fields !== undefined) {
      if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });
      const clean = sanitizeFields(fields);
      for (const f of clean) {
        if (!isValidField(f)) {
          return res.status(400).json({
            error: 'Invalid field definition: label, name, suffix are required; option-based fields need options or a dataSource.'
          });
        }
      }


      

      await FormField.destroy({ where: { formId: form.id } });
      const rows = clean.map((f, idx) => ({
        id: f.id && String(f.id).trim() ? f.id : rid(),
        formId: form.id,
        type: f.type,
        label: f.label,
        name: f.name,
        placeholder: f.placeholder || '',
        required: !!f.required,
        doNotStore: !!f.doNotStore,
        countryIso2: f.countryIso2 || '',
        options: f.options || '',
        position: idx
      }));

      try {
        await FormField.bulkCreate(rows);
      } catch (err) {
          if (err?.name === 'SequelizeUniqueConstraintError') {
            // We're inside bulkCreate of FormField rows → much more likely a (formId,prefix,suffix) conflict.
            return res.status(400).json({
              error: 'Duplicate (prefix, suffix) in this form. Each DB Suffix must be unique.'
            });
          }
          throw err;
        }
    }

    await form.save();

    const withFields = await Form.findByPk(form.id, { include: [{ model: FormField, as: 'fields' }] });
    const fieldsOut = (withFields.fields || []).sort((a,b)=>a.position-b.position).map(f => ({
      id: f.id, type: f.type, label: f.label, name: f.name, suffix: f.suffix,
      placeholder: f.placeholder, customClass: f.customClass,
      required: f.required, doNotStore: f.doNotStore,
      options: f.options, dataSource: f.dataSource, countryIso2: f.countryIso2,
      prefix: f.prefix
    }));

    res.json({ ok: true, form: { id: form.id, title: form.title, fields: fieldsOut } });
  } catch (err) {
    console.error('Update form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Live uniqueness check for form titles
app.get('/api/forms/check-title', async (req, res) => {
  try {
    const title = String(req.query.title || '');
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : null;
    if (!title.trim()) return res.json({ unique: false });
    const taken = await isTitleTaken(title, excludeId);
    res.json({ unique: !taken });
  } catch (err) {
    console.error('check-title error:', err);
    res.status(500).json({ unique: false, error: 'Server error' });
  }
});

// ---------------------------------------------------------------------
// Hosted Form (End-user view) + Submission flow
// ---------------------------------------------------------------------

// Hosted form page — renders a full document via views/hosted-form.hbs
app.get('/f/:id', async (req, res) => {
  try {
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).send('Form not found');

    const fields = (form.fields || []).sort((a,b)=>a.position-b.position);

    const vmFields = fields.map((f, idx) => ({
      partial: PARTIAL_FOR[f.type] || 'fields/text',
      ...toVM({
        name: f.name, label: f.label, required: f.required,
        placeholder: f.placeholder,
        options: f.options,
      }, idx, form.title || '')
    }));

    res.render('hosted-form', {
      layout: false,
      formId: form.id,
      title: form.title || 'Form',
      fields: vmFields
    });
  } catch (err) {
    console.error('Render hosted form error:', err);
    res.status(500).send('Server error');
  }
});

// Public submission endpoint
app.post('/public/forms/:id/submissions', async (req, res) => {
  try {
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const fields = form.fields || [];
    const forwardUrl = null; // optional: store in another table if needed

    const { data = {}, storeConsent = false } = req.body || {};
    const byKey = new Map(fields.map(f => [f.name, f]));
    const prefix = prefixFromTitle(form.title);

    if (storeConsent) {
      const reduced = {};
      for (const [k, v] of Object.entries(data)) {
        const f = byKey.get(k);
        if (f?.doNotStore) continue;
        reduced[`${prefix}_${safeKey(k)}`] = v;
      }
      await FormSubmission.create({
        id: crypto.randomBytes(9).toString('base64url'),
        formId: form.id,
        payloadJson: reduced
      });
    }

    // (Optional) Forward to webhook if you add that back in
    res.json({ ok: true });
  } catch (err) {
    console.error('Public submit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a form (and its fields + submissions)
app.delete('/api/forms/:id', async (req, res) => {
  try {
    await sequelize.transaction(async (t) => {
      const form = await Form.findByPk(req.params.id, { transaction: t });
      if (!form) return res.status(404).json({ error: 'Not found' });

      // If your FKs are ON DELETE CASCADE, the next line is enough:
      // await form.destroy({ transaction: t });

      // If not, delete dependents explicitly:
      await FormField.destroy({ where: { formId: form.id }, transaction: t });
      await FormSubmission.destroy({ where: { formId: form.id }, transaction: t });
      await form.destroy({ transaction: t });

      res.json({ ok: true });
    });
  } catch (err) {
    console.error('Delete form error:', err);
    res.status(500).json({ error: 'Could not delete form' });
  }
});

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
const port = process.env.PORT || 5173;

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('PRAGMA foreign_keys = ON;');
    await sequelize.sync(); // create tables if not present
    app.listen(port, () => {
      console.log(`Listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('DB boot error:', err);
    process.exit(1);
  }
})();
