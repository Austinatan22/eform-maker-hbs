/**
 * Minimal Frontend Integration Tests
 * 
 * Basic tests that don't require complex setup
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase, clearTestData, createTestAdmin } from './helpers/test-db-setup.js';
import request from 'supertest';
import { app } from '../src/server/app.js';
import jwt from 'jsonwebtoken';

describe('Minimal Frontend Integration Tests', () => {
    let testUser;
    let authToken;

    beforeEach(async () => {
        await setupTestDatabase();
        await clearTestData();

        // Create test admin user
        testUser = await createTestAdmin({
            email: 'minimal-test@example.com'
        });

        // Create JWT token directly
        authToken = jwt.sign(
            { sub: testUser.id, role: 'admin', email: testUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );
    });

    afterEach(async () => {
        await teardownTestDatabase();
    });

    describe('Builder Page Rendering', () => {
        test('should render builder page for new form', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('<!doctype html>');
            expect(response.text).toContain('<html');
        });

        test('should include SortableJS in builder page', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('sortablejs');
            expect(response.text).toContain('Sortable.min.js');
        });

        test('should include Quill rich text editor', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('quill.snow.css');
            expect(response.text).toContain('quill.min.js');
        });

        test('should include intl-tel-input for phone fields', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput.css');
            expect(response.text).toContain('intlTelInput.min.js');
        });
    });

    describe('Hosted Form Rendering', () => {
        test('should handle non-existent hosted form', async () => {
            const response = await request(app)
                .get('/f/non-existent-id');

            expect(response.status).toBe(404);
        });
    });
});
