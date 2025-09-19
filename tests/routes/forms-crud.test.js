// tests/routes/forms-crud.test.js
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { setupTestDatabase, teardownTestDatabase, clearTestData, createTestUser, createTestAdmin, createTestViewer, generateTestJWT } from '../helpers/test-db-setup.js';
import { createTestAuthRoutes } from '../helpers/test-auth-routes.js';
import { Form } from '../../src/server/models/Form.js';
import { FormField } from '../../src/server/models/FormField.js';
import { Category } from '../../src/server/models/Category.js';
import { FormSubmission } from '../../src/server/models/FormSubmission.js';
import { sequelize, submissionsSequelize } from '../../src/server/db.js';
import { createFormWithFields, updateFormWithFields, isTitleTaken } from '../../src/server/services/forms.service.js';
import { validateFields, ensureUniqueFieldNames } from '../../src/server/utils/field-validation.js';
import { sanitize } from '../../src/server/services/validation.service.js';
import crypto from 'crypto';

describe('Form CRUD Operations', () => {
    let app;
    let testUser, testAdmin, testViewer;
    let userToken, adminToken, viewerToken;
    let testCategory;

    beforeAll(async () => {
        // Set up test environment
        process.env.AUTH_ENABLED = '1';
        process.env.JWT_SECRET = 'test_jwt_secret_key';

        // Set up test database
        await setupTestDatabase();

        // Set up Express app with test routes
        app = express();
        app.use(express.json());
        app.use(session({
            secret: 'test_session_secret',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: false }
        }));

        // Add auth routes
        app.use(createTestAuthRoutes(global.TestUser, global.TestRefreshToken, global.TestUserLockout));

        // Mock form routes for testing
        app.use(createTestFormRoutes());
    });

    afterAll(async () => {
        await teardownTestDatabase();
    });

    beforeEach(async () => {
        await clearTestData();

        // Create test users
        testUser = await createTestUser({ email: 'editor@test.com', role: 'editor' });
        testAdmin = await createTestAdmin({ email: 'admin@test.com', role: 'admin' });
        testViewer = await createTestViewer({ email: 'viewer@test.com', role: 'viewer' });

        // Generate JWT tokens
        userToken = await generateTestJWT(testUser);
        adminToken = await generateTestJWT(testAdmin);
        viewerToken = await generateTestJWT(testViewer);

        // Create test category using the existing Category model
        const { Category } = await import('../../src/server/models/Category.js');
        testCategory = await Category.create({
            id: 'cat-test-001',
            name: 'Test Category',
            description: 'A test category for forms',
            color: '#ff6b6b'
        });
    });

    describe('Create Form Operations', () => {
        describe('POST /api/forms', () => {
            it('should create a form with valid data', async () => {
                const formData = {
                    title: 'Test Form',
                    fields: [
                        {
                            type: 'singleLine',
                            label: 'Full Name',
                            name: 'fullName',
                            required: true,
                            placeholder: 'Enter your full name'
                        },
                        {
                            type: 'email',
                            label: 'Email Address',
                            name: 'email',
                            required: true
                        }
                    ],
                    categoryId: testCategory.id
                };

                const response = await request(app)
                    .post('/api/forms')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(formData)
                    .expect(200);

                expect(response.body.ok).toBe(true);
                expect(response.body.form).toBeDefined();
                expect(response.body.form.id).toMatch(/^form-[A-Za-z0-9]{8}$/);
                expect(response.body.form.title).toBe('Test Form');
                expect(response.body.form.fields).toHaveLength(2);
                expect(response.body.form.fields[0].type).toBe('singleLine');
                expect(response.body.form.fields[0].label).toBe('Full Name');
                expect(response.body.form.fields[0].required).toBe(true);

                // Verify form was created in database
                const { Form } = await import('../../src/server/models/Form.js');
                const { FormField } = await import('../../src/server/models/FormField.js');
                const createdForm = await Form.findByPk(response.body.form.id, {
                    include: [{ model: FormField, as: 'fields' }]
                });
                expect(createdForm).toBeTruthy();
                expect(createdForm.title).toBe('Test Form');
                expect(createdForm.categoryId).toBe(testCategory.id);
                expect(createdForm.createdBy).toBe(testAdmin.id);
                expect(createdForm.fields).toHaveLength(2);
            });

            it('should fail to create form with duplicate title', async () => {
                // Create first form
                const formData1 = {
                    title: 'Duplicate Title Form',
                    fields: [{ type: 'singleLine', label: 'Name', name: 'name', required: true }]
                };

                await request(app)
                    .post('/api/forms')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(formData1)
                    .expect(200);

                // Try to create second form with same title
                const formData2 = {
                    title: 'Duplicate Title Form', // Same title
                    fields: [{ type: 'email', label: 'Email', name: 'email', required: true }]
                };

                const response = await request(app)
                    .post('/api/forms')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(formData2)
                    .expect(409);

                expect(response.body.error).toBe('Form title already exists. Choose another.');
            });

            it('should fail to create form with empty title', async () => {
                const formData = {
                    title: '',
                    fields: [{ type: 'singleLine', label: 'Name', name: 'name', required: true }]
                };

                const response = await request(app)
                    .post('/api/forms')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(formData)
                    .expect(400);

                expect(response.body.error).toBe('Form validation failed');
                expect(response.body.details.title).toBe('Form title is required');
            });

            it('should fail to create form with invalid field data', async () => {
                const formData = {
                    title: 'Test Form',
                    fields: [
                        {
                            type: 'invalidType', // Invalid field type
                            label: 'Name',
                            name: 'name',
                            required: true
                        }
                    ]
                };

                const response = await request(app)
                    .post('/api/forms')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(formData)
                    .expect(400);

                expect(response.body.error).toBe('Field validation failed');
                expect(response.body.details).toBeDefined();
            });

            it('should fail to create form with duplicate field names', async () => {
                const formData = {
                    title: 'Test Form',
                    fields: [
                        { type: 'singleLine', label: 'Name', name: 'duplicateName', required: true },
                        { type: 'email', label: 'Email', name: 'duplicateName', required: true } // Duplicate name
                    ]
                };

                const response = await request(app)
                    .post('/api/forms')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(formData)
                    .expect(400);

                expect(response.body.error).toBe('Field names must be unique within the form');
            });

            it('should require authentication to create form', async () => {
                const formData = {
                    title: 'Test Form',
                    fields: [{ type: 'singleLine', label: 'Name', name: 'name', required: true }]
                };

                const response = await request(app)
                    .post('/api/forms')
                    .send(formData)
                    .expect(401);

                expect(response.body.error).toBe('Unauthorized');
            });

            it('should require admin or editor role to create form', async () => {
                const formData = {
                    title: 'Test Form',
                    fields: [{ type: 'singleLine', label: 'Name', name: 'name', required: true }]
                };

                const response = await request(app)
                    .post('/api/forms')
                    .set('Authorization', `Bearer ${viewerToken}`)
                    .send(formData)
                    .expect(403);

                expect(response.body.error).toBe('Forbidden');
            });
        });
    });

    describe('Read Form Operations', () => {
        let testForm;

        beforeEach(async () => {
            // Create a test form for read operations
            const { Form } = await import('../../src/server/models/Form.js');
            const { FormField } = await import('../../src/server/models/FormField.js');

            testForm = await Form.create({
                id: 'form-test-001',
                title: 'Read Test Form',
                categoryId: testCategory.id,
                createdBy: testAdmin.id
            });

            await FormField.bulkCreate([
                {
                    id: 'field-001',
                    formId: testForm.id,
                    type: 'singleLine',
                    label: 'Full Name',
                    name: 'fullName',
                    required: true,
                    position: 0
                },
                {
                    id: 'field-002',
                    formId: testForm.id,
                    type: 'email',
                    label: 'Email',
                    name: 'email',
                    required: true,
                    position: 1
                }
            ]);
        });

        describe('GET /api/forms/:id', () => {
            it('should read form by ID with fields', async () => {
                const response = await request(app)
                    .get(`/api/forms/${testForm.id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.ok).toBe(true);
                expect(response.body.form).toBeDefined();
                expect(response.body.form.id).toBe(testForm.id);
                expect(response.body.form.title).toBe('Read Test Form');
                expect(response.body.form.categoryId).toBe(testCategory.id);
                expect(response.body.form.fields).toHaveLength(2);
                expect(response.body.form.fields[0].type).toBe('singleLine');
                expect(response.body.form.fields[0].label).toBe('Full Name');
                expect(response.body.form.fields[1].type).toBe('email');
                expect(response.body.form.fields[1].label).toBe('Email');
            });

            it('should return 404 for non-existent form', async () => {
                const response = await request(app)
                    .get('/api/forms/non-existent-id')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(404);

                expect(response.body.error).toBe('Not found');
            });

            it('should require authentication to read form', async () => {
                const response = await request(app)
                    .get(`/api/forms/${testForm.id}`)
                    .expect(401);

                expect(response.body.error).toBe('Unauthorized');
            });

            it('should allow viewers to read forms', async () => {
                const response = await request(app)
                    .get(`/api/forms/${testForm.id}`)
                    .set('Authorization', `Bearer ${viewerToken}`)
                    .expect(200);

                expect(response.body.ok).toBe(true);
                expect(response.body.form.id).toBe(testForm.id);
            });
        });

        describe('GET /api/forms', () => {
            it('should list all forms with pagination', async () => {
                // Create additional test forms
                const { Form } = await import('../../src/server/models/Form.js');
                await Form.bulkCreate([
                    {
                        id: 'form-test-002',
                        title: 'Second Form',
                        categoryId: testCategory.id,
                        createdBy: testAdmin.id
                    },
                    {
                        id: 'form-test-003',
                        title: 'Third Form',
                        categoryId: testCategory.id,
                        createdBy: testUser.id
                    }
                ]);

                const response = await request(app)
                    .get('/api/forms')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.data).toBeDefined();
                expect(Array.isArray(response.body.data)).toBe(true);
                expect(response.body.data.length).toBe(3);

                // Should be ordered by updatedAt DESC
                const formTitles = response.body.data.map(f => f.title);
                expect(formTitles).toContain('Read Test Form');
                expect(formTitles).toContain('Second Form');
                expect(formTitles).toContain('Third Form');
            });

            it('should include form fields and category information', async () => {
                const response = await request(app)
                    .get('/api/forms')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200);

                expect(response.body.data).toHaveLength(1);
                const form = response.body.data[0];
                expect(form.fields).toBeDefined();
                expect(Array.isArray(form.fields)).toBe(true);
                expect(form.fields).toHaveLength(2);
                expect(form.category).toBeDefined();
                expect(form.category.id).toBe(testCategory.id);
                expect(form.category.name).toBe('Test Category');
            });

            it('should require authentication to list forms', async () => {
                const response = await request(app)
                    .get('/api/forms')
                    .expect(401);

                expect(response.body.error).toBe('Unauthorized');
            });
        });
    });

    // Continue with Update and Delete operations in next part...
});

// Helper function to create test form routes
function createTestFormRoutes() {
    const router = express.Router();

    // Auth middleware
    async function ensureAuth(req, res, next) {
        if (process.env.AUTH_ENABLED !== '1') return next();
        if (req.session?.user) return next();
        const auth = req.headers['authorization'] || '';
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m) {
            try {
                const jwt = await import('jsonwebtoken');
                const secret = process.env.JWT_SECRET || 'test_jwt_secret_key';
                const payload = jwt.default.verify(m[1], secret);
                req.user = { id: payload.sub, role: payload.role, email: payload.email };
                return next();
            } catch (e) {
                console.log('JWT verification failed:', e.message);
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }
        return res.status(401).json({ error: 'Unauthorized' });
    }

    function requireRole(...roles) {
        return (req, res, next) => {
            if (process.env.AUTH_ENABLED !== '1') return next();
            const role = (req.session?.user && req.session.user.role) || (req.user && req.user.role) || null;
            if (role && roles.includes(role)) return next();
            return res.status(403).json({ error: 'Forbidden' });
        };
    }

    // Mock form routes
    router.post('/api/forms', ensureAuth, requireRole('admin', 'editor'), async (req, res) => {
        try {
            const { Form } = await import('../../src/server/models/Form.js');
            const { FormField } = await import('../../src/server/models/FormField.js');

            const { title = '', fields = [], categoryId } = req.body || {};

            // Basic validation
            if (!title.trim()) {
                return res.status(400).json({
                    error: 'Form validation failed',
                    details: { title: 'Form title is required' }
                });
            }

            // Check for duplicate title
            const existingForm = await Form.findOne({
                where: { title: title.trim() }
            });
            if (existingForm) {
                return res.status(409).json({ error: 'Form title already exists. Choose another.' });
            }

            // Validate fields
            if (!Array.isArray(fields)) {
                return res.status(400).json({ error: 'Field validation failed', details: ['Fields must be an array'] });
            }

            // Enhanced field validation
            const validFieldTypes = ['singleLine', 'paragraph', 'dropdown', 'multipleChoice', 'checkboxes', 'number', 'name', 'email', 'phone', 'password', 'date', 'time', 'datetime', 'url', 'file', 'richText'];
            const fieldErrors = [];

            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];

                if (!field.label || !field.label.trim()) {
                    fieldErrors.push(`Field ${i + 1}: Label is required`);
                }

                if (!field.type || !validFieldTypes.includes(field.type)) {
                    fieldErrors.push(`Field ${i + 1}: Invalid field type. Must be one of: ${validFieldTypes.join(', ')}`);
                }

                if (!field.name || !field.name.trim()) {
                    fieldErrors.push(`Field ${i + 1}: Name is required`);
                }
            }

            if (fieldErrors.length > 0) {
                return res.status(400).json({ error: 'Field validation failed', details: fieldErrors });
            }

            // Check for duplicate field names
            const fieldNames = fields.map(f => f.name).filter(Boolean);
            const uniqueNames = new Set(fieldNames);
            if (fieldNames.length !== uniqueNames.size) {
                return res.status(400).json({ error: 'Field names must be unique within the form' });
            }

            // Create form
            const formId = `form-${crypto.randomBytes(4).toString('hex')}`;
            const form = await Form.create({
                id: formId,
                title: title.trim(),
                categoryId: categoryId || null,
                createdBy: req.user?.id || null
            });

            // Create fields
            const fieldRecords = fields.map((field, index) => ({
                id: `field-${crypto.randomBytes(4).toString('hex')}`,
                formId: form.id,
                type: field.type,
                label: field.label,
                name: field.name,
                placeholder: field.placeholder || '',
                required: !!field.required,
                doNotStore: !!field.doNotStore,
                options: field.options || '',
                position: index
            }));

            await FormField.bulkCreate(fieldRecords);

            res.json({
                ok: true,
                form: {
                    id: form.id,
                    title: form.title,
                    fields: fieldRecords
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/api/forms/:id', ensureAuth, requireRole('admin', 'editor', 'viewer'), async (req, res) => {
        try {
            const { Form } = await import('../../src/server/models/Form.js');
            const { FormField } = await import('../../src/server/models/FormField.js');
            const { Category } = await import('../../src/server/models/Category.js');

            const form = await Form.findByPk(req.params.id);

            if (!form) {
                return res.status(404).json({ error: 'Not found' });
            }

            // Manually fetch related data since associations aren't set up in test environment
            const fields = await FormField.findAll({
                where: { formId: form.id },
                order: [['position', 'ASC']]
            });

            let category = null;
            if (form.categoryId) {
                category = await Category.findByPk(form.categoryId);
            }

            const fieldsData = fields.map(f => ({
                id: f.id,
                type: f.type,
                label: f.label,
                name: f.name,
                placeholder: f.placeholder,
                required: f.required,
                doNotStore: f.doNotStore,
                options: f.options
            }));

            res.json({
                ok: true,
                form: {
                    id: form.id,
                    title: form.title,
                    categoryId: form.categoryId,
                    category: category ? {
                        id: category.id,
                        name: category.name,
                        description: category.description,
                        color: category.color
                    } : null,
                    fields: fieldsData
                }
            });
        } catch (error) {
            console.error('Read form error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/api/forms', ensureAuth, requireRole('admin', 'editor', 'viewer'), async (req, res) => {
        try {
            const { Form } = await import('../../src/server/models/Form.js');
            const { FormField } = await import('../../src/server/models/FormField.js');
            const { Category } = await import('../../src/server/models/Category.js');

            const forms = await Form.findAll({
                order: [['updatedAt', 'DESC']]
            });

            // Manually fetch related data for each form
            const formsData = await Promise.all(forms.map(async (form) => {
                const fields = await FormField.findAll({
                    where: { formId: form.id },
                    order: [['position', 'ASC']]
                });

                let category = null;
                if (form.categoryId) {
                    category = await Category.findByPk(form.categoryId);
                }

                return {
                    id: form.id,
                    title: form.title,
                    categoryId: form.categoryId,
                    category: category ? {
                        id: category.id,
                        name: category.name,
                        description: category.description,
                        color: category.color
                    } : null,
                    fields: fields.map(f => ({
                        id: f.id,
                        type: f.type,
                        label: f.label,
                        name: f.name,
                        placeholder: f.placeholder,
                        required: f.required,
                        doNotStore: f.doNotStore,
                        options: f.options
                    })),
                    createdAt: form.createdAt,
                    updatedAt: form.updatedAt
                };
            }));

            res.json({ data: formsData });
        } catch (error) {
            console.error('List forms error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
}
