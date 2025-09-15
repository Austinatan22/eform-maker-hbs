// src/server/db.js (ESM)
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from here (repo/src/server)
const ROOT = path.join(__dirname, '..', '..');

// Main application database (forms, users, etc.)
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

// Separate database for form submissions (client data isolation)
const defaultSubmissionsDbPath = path.join(ROOT, 'data', 'submissions.sqlite');
const submissionsStorage = process.env.SUBMISSIONS_DB_FILE && String(process.env.SUBMISSIONS_DB_FILE).trim()
  ? path.isAbsolute(process.env.SUBMISSIONS_DB_FILE)
    ? process.env.SUBMISSIONS_DB_FILE
    : path.join(ROOT, process.env.SUBMISSIONS_DB_FILE)
  : defaultSubmissionsDbPath;

export const submissionsSequelize = new Sequelize({
  dialect: 'sqlite',
  storage: submissionsStorage,
  logging: false,
});
