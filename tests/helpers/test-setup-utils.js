// tests/helpers/test-setup-utils.js
// Standardized test setup utilities

import { setupTestDatabase, teardownTestDatabase, clearTestData } from './test-db-setup.js';
import jwt from 'jsonwebtoken';

/**
 * Standard test environment setup
 */
export function setupTestEnvironment() {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENABLED = '1';
    process.env.JWT_SECRET = 'test_jwt_secret_key';
}

/**
 * Clean up test environment
 */
export function cleanupTestEnvironment() {
    delete process.env.NODE_ENV;
    delete process.env.AUTH_ENABLED;
    delete process.env.JWT_SECRET;
}

/**
 * Standard beforeEach setup for database tests
 */
export async function standardBeforeEach() {
    await setupTestDatabase();
    await clearTestData();
    setupTestEnvironment();
}

/**
 * Standard afterEach cleanup for database tests
 */
export async function standardAfterEach() {
    await clearTestData();
    await teardownTestDatabase();
    cleanupTestEnvironment();
}

/**
 * Standard beforeAll setup for database tests
 */
export async function standardBeforeAll() {
    await setupTestDatabase();
    setupTestEnvironment();
}

/**
 * Standard afterAll cleanup for database tests
 */
export async function standardAfterAll() {
    await teardownTestDatabase();
    cleanupTestEnvironment();
}

/**
 * Create a test Express app with standard middleware
 */
export function createTestApp() {
    const express = require('express');
    const session = require('express-session');
    const { engine } = require('express-handlebars');
    const path = require('path');
    const { fileURLToPath } = require('url');

    const app = express();

    // Standard middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(session({
        secret: 'test-session-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));

    // Configure Handlebars
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    app.engine('hbs', engine({
        extname: '.hbs',
        defaultLayout: false,
        layoutsDir: path.join(__dirname, '../../views/layouts'),
        partialsDir: path.join(__dirname, '../../views/partials')
    }));
    app.set('view engine', 'hbs');
    app.set('views', path.join(__dirname, '../../views'));

    return app;
}

/**
 * Generate test JWT token
 */
export function generateTestJWT(user, secret = 'test_jwt_secret_key') {
    return jwt.sign(
        {
            sub: user.id,
            role: user.role,
            email: user.email
        },
        secret,
        { expiresIn: '15m' }
    );
}

/**
 * Standard test timeout configuration
 */
export const TEST_TIMEOUT = 10000;

/**
 * Common test assertions
 */
export const testAssertions = {
    /**
     * Assert successful response
     */
    expectSuccess: (response, expectedStatus = 200) => {
        expect(response.status).toBe(expectedStatus);
    },

    /**
     * Assert error response
     */
    expectError: (response, expectedStatus = 400) => {
        expect(response.status).toBe(expectedStatus);
        expect(response.body).toHaveProperty('error');
    },

    /**
     * Assert redirect response
     */
    expectRedirect: (response, expectedLocation) => {
        expect(response.status).toBe(302);
        if (expectedLocation) {
            expect(response.headers.location).toBe(expectedLocation);
        }
    },

    /**
     * Assert unauthorized response
     */
    expectUnauthorized: (response) => {
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Unauthorized' });
    },

    /**
     * Assert forbidden response
     */
    expectForbidden: (response) => {
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Forbidden' });
    },

    /**
     * Assert not found response
     */
    expectNotFound: (response) => {
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Not found' });
    }
};
