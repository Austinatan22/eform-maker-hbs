// app.js (ESM)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { engine } from 'express-handlebars';
import { sequelize } from './db.js';
import { Form } from './models/Form.js';
import { FormSubmission } from './models/FormSubmission.js';
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
      // allow {{#section "scripts"}}...{{/section}} in views
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
    customClass: f.customClass || '',
    options: String(f.options || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    prefix: prefixFromTitle(formTitle)
  };
  return vm;
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
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
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
    const form = await Form.findByPk(req.params.id);
    if (!form) return res.status(404).send('Form not found');

    // Normalize fields (accept {fields, meta} or legacy array)
    const raw = form.fieldsJson || [];
    const fields = Array.isArray(raw.fields) ? raw.fields : (Array.isArray(raw) ? raw : []);

    // Preload JSON into localStorage via <script> on the page
    const preload = JSON.stringify({
      title: form.title || '',
      fields
    });

    res.render('index', {
      title: `Editing: ${form.title || '(Untitled)'}`,
      currentPath: '/builder',
      form,
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

// Create or upsert
// POST /api/forms
app.post('/api/forms', async (req, res) => {
  const { id, title = '', fields = [] } = req.body || {};
  if (!Array.isArray(fields)) {
    return res.status(400).json({ error: 'fields must be an array' });
  }

  try {
    let form;
    if (id) {
      // update existing
      form = await Form.findByPk(id);
      if (!form) return res.status(404).json({ error: 'Not found' });
      form.title = title;
      form.fieldsJson = fields;
      await form.save();
    } else {
      // create new (auto-increment id)
      form = await Form.create({ title, fieldsJson: fields });
    }

    res.json({ ok: true, form: { id: form.id, title: form.title, fields: form.fieldsJson } });
  } catch (err) {
    console.error('Form save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// List
app.get('/api/forms', async (_req, res) => {
  try {
    const rows = await Form.findAll({ order: [['updatedAt', 'DESC']] });
    const forms = rows.map(r => ({
      id: r.id,
      title: r.title,
      fields: r.fieldsJson,
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
    const form = await Form.findByPk(req.params.id);
    if (!form) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, form: { id: form.id, title: form.title, fields: form.fieldsJson } });
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

    if (title !== undefined) form.title = title;
    if (fields !== undefined) {
      if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });
      form.fieldsJson = fields;
    }
    await form.save();
    res.json({ ok: true, form: { id: form.id, title: form.title, fields: form.fieldsJson } });
  } catch (err) {
    console.error('Update form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete
app.delete('/api/forms/:id', async (req, res) => {
  try {
    const deleted = await Form.destroy({ where: { id: req.params.id } });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    console.error('Delete form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------
// Hosted Form (End-user view) + Submission flow
// ---------------------------------------------------------------------

// Hosted form page — renders a full document via views/hosted-form.hbs
app.get('/f/:id', async (req, res) => {
  try {
    const form = await Form.findByPk(req.params.id);
    if (!form) return res.status(404).send('Form not found');

    const raw = form.fieldsJson || [];
    const fields = Array.isArray(raw.fields) ? raw.fields : (Array.isArray(raw) ? raw : []);

    // Build view-model for the template and partials
    const vmFields = fields.map((f, idx) => ({
      partial: PARTIAL_FOR[f.type] || 'fields/text',  // used with {{> (lookup this "partial") this}}
      ...toVM(f, idx, form.title || '')
    }));

    res.render('hosted-form', {
      layout: false,                 // hosted-form.hbs is a full HTML doc
      formId: form.id,
      title: form.title || 'Form',
      fields: vmFields
    });
  } catch (err) {
    console.error('Render hosted form error:', err);
    res.status(500).send('Server error');
  }
});

// Public submission endpoint (called by hosted form iframe OR direct)
app.post('/public/forms/:id/submissions', async (req, res) => {
  try {
    const form = await Form.findByPk(req.params.id);
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const def = form.fieldsJson || {};
    const fields = Array.isArray(def.fields) ? def.fields : (def || []);
    const forwardUrl = def.meta?.forwardUrl || null;

    const { data = {}, storeConsent = false } = req.body || {};
    const byKey = new Map(fields.map(f => [f.name || f.id, f]));
    const prefix = prefixFromTitle(form.title);

    // 1) Optionally store a filtered copy server-side (exclude doNotStore)
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

    // 2) Forward full payload to client's webhook (non-blocking best-effort)
    if (forwardUrl) {
      try {
        await fetch(forwardUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formId: form.id, data })
        });
      } catch (err) {
        console.error('Forwarding failed:', err);
        // Do not fail the submit because of webhook issues
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Public submit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
const port = process.env.PORT || 5173;

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync(); // create tables if not present
    app.listen(port, () => {
      console.log(`Listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('DB boot error:', err);
    process.exit(1);
  }
})();
