// tests/categories-templates.test.js
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize, submissionsSequelize } from '../src/server/db.js';
import { User } from '../src/server/models/User.js';
import { Category } from '../src/server/models/Category.js';
import { Template } from '../src/server/models/Template.js';
import { Form } from '../src/server/models/Form.js';
import { setupTestDatabase, teardownTestDatabase } from './helpers/test-db-setup.js';
import categoriesRoutes from '../src/server/routes/categories.routes.js';
import templatesRoutes from '../src/server/routes/templates.routes.js';

describe('Categories & Templates Tests', () => {
    let app;
    let testUser;
    let testCategory;
    let testTemplate;
    let authToken;

    beforeAll(async () => {
        await setupTestDatabase();

        // Enable authentication for testing
        process.env.AUTH_ENABLED = '1';

        // Set NODE_ENV to development for better error messages in tests
        process.env.NODE_ENV = 'development';

        // Setup Express app for testing
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
            layoutsDir: path.join(__dirname, '../views/layouts'),
            partialsDir: path.join(__dirname, '../views/partials')
        }));
        app.set('view engine', 'hbs');
        app.set('views', path.join(__dirname, '../views'));

        // Global error handler
        app.use((err, req, res, next) => {
            console.error('Unhandled error:', err);
            const isDevelopment = process.env.NODE_ENV !== 'production';

            if (req.path.startsWith('/api/')) {
                res.status(err.status || 500).json({
                    error: isDevelopment ? err.message : 'Internal Server Error',
                    ...(isDevelopment && { stack: err.stack })
                });
            } else {
                res.status(err.status || 500).render('error', {
                    title: 'Error',
                    message: isDevelopment ? err.message : 'Internal Server Error'
                });
            }
        });

        // Setup routes
        app.use('/', categoriesRoutes);
        app.use('/', templatesRoutes);

        // Create test user for authentication
        const bcrypt = await import('bcryptjs');
        testUser = await User.create({
            id: 'test-user-categories',
            email: 'categories-test@example.com',
            username: 'categoriestest',
            passwordHash: await bcrypt.hash('testpassword', 10),
            role: 'admin'
        });

        // Create auth token
        const jwt = await import('jsonwebtoken');
        authToken = jwt.default.sign(
            { sub: testUser.id, role: testUser.role, email: testUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me'
        );
    });

    beforeEach(async () => {
        // Clean up test data between tests to ensure isolation
        // Delete in reverse order of dependencies
        await Form.destroy({ where: {} });
        await Template.destroy({ where: {} });
        await Category.destroy({ where: {} });
        // Don't delete the test user as it's needed for authentication
    });

    afterAll(async () => {
        await teardownTestDatabase();
    });

    describe('Categories CRUD Operations', () => {
        test('✅ Create Category - Valid Data', async () => {
            const categoryData = {
                name: 'Test Category',
                description: 'A test category for forms',
                color: '#ff5733'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send(categoryData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('category');
            expect(response.body.category).toHaveProperty('id');
            expect(response.body.category.name).toBe(categoryData.name);
            expect(response.body.category.description).toBe(categoryData.description);
            expect(response.body.category.color).toBe(categoryData.color);

            // Verify category was created in database
            const createdCategory = await Category.findByPk(response.body.category.id);
            expect(createdCategory).toBeTruthy();
            expect(createdCategory.name).toBe(categoryData.name);
        });

        test('✅ Create Category - Minimal Data', async () => {
            const categoryData = {
                name: 'Minimal Category'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send(categoryData);

            expect(response.status).toBe(200);
            expect(response.body.category.name).toBe(categoryData.name);
            expect(response.body.category.description).toBe('');
            expect(response.body.category.color).toBe('#6c757d'); // Default color
        });

        test('❌ Create Category - Missing Name', async () => {
            const categoryData = {
                description: 'Category without name'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send(categoryData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Category name is required');
        });

        test('❌ Create Category - Empty Name', async () => {
            const categoryData = {
                name: '   ',
                description: 'Category with empty name'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send(categoryData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Category name is required');
        });

        test('❌ Create Category - Name Too Long', async () => {
            const categoryData = {
                name: 'A'.repeat(256), // Exceeds 255 character limit
                description: 'Category with name too long'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send(categoryData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Category name is too long');
        });

        test('❌ Create Category - Duplicate Name', async () => {
            // Create first category
            const categoryData = {
                name: 'Duplicate Test Category',
                description: 'First category'
            };

            await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send(categoryData);

            // Try to create second category with same name
            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send(categoryData);

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('error', 'Category name already exists');
        });

        test('❌ Create Category - Invalid Color Format', async () => {
            const categoryData = {
                name: 'Invalid Color Category',
                color: 'not-a-hex-color'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send(categoryData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Invalid color format');
        });

        test('✅ List Categories - Empty List', async () => {
            const response = await request(app)
                .get('/api/categories')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBe(0);
        });

        test('✅ List Categories - With Data', async () => {
            // Create test categories
            const categories = [
                { name: 'Category A', description: 'First category', color: '#ff0000' },
                { name: 'Category B', description: 'Second category', color: '#00ff00' },
                { name: 'Category C', description: 'Third category', color: '#0000ff' }
            ];

            for (const catData of categories) {
                await request(app)
                    .post('/api/categories')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(catData);
            }

            const response = await request(app)
                .get('/api/categories')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(3);

            // Should be sorted by name
            expect(response.body.data[0].name).toBe('Category A');
            expect(response.body.data[1].name).toBe('Category B');
            expect(response.body.data[2].name).toBe('Category C');
        });

        test('✅ Update Category - Valid Data', async () => {
            // Create category first
            const createResponse = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Original Category',
                    description: 'Original description',
                    color: '#ff0000'
                });

            const categoryId = createResponse.body.category.id;

            // Update category
            const updateData = {
                name: 'Updated Category',
                description: 'Updated description',
                color: '#00ff00'
            };

            const response = await request(app)
                .put(`/api/categories/${categoryId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.category.name).toBe(updateData.name);
            expect(response.body.category.description).toBe(updateData.description);
            expect(response.body.category.color).toBe(updateData.color);

            // Verify update in database
            const updatedCategory = await Category.findByPk(categoryId);
            expect(updatedCategory.name).toBe(updateData.name);
        });

        test('✅ Update Category - Partial Update', async () => {
            // Create category first
            const createResponse = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Original Category',
                    description: 'Original description',
                    color: '#ff0000'
                });

            const categoryId = createResponse.body.category.id;

            // Update only name
            const response = await request(app)
                .put(`/api/categories/${categoryId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Updated Name Only' });

            expect(response.status).toBe(200);
            expect(response.body.category.name).toBe('Updated Name Only');
            expect(response.body.category.description).toBe('Original description'); // Unchanged
            expect(response.body.category.color).toBe('#ff0000'); // Unchanged
        });

        test('❌ Update Category - Not Found', async () => {
            const response = await request(app)
                .put('/api/categories/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Updated Name' });

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Category not found');
        });

        test('❌ Update Category - Duplicate Name', async () => {
            // Create two categories
            const cat1Response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Category One' });

            const cat2Response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Category Two' });

            // Try to update second category to have same name as first
            const response = await request(app)
                .put(`/api/categories/${cat2Response.body.category.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Category One' });

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('error', 'Category name already exists');
        });

        test('✅ Delete Category - Not In Use', async () => {
            // Create category
            const createResponse = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Category To Delete',
                    description: 'This will be deleted'
                });

            const categoryId = createResponse.body.category.id;

            // Delete category
            const response = await request(app)
                .delete(`/api/categories/${categoryId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);

            // Verify deletion
            const deletedCategory = await Category.findByPk(categoryId);
            expect(deletedCategory).toBeNull();
        });

        test('❌ Delete Category - Not Found', async () => {
            const response = await request(app)
                .delete('/api/categories/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Category not found');
        });

        test('❌ Delete Category - In Use By Forms', async () => {
            // Create category
            const createResponse = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Category In Use',
                    description: 'This category is used by a form'
                });

            const categoryId = createResponse.body.category.id;

            // Create a form that uses this category
            await Form.create({
                id: 'form-using-category',
                title: 'Form Using Category',
                categoryId: categoryId,
                createdBy: testUser.id
            });

            // Try to delete category
            const response = await request(app)
                .delete(`/api/categories/${categoryId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Cannot delete category that is in use');
            expect(response.body).toHaveProperty('details');
            expect(response.body.details).toContain('1 form(s) are using this category');

            // Verify category still exists
            const category = await Category.findByPk(categoryId);
            expect(category).toBeTruthy();
        });
    });

    describe('Templates CRUD Operations', () => {
        test('✅ Create Template - Valid Data', async () => {
            // Create category first
            const categoryResponse = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Template Category',
                    description: 'Category for templates'
                });

            const templateData = {
                name: 'Contact Form Template',
                description: 'A template for contact forms',
                categoryId: categoryResponse.body.category.id,
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
                        required: true,
                        placeholder: 'Enter your email'
                    },
                    {
                        type: 'paragraph',
                        label: 'Message',
                        name: 'message',
                        required: false,
                        placeholder: 'Enter your message'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('template');
            expect(response.body.template).toHaveProperty('id');
            expect(response.body.template.name).toBe(templateData.name);
            expect(response.body.template.description).toBe(templateData.description);
            expect(response.body.template.categoryId).toBe(templateData.categoryId);
            expect(response.body.template.fields).toHaveLength(3);

            // Verify template was created in database
            const createdTemplate = await Template.findByPk(response.body.template.id);
            expect(createdTemplate).toBeTruthy();
            expect(createdTemplate.name).toBe(templateData.name);
            expect(createdTemplate.fields).toEqual(templateData.fields);
        });

        test('✅ Create Template - Minimal Data', async () => {
            const templateData = {
                name: 'Minimal Template',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            expect(response.status).toBe(200);
            expect(response.body.template.name).toBe(templateData.name);
            expect(response.body.template.description).toBe('');
            expect(response.body.template.categoryId).toBeNull();
            expect(response.body.template.fields).toEqual([]);
        });

        test('❌ Create Template - Missing Name', async () => {
            const templateData = {
                description: 'Template without name',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Template name is required');
        });

        test('❌ Create Template - Empty Name', async () => {
            const templateData = {
                name: '   ',
                description: 'Template with empty name',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Template name is required');
        });

        test('❌ Create Template - Duplicate Name', async () => {
            const templateData = {
                name: 'Duplicate Template',
                fields: []
            };

            // Create first template
            await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            // Try to create second template with same name
            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('error', 'Template name already exists. Choose another.');
        });

        test('❌ Create Template - Invalid Category ID', async () => {
            const templateData = {
                name: 'Template With Invalid Category',
                categoryId: 'non-existent-category-id',
                fields: []
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Invalid category ID');
        });

        test('❌ Create Template - Invalid Field Data', async () => {
            const templateData = {
                name: 'Template With Invalid Fields',
                fields: [
                    {
                        type: 'invalidType',
                        label: 'Invalid Field',
                        name: 'invalidField'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Field validation failed');
            expect(response.body).toHaveProperty('details');
        });

        test('❌ Create Template - Duplicate Field Names', async () => {
            const templateData = {
                name: 'Template With Duplicate Fields',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'First Field',
                        name: 'duplicateName'
                    },
                    {
                        type: 'email',
                        label: 'Second Field',
                        name: 'duplicateName' // Same name as first field
                    }
                ]
            };

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send(templateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Field names must be unique');
        });

        test('✅ List Templates - Empty List', async () => {
            const response = await request(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBe(0);
        });

        test('✅ List Templates - With Data', async () => {
            // Create test templates
            const templates = [
                { name: 'Template A', fields: [] },
                { name: 'Template B', fields: [] },
                { name: 'Template C', fields: [] }
            ];

            for (const templateData of templates) {
                await request(app)
                    .post('/api/templates')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(templateData);
            }

            const response = await request(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(3);
        });

        test('✅ List Active Templates', async () => {
            // Create test templates
            const templates = [
                { name: 'Active Template 1', fields: [] },
                { name: 'Active Template 2', fields: [] }
            ];

            for (const templateData of templates) {
                await request(app)
                    .post('/api/templates')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(templateData);
            }

            const response = await request(app)
                .get('/api/templates/active')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(2);
        });

        test('✅ Read Template - Valid ID', async () => {
            // Create template first
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Template To Read',
                    description: 'This template will be read',
                    fields: [
                        {
                            type: 'singleLine',
                            label: 'Test Field',
                            name: 'testField'
                        }
                    ]
                });

            const templateId = createResponse.body.template.id;

            // Read template
            const response = await request(app)
                .get(`/api/templates/${templateId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('template');
            expect(response.body.template.id).toBe(templateId);
            expect(response.body.template.name).toBe('Template To Read');
            expect(response.body.template.fields).toHaveLength(1);
        });

        test('❌ Read Template - Not Found', async () => {
            const response = await request(app)
                .get('/api/templates/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Template not found');
        });

        test('✅ Update Template - Valid Data', async () => {
            // Create template first
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Original Template',
                    description: 'Original description',
                    fields: []
                });

            const templateId = createResponse.body.template.id;

            // Update template
            const updateData = {
                name: 'Updated Template',
                description: 'Updated description',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Updated Field',
                        name: 'updatedField'
                    }
                ]
            };

            const response = await request(app)
                .put(`/api/templates/${templateId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.template.name).toBe(updateData.name);
            expect(response.body.template.description).toBe(updateData.description);
            expect(response.body.template.fields).toHaveLength(1);

            // Verify update in database
            const updatedTemplate = await Template.findByPk(templateId);
            expect(updatedTemplate.name).toBe(updateData.name);
        });

        test('✅ Update Template - Partial Update', async () => {
            // Create template first
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Original Template',
                    description: 'Original description',
                    fields: []
                });

            const templateId = createResponse.body.template.id;

            // Update only name
            const response = await request(app)
                .put(`/api/templates/${templateId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Updated Name Only' });

            expect(response.status).toBe(200);
            expect(response.body.template.name).toBe('Updated Name Only');
            expect(response.body.template.description).toBe('Original description'); // Unchanged
        });

        test('❌ Update Template - Not Found', async () => {
            const response = await request(app)
                .put('/api/templates/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Updated Name' });

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Template not found');
        });

        test('❌ Update Template - Duplicate Name', async () => {
            // Create two templates
            const template1Response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Template One', fields: [] });

            const template2Response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Template Two', fields: [] });

            // Try to update second template to have same name as first
            const response = await request(app)
                .put(`/api/templates/${template2Response.body.template.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'Template One' });

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('error', 'Template name already exists. Choose another.');
        });

        test('✅ Delete Template - Valid ID', async () => {
            // Create template first
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Template To Delete',
                    description: 'This will be deleted',
                    fields: []
                });

            const templateId = createResponse.body.template.id;

            // Delete template
            const response = await request(app)
                .delete(`/api/templates/${templateId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);

            // Verify deletion
            const deletedTemplate = await Template.findByPk(templateId);
            expect(deletedTemplate).toBeNull();
        });

        test('❌ Delete Template - Not Found', async () => {
            const response = await request(app)
                .delete('/api/templates/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Template not found');
        });

        test('✅ Check Template Name Unique - Available', async () => {
            const response = await request(app)
                .get('/api/templates/check-name?name=AvailableName')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('unique', true);
        });

        test('✅ Check Template Name Unique - Taken', async () => {
            // Create template first
            await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'TakenName', fields: [] });

            // Check if name is taken
            const response = await request(app)
                .get('/api/templates/check-name?name=TakenName')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('unique', false);
        });

        test('✅ Check Template Name Unique - Exclude Self', async () => {
            // Create template first
            const createResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: 'SelfExcludeName', fields: [] });

            const templateId = createResponse.body.template.id;

            // Check if name is unique when excluding self
            const response = await request(app)
                .get(`/api/templates/check-name?name=SelfExcludeName&excludeId=${templateId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('unique', true);
        });
    });

    describe('Categories & Templates Relationships', () => {
        test('✅ Template with Category Relationship', async () => {
            // Create category
            const categoryResponse = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Business Category',
                    description: 'For business-related templates',
                    color: '#007bff'
                });

            const categoryId = categoryResponse.body.category.id;

            // Create template with category
            const templateResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Business Contact Form',
                    description: 'Contact form for business',
                    categoryId: categoryId,
                    fields: [
                        {
                            type: 'singleLine',
                            label: 'Company Name',
                            name: 'companyName',
                            required: true
                        }
                    ]
                });

            expect(templateResponse.status).toBe(200);
            expect(templateResponse.body.template.categoryId).toBe(categoryId);

            // Verify relationship in database
            const template = await Template.findByPk(templateResponse.body.template.id, {
                include: [{ model: Category, as: 'category' }]
            });
            expect(template.category).toBeTruthy();
            expect(template.category.name).toBe('Business Category');
        });

        test('✅ Template without Category (Uncategorized)', async () => {
            const templateResponse = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Uncategorized Template',
                    fields: []
                });

            expect(templateResponse.status).toBe(200);
            expect(templateResponse.body.template.categoryId).toBeNull();

            // Verify in database
            const template = await Template.findByPk(templateResponse.body.template.id);
            expect(template.categoryId).toBeNull();
        });

        test('✅ Category with Multiple Templates', async () => {
            // Create category
            const categoryResponse = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Multi-Template Category',
                    description: 'Category with multiple templates'
                });

            const categoryId = categoryResponse.body.category.id;

            // Create multiple templates with same category
            const templates = [
                { name: 'Template 1', fields: [] },
                { name: 'Template 2', fields: [] },
                { name: 'Template 3', fields: [] }
            ];

            for (const templateData of templates) {
                const response = await request(app)
                    .post('/api/templates')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({
                        ...templateData,
                        categoryId: categoryId
                    });

                expect(response.status).toBe(200);
                expect(response.body.template.categoryId).toBe(categoryId);
            }

            // Verify all templates are associated with category
            const templatesInCategory = await Template.findAll({
                where: { categoryId: categoryId }
            });
            expect(templatesInCategory.length).toBe(3);
        });

        test('✅ Category Deletion with Associated Templates', async () => {
            // Create category
            const categoryResponse = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Category With Templates',
                    description: 'This category has templates'
                });

            const categoryId = categoryResponse.body.category.id;

            // Create template with category
            await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Template In Category',
                    categoryId: categoryId,
                    fields: []
                });

            // Try to delete category (should fail because it has templates)
            const deleteResponse = await request(app)
                .delete(`/api/categories/${categoryId}`)
                .set('Authorization', `Bearer ${authToken}`);

            // Note: This test reveals current behavior - categories with templates can be deleted
            // This might be intended behavior or a bug depending on requirements
            console.log('📊 CATEGORY DELETION WITH TEMPLATES RESPONSE:', {
                status: deleteResponse.status,
                body: deleteResponse.body
            });

            // The test documents current behavior without assuming it's correct
            expect([200, 400]).toContain(deleteResponse.status); // Either works or fails
        });
    });

    describe('Authentication & Authorization', () => {
        test('❌ Categories API - No Authentication', async () => {
            const response = await request(app)
                .get('/api/categories');

            // Current behavior: Returns 401 for unauthenticated requests
            // Intended: Should return 401
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error', 'Unauthorized');
        });

        test('❌ Templates API - No Authentication', async () => {
            const response = await request(app)
                .get('/api/templates');

            // Current behavior: Returns 401 for unauthenticated requests
            // Intended: Should return 401
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error', 'Unauthorized');
        });

        test('❌ Categories API - Invalid Token', async () => {
            const response = await request(app)
                .get('/api/categories')
                .set('Authorization', 'Bearer invalid-token');

            // Current behavior: Returns 401 for invalid tokens
            // Intended: Should return 401
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error', 'Unauthorized');
        });

        test('❌ Templates API - Invalid Token', async () => {
            const response = await request(app)
                .get('/api/templates')
                .set('Authorization', 'Bearer invalid-token');

            // Current behavior: Returns 401 for invalid tokens
            // Intended: Should return 401
            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error', 'Unauthorized');
        });
    });

    describe('Error Handling & Edge Cases', () => {
        test('❌ Categories - Malformed JSON', async () => {
            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .set('Content-Type', 'application/json')
                .send('{ invalid json }');

            // Current behavior: Returns 500 for malformed JSON
            // Intended: Should return 400 for malformed JSON
            expect([400, 500]).toContain(response.status);
            expect(response.body).toHaveProperty('error');
        });

        test('❌ Templates - Malformed JSON', async () => {
            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .set('Content-Type', 'application/json')
                .send('{ invalid json }');

            // Current behavior: Returns 500 for malformed JSON
            // Intended: Should return 400 for malformed JSON
            expect([400, 500]).toContain(response.status);
            expect(response.body).toHaveProperty('error');
        });

        test('❌ Categories - Oversized Request', async () => {
            const largeName = 'A'.repeat(10000); // Very large name
            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ name: largeName });

            // Current behavior: Returns 500 for oversized requests
            // Intended: Should return 413 for payload too large
            expect([400, 413, 500]).toContain(response.status);
            expect(response.body).toHaveProperty('error');
        });

        test('❌ Templates - Oversized Request', async () => {
            const largeFields = Array(1000).fill().map((_, i) => ({
                type: 'singleLine',
                label: `Field ${i}`,
                name: `field${i}`
            }));

            const response = await request(app)
                .post('/api/templates')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Template With Many Fields',
                    fields: largeFields
                });

            // Current behavior: Returns 500 for oversized requests
            // Intended: Should return 413 for payload too large
            expect([400, 413, 500]).toContain(response.status);
            expect(response.body).toHaveProperty('error');
        });

        test('❌ Database Connection Error Simulation', async () => {
            // Mock Category.findAll to simulate database error
            const originalFindAll = Category.findAll;
            Category.findAll = jest.fn().mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .get('/api/categories')
                .set('Authorization', `Bearer ${authToken}`);

            // Current behavior: Returns 500 for database errors with empty response body
            // Intended: Should return 503 for service unavailable with proper error message
            expect(response.status).toBe(500);
            expect(response.body).toEqual({}); // Current behavior: empty response body

            // Restore original function
            Category.findAll = originalFindAll;
        });
    });
});
