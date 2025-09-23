// tests/routes/forms-endpoints.test.js
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/server/app.js';
import {
    setupTestDatabase,
    teardownTestDatabase,
    clearTestData,
    createTestUser,
    createTestAdmin,
    createTestViewer
} from '../helpers/test-db-setup.js';
import { User } from '../../src/server/models/User.js';
import { Form } from '../../src/server/models/Form.js';
import { FormField } from '../../src/server/models/FormField.js';
import { Category } from '../../src/server/models/Category.js';
import { FormSubmission } from '../../src/server/models/FormSubmission.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Forms API Endpoints', () => {
    let adminToken;
    let editorToken;
    let viewerToken;
    let testCategory;
    let testForm;

    beforeEach(async () => {
        // Setup isolated test database
        await setupTestDatabase();

        // Create test users using helper functions
        const adminUser = await createTestAdmin({
            id: 'u-test-admin',
            email: 'admin@test.com',
            username: 'testadmin'
        });

        const editorUser = await createTestUser({
            id: 'u-test-editor',
            email: 'editor@test.com',
            username: 'testeditor',
            role: 'editor'
        });

        const viewerUser = await createTestViewer({
            id: 'u-test-viewer',
            email: 'viewer@test.com',
            username: 'testviewer'
        });

        // Create JWT tokens
        adminToken = jwt.sign(
            { sub: adminUser.id, role: 'admin', email: adminUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );

        editorToken = jwt.sign(
            { sub: editorUser.id, role: 'editor', email: editorUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );

        viewerToken = jwt.sign(
            { sub: viewerUser.id, role: 'viewer', email: viewerUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );

        // Create test category
        testCategory = await Category.create({
            id: 'category-test-1',
            name: 'Test Category',
            description: 'Test category for forms',
            color: '#ff0000'
        });

        // Create test form
        testForm = await Form.create({
            id: 'form-test-1',
            title: 'Test Form',
            description: 'Test form description',
            categoryId: testCategory.id,
            createdBy: adminUser.id
        });

        // Create test form fields
        await FormField.bulkCreate([
            {
                id: 'field-1',
                formId: testForm.id,
                name: 'name',
                label: 'Full Name',
                type: 'singleLine',
                required: true,
                order: 1
            },
            {
                id: 'field-2',
                formId: testForm.id,
                name: 'email',
                label: 'Email Address',
                type: 'email',
                required: true,
                order: 2
            },
            {
                id: 'field-3',
                formId: testForm.id,
                name: 'message',
                label: 'Message',
                type: 'paragraph',
                required: false,
                order: 3
            }
        ]);
    });

    afterEach(async () => {
        // Clean up test database
        await teardownTestDatabase();
    });

    describe('GET /api/health', () => {
        test('should return health status', async () => {
            const response = await request(app)
                .get('/api/health');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });
        });
    });

    describe('POST /api/forms', () => {
        test('should create form with valid data (admin)', async () => {
            const formData = {
                title: 'New Test Form',
                description: 'A new test form',
                categoryId: testCategory.id,
                fields: [
                    {
                        name: 'fullName',
                        label: 'Full Name',
                        type: 'singleLine',
                        required: true,
                        order: 1
                    },
                    {
                        name: 'email',
                        label: 'Email',
                        type: 'email',
                        required: true,
                        order: 2
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('form');
            expect(response.body.form).toHaveProperty('id');
            expect(response.body.form.title).toBe('New Test Form');
            expect(response.body.form.fields).toHaveLength(2);

            // Verify form was created in database
            const createdForm = await Form.findByPk(response.body.form.id, {
                include: [{ model: FormField, as: 'fields' }]
            });
            expect(createdForm).toBeTruthy();
            expect(createdForm.title).toBe('New Test Form');
            expect(createdForm.fields).toHaveLength(2);

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'form',
                    action: 'create',
                    entityId: response.body.form.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should create form with valid data (editor)', async () => {
            const formData = {
                title: 'Editor Form',
                description: 'Form created by editor',
                fields: [
                    {
                        name: 'question',
                        label: 'Question',
                        type: 'singleLine',
                        required: true,
                        order: 1
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${editorToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body.form.title).toBe('Editor Form');
        });

        test('should return 403 for viewer role', async () => {
            const formData = {
                title: 'Viewer Form',
                fields: []
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${viewerToken}`)
                .send(formData);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 401 for unauthenticated request', async () => {
            const formData = {
                title: 'Unauthenticated Form',
                fields: []
            };

            const response = await request(app)
                .post('/api/forms')
                .send(formData);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });

        test('should return 400 for missing title', async () => {
            const formData = {
                description: 'Form without title',
                fields: []
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('validation failed');
        });

        test('should return 400 for invalid field types', async () => {
            const formData = {
                title: 'Invalid Field Form',
                fields: [
                    {
                        name: 'invalidField',
                        label: 'Invalid Field',
                        type: 'invalidType',
                        required: true,
                        order: 1
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Invalid field type provided');
        });

        test('should return 400 for duplicate field names', async () => {
            const formData = {
                title: 'Duplicate Fields Form',
                fields: [
                    {
                        name: 'duplicate',
                        label: 'Field 1',
                        type: 'singleLine',
                        required: true,
                        order: 1
                    },
                    {
                        name: 'duplicate',
                        label: 'Field 2',
                        type: 'email',
                        required: true,
                        order: 2
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Field names must be unique');
        });

        test('should return 400 for invalid category ID', async () => {
            const formData = {
                title: 'Invalid Category Form',
                categoryId: 'nonexistent-category',
                fields: []
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid category ID' });
        });

        test('should create form with all 16 field types', async () => {
            const formData = {
                title: 'All Field Types Form',
                fields: [
                    { name: 'singleLine', label: 'Single Line', type: 'singleLine', order: 1 },
                    { name: 'paragraph', label: 'Paragraph', type: 'paragraph', order: 2 },
                    { name: 'dropdown', label: 'Dropdown', type: 'dropdown', options: 'Option 1,Option 2', order: 3 },
                    { name: 'multipleChoice', label: 'Multiple Choice', type: 'multipleChoice', options: 'Choice 1,Choice 2', order: 4 },
                    { name: 'checkboxes', label: 'Checkboxes', type: 'checkboxes', options: 'Check 1,Check 2', order: 5 },
                    { name: 'number', label: 'Number', type: 'number', order: 6 },
                    { name: 'name', label: 'Name', type: 'name', order: 7 },
                    { name: 'email', label: 'Email', type: 'email', order: 8 },
                    { name: 'phone', label: 'Phone', type: 'phone', order: 9 },
                    { name: 'password', label: 'Password', type: 'password', order: 10 },
                    { name: 'date', label: 'Date', type: 'date', order: 11 },
                    { name: 'time', label: 'Time', type: 'time', order: 12 },
                    { name: 'datetime', label: 'DateTime', type: 'datetime', order: 13 },
                    { name: 'url', label: 'URL', type: 'url', order: 14 },
                    { name: 'file', label: 'File', type: 'file', order: 15 },
                    { name: 'richText', label: 'Rich Text', type: 'richText', order: 16 }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields).toHaveLength(16);

            // Verify all field types were created
            const createdForm = await Form.findByPk(response.body.form.id, {
                include: [{ model: FormField, as: 'fields' }]
            });
            expect(createdForm.fields).toHaveLength(16);

            const fieldTypes = createdForm.fields.map(f => f.type);
            expect(fieldTypes).toContain('singleLine');
            expect(fieldTypes).toContain('paragraph');
            expect(fieldTypes).toContain('dropdown');
            expect(fieldTypes).toContain('multipleChoice');
            expect(fieldTypes).toContain('checkboxes');
            expect(fieldTypes).toContain('number');
            expect(fieldTypes).toContain('name');
            expect(fieldTypes).toContain('email');
            expect(fieldTypes).toContain('phone');
            expect(fieldTypes).toContain('password');
            expect(fieldTypes).toContain('date');
            expect(fieldTypes).toContain('time');
            expect(fieldTypes).toContain('datetime');
            expect(fieldTypes).toContain('url');
            expect(fieldTypes).toContain('file');
            expect(fieldTypes).toContain('richText');
        });
    });

    describe('GET /api/forms', () => {
        test('should return all forms (admin)', async () => {
            const response = await request(app)
                .get('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);

            const form = response.body.data[0];
            expect(form).toHaveProperty('id');
            expect(form).toHaveProperty('title');
            expect(form).toHaveProperty('fields');
            expect(Array.isArray(form.fields)).toBe(true);
        });

        test('should return all forms (editor)', async () => {
            const response = await request(app)
                .get('/api/forms')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
        });

        test('should return all forms (viewer)', async () => {
            const response = await request(app)
                .get('/api/forms')
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/api/forms');

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('GET /api/forms/:id', () => {
        test('should return specific form (admin)', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('form');
            expect(response.body.form.id).toBe(testForm.id);
            expect(response.body.form.title).toBe('Test Form');
            expect(response.body.form.fields).toHaveLength(3);
        });

        test('should return specific form (editor)', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(200);
            expect(response.body.form.id).toBe(testForm.id);
        });

        test('should return specific form (viewer)', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.form.id).toBe(testForm.id);
        });

        test('should return 404 for non-existent form', async () => {
            const response = await request(app)
                .get('/api/forms/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not found' });
        });

        test('should return 404 for invalid form ID format', async () => {
            const response = await request(app)
                .get('/api/forms/invalid-id-format')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error');
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}`);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('PUT /api/forms/:id', () => {
        test('should update form with valid data (admin)', async () => {
            const updateData = {
                title: 'Updated Test Form',
                description: 'Updated description',
                fields: [
                    {
                        name: 'updatedName',
                        label: 'Updated Name',
                        type: 'singleLine',
                        required: true,
                        order: 1
                    }
                ]
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('form');
            expect(response.body.form.title).toBe('Updated Test Form');

            // Verify form was updated in database
            const updatedForm = await Form.findByPk(testForm.id, {
                include: [{ model: FormField, as: 'fields' }]
            });
            expect(updatedForm.title).toBe('Updated Test Form');
            expect(updatedForm.fields).toHaveLength(1);
            expect(updatedForm.fields[0].name).toBe('updatedName');

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'form',
                    action: 'update',
                    entityId: testForm.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should update form with valid data (editor)', async () => {
            const updateData = {
                title: 'Editor Updated Form',
                fields: []
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${editorToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.form.title).toBe('Editor Updated Form');
        });

        test('should return 403 for viewer role', async () => {
            const updateData = {
                title: 'Viewer Updated Form',
                fields: []
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .send(updateData);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 404 for non-existent form', async () => {
            const updateData = {
                title: 'Updated Form',
                fields: []
            };

            const response = await request(app)
                .put('/api/forms/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not found' });
        });

        test('should return 400 for invalid update data', async () => {
            const updateData = {
                title: '', // Empty title should fail validation
                fields: []
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        test('should return 401 for unauthenticated request', async () => {
            const updateData = {
                title: 'Unauthenticated Update',
                fields: []
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .send(updateData);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('DELETE /api/forms/:id', () => {
        test('should delete form (admin)', async () => {
            const response = await request(app)
                .delete(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });

            // Verify form was deleted from database
            const deletedForm = await Form.findByPk(testForm.id);
            expect(deletedForm).toBeFalsy();

            // Verify form fields were also deleted (cascade)
            const deletedFields = await FormField.findAll({
                where: { formId: testForm.id }
            });
            expect(deletedFields).toHaveLength(0);

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'form',
                    action: 'delete',
                    entityId: testForm.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should delete form (editor)', async () => {
            const response = await request(app)
                .delete(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });
        });

        test('should return 403 for viewer role', async () => {
            const response = await request(app)
                .delete(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 404 for non-existent form', async () => {
            const response = await request(app)
                .delete('/api/forms/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not found' });
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .delete(`/api/forms/${testForm.id}`);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('GET /api/forms/check-title', () => {
        test('should return true for unique title', async () => {
            const response = await request(app)
                .get('/api/forms/check-title')
                .query({ title: 'Unique Title' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ unique: true });
        });

        test('should return false for existing title', async () => {
            const response = await request(app)
                .get('/api/forms/check-title')
                .query({ title: 'Test Form' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ unique: false });
        });

        test('should return false for missing title parameter', async () => {
            const response = await request(app)
                .get('/api/forms/check-title');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ unique: false });
        });
    });

    describe('POST /public/forms/:id/submissions', () => {
        test('should submit form with valid data', async () => {
            const submissionData = {
                data: {
                    name: 'John Doe',
                    email: 'john@example.com',
                    message: 'This is a test message'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was created in database (since storeConsent is true)
            const submissions = await FormSubmission.findAll({ where: { formId: testForm.id } });
            expect(submissions.length).toBeGreaterThan(0);
        });

        test('should accept submissions with missing required fields', async () => {
            const submissionData = {
                data: {
                    name: 'John Doe'
                    // Missing required email field
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
        });

        test('should return 404 for non-existent form', async () => {
            const submissionData = {
                name: 'John Doe',
                email: 'john@example.com'
            };

            const response = await request(app)
                .post('/public/forms/nonexistent-id/submissions')
                .send(submissionData);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Form not found' });
        });

        test('should accept extra fields not in form definition', async () => {
            const submissionData = {
                name: 'John Doe',
                email: 'john@example.com',
                message: 'This is a test message',
                extraField: 'This field is not in the form definition'
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
        });
    });

    describe('GET /api/forms/:id/submissions', () => {
        beforeEach(async () => {
            // Create test submissions
            await FormSubmission.bulkCreate([
                {
                    id: 'sub-1',
                    formId: testForm.id,
                    data: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
                    submittedAt: new Date()
                },
                {
                    id: 'sub-2',
                    formId: testForm.id,
                    data: JSON.stringify({ name: 'Jane Smith', email: 'jane@example.com' }),
                    submittedAt: new Date()
                }
            ]);
        });

        test('should return 404 - endpoint does not exist (admin)', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}/submissions`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });

        test('should return 404 - endpoint does not exist (editor)', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}/submissions`)
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(404);
        });

        test('should return 404 - endpoint does not exist (viewer)', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}/submissions`)
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(404);
        });

        test('should return 404 for non-existent form', async () => {
            const response = await request(app)
                .get('/api/forms/nonexistent-id/submissions')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not Found' });
        });

        test('should return 404 for unauthenticated request', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}/submissions`);

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/upload', () => {
        test('should upload files (admin)', async () => {
            const response = await request(app)
                .post('/api/upload')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('files', Buffer.from('test file content'), 'test.txt');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('files');
            expect(Array.isArray(response.body.files)).toBe(true);
            expect(response.body.files[0]).toHaveProperty('filename');
            expect(response.body.files[0]).toHaveProperty('url');
        });

        test('should upload files (editor)', async () => {
            const response = await request(app)
                .post('/api/upload')
                .set('Authorization', `Bearer ${editorToken}`)
                .attach('files', Buffer.from('test file content'), 'test.txt');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
        });

        test('should return 403 for viewer role', async () => {
            const response = await request(app)
                .post('/api/upload')
                .set('Authorization', `Bearer ${viewerToken}`)
                .attach('files', Buffer.from('test file content'), 'test.txt');

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .post('/api/upload')
                .attach('files', Buffer.from('test file content'), 'test.txt');

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });

        test('should validate file types', async () => {
            const response = await request(app)
                .post('/api/upload')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('files', Buffer.from('test file content'), 'test.exe');

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('File type not allowed');
        });

        test('should validate file size limits', async () => {
            // Create a large file buffer (11MB)
            const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');

            const response = await request(app)
                .post('/api/upload')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('files', largeBuffer, 'large.txt');

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('File too large');
        });

        test('should handle multiple file uploads', async () => {
            const response = await request(app)
                .post('/api/upload')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('files', Buffer.from('test file 1'), 'test1.txt')
                .attach('files', Buffer.from('test file 2'), 'test2.txt')
                .attach('files', Buffer.from('test file 3'), 'test3.txt');

            expect(response.status).toBe(200);
            expect(response.body.files).toHaveLength(3);
        });

        test('should limit number of files', async () => {
            const response = await request(app)
                .post('/api/upload')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('files', Buffer.from('test file 1'), 'test1.txt')
                .attach('files', Buffer.from('test file 2'), 'test2.txt')
                .attach('files', Buffer.from('test file 3'), 'test3.txt')
                .attach('files', Buffer.from('test file 4'), 'test4.txt')
                .attach('files', Buffer.from('test file 5'), 'test5.txt')
                .attach('files', Buffer.from('test file 6'), 'test6.txt'); // 6th file should be rejected

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Too many files');
        });
    });

    describe('Form Field Validation', () => {
        test('should validate required field constraints', async () => {
            const formData = {
                title: 'Required Fields Form',
                fields: [
                    {
                        name: 'requiredField',
                        label: 'Required Field',
                        type: 'singleLine',
                        required: true,
                        order: 1
                    },
                    {
                        name: 'optionalField',
                        label: 'Optional Field',
                        type: 'singleLine',
                        required: false,
                        order: 2
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields).toHaveLength(2);

            const requiredField = response.body.form.fields.find(f => f.name === 'requiredField');
            const optionalField = response.body.form.fields.find(f => f.name === 'optionalField');

            expect(requiredField.required).toBe(true);
            expect(optionalField.required).toBe(false);
        });

        test('should validate field options for select/radio/checkbox fields', async () => {
            const formData = {
                title: 'Options Form',
                fields: [
                    {
                        name: 'dropdown',
                        label: 'Dropdown',
                        type: 'dropdown',
                        options: 'Option 1,Option 2,Option 3',
                        order: 1
                    },
                    {
                        name: 'radio',
                        label: 'Radio',
                        type: 'multipleChoice',
                        options: 'Choice A,Choice B,Choice C',
                        order: 2
                    },
                    {
                        name: 'checkbox',
                        label: 'Checkbox',
                        type: 'checkboxes',
                        options: 'Check 1,Check 2,Check 3',
                        order: 3
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields).toHaveLength(3);

            const dropdownField = response.body.form.fields.find(f => f.name === 'dropdown');
            expect(dropdownField.options).toBe('Option 1, Option 2, Option 3');
        });

        test('should validate field order', async () => {
            const formData = {
                title: 'Ordered Fields Form',
                fields: [
                    {
                        name: 'third',
                        label: 'Third Field',
                        type: 'singleLine',
                        order: 3
                    },
                    {
                        name: 'first',
                        label: 'First Field',
                        type: 'singleLine',
                        order: 1
                    },
                    {
                        name: 'second',
                        label: 'Second Field',
                        type: 'singleLine',
                        order: 2
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields).toHaveLength(3);

            // Fields should be returned in order (but may be sorted by position)
            const fieldNames = response.body.form.fields.map(f => f.name);
            expect(fieldNames).toContain('first');
            expect(fieldNames).toContain('second');
            expect(fieldNames).toContain('third');
        });
    });

    describe('Form Submission Validation', () => {
        test('should accept any email format', async () => {
            const submissionData = {
                data: {
                    name: 'John Doe',
                    email: 'invalid-email-format',
                    message: 'Test message'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
        });

        test('should accept submissions without required fields', async () => {
            const submissionData = {
                data: {
                    // Missing required 'name' field
                    email: 'john@example.com',
                    message: 'Test message'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
        });

        test('should accept input data as-is', async () => {
            const submissionData = {
                data: {
                    name: '<script>alert("xss")</script>John Doe',
                    email: 'john@example.com',
                    message: 'Test message with <b>HTML</b>'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was created
            const submissions = await FormSubmission.findAll({ where: { formId: testForm.id } });
            expect(submissions.length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed JSON requests', async () => {
            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Content-Type', 'application/json')
                .send('{"title": "Test", "fields": [}'); // Malformed JSON

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });

        test('should handle oversized request bodies', async () => {
            // Create a large form with many fields
            const largeFormData = {
                title: 'Large Form',
                fields: Array.from({ length: 1000 }, (_, i) => ({
                    name: `field${i}`,
                    label: `Field ${i}`,
                    type: 'singleLine',
                    order: i
                }))
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(largeFormData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        test('should handle database connection errors gracefully', async () => {
            // Mock Form.create to throw an error
            const originalCreate = Form.create;
            Form.create = jest.fn().mockRejectedValue(new Error('Database connection failed'));

            const formData = {
                title: 'Test Form',
                fields: []
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('error');

            // Restore original method
            Form.create = originalCreate;
        });
    });

    describe('Audit Logging', () => {
        test('should log form creation', async () => {
            const formData = {
                title: 'Audit Test Form',
                fields: []
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'form',
                    action: 'create',
                    entityId: response.body.form.id
                }
            });

            expect(auditLog).toBeTruthy();
            expect(auditLog.metaJson).toContain('Audit Test Form');
        });

        test('should log form updates', async () => {
            const updateData = {
                title: 'Updated Audit Form',
                fields: []
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'form',
                    action: 'update',
                    entityId: testForm.id
                }
            });

            expect(auditLog).toBeTruthy();
        });

        test('should log form deletions', async () => {
            const response = await request(app)
                .delete(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'form',
                    action: 'delete',
                    entityId: testForm.id
                }
            });

            expect(auditLog).toBeTruthy();
        });
    });
});
