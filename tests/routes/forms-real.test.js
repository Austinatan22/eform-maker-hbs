// tests/routes/forms-real.test.js
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import formsRoutes from '../../src/server/routes/forms.routes.js';
import {
    setupTestDatabase,
    teardownTestDatabase,
    clearTestData,
    createTestUser,
    createTestAdmin,
    createTestViewer,
    generateTestJWT
} from '../helpers/test-db-setup.js';
import bcrypt from 'bcryptjs';

describe('Form CRUD Operations - Real Application Tests', () => {
    let app;
    let testUser;
    let testAdmin;
    let testViewer;
    let testCategory;
    let adminToken;
    let editorToken;
    let viewerToken;

    beforeEach(async () => {
        // Enable authentication for tests
        process.env.AUTH_ENABLED = '1';
        process.env.JWT_SECRET = 'dev_jwt_secret_change_me';

        // Setup isolated test database
        await setupTestDatabase();

        // Create test users with real password hashes
        testUser = await createTestUser({
            email: 'editor@example.com',
            passwordHash: await bcrypt.hash('password123', 10),
            role: 'editor'
        });

        testAdmin = await createTestAdmin({
            email: 'admin@example.com',
            passwordHash: await bcrypt.hash('admin123', 10),
            role: 'admin'
        });

        testViewer = await createTestViewer({
            email: 'viewer@example.com',
            passwordHash: await bcrypt.hash('viewer123', 10),
            role: 'viewer'
        });

        // Create test category
        const { Category } = await import('../../src/server/models/Category.js');
        testCategory = await Category.create({
            id: 'cat-001',
            name: 'Test Category',
            description: 'A test category',
            color: '#ff0000'
        });

        // Generate JWT tokens for API testing
        adminToken = await generateTestJWT(testAdmin);
        editorToken = await generateTestJWT(testUser);
        viewerToken = await generateTestJWT(testViewer);

        // Setup Express app with real forms routes
        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(session({
            secret: 'test-session-secret',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: false }
        }));

        // Configure Handlebars view engine for tests
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        app.engine('hbs', engine({
            extname: '.hbs',
            defaultLayout: false,
            layoutsDir: path.join(__dirname, '../../views/layouts')
        }));
        app.set('view engine', 'hbs');
        app.set('views', path.join(__dirname, '../../views'));

        // Use REAL forms routes
        app.use('/', formsRoutes);
    });

    afterEach(async () => {
        await clearTestData();
        await teardownTestDatabase();
    });

    describe('POST /api/forms', () => {
        it('should create a form with valid data', async () => {
            const formData = {
                title: 'Test Form',
                categoryId: testCategory.id,
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name',
                        required: true
                    },
                    {
                        type: 'email',
                        label: 'Email',
                        name: 'email',
                        required: true
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData)
                .expect(200);

            expect(response.body).toHaveProperty('form');
            expect(response.body.form.title).toBe('Test Form');
            expect(response.body.form.fields).toHaveLength(2);
            expect(response.body.form.fields[0].type).toBe('singleLine');
            expect(response.body.form.fields[1].type).toBe('email');
        });

        it('should fail to create form with duplicate title', async () => {
            // First, create a form
            const formData = {
                title: 'Duplicate Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name'
                    }
                ]
            };

            await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData)
                .expect(200);

            // Now try to create another form with the same title
            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData)
                .expect(409);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('already exists');
        });

        it('should fail to create form with empty title', async () => {
            const formData = {
                title: '',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should fail to create form with invalid field data', async () => {
            const formData = {
                title: 'Test Form',
                fields: [
                    {
                        type: 'invalidType',
                        label: 'Name',
                        name: 'name'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should fail to create form with duplicate field names', async () => {
            const formData = {
                title: 'Test Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name'
                    },
                    {
                        type: 'email',
                        label: 'Email',
                        name: 'name' // Duplicate name
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(formData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should require authentication to create form', async () => {
            const formData = {
                title: 'Test Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .send(formData)
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('should require admin or editor role to create form', async () => {
            const formData = {
                title: 'Test Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${viewerToken}`)
                .send(formData)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /api/forms/:id', () => {
        let testForm;

        beforeEach(async () => {
            // Create a test form
            const { Form } = await import('../../src/server/models/Form.js');
            const { FormField } = await import('../../src/server/models/FormField.js');

            testForm = await Form.create({
                id: 'form-001',
                title: 'Test Form',
                categoryId: testCategory.id,
                createdBy: testAdmin.id
            });

            await FormField.create({
                id: 'field-001',
                formId: testForm.id,
                type: 'singleLine',
                label: 'Name',
                name: 'name',
                required: true,
                position: 0
            });

            await FormField.create({
                id: 'field-002',
                formId: testForm.id,
                type: 'email',
                label: 'Email',
                name: 'email',
                required: true,
                position: 1
            });
        });

        it('should read form by ID with fields', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('form');
            expect(response.body.form.id).toBe(testForm.id);
            expect(response.body.form.title).toBe('Test Form');
            expect(response.body.form.fields).toHaveLength(2);
            expect(response.body.form.fields[0].type).toBe('singleLine');
            expect(response.body.form.fields[1].type).toBe('email');
        });

        it('should return 404 for non-existent form', async () => {
            const response = await request(app)
                .get('/api/forms/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

        it('should require authentication to read form', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}`)
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('should allow viewers to read forms', async () => {
            const response = await request(app)
                .get(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('form');
            expect(response.body.form.id).toBe(testForm.id);
        });
    });

    describe('GET /api/forms', () => {
        beforeEach(async () => {
            // Create test forms
            const { Form } = await import('../../src/server/models/Form.js');
            const { FormField } = await import('../../src/server/models/FormField.js');

            const form1 = await Form.create({
                id: 'form-001',
                title: 'Form 1',
                categoryId: testCategory.id,
                createdBy: testAdmin.id
            });

            const form2 = await Form.create({
                id: 'form-002',
                title: 'Form 2',
                createdBy: testAdmin.id
            });

            await FormField.create({
                id: 'field-001',
                formId: form1.id,
                type: 'singleLine',
                label: 'Name',
                name: 'name',
                position: 0
            });

            await FormField.create({
                id: 'field-002',
                formId: form2.id,
                type: 'email',
                label: 'Email',
                name: 'email',
                position: 0
            });
        });

        it('should list all forms with pagination', async () => {
            const response = await request(app)
                .get('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThanOrEqual(2);
        });

        it('should include form fields and category information', async () => {
            const response = await request(app)
                .get('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            const forms = response.body.data;

            // Find the form with category
            const formWithCategory = forms.find(f => f.categoryId === testCategory.id);
            expect(formWithCategory).toBeDefined();
            expect(formWithCategory.category).toBeDefined();
            expect(formWithCategory.category.name).toBe('Test Category');
            expect(formWithCategory.fields).toBeDefined();
            expect(formWithCategory.fields.length).toBeGreaterThan(0);
        });

        it('should require authentication to list forms', async () => {
            const response = await request(app)
                .get('/api/forms')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('PUT /api/forms/:id', () => {
        let testForm;

        beforeEach(async () => {
            // Create a test form
            const { Form } = await import('../../src/server/models/Form.js');
            const { FormField } = await import('../../src/server/models/FormField.js');

            testForm = await Form.create({
                id: 'form-001',
                title: 'Original Title',
                createdBy: testAdmin.id
            });

            await FormField.create({
                id: 'field-001',
                formId: testForm.id,
                type: 'singleLine',
                label: 'Original Label',
                name: 'originalName',
                position: 0
            });
        });

        it('should update form title', async () => {
            const updateData = {
                title: 'Updated Title'
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body).toHaveProperty('form');
            expect(response.body.form.title).toBe('Updated Title');
        });

        it('should update form fields', async () => {
            const updateData = {
                fields: [
                    {
                        type: 'email',
                        label: 'Updated Email',
                        name: 'updatedEmail',
                        required: true
                    }
                ]
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body).toHaveProperty('form');
            expect(response.body.form.fields).toHaveLength(1);
            expect(response.body.form.fields[0].type).toBe('email');
            expect(response.body.form.fields[0].label).toBe('Updated Email');
        });

        it('should update form category', async () => {
            const updateData = {
                categoryId: testCategory.id
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body).toHaveProperty('form');
            expect(response.body.form.categoryId).toBe(testCategory.id);
        });

        it('should fail to update with duplicate title', async () => {
            // Create another form with a different title
            const { Form } = await import('../../src/server/models/Form.js');
            await Form.create({
                id: 'form-002',
                title: 'Existing Title',
                createdBy: testAdmin.id
            });

            const updateData = {
                title: 'Existing Title'
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(409);

            expect(response.body).toHaveProperty('error');
        });

        it('should return 404 for non-existent form', async () => {
            const updateData = {
                title: 'Updated Title'
            };

            const response = await request(app)
                .put('/api/forms/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

        it('should require authentication to update form', async () => {
            const updateData = {
                title: 'Updated Title'
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .send(updateData)
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('should require admin or editor role to update form', async () => {
            const updateData = {
                title: 'Updated Title'
            };

            const response = await request(app)
                .put(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .send(updateData)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('DELETE /api/forms/:id', () => {
        let testForm;

        beforeEach(async () => {
            // Create a test form
            const { Form } = await import('../../src/server/models/Form.js');
            const { FormField } = await import('../../src/server/models/FormField.js');

            testForm = await Form.create({
                id: 'form-001',
                title: 'Test Form',
                createdBy: testAdmin.id
            });

            await FormField.create({
                id: 'field-001',
                formId: testForm.id,
                type: 'singleLine',
                label: 'Name',
                name: 'name',
                position: 0
            });
        });

        it('should delete form and cascade cleanup', async () => {
            const response = await request(app)
                .delete(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('ok');
            expect(response.body.ok).toBe(true);

            // Verify form is deleted
            const { Form } = await import('../../src/server/models/Form.js');
            const deletedForm = await Form.findByPk(testForm.id);
            expect(deletedForm).toBeNull();
        });

        it('should return 404 for non-existent form', async () => {
            const response = await request(app)
                .delete('/api/forms/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

        it('should require authentication to delete form', async () => {
            const response = await request(app)
                .delete(`/api/forms/${testForm.id}`)
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('should require admin or editor role to delete form', async () => {
            const response = await request(app)
                .delete(`/api/forms/${testForm.id}`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });
    });
});
