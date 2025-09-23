// tests/helpers/test-env-setup.js
// Jest environment setup file

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.AUTH_ENABLED = '1';
process.env.JWT_SECRET = 'test_jwt_secret_key';

// Timeout is handled in jest.config.mjs

// Global test utilities
global.testUtils = {
    // Helper to create test data
    createTestData: async () => {
        // This can be extended with common test data creation
        return {};
    },

    // Helper to clean up test data
    cleanupTestData: async () => {
        // This can be extended with common cleanup operations
        return {};
    }
};

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
    console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
    console.warn('Uncaught Exception:', error);
});