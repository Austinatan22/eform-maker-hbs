// src/server/app.js (ESM)
import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { engine } from 'express-handlebars';
import { sequelize } from './db.js';
import { DataTypes } from 'sequelize';
import formsRouter from './routes/forms.routes.js';
import authRouter from './routes/auth.routes.js';
import cors from 'cors';
import { RefreshToken } from './models/RefreshToken.js';
import { User } from './models/User.js';

// Paths / __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from here (repo/src/server)
const ROOT = path.join(__dirname, '..', '..');
const VIEWS_DIR = path.join(ROOT, 'views');
const LAYOUTS_DIR = path.join(VIEWS_DIR, 'layouts');
const PARTIALS_DIR = path.join(VIEWS_DIR, 'partials');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Ensure SQLite 'data' dir exists under project root
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();

// Static assets (/assets, /css, /js, etc. under /public)
app.use(express.static(PUBLIC_DIR));

// Expose field partials for the builder to fetch (e.g. /tpl/fields/phone.hbs)
// Serve partials so the builder can fetch field templates at /tpl/fields/*.hbs
app.use('/tpl', express.static(PARTIALS_DIR));

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Sessions (dev-friendly; for production use a persistent store)
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false // set true behind HTTPS/proxy
  }
}));

// Expose session user to templates
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
});

// CORS for APIs when JWT auth is enabled
if (process.env.AUTH_ENABLED === '1') {
  const origin = process.env.CORS_ORIGIN || undefined; // undefined => reflect request origin if needed
  app.use(cors({ origin: origin || true, credentials: true }));
}

// Routes
app.use(authRouter);
app.use(formsRouter);
app.get('/', (_req, res) => res.redirect('/forms'));

// Handlebars
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

async function ensureSchema() {
  try {
    // If starting on a fresh DB, sync creates the column from the model.
    // For existing DBs, add the column if it doesn't exist (SQLite only).
    const [cols] = await sequelize.query("PRAGMA table_info('forms')");
    const hasCategory = Array.isArray(cols) && cols.some(c => String(c.name).toLowerCase() === 'category');
    if (!hasCategory) {
      await sequelize.getQueryInterface().addColumn('forms', 'category', {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'survey'
      });
      console.log('Added missing column forms.category');
    }

    const hasCreatedBy = Array.isArray(cols) && cols.some(c => String(c.name).toLowerCase() === 'createdby');
    if (!hasCreatedBy) {
      await sequelize.getQueryInterface().addColumn('forms', 'createdBy', {
        type: DataTypes.STRING(64),
        allowNull: true
      });
      console.log('Added missing column forms.createdBy');
    }

    // Ensure unique index on forms.title (case-insensitive)
    try {
      const [idx] = await sequelize.query("PRAGMA index_list('forms')");
      const hasTitleIdx = Array.isArray(idx) && idx.some(r => String(r.name || '').toLowerCase() === 'forms_title_nocase_unique');
      if (!hasTitleIdx) {
        // Check for existing duplicates (case-insensitive) to avoid index creation failure
        const [dups] = await sequelize.query(
          "SELECT lower(title) AS lt, COUNT(*) AS c FROM forms GROUP BY lt HAVING c > 1 LIMIT 1"
        );
        const hasDups = Array.isArray(dups) && dups.length > 0;
        if (hasDups) {
          console.warn('Cannot create unique index on forms.title: duplicates exist (case-insensitive). Please resolve and restart.');
        } else {
          await sequelize.query("CREATE UNIQUE INDEX IF NOT EXISTS forms_title_nocase_unique ON forms(title COLLATE NOCASE)");
          console.log('Ensured unique index forms_title_nocase_unique');
        }
      }
    } catch (e) {
      console.warn('Index ensure failed (forms.title unique):', e.message || e);
    }

    // Ensure indexes on form_fields (including unique(formId,name))
    try {
      const [idx] = await sequelize.query("PRAGMA index_list('form_fields')");
      const have = new Set((Array.isArray(idx) ? idx : []).map(r => String(r.name || '').toLowerCase()));
      if (!have.has('idx_form_fields_formid')) {
        await sequelize.query("CREATE INDEX IF NOT EXISTS idx_form_fields_formId ON form_fields(formId)");
        console.log('Ensured index idx_form_fields_formId');
      }
      if (!have.has('uq_form_fields_formid_name')) {
        // Check duplicates before creating unique index
        const [dups] = await sequelize.query(
          "SELECT formId, name, COUNT(*) AS c FROM form_fields GROUP BY formId, name HAVING c > 1 LIMIT 1"
        );
        const hasDups = Array.isArray(dups) && dups.length > 0;
        if (hasDups) {
          console.warn('Cannot create unique index on form_fields(formId,name): duplicates exist. Please resolve and restart.');
        } else {
          await sequelize.query("CREATE UNIQUE INDEX IF NOT EXISTS uq_form_fields_formId_name ON form_fields(formId, name)");
          console.log('Ensured unique index uq_form_fields_formId_name');
        }
      }
    } catch (e) {
      console.warn('Index ensure failed (form_fields):', e.message || e);
    }

    // Ensure index on form_submissions(formId)
    try {
      const [idx] = await sequelize.query("PRAGMA index_list('form_submissions')");
      const have = new Set((Array.isArray(idx) ? idx : []).map(r => String(r.name || '').toLowerCase()));
      if (!have.has('idx_form_submissions_formid')) {
        await sequelize.query("CREATE INDEX IF NOT EXISTS idx_form_submissions_formId ON form_submissions(formId)");
        console.log('Ensured index idx_form_submissions_formId');
      }
    } catch (e) {
      console.warn('Index ensure failed (form_submissions):', e.message || e);
    }

    // Ensure users table & seed admin (dev)
    try {
      await User.sync();
      const [rows] = await sequelize.query("SELECT COUNT(*) as c FROM users");
      const count = Array.isArray(rows) ? (rows[0]?.c ?? rows[0]?.C ?? 0) : 0;
      if (!count) {
        const bcrypt = await import('bcryptjs');
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
        const hash = bcrypt.hashSync(adminPass, 10);
        await User.create({ id: 'u-admin', email: adminEmail, passwordHash: hash, role: 'admin' });
        console.log(`Seeded admin user: ${adminEmail} / ${adminPass}`);
      }
    } catch (e) {
      console.warn('User schema/seed issue:', e.message || e);
    }

    // Ensure refresh_tokens table exists
    try { await RefreshToken.sync(); } catch (e) {
      console.warn('RefreshToken schema issue:', e.message || e);
    }
  } catch (e) {
    console.warn('Schema ensure failed (category):', e.message || e);
  }
}

// Start
const port = process.env.PORT || 5173;
(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('PRAGMA foreign_keys = ON;');
    await sequelize.sync();
    await ensureSchema();
    app.listen(port, () => {
      console.log(`Listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('DB boot error:', err);
    process.exit(1);
  }
})();
