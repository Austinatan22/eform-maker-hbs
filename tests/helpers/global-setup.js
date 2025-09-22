// Global setup for Jest tests
// This runs once before all tests start

import { cleanupLeftoverTestFiles } from './test-db-setup.js';

export default async function globalSetup() {
    console.log('🧹 Cleaning up leftover test database files...');
    cleanupLeftoverTestFiles();
    console.log('✅ Global setup completed');
}
