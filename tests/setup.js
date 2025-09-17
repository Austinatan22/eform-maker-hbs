// Test setup file for Jest
const { jest } = require('@jest/globals');
const path = require('path');
const fs = require('fs');

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    // Uncomment to suppress console.log in tests
    // log: jest.fn(),
    // debug: jest.fn(),
    // info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Global test utilities
global.testUtils = {
    // Helper to create test database path
    getTestDbPath: (name = 'test') => {
        return path.join(process.cwd(), 'data', `${name}.sqlite`);
    },

    // Helper to clean up test databases
    cleanupTestDbs: () => {
        const dataDir = path.join(process.cwd(), 'data');

        if (fs.existsSync(dataDir)) {
            const files = fs.readdirSync(dataDir);
            files.forEach(file => {
                if (file.endsWith('.sqlite') && file.includes('test')) {
                    try {
                        fs.unlinkSync(path.join(dataDir, file));
                    } catch (err) {
                        // Ignore errors
                    }
                }
            });
        }
    },

    // Helper to wait for async operations
    wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// Clean up test databases before each test
beforeEach(() => {
    global.testUtils.cleanupTestDbs();
});

// Clean up after all tests
afterAll(() => {
    global.testUtils.cleanupTestDbs();
});
