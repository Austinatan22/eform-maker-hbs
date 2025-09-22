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

    // Global setup and teardown
    globalSetup: '<rootDir>/tests/helpers/global-setup.js',
    globalTeardown: '<rootDir>/tests/helpers/global-teardown.js',

    // Verbose output
    verbose: true
};
