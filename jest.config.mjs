export default {
    // Test environment
    testEnvironment: 'node',

    // Test file patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/tests/**/*.spec.js',
        '**/__tests__/**/*.js'
    ],

    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
        '!src/**/*.spec.js',
        '!src/server/app.js', // Exclude main app file from coverage
        '!src/server/db.js'   // Exclude database setup from coverage
    ],

    // Test timeout
    testTimeout: 10000,

    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,

    // Global setup (no global teardown - tests handle their own cleanup)
    globalSetup: '<rootDir>/tests/helpers/global-setup.js',

    // Verbose output
    verbose: true,

    // Environment variables for tests
    setupFilesAfterEnv: ['<rootDir>/tests/helpers/test-env-setup.js'],

    // Test environment variables
    testEnvironmentOptions: {
        NODE_ENV: 'test',
        AUTH_ENABLED: '1',
        JWT_SECRET: 'test_jwt_secret_key'
    }
};
