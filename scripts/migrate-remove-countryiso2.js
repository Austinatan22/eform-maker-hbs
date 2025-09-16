// scripts/migrate-remove-countryiso2.js
import { sequelize } from '../src/server/db.js';

async function migrate() {
    try {
        console.log('Starting migration to remove countryIso2 column...');

        // Check if the column exists
        const [results] = await sequelize.query(`
      PRAGMA table_info(form_fields);
    `);

        const hasCountryIso2 = results.some(col => col.name === 'countryIso2');

        if (hasCountryIso2) {
            console.log('Found countryIso2 column, removing it...');

            // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
            await sequelize.query(`
        CREATE TABLE form_fields_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          formId INTEGER NOT NULL,
          type VARCHAR(255) NOT NULL,
          label VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          placeholder TEXT,
          required BOOLEAN DEFAULT 0,
          doNotStore BOOLEAN DEFAULT 0,
          options TEXT,
          position INTEGER DEFAULT 0,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (formId) REFERENCES forms (id) ON DELETE CASCADE
        );
      `);

            // Copy data from old table to new table
            await sequelize.query(`
        INSERT INTO form_fields_new (id, formId, type, label, name, placeholder, required, doNotStore, options, position, createdAt, updatedAt)
        SELECT id, formId, type, label, name, placeholder, required, doNotStore, options, position, createdAt, updatedAt
        FROM form_fields;
      `);

            // Drop old table and rename new table
            await sequelize.query(`DROP TABLE form_fields;`);
            await sequelize.query(`ALTER TABLE form_fields_new RENAME TO form_fields;`);

            console.log('✅ Successfully removed countryIso2 column');
        } else {
            console.log('✅ countryIso2 column not found, migration not needed');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

migrate();
