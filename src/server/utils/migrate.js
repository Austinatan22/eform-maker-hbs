// src/server/utils/migrate.js
// Migration runner utility

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get all migration files
 */
function getMigrationFiles() {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }

    return fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.js'))
        .sort()
        .map(file => ({
            name: file,
            path: path.join(migrationsDir, file)
        }));
}

/**
 * Get the last run migration
 */
async function getLastMigration(sequelize) {
    try {
        const [rows] = await sequelize.query("SELECT name FROM migrations ORDER BY id DESC LIMIT 1");
        return rows.length > 0 ? rows[0].name : null;
    } catch (error) {
        // Table doesn't exist yet, return null
        return null;
    }
}

/**
 * Create migrations table if it doesn't exist
 */
async function createMigrationsTable(sequelize) {
    try {
        await sequelize.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    } catch (error) {
        console.error('Failed to create migrations table:', error);
        throw error;
    }
}

/**
 * Record a migration as executed
 */
async function recordMigration(sequelize, migrationName) {
    try {
        await sequelize.query(
            "INSERT INTO migrations (name) VALUES (?)",
            { replacements: [migrationName] }
        );
    } catch (error) {
        console.error(`Failed to record migration ${migrationName}:`, error);
        throw error;
    }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(sequelize) {
    console.log('🔄 Running database migrations...');

    try {
        // Create migrations table
        await createMigrationsTable(sequelize);

        // Get all migration files
        const migrationFiles = getMigrationFiles();
        if (migrationFiles.length === 0) {
            console.log('✓ No migrations found');
            return;
        }

        // Get last executed migration
        const lastMigration = await getLastMigration(sequelize);

        // Find pending migrations
        const pendingMigrations = migrationFiles.filter(migration => {
            return !lastMigration || migration.name > lastMigration;
        });

        if (pendingMigrations.length === 0) {
            console.log('✓ Database is up to date');
            return;
        }

        console.log(`📋 Found ${pendingMigrations.length} pending migration(s)`);

        // Run pending migrations
        for (const migration of pendingMigrations) {
            console.log(`🔄 Running migration: ${migration.name}`);

            try {
                // Import and run the migration (use file URL for Windows compatibility)
                const migrationUrl = pathToFileURL(migration.path).href;
                const migrationModule = await import(migrationUrl);
                await migrationModule.up(sequelize);

                // Record the migration as executed
                await recordMigration(sequelize, migration.name);

                console.log(`✓ Migration ${migration.name} completed successfully`);
            } catch (error) {
                console.error(`✗ Migration ${migration.name} failed:`, error.message);
                throw error;
            }
        }

        console.log('✅ All migrations completed successfully');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    }
}

/**
 * Rollback the last migration
 */
export async function rollbackLastMigration(sequelize) {
    console.log('🔄 Rolling back last migration...');

    try {
        // Get last executed migration
        const lastMigration = await getLastMigration(sequelize);
        if (!lastMigration) {
            console.log('✓ No migrations to rollback');
            return;
        }

        // Find the migration file
        const migrationFiles = getMigrationFiles();
        const migration = migrationFiles.find(m => m.name === lastMigration);

        if (!migration) {
            console.log(`⚠️  Migration file not found: ${lastMigration}`);
            return;
        }

        console.log(`🔄 Rolling back migration: ${lastMigration}`);

        // Import and run the rollback (use file URL for Windows compatibility)
        const migrationUrl = pathToFileURL(migration.path).href;
        const migrationModule = await import(migrationUrl);
        if (migrationModule.down) {
            await migrationModule.down(sequelize);
        } else {
            console.log('⚠️  No rollback function defined for this migration');
        }

        // Remove the migration record
        await sequelize.query("DELETE FROM migrations WHERE name = ?", {
            replacements: [lastMigration]
        });

        console.log(`✓ Migration ${lastMigration} rolled back successfully`);
    } catch (error) {
        console.error('❌ Rollback failed:', error.message);
        throw error;
    }
}
