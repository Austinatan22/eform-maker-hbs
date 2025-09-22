#!/usr/bin/env node

/**
 * Script to clean up leftover test database files
 * Usage: node scripts/cleanup-test-dbs.js
 */

import { cleanupLeftoverTestFiles } from '../tests/helpers/test-db-setup.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

console.log('🧹 Cleaning up leftover test database files...');
console.log(`📁 Data directory: ${path.join(ROOT, 'data')}`);

try {
    cleanupLeftoverTestFiles();
    console.log('✅ Cleanup completed successfully');
} catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
}
