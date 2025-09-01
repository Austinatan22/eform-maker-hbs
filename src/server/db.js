// src/server/db.js (ESM)
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from here (repo/src/server)
const ROOT = path.join(__dirname, '..', '..');

// SQLite file under <projectRoot>/data/app.sqlite (override with DB_FILE env)
const defaultDbPath = path.join(ROOT, 'data', 'app.sqlite');
const storage = process.env.DB_FILE && String(process.env.DB_FILE).trim()
  ? path.isAbsolute(process.env.DB_FILE)
    ? process.env.DB_FILE
    : path.join(ROOT, process.env.DB_FILE)
  : defaultDbPath;

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  logging: false,
});
