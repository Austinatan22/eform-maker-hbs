/**
 * Authentication Test Utilities
 * 
 * Shared utilities for testing authentication scenarios across all test files.
 * Reduces duplication and provides consistent test patterns.
 */

import request from 'supertest';
import { app } from '../../src/server/app.js';

/**
 * Test unauthenticated access to an endpoint
 * @param {string} endpoint - The endpoint to test
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object} data - Request body data (for POST/PUT)
 * @param {Object} headers - Additional headers
 */
export const testUnauthenticatedAccess = async (endpoint, method = 'GET', data = null, headers = {}) => {
    const req = request(app)[method.toLowerCase()](endpoint);

    if (headers) {
        Object.entries(headers).forEach(([key, value]) => {
            req.set(key, value);
        });
    }

    if (data) {
        req.send(data);
    }

    const response = await req;

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');

    return response;
};

/**
 * Test authenticated access with different roles
 * @param {string} endpoint - The endpoint to test
 * @param {string} method - HTTP method
 * @param {Object} options - Test options
 * @param {string} options.adminToken - Admin JWT token
 * @param {string} options.editorToken - Editor JWT token
 * @param {string} options.viewerToken - Viewer JWT token
 * @param {Object} options.data - Request body data
 * @param {Object} options.headers - Additional headers
 * @param {Object} options.expectedStatus - Expected status codes for each role
 */
export const testRoleBasedAccess = async (endpoint, method = 'GET', options = {}) => {
    const {
        adminToken,
        editorToken,
        viewerToken,
        data = null,
        headers = {},
        expectedStatus = { admin: 200, editor: 200, viewer: 403 }
    } = options;

    // Test admin access
    if (adminToken) {
        const adminReq = request(app)[method.toLowerCase()](endpoint)
            .set('Authorization', `Bearer ${adminToken}`);

        if (Object.keys(headers).length > 0) {
            Object.entries(headers).forEach(([key, value]) => {
                adminReq.set(key, value);
            });
        }

        if (data) {
            adminReq.send(data);
        }

        const adminResponse = await adminReq;
        expect(adminResponse.status).toBe(expectedStatus.admin);
    }

    // Test editor access
    if (editorToken) {
        const editorReq = request(app)[method.toLowerCase()](endpoint)
            .set('Authorization', `Bearer ${editorToken}`);

        if (Object.keys(headers).length > 0) {
            Object.entries(headers).forEach(([key, value]) => {
                editorReq.set(key, value);
            });
        }

        if (data) {
            editorReq.send(data);
        }

        const editorResponse = await editorReq;
        expect(editorResponse.status).toBe(expectedStatus.editor);
    }

    // Test viewer access
    if (viewerToken) {
        const viewerReq = request(app)[method.toLowerCase()](endpoint)
            .set('Authorization', `Bearer ${viewerToken}`);

        if (Object.keys(headers).length > 0) {
            Object.entries(headers).forEach(([key, value]) => {
                viewerReq.set(key, value);
            });
        }

        if (data) {
            viewerReq.send(data);
        }

        const viewerResponse = await viewerReq;
        expect(viewerResponse.status).toBe(expectedStatus.viewer);
    }
};

/**
 * Test authentication patterns for CRUD operations
 * @param {Object} options - Test configuration
 * @param {string} options.baseEndpoint - Base endpoint (e.g., '/api/forms')
 * @param {string} options.resourceId - Resource ID for GET/PUT/DELETE operations
 * @param {Object} options.tokens - JWT tokens for different roles
 * @param {Object} options.testData - Test data for POST/PUT operations
 */
export const testCrudAuthentication = async (options = {}) => {
    const {
        baseEndpoint,
        resourceId = 'test-id',
        tokens = {},
        testData = {}
    } = options;

    const { adminToken, editorToken, viewerToken } = tokens;

    // Test GET (list) endpoint
    await testRoleBasedAccess(baseEndpoint, 'GET', {
        adminToken,
        editorToken,
        viewerToken,
        expectedStatus: { admin: 200, editor: 200, viewer: 200 }
    });

    // Test GET (single) endpoint
    await testRoleBasedAccess(`${baseEndpoint}/${resourceId}`, 'GET', {
        adminToken,
        editorToken,
        viewerToken,
        expectedStatus: { admin: 200, editor: 200, viewer: 200 }
    });

    // Test POST endpoint
    await testRoleBasedAccess(baseEndpoint, 'POST', {
        adminToken,
        editorToken,
        viewerToken,
        data: testData,
        expectedStatus: { admin: 200, editor: 200, viewer: 403 }
    });

    // Test PUT endpoint
    await testRoleBasedAccess(`${baseEndpoint}/${resourceId}`, 'PUT', {
        adminToken,
        editorToken,
        viewerToken,
        data: testData,
        expectedStatus: { admin: 200, editor: 200, viewer: 403 }
    });

    // Test DELETE endpoint
    await testRoleBasedAccess(`${baseEndpoint}/${resourceId}`, 'DELETE', {
        adminToken,
        editorToken,
        viewerToken,
        expectedStatus: { admin: 200, editor: 200, viewer: 403 }
    });
};

/**
 * Test authentication for public endpoints (no auth required)
 * @param {string} endpoint - The public endpoint to test
 * @param {string} method - HTTP method
 * @param {Object} data - Request body data
 * @param {number} expectedStatus - Expected status code (default: 200)
 */
export const testPublicEndpoint = async (endpoint, method = 'GET', data = null, expectedStatus = 200) => {
    const req = request(app)[method.toLowerCase()](endpoint);

    if (data) {
        req.send(data);
    }

    const response = await req;
    expect(response.status).toBe(expectedStatus);

    return response;
};

/**
 * Test invalid authentication scenarios
 * @param {string} endpoint - The endpoint to test
 * @param {string} method - HTTP method
 * @param {Object} data - Request body data
 */
export const testInvalidAuthentication = async (endpoint, method = 'GET', data = null) => {
    const invalidTokens = [
        'invalid-token',
        'Bearer invalid-token',
        'Bearer ',
        'invalid.bearer.token',
        null,
        undefined
    ];

    for (const token of invalidTokens) {
        const req = request(app)[method.toLowerCase()](endpoint);

        if (token) {
            req.set('Authorization', token);
        }

        if (data) {
            req.send(data);
        }

        const response = await req;
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Unauthorized');
    }
};

/**
 * Test authentication with expired tokens
 * @param {string} endpoint - The endpoint to test
 * @param {string} method - HTTP method
 * @param {string} expiredToken - Expired JWT token
 * @param {Object} data - Request body data
 */
export const testExpiredToken = async (endpoint, method = 'GET', expiredToken, data = null) => {
    const req = request(app)[method.toLowerCase()](endpoint)
        .set('Authorization', `Bearer ${expiredToken}`);

    if (data) {
        req.send(data);
    }

    const response = await req;
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
};

/**
 * Common authentication test patterns
 */
export const authTestPatterns = {
    /**
     * Test that an endpoint requires authentication
     */
    requiresAuth: async (endpoint, method = 'GET', data = null) => {
        await testUnauthenticatedAccess(endpoint, method, data);
    },

    /**
     * Test that an endpoint allows public access
     */
    allowsPublic: async (endpoint, method = 'GET', data = null, expectedStatus = 200) => {
        await testPublicEndpoint(endpoint, method, data, expectedStatus);
    },

    /**
     * Test role-based access control
     */
    roleBased: async (endpoint, method = 'GET', options = {}) => {
        await testRoleBasedAccess(endpoint, method, options);
    },

    /**
     * Test CRUD authentication patterns
     */
    crud: async (options = {}) => {
        await testCrudAuthentication(options);
    },

    /**
     * Test invalid authentication scenarios
     */
    invalidAuth: async (endpoint, method = 'GET', data = null) => {
        await testInvalidAuthentication(endpoint, method, data);
    }
};

/**
 * Helper to create test data for different scenarios
 */
export const createTestData = {
    /**
     * Create minimal form data for testing
     */
    form: (overrides = {}) => ({
        title: 'Test Form',
        fields: [
            {
                type: 'singleLine',
                label: 'Test Field',
                name: 'testField'
            }
        ],
        ...overrides
    }),

    /**
     * Create minimal category data for testing
     */
    category: (overrides = {}) => ({
        name: 'Test Category',
        description: 'Test category description',
        color: '#ff0000',
        ...overrides
    }),

    /**
     * Create minimal user data for testing
     */
    user: (overrides = {}) => ({
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: '$2b$10$test.hash',
        role: 'viewer',
        ...overrides
    })
};

/**
 * Helper to validate common response patterns
 */
export const validateResponse = {
    /**
     * Validate successful response structure
     */
    success: (response, expectedFields = []) => {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);

        if (expectedFields.length > 0) {
            expectedFields.forEach(field => {
                expect(response.body).toHaveProperty(field);
            });
        }
    },

    /**
     * Validate error response structure
     */
    error: (response, expectedStatus = 400, expectedError = null) => {
        expect(response.status).toBe(expectedStatus);
        expect(response.body).toHaveProperty('error');

        if (expectedError) {
            expect(response.body.error).toContain(expectedError);
        }
    },

    /**
     * Validate authentication error response
     */
    authError: (response) => {
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Unauthorized');
    },

    /**
     * Validate authorization error response
     */
    authzError: (response) => {
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Forbidden');
    },

    /**
     * Validate not found error response
     */
    notFound: (response) => {
        expect(response.status).toBe(404);
        expect(response.body.error).toContain('not found');
    }
};