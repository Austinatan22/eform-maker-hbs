// tests/routes/templates-endpoints.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../helpers/test-db-setup.js';
import { User } from '../../src/server/models/User.js';
import { Template } from '../../src/server/models/Template.js';
import { Category } from '../../src/server/models/Category.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Templates API Endpoints', () => {
    let adminToken;
    let editorToken;
    let viewerToken;
    let testCategory;
    let testTemplate;

    beforeEach(async () => {
        // Clean up test data
        await Template.destroy({ where: {} });
        await Category.destroy({ where: {} });
        await AuditLog.destroy({ where: {} });
        await User.destroy({ where: {} });

        // Create test users
        const passwordHash = bcrypt.hashSync('testpassword123', 10);

        const adminUser = await User.create({
            id: 'u-test-admin',
            email: 'admin@test.com',
            username: 'testadmin',
            passwordHash,
            role: 'admin'
        });

        const editorUser = await User.create({
            id: 'u-test-editor',
            email: 'editor@test.com',
            username: 'testeditor',
            passwordHash,
            role: 'editor'
        });

        const viewerUser = await User.create({
            id: 'u-test-viewer',
            email: 'viewer@test.com',
            username: 'testviewer',
            passwordHash,
            role: 'viewer'
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
            description: 'Test category for templates',
            color: '#ff0000'
        });

        // Create test template
        testTemplate = await Template.create({
            id: 'template-test-1',
            name: 'Test Template',
            description: 'Test template description',
            categoryId: testCategory.id,
            fields: JSON.stringify([
                {
                    name: 'name',
                    label: 'Full Name',
                    type: 'singleLine',
                    required: true,
                    order: 1
                },
                {
                    name: 'email',
                    label: 'Email Address',
                    type: 'email',
                    required: true,
                    order: 2
                },
                {
                    name: 'message',
                    label: 'Message',
                    type: 'paragraph',
                    required: false,
                    order: 3
                }
            ]),
            isActive: true,
            createdBy: adminUser.id
        });
    });

    afterEach(async () => {
        // Clean up test data
        await Template.destroy({ where: {} });
        await Category.destroy({ where: {} });
        await AuditLog.destroy({ where: {} });
        await User.destroy({ where: {} });
    });

    describe('POST /api/templates', () => {
        test('should create template with valid data (admin)', async () => {
            const templateData = {
                name: 'New Test Template',
                description: 'A new test template',
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
                ],
                isActive: true
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('template');
            expect(response.body.template).toHaveProperty('id');
            expect(response.body.template.name).toBe('New Test Template');
            expect(response.body.template.fields).toHaveLength(2);

            // Verify template was created in database
            const createdTemplate = await Template.findByPk(response.body.template.id);
            expect(createdTemplate).toBeTruthy();
            expect(createdTemplate.name).toBe('New Test Template');
            expect(createdTemplate.isActive).toBe(true);

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'template',
                    action: 'create',
                    entityId: response.body.template.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should create template with valid data (editor)', async () => {
            const templateData = {
                name: 'Editor Template',
                description: 'Template created by editor',
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
                .post('/api/templates')
                .set('Authorization', `Bearer ${editorToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body.template.name).toBe('Editor Template');
        });

        test('should return 403 for viewer role', async () => {
            const templateData = {
                name: 'Viewer Template',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${viewerToken}`)
                .send(templateData);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 401 for unauthenticated request', async () => {
            const templateData = {
                name: 'Unauthenticated Template',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .send(templateData);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });

        test('should return 400 for missing name', async () => {
            const templateData = {
                description: 'Template without name',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Template name is required' });
        });

        test('should return 400 for invalid field types', async () => {
            const templateData = {
                name: 'Invalid Field Template',
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
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('validation failed');
        });

        test('should return 400 for duplicate field names', async () => {
            const templateData = {
                name: 'Duplicate Fields Template',
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
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Field names must be unique');
        });

        test('should return 400 for invalid category ID', async () => {
            const templateData = {
                name: 'Invalid Category Template',
                categoryId: 'nonexistent-category',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid category ID' });
        });

        test('should return 409 for duplicate template name', async () => {
            const templateData = {
                name: 'Test Template', // Same name as existing template
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(409);
            expect(response.body).toEqual({ error: 'Template name already exists. Choose another.' });
        });

        test('should return 413 for too many fields', async () => {
            const templateData = {
                name: 'Large Template',
                fields: Array.from({ length: 101 }, (_, i) => ({
                    name: `field${i}`,
                    label: `Field ${i}`,
                    type: 'singleLine',
                    order: i
                }))
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(413);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Too many fields');
        });

        test('should create template with all 16 field types', async () => {
            const templateData = {
                name: 'All Field Types Template',
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
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body.template.fields).toHaveLength(16);

            // Verify all field types were created
            const createdTemplate = await Template.findByPk(response.body.template.id);
            const fields = JSON.parse(createdTemplate.fields);
            expect(fields).toHaveLength(16);

            const fieldTypes = fields.map(f => f.type);
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

    describe('GET /api/templates', () => {
        test('should return all templates (admin)', async () => {
            const response = await request(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('templates');
            expect(Array.isArray(response.body.templates)).toBe(true);
            expect(response.body.templates.length).toBeGreaterThan(0);

            const template = response.body.templates[0];
            expect(template).toHaveProperty('id');
            expect(template).toHaveProperty('name');
            expect(template).toHaveProperty('fields');
            expect(Array.isArray(template.fields)).toBe(true);
        });

        test('should return all templates (editor)', async () => {
            const response = await request(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('templates');
        });

        test('should return all templates (viewer)', async () => {
            const response = await request(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('templates');
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/api/templates');

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('GET /api/templates/active', () => {
        beforeEach(async () => {
            // Create additional templates with different active states
            await Template.bulkCreate([
                {
                    id: 'template-active-1',
                    name: 'Active Template 1',
                    description: 'Active template',
                    fields: JSON.stringify([]),
                    isActive: true,
                    createdBy: 'u-test-admin'
                },
                {
                    id: 'template-inactive-1',
                    name: 'Inactive Template 1',
                    description: 'Inactive template',
                    fields: JSON.stringify([]),
                    isActive: false,
                    createdBy: 'u-test-admin'
                },
                {
                    id: 'template-active-2',
                    name: 'Active Template 2',
                    description: 'Another active template',
                    fields: JSON.stringify([]),
                    isActive: true,
                    createdBy: 'u-test-admin'
                }
            ]);
        });

        test('should return only active templates (admin)', async () => {
            const response = await request(app)
                .get('/api/templates/active')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('templates');
            expect(Array.isArray(response.body.templates)).toBe(true);

            // Should return 3 active templates (including the original testTemplate)
            expect(response.body.templates).toHaveLength(3);

            // All returned templates should be active
            response.body.templates.forEach(template => {
                expect(template.isActive).toBe(true);
            });
        });

        test('should return only active templates (editor)', async () => {
            const response = await request(app)
                .get('/api/templates/active')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(200);
            expect(response.body.templates).toHaveLength(3);
        });

        test('should return only active templates (viewer)', async () => {
            const response = await request(app)
                .get('/api/templates/active')
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.templates).toHaveLength(3);
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/api/templates/active');

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('GET /api/templates/:id', () => {
        test('should return specific template (admin)', async () => {
            const response = await request(app)
                .get(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('template');
            expect(response.body.template.id).toBe(testTemplate.id);
            expect(response.body.template.name).toBe('Test Template');
            expect(response.body.template.fields).toHaveLength(3);
        });

        test('should return specific template (editor)', async () => {
            const response = await request(app)
                .get(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(200);
            expect(response.body.template.id).toBe(testTemplate.id);
        });

        test('should return specific template (viewer)', async () => {
            const response = await request(app)
                .get(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.template.id).toBe(testTemplate.id);
        });

        test('should return 404 for non-existent template', async () => {
            const response = await request(app)
                .get('/api/templates/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not found' });
        });

        test('should return 400 for invalid template ID format', async () => {
            const response = await request(app)
                .get('/api/templates/invalid-id-format')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get(`/api/templates/${testTemplate.id}`);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('PUT /api/templates/:id', () => {
        test('should update template with valid data (admin)', async () => {
            const updateData = {
                name: 'Updated Test Template',
                description: 'Updated description',
                fields: [
                    {
                        name: 'updatedName',
                        label: 'Updated Name',
                        type: 'singleLine',
                        required: true,
                        order: 1
                    }
                ],
                isActive: false
            };

            const response = await request(app)
                .put(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('template');
            expect(response.body.template.name).toBe('Updated Test Template');
            expect(response.body.template.isActive).toBe(false);

            // Verify template was updated in database
            const updatedTemplate = await Template.findByPk(testTemplate.id);
            expect(updatedTemplate.name).toBe('Updated Test Template');
            expect(updatedTemplate.isActive).toBe(false);

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'template',
                    action: 'update',
                    entityId: testTemplate.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should update template with valid data (editor)', async () => {
            const updateData = {
                name: 'Editor Updated Template',
                fields: []
            };

            const response = await request(app)
                .put(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${editorToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.template.name).toBe('Editor Updated Template');
        });

        test('should return 403 for viewer role', async () => {
            const updateData = {
                name: 'Viewer Updated Template',
                fields: []
            };

            const response = await request(app)
                .put(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .send(updateData);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 404 for non-existent template', async () => {
            const updateData = {
                name: 'Updated Template',
                fields: []
            };

            const response = await request(app)
                .put('/api/templates/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not found' });
        });

        test('should return 400 for invalid update data', async () => {
            const updateData = {
                name: '', // Empty name should fail validation
                fields: []
            };

            const response = await request(app)
                .put(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Template name is required' });
        });

        test('should return 409 for duplicate template name on update', async () => {
            // Create another template
            await Template.create({
                id: 'template-test-2',
                name: 'Another Template',
                description: 'Another template',
                fields: JSON.stringify([]),
                isActive: true,
                createdBy: 'u-test-admin'
            });

            const updateData = {
                name: 'Another Template', // Same name as the other template
                fields: []
            };

            const response = await request(app)
                .put(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(409);
            expect(response.body).toEqual({ error: 'Template name already exists. Choose another.' });
        });

        test('should return 401 for unauthenticated request', async () => {
            const updateData = {
                name: 'Unauthenticated Update',
                fields: []
            };

            const response = await request(app)
                .put(`/api/templates/${testTemplate.id}`)
                .send(updateData);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('DELETE /api/templates/:id', () => {
        test('should delete template (admin)', async () => {
            const response = await request(app)
                .delete(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });

            // Verify template was deleted from database
            const deletedTemplate = await Template.findByPk(testTemplate.id);
            expect(deletedTemplate).toBeFalsy();

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'template',
                    action: 'delete',
                    entityId: testTemplate.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should delete template (editor)', async () => {
            const response = await request(app)
                .delete(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });
        });

        test('should return 403 for viewer role', async () => {
            const response = await request(app)
                .delete(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 404 for non-existent template', async () => {
            const response = await request(app)
                .delete('/api/templates/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not found' });
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .delete(`/api/templates/${testTemplate.id}`);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });
    });

    describe('GET /api/templates/check-name', () => {
        test('should return true for unique name', async () => {
            const response = await request(app)
                .get('/api/templates/check-name')
                .query({ name: 'Unique Template Name' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ available: true });
        });

        test('should return false for existing name', async () => {
            const response = await request(app)
                .get('/api/templates/check-name')
                .query({ name: 'Test Template' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ available: false });
        });

        test('should return 400 for missing name parameter', async () => {
            const response = await request(app)
                .get('/api/templates/check-name');

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Template Field Validation', () => {
        test('should validate required field constraints', async () => {
            const templateData = {
                name: 'Required Fields Template',
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
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body.template.fields).toHaveLength(2);

            const requiredField = response.body.template.fields.find(f => f.name === 'requiredField');
            const optionalField = response.body.template.fields.find(f => f.name === 'optionalField');

            expect(requiredField.required).toBe(true);
            expect(optionalField.required).toBe(false);
        });

        test('should validate field options for select/radio/checkbox fields', async () => {
            const templateData = {
                name: 'Options Template',
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
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body.template.fields).toHaveLength(3);

            const dropdownField = response.body.template.fields.find(f => f.name === 'dropdown');
            expect(dropdownField.options).toBe('Option 1,Option 2,Option 3');
        });

        test('should validate field order', async () => {
            const templateData = {
                name: 'Ordered Fields Template',
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
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body.template.fields).toHaveLength(3);

            // Fields should be returned in order
            expect(response.body.template.fields[0].name).toBe('first');
            expect(response.body.template.fields[1].name).toBe('second');
            expect(response.body.template.fields[2].name).toBe('third');
        });
    });

    describe('Template JSON Field Handling', () => {
        test('should properly serialize and deserialize fields JSON', async () => {
            const templateData = {
                name: 'JSON Test Template',
                fields: [
                    {
                        name: 'complexField',
                        label: 'Complex Field',
                        type: 'singleLine',
                        required: true,
                        order: 1,
                        placeholder: 'Enter text here',
                        validation: { minLength: 5, maxLength: 100 }
                    }
                ]
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);

            // Verify the template was stored correctly in database
            const createdTemplate = await Template.findByPk(response.body.template.id);
            expect(createdTemplate.fields).toBeTruthy();

            const fields = JSON.parse(createdTemplate.fields);
            expect(fields).toHaveLength(1);
            expect(fields[0].name).toBe('complexField');
            expect(fields[0].validation).toEqual({ minLength: 5, maxLength: 100 });
        });

        test('should handle empty fields array', async () => {
            const templateData = {
                name: 'Empty Fields Template',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body.template.fields).toHaveLength(0);

            // Verify in database
            const createdTemplate = await Template.findByPk(response.body.template.id);
            const fields = JSON.parse(createdTemplate.fields);
            expect(fields).toHaveLength(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed JSON requests', async () => {
            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Content-Type', 'application/json')
                .send('{"name": "Test", "fields": [}'); // Malformed JSON

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        test('should handle database connection errors gracefully', async () => {
            // Mock Template.create to throw an error
            const originalCreate = Template.create;
            Template.create = jest.fn().mockRejectedValue(new Error('Database connection failed'));

            const templateData = {
                name: 'Test Template',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Server error');

            // Restore original method
            Template.create = originalCreate;
        });

        test('should handle invalid JSON in fields', async () => {
            const templateData = {
                name: 'Invalid JSON Template',
                fields: 'invalid json string' // Should be an array
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('validation failed');
        });
    });

    describe('Audit Logging', () => {
        test('should log template creation', async () => {
            const templateData = {
                name: 'Audit Test Template',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'template',
                    action: 'create',
                    entityId: response.body.template.id
                }
            });

            expect(auditLog).toBeTruthy();
            expect(auditLog.metaJson).toContain('Audit Test Template');
        });

        test('should log template updates', async () => {
            const updateData = {
                name: 'Updated Audit Template',
                fields: []
            };

            const response = await request(app)
                .put(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'template',
                    action: 'update',
                    entityId: testTemplate.id
                }
            });

            expect(auditLog).toBeTruthy();
        });

        test('should log template deletions', async () => {
            const response = await request(app)
                .delete(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'template',
                    action: 'delete',
                    entityId: testTemplate.id
                }
            });

            expect(auditLog).toBeTruthy();
        });
    });

    describe('Template-Category Relationships', () => {
        test('should create template with category relationship', async () => {
            const templateData = {
                name: 'Categorized Template',
                description: 'Template with category',
                categoryId: testCategory.id,
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body.template.categoryId).toBe(testCategory.id);

            // Verify in database
            const createdTemplate = await Template.findByPk(response.body.template.id);
            expect(createdTemplate.categoryId).toBe(testCategory.id);
        });

        test('should update template category', async () => {
            // Create another category
            const anotherCategory = await Category.create({
                id: 'category-test-2',
                name: 'Another Category',
                description: 'Another test category',
                color: '#00ff00'
            });

            const updateData = {
                categoryId: anotherCategory.id
            };

            const response = await request(app)
                .put(`/api/templates/${testTemplate.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);

            // Verify in database
            const updatedTemplate = await Template.findByPk(testTemplate.id);
            expect(updatedTemplate.categoryId).toBe(anotherCategory.id);
        });

        test('should handle template without category', async () => {
            const templateData = {
                name: 'Uncategorized Template',
                fields: []
                // No categoryId provided
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body.template.categoryId).toBeNull();

            // Verify in database
            const createdTemplate = await Template.findByPk(response.body.template.id);
            expect(createdTemplate.categoryId).toBeNull();
        });
    });
});
