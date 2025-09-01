// src/server/app.js (ESM)
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { engine } from 'express-handlebars';
import { sequelize } from './db.js';
import formsRouter from './routes/forms.routes.js';

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

// Routes
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

// Start
const port = process.env.PORT || 5173;
(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('PRAGMA foreign_keys = ON;');
    await sequelize.sync();
    app.listen(port, () => {
      console.log(`Listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('DB boot error:', err);
    process.exit(1);
  }
})();
