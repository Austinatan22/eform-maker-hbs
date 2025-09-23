// Global teardown for Jest tests
// This runs once after all tests complete

import { cleanupLeftoverTestFiles } from './test-db-setup.js';

export default async function globalTeardown() {
    console.log('Final cleanup of test database files...');
    cleanupLeftoverTestFiles();
    console.log('Global teardown completed');
}
