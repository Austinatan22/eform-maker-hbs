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
import adminRouter from './routes/admin.routes.js';
import authRouter from './routes/auth.routes.js';
import usersRouter from './routes/users.routes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import csurf from 'csurf';
import { RefreshToken } from './models/RefreshToken.js';
import { AuditLog } from './models/AuditLog.js';
import { User } from './models/User.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './utils/errorHandler.js';
import { runMigrations } from './utils/migrate.js';

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
if (env.CSP_ENABLED) {
  const extraConnect = String(env.CSP_CONNECT_SRC || '')
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
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production' // secure cookies in production
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
  const list = String(env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const allowAllLocal = env.NODE_ENV !== 'production' && list.length === 0;
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
app.use(formsRouter);
app.use(adminRouter);
app.get('/', (_req, res) => res.redirect('/forms'));

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Handlebars
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: LAYOUTS_DIR,
  partialsDir: PARTIALS_DIR,
  helpers: {
    eq(a, b) { return String(a) === String(b); },
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
    }
  }
}));
app.set('view engine', 'hbs');
app.set('views', VIEWS_DIR);

async function seedAdminUser() {
  try {
    const [rows] = await sequelize.query("SELECT COUNT(*) as c FROM users");
    const count = Array.isArray(rows) ? (rows[0]?.c ?? rows[0]?.C ?? 0) : 0;
    if (!count) {
      const bcrypt = await import('bcryptjs');
      const adminEmail = env.ADMIN_EMAIL;
      const adminPass = env.ADMIN_PASSWORD;
      const hash = bcrypt.hashSync(adminPass, 10);
      await User.create({ id: 'u-admin', email: adminEmail, username: 'admin', passwordHash: hash, role: 'admin' });
      console.log(`✓ Seeded admin user: ${adminEmail} / ${adminPass}`);
    }
  } catch (e) {
    console.warn('User seeding issue:', e.message || e);
  }
}

// Start
const port = env.PORT;
(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('PRAGMA foreign_keys = ON;');

    // Run migrations first
    await runMigrations(sequelize);

    // Sync models (creates tables if they don't exist)
    await sequelize.sync();

    // Seed admin user
    await seedAdminUser();

    app.listen(port, () => {
      console.log(`🚀 Server listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('❌ Server startup error:', err);
    process.exit(1);
  }
})();
