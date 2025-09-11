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
import usersRouter from './routes/users.routes.js';
import logsRouter from './routes/logs.routes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import csurf from 'csurf';
import { RefreshToken } from './models/RefreshToken.js';
import { AuditLog } from './models/AuditLog.js';
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

// ---- Security headers (Helmet) ----
// Configure a conservative CSP that allows our local assets and required CDNs
// NOTE: Inline scripts/styles are used in server-rendered views; keep 'unsafe-inline'.
if (process.env.CSP_ENABLED === '1') {
  const extraConnect = String(process.env.CSP_CONNECT_SRC || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          // CDN for SortableJS / intl-tel-input / Handlebars / Bootstrap on hosted form
          'https://cdn.jsdelivr.net'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net'
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", ...extraConnect],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null
      }
    },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
} else {
  // Use helmet defaults without CSP in dev to avoid breaking UI
  app.use(helmet({ contentSecurityPolicy: false }));
}

// Static assets (/assets, /css, /js, etc. under /public)
app.use(express.static(PUBLIC_DIR));

// Expose ONLY field partials for the builder to fetch (e.g. /tpl/fields/phone.hbs)
app.use('/tpl/fields', express.static(path.join(PARTIALS_DIR, 'fields')));

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
  // Build top navigation menu per request
  const baseMenu = [
    {
      label: 'Forms',
      href: 'javascript:void(0)',
      icon: 'ti tabler-file-text',
      children: [
        { label: 'Forms', href: '/forms', icon: 'ti tabler-file-text' }
      ]
    }
  ];
  const isAdmin = !!res.locals.user && String(res.locals.user.role || '').toLowerCase() === 'admin';
  if (isAdmin) {
    baseMenu.push({
      label: 'Admin',
      href: 'javascript:void(0)',
      icon: 'ti tabler-settings',
      children: [
        { label: 'Users', href: '/admin/users', icon: 'ti tabler-users' },
        { label: 'Logs', href: '/admin/logs', icon: 'ti tabler-clipboard-list' }
      ]
    });
  }
  res.locals.menu = baseMenu;
  next();
});

// ---- CSRF protection (session-based) ----
// Protect state-changing routes; skip public submission endpoint
{
  const csrfProtection = csurf({ cookie: false });
  // Apply CSRF to all session HTML routes so GETs get a token and mutating methods are validated.
  app.use((req, res, next) => {
    // Allow public submissions without CSRF (from hosted forms or external clients)
    if (req.path.startsWith('/public/forms/')) return next();
    // Skip JSON API routes; CSRF is intended for session-based HTML posts
    if (req.path.startsWith('/api/')) return next();
    return csrfProtection(req, res, next);
  });
  // Make token available to views on all HTML routes
  app.use((req, res, next) => {
    try { if (typeof req.csrfToken === 'function') res.locals.csrfToken = req.csrfToken(); } catch { }
    next();
  });
}

// ---- CORS (strict allowlist) ----
// Specify one or more allowed origins via CORS_ORIGIN (comma-separated)
{
  const list = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const allowAllLocal = process.env.NODE_ENV !== 'production' && list.length === 0;
  const corsOptions = {
    credentials: true,
    origin: (origin, cb) => {
      // No origin (same-origin or curl) -> allow
      if (!origin) return cb(null, true);
      if (allowAllLocal) return cb(null, true);
      if (list.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: Not allowed'), false);
    }
  };
  app.use(cors(corsOptions));
}

// Routes
app.use(authRouter);
app.use(usersRouter);
app.use(logsRouter);
app.use(formsRouter);
app.get('/', (_req, res) => res.redirect('/forms'));

// Handlebars
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: LAYOUTS_DIR,
  partialsDir: PARTIALS_DIR,
  helpers: {
    logActionLabel(action) {
      const a = String(action || '').toLowerCase();
      if (a === 'create') return 'Create';
      if (a === 'update') return 'Update';
      if (a === 'delete') return 'Delete';
      return String(action || '');
    },
    logActionBadge(action) {
      const a = String(action || '').toLowerCase();
      if (a === 'create') return 'bg-label-success';
      if (a === 'update') return 'bg-label-info';
      if (a === 'delete') return 'bg-label-danger';
      return 'bg-label-secondary';
    },
    entityLabel(entity) {
      const e = String(entity || '').trim();
      if (!e) return '';
      return e.charAt(0).toUpperCase() + e.slice(1);
    },
    entityBadgeClass(entity) {
      const e = String(entity || '').toLowerCase();
      if (e === 'form') return 'bg-label-primary';
      if (e === 'user') return 'bg-label-info';
      if (e === 'auth') return 'bg-label-warning';
      return 'bg-label-secondary';
    },
    section(name, options) {
      const root = options.data.root;
      root._sections ??= {};
      root._sections[name] = options.fn(this);
      return null;
    },
    isActive(pathname, current) {
      return pathname === current ? 'active' : '';
    },
    isMenuActive(item, current) {
      function match(it) {
        if (!it) return false;
        if (it.href && it.href === current) return true;
        if (Array.isArray(it.children)) return it.children.some(c => match(c));
        return false;
      }
      return match(item) ? 'active open' : '';
    },
    // Labels & badge classes
    roleLabel(role) {
      const r = String(role || '').toLowerCase();
      if (r === 'admin') return 'Admin';
      if (r === 'viewer') return 'Viewer';
      return 'Editor';
    },
    roleBadgeClass(role) {
      const r = String(role || '').toLowerCase();
      if (r === 'admin') return 'bg-label-danger';
      if (r === 'viewer') return 'bg-label-secondary';
      return 'bg-label-primary';
    },
    categoryLabel(cat) {
      const c = String(cat || '').toLowerCase();
      if (c === 'quiz') return 'Quiz';
      if (c === 'feedback') return 'Feedback';
      return 'Survey';
    },
    categoryBadgeClass(cat) {
      const c = String(cat || '').toLowerCase();
      if (c === 'quiz') return 'bg-label-info';
      if (c === 'feedback') return 'bg-label-warning';
      return 'bg-label-primary';
    },
    // Date formatting helper used in views
    formatDateTime(val) {
      try {
        if (!val) return '';
        const d = new Date(val);
        if (isNaN(d)) return String(val);
        const DD = String(d.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const MMM = months[d.getMonth()] || '';
        const YYYY = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${DD} ${MMM} ${YYYY}, ${hh}:${mm}:${ss}`;
      } catch { return String(val || ''); }
    },
    formatDate(val) {
      try {
        if (!val) return '';
        const d = new Date(val);
        if (isNaN(d)) return String(val);
        const DD = String(d.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const MMM = months[d.getMonth()] || '';
        const YYYY = d.getFullYear();
        return `${DD} ${MMM} ${YYYY}`;
      } catch { return String(val || ''); }
    },
    formatTime(val) {
      try {
        if (!val) return '';
        const d = new Date(val);
        if (isNaN(d)) return String(val);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
      } catch { return String(val || ''); }
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
      // Add composite index for better deletion performance
      if (!have.has('idx_form_submissions_formid_created')) {
        await sequelize.query("CREATE INDEX IF NOT EXISTS idx_form_submissions_formId_created ON form_submissions(formId, createdAt)");
        console.log('Ensured composite index idx_form_submissions_formId_created');
      }
    } catch (e) {
      console.warn('Index ensure failed (form_submissions):', e.message || e);
    }

    // Ensure users table & seed admin (dev) and add username column if missing
    try {
      await User.sync();
      // Add users.username if missing (SQLite)
      try {
        const [uCols] = await sequelize.query("PRAGMA table_info('users')");
        const hasUsername = Array.isArray(uCols) && uCols.some(c => String(c.name).toLowerCase() === 'username');
        if (!hasUsername) {
          await sequelize.getQueryInterface().addColumn('users', 'username', {
            type: DataTypes.STRING(64),
            allowNull: true
          });
          console.log('Added missing column users.username');
        }
      } catch (e) {
        console.warn('Users.username ensure failed:', e.message || e);
      }

      const [rows] = await sequelize.query("SELECT COUNT(*) as c FROM users");
      const count = Array.isArray(rows) ? (rows[0]?.c ?? rows[0]?.C ?? 0) : 0;
      if (!count) {
        const bcrypt = await import('bcryptjs');
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
        const hash = bcrypt.hashSync(adminPass, 10);
        await User.create({ id: 'u-admin', email: adminEmail, username: 'admin', passwordHash: hash, role: 'admin' });
        console.log(`Seeded admin user: ${adminEmail} / ${adminPass}`);
      }
    } catch (e) {
      console.warn('User schema/seed issue:', e.message || e);
    }

    // Ensure refresh_tokens table exists
    try { await RefreshToken.sync(); } catch (e) {
      console.warn('RefreshToken schema issue:', e.message || e);
    }
    // Ensure audit_logs table exists
    try { await AuditLog.sync(); } catch (e) {
      console.warn('AuditLog schema issue:', e.message || e);
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
