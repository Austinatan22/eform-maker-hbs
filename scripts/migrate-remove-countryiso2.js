// scripts/migrate-remove-countryiso2.js
// One-time migration to drop the countryIso2 column from form_fields (SQLite)

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { sequelize } from '../src/server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

async function columnExists(table, col) {
  const [rows] = await sequelize.query(`PRAGMA table_info(${table});`);
  return Array.isArray(rows) && rows.some(r => String(r.name) === col);
}

async function recreateFormFieldsWithoutCountry() {
  // Determine if migration needed
  if (!(await columnExists('form_fields', 'countryIso2'))) {
    console.log('[migrate] countryIso2 not present; nothing to do.');
    return;
  }

  console.log('[migrate] Removing countryIso2 from form_fields...');
  await sequelize.transaction(async (t) => {
    // Create new table with desired schema
    await sequelize.query(`
      CREATE TABLE form_fields_new (
        id TEXT PRIMARY KEY,
        formId TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        placeholder TEXT NOT NULL DEFAULT '',
        required INTEGER NOT NULL DEFAULT 0,
        doNotStore INTEGER NOT NULL DEFAULT 0,
        options TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0
      );
    `, { transaction: t });

    // Copy data excluding the removed column
    await sequelize.query(`
      INSERT INTO form_fields_new (id, formId, type, label, name, placeholder, required, doNotStore, options, position)
      SELECT id, formId, type, label, name, placeholder, required, doNotStore, options, position
      FROM form_fields;
    `, { transaction: t });

    // Replace old table
    await sequelize.query(`DROP TABLE form_fields;`, { transaction: t });
    await sequelize.query(`ALTER TABLE form_fields_new RENAME TO form_fields;`, { transaction: t });

    // Recreate index
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_form_fields_formId ON form_fields(formId);`, { transaction: t });
  });

  console.log('[migrate] Done.');
}

async function main() {
  // Ensure data folder exists
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  try {
    await sequelize.authenticate();
    await recreateFormFieldsWithoutCountry();
  } catch (e) {
    console.error('[migrate] Error:', e);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();

