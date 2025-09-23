/**
 * Simple Frontend Integration Tests
 * 
 * Basic tests that don't require complex setup
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase, clearTestData, createTestAdmin } from './helpers/test-db-setup.js';
import request from 'supertest';
import { app } from '../src/server/app.js';
import jwt from 'jsonwebtoken';

describe('Simple Frontend Integration Tests', () => {
    let testUser;
    let authToken;

    beforeEach(async () => {
        await setupTestDatabase();
        await clearTestData();

        // Create test admin user
        testUser = await createTestAdmin({
            email: 'simple-test@example.com'
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

    describe('Basic Page Rendering', () => {
        test('should render login page', async () => {
            const response = await request(app)
                .get('/login');

            expect(response.status).toBe(200);
            expect(response.text).toContain('<!doctype html>');
            expect(response.text).toContain('<html');
        });

        test('should render builder page for new form', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Add Field');
            expect(response.text).toContain('Edit Field');
        });

        test('should include SortableJS in builder page', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('sortablejs');
            expect(response.text).toContain('Sortable.min.js');
        });

        test('should include modular builder JavaScript', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('/src/client/builder/index.js');
            expect(response.text).toContain('BUILDER_USE_MODULAR');
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

    describe('Field Type Buttons', () => {
        test('should include all field type buttons', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type="singleLine"');
            expect(response.text).toContain('data-type="paragraph"');
            expect(response.text).toContain('data-type="dropdown"');
            expect(response.text).toContain('data-type="multipleChoice"');
            expect(response.text).toContain('data-type="checkboxes"');
            expect(response.text).toContain('data-type="number"');
            expect(response.text).toContain('data-type="name"');
            expect(response.text).toContain('data-type="email"');
            expect(response.text).toContain('data-type="phone"');
            expect(response.text).toContain('data-type="password"');
            expect(response.text).toContain('data-type="date"');
            expect(response.text).toContain('data-type="time"');
            expect(response.text).toContain('data-type="datetime"');
            expect(response.text).toContain('data-type="url"');
            expect(response.text).toContain('data-type="file"');
            expect(response.text).toContain('data-type="richText"');
        });

        test('should include preset buttons', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Yes / No');
            expect(response.text).toContain('NPS (1-10)');
            expect(response.text).toContain('Issue Type');
            expect(response.text).toContain('Consent');
        });
    });

    describe('Form Builder Interface', () => {
        test('should include form title editing', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('formTitle');
            expect(response.text).toContain('formTitleDisplay');
            expect(response.text).toContain('Save');
        });

        test('should include field editing form', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('editLabel');
            expect(response.text).toContain('editOptions');
            expect(response.text).toContain('editPlaceholder');
            expect(response.text).toContain('editName');
            expect(response.text).toContain('editRequired');
            expect(response.text).toContain('editDoNotStore');
        });

        test('should include preview area', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('id="preview"');
        });
    });

    describe('Authentication', () => {
        test('should require authentication for builder', async () => {
            const response = await request(app)
                .get('/builder/new');

            // Should redirect to login for HTML requests
            expect(response.status).toBe(302);
        });

        test('should allow authenticated access to builder', async () => {
            const response = await request(app)
                .get('/builder/new')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('Error Handling', () => {
        test('should handle non-existent builder form', async () => {
            const response = await request(app)
                .get('/builder/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
        });

        test('should handle non-existent hosted form', async () => {
            const response = await request(app)
                .get('/f/non-existent-id');

            expect(response.status).toBe(404);
        });
    });
});
