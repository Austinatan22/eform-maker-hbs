#!/usr/bin/env node

// scripts/cleanup-drafts.js
// Cleanup script for old drafts (runs as a cron job or scheduled task)

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cleanupOldDrafts } from '../src/server/services/versioning.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Change to project root directory
process.chdir(join(__dirname, '..'));

async function main() {
    try {
        console.log('Starting draft cleanup...');

        // Clean up drafts older than 30 days
        const deletedCount = await cleanupOldDrafts(30);

        console.log(`Cleanup completed. Deleted ${deletedCount} old drafts.`);

        process.exit(0);
    } catch (error) {
        console.error('Draft cleanup failed:', error);
        process.exit(1);
    }
}

main();
