// app.js (ESM)
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { engine } from 'express-handlebars';
import { sequelize } from './db.js';
import formsRouter from './src/server/routes/forms.routes.js';
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
// Modular routes
app.use(formsRouter);

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

// (utilities moved to controllers/validators/services)

// ---------------------------------------------------------------------
// Routes (Builder UI)
// ---------------------------------------------------------------------
app.get('/', (_req, res) => res.redirect('/forms'));

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
