// db.js (ESM)
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite file under ./data/app.sqlite (override with DB_FILE env)
const defaultDbPath = path.join(__dirname, 'data', 'app.sqlite');
const storage = process.env.DB_FILE && String(process.env.DB_FILE).trim()
  ? path.isAbsolute(process.env.DB_FILE)
    ? process.env.DB_FILE
    : path.join(__dirname, process.env.DB_FILE)
  : defaultDbPath;

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  logging: false,
});

// Example (Postgres):
// export const sequelize = new Sequelize(process.env.DATABASE_URL, {
//   dialect: 'postgres',
//   logging: false,
// });
