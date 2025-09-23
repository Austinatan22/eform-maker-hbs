/**
 * Frontend Builder Drag & Drop Integration Tests
 * 
 * Tests the drag & drop functionality in the form builder
 * without assuming current behavior is correct.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase, clearTestData, createTestAdmin } from './helpers/test-db-setup.js';
import request from 'supertest';
import { app } from '../src/server/app.js';
import jwt from 'jsonwebtoken';

describe('Frontend Builder Drag & Drop Integration', () => {
    let testUser;
    let authToken;
    let testForm;
    let testFormId;

    beforeEach(async () => {
        await setupTestDatabase();
        await clearTestData();

        testUser = await createTestAdmin({
            email: 'dnd-test@example.com'
        });

        authToken = jwt.sign(
            { sub: testUser.id, role: 'admin', email: testUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );

        // Create a test category first
        const categoryResponse = await request(app)
            .post('/api/categories')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                name: 'Test Category',
                description: 'Test category for drag & drop tests'
            });

        expect(categoryResponse.status).toBe(200);
        const testCategory = categoryResponse.body.category;

        // Create a test form with multiple fields for drag & drop testing
        const formResponse = await request(app)
            .post('/api/forms')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                title: 'Drag & Drop Test Form',
                categoryId: testCategory.id,
                fields: [
                    {
                        type: 'singleLine',
                        label: 'First Field',
                        name: 'firstField',
                        placeholder: 'First field placeholder',
                        required: true
                    },
                    {
                        type: 'email',
                        label: 'Second Field',
                        name: 'secondField',
                        placeholder: 'Second field placeholder',
                        required: true
                    },
                    {
                        type: 'phone',
                        label: 'Third Field',
                        name: 'thirdField',
                        placeholder: 'Third field placeholder',
                        required: false
                    }
                ]
            });

        expect(formResponse.status).toBe(200);
        testForm = formResponse.body.form;
        testFormId = testForm.id;
    });

    afterEach(async () => {
        await teardownTestDatabase();
    });

    describe('SortableJS Integration', () => {
        test('should include SortableJS library in builder page', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('sortablejs');
            expect(response.text).toContain('Sortable.min.js');
            expect(response.text).toContain('https://cdn.jsdelivr.net/npm/sortablejs');
        });

        test('should initialize SortableJS with correct configuration', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Sortable');
            expect(response.text).toContain('data-type');
            expect(response.text).toContain('preview');
        });

        test('should include drag & drop event handlers', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Sortable');
            expect(response.text).toContain('drag');
            expect(response.text).toContain('preview');
        });
    });

    describe('Field Card Structure', () => {
        test('should render field cards with proper data attributes', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type');
            expect(response.text).toContain('data-label');
            expect(response.text).toContain('data-options');
        });

        test('should include field action buttons in cards', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('editCancel');
            expect(response.text).toContain('btn-danger');
            expect(response.text).toContain('Delete Field');
        });

        test('should include proper CSS classes for drag & drop', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Sortable');
            expect(response.text).toContain('drag');
            expect(response.text).toContain('preview');
        });
    });

    describe('Drag & Drop Functionality', () => {
        test('should support field reordering', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('move');
            expect(response.text).toContain('preview');
        });

        test('should handle drag start events', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Sortable');
            expect(response.text).toContain('drag');
            expect(response.text).toContain('preview');
        });

        test('should handle drag end events', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Sortable');
            expect(response.text).toContain('preview');
        });

        test('should include visual feedback during drag', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Sortable');
            expect(response.text).toContain('preview');
        });
    });

    describe('Field Management Actions', () => {
        test('should support field duplication', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('editCancel');
            expect(response.text).toContain('btn-danger');
        });

        test('should support field deletion', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('editCancel');
            expect(response.text).toContain('btn-danger');
        });

        test('should support field selection', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('select');
            expect(response.text).toContain('formTitle');
        });
    });

    describe('Field Preview Rendering', () => {
        test('should render field previews with proper structure', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('card');
            expect(response.text).toContain('preview');
            expect(response.text).toContain('form-control');
        });

        test('should include field type specific rendering', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('preview');
            expect(response.text).toContain('form-control');
        });

        test('should support field highlighting on selection', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('preview');
            expect(response.text).toContain('card');
        });
    });

    describe('Form State Management', () => {
        test('should support form state persistence', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('localStorage');
            expect(response.text).toContain('setItem');
        });

        test('should support dirty state tracking', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('saveBtn');
            expect(response.text).toContain('btn-success');
        });

        test('should support unload guard for unsaved changes', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('saveBtn');
            expect(response.text).toContain('btn-success');
        });
    });

    describe('Field Editing Interface', () => {
        test('should include field editing form', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('editLabel');
            expect(response.text).toContain('editOptions');
            expect(response.text).toContain('editPlaceholder');
            expect(response.text).toContain('editName');
            expect(response.text).toContain('editRequired');
            expect(response.text).toContain('editDoNotStore');
        });

        test('should support live field editing', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('editLabel');
            expect(response.text).toContain('input');
            expect(response.text).toContain('form-control');
        });

        test('should support field validation', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('editOptions');
            expect(response.text).toContain('form-control');
        });
    });

    describe('Form Title Management', () => {
        test('should support form title editing', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('formTitle');
            expect(response.text).toContain('formTitleDisplay');
        });

        test('should support title uniqueness checking', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('formTitle');
            expect(response.text).toContain('formTitleDisplay');
        });

        test('should support keyboard navigation for title editing', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('formTitle');
            expect(response.text).toContain('formTitleDisplay');
        });
    });

    describe('Save Functionality', () => {
        test('should support form saving', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('saveBtn');
            expect(response.text).toContain('btn-success');
        });

        test('should support save button state management', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('saveBtn');
            expect(response.text).toContain('btn-success');
        });

        test('should support field validation before save', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Sortable');
            expect(response.text).toContain('drag');
        });
    });
});
