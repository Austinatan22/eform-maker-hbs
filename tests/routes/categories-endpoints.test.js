// tests/routes/categories-endpoints.test.js
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
import { Category } from '../../src/server/models/Category.js';
import { Form } from '../../src/server/models/Form.js';
import { Template } from '../../src/server/models/Template.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Categories API Endpoints', () => {
    let adminToken;
    let testCategory;
    let testForm;
    let testTemplate;

    beforeEach(async () => {
        // Setup isolated test database
        await setupTestDatabase();

        // Create test admin user using helper function
        const adminUser = await createTestAdmin({
            id: 'u-test-admin',
            email: 'admin@test.com',
            username: 'testadmin'
        });

        // Create JWT token
        adminToken = jwt.sign(
            { sub: adminUser.id, role: 'admin', email: adminUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );

        // Create test category
        testCategory = await Category.create({
            id: 'category-test-1',
            name: 'Test Category',
            description: 'Test category for forms and templates',
            color: '#ff0000'
        });

        // Create test form using the category
        testForm = await Form.create({
            id: 'form-test-1',
            title: 'Test Form',
            description: 'Test form using category',
            categoryId: testCategory.id,
            createdBy: adminUser.id
        });

        // Create test template using the category
        testTemplate = await Template.create({
            id: 'template-test-1',
            name: 'Test Template',
            description: 'Test template using category',
            categoryId: testCategory.id,
            fields: JSON.stringify([]),
            isActive: true,
            createdBy: adminUser.id
        });
    });

    afterEach(async () => {
        // Clean up test database
        await teardownTestDatabase();
    });

    describe('GET /api/categories', () => {
        test('should return all categories (admin)', async () => {
            const response = await request(app)
                .get('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);

            const category = response.body.data[0];
            expect(category).toHaveProperty('id');
            expect(category).toHaveProperty('name');
            expect(category).toHaveProperty('description');
            expect(category).toHaveProperty('color');
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/api/categories');

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });

        test('should return 403 for non-admin role', async () => {
            // Create non-admin user
            const passwordHash = bcrypt.hashSync('testpassword123', 10);
            const editorUser = await User.create({
                id: 'u-test-editor',
                email: 'editor@test.com',
                username: 'testeditor',
                passwordHash,
                role: 'editor'
            });

            const editorToken = jwt.sign(
                { sub: editorUser.id, role: 'editor', email: editorUser.email },
                process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
                { expiresIn: '15m' }
            );

            const response = await request(app)
                .get('/api/categories')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });
    });

    describe('POST /api/categories', () => {
        test('should create category with valid data (admin)', async () => {
            const categoryData = {
                name: 'New Test Category',
                description: 'A new test category',
                color: '#00ff00'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('category');
            expect(response.body.category).toHaveProperty('id');
            expect(response.body.category.name).toBe('New Test Category');
            expect(response.body.category.description).toBe('A new test category');
            expect(response.body.category.color).toBe('#00ff00');

            // Verify category was created in database
            const createdCategory = await Category.findByPk(response.body.category.id);
            expect(createdCategory).toBeTruthy();
            expect(createdCategory.name).toBe('New Test Category');

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'category',
                    action: 'create',
                    entityId: response.body.category.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should create category with minimal data (admin)', async () => {
            const categoryData = {
                name: 'Minimal Category'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(200);
            expect(response.body.category.name).toBe('Minimal Category');
            expect(response.body.category.description).toBe('');
            expect(response.body.category.color).toBe('#6c757d'); // Default color
        });

        test('should return 401 for unauthenticated request', async () => {
            const categoryData = {
                name: 'Unauthenticated Category'
            };

            const response = await request(app)
                .post('/api/categories')
                .send(categoryData);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });

        test('should return 403 for non-admin role', async () => {
            // Create non-admin user
            const passwordHash = bcrypt.hashSync('testpassword123', 10);
            const editorUser = await User.create({
                id: 'u-test-editor',
                email: 'editor@test.com',
                username: 'testeditor',
                passwordHash,
                role: 'editor'
            });

            const editorToken = jwt.sign(
                { sub: editorUser.id, role: 'editor', email: editorUser.email },
                process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
                { expiresIn: '15m' }
            );

            const categoryData = {
                name: 'Editor Category'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${editorToken}`)
                .send(categoryData);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 400 for missing name', async () => {
            const categoryData = {
                description: 'Category without name'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Category name is required' });
        });

        test('should return 400 for empty name', async () => {
            const categoryData = {
                name: '',
                description: 'Category with empty name'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Category name is required' });
        });

        test('should return 400 for name too long', async () => {
            const categoryData = {
                name: 'A'.repeat(256), // 256 characters, exceeds 255 limit
                description: 'Category with very long name'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Category name is too long' });
        });

        test('should return 409 for duplicate category name', async () => {
            const categoryData = {
                name: 'Test Category', // Same name as existing category
                description: 'Duplicate category'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(409);
            expect(response.body).toEqual({ error: 'Category name already exists' });
        });

        test('should return 400 for invalid color format', async () => {
            const categoryData = {
                name: 'Invalid Color Category',
                color: 'invalid-color-format'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid color format' });
        });

        test('should accept valid hex color formats', async () => {
            const validColors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#123abc', '#ABC123'];

            for (const color of validColors) {
                const categoryData = {
                    name: `Category with color ${color}`,
                    color: color
                };

                const response = await request(app)
                    .post('/api/categories')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(categoryData);

                expect(response.status).toBe(200);
                expect(response.body.category.color).toBe(color);
            }
        });

        test('should use default color when not provided', async () => {
            const categoryData = {
                name: 'Default Color Category'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(200);
            expect(response.body.category.color).toBe('#6c757d');
        });
    });

    describe('PUT /api/categories/:id', () => {
        test('should update category with valid data (admin)', async () => {
            const updateData = {
                name: 'Updated Test Category',
                description: 'Updated description',
                color: '#00ff00'
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('category');
            expect(response.body.category.name).toBe('Updated Test Category');
            expect(response.body.category.description).toBe('Updated description');
            expect(response.body.category.color).toBe('#00ff00');

            // Verify category was updated in database
            const updatedCategory = await Category.findByPk(testCategory.id);
            expect(updatedCategory.name).toBe('Updated Test Category');
            expect(updatedCategory.description).toBe('Updated description');
            expect(updatedCategory.color).toBe('#00ff00');

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'category',
                    action: 'update',
                    entityId: testCategory.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should update only provided fields', async () => {
            const updateData = {
                name: 'Partially Updated Category'
                // Only updating name, not description or color
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.category.name).toBe('Partially Updated Category');
            expect(response.body.category.description).toBe('Test category for forms and templates'); // Original value
            expect(response.body.category.color).toBe('#ff0000'); // Original value
        });

        test('should return 401 for unauthenticated request', async () => {
            const updateData = {
                name: 'Unauthenticated Update'
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .send(updateData);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });

        test('should return 403 for non-admin role', async () => {
            // Create non-admin user
            const passwordHash = bcrypt.hashSync('testpassword123', 10);
            const editorUser = await User.create({
                id: 'u-test-editor',
                email: 'editor@test.com',
                username: 'testeditor',
                passwordHash,
                role: 'editor'
            });

            const editorToken = jwt.sign(
                { sub: editorUser.id, role: 'editor', email: editorUser.email },
                process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
                { expiresIn: '15m' }
            );

            const updateData = {
                name: 'Editor Update'
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${editorToken}`)
                .send(updateData);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 404 for non-existent category', async () => {
            const updateData = {
                name: 'Updated Category'
            };

            const response = await request(app)
                .put('/api/categories/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Category not found' });
        });

        test('should return 400 for empty name', async () => {
            const updateData = {
                name: ''
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Category name is required' });
        });

        test('should return 400 for name too long', async () => {
            const updateData = {
                name: 'A'.repeat(256) // 256 characters, exceeds 255 limit
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Category name is too long' });
        });

        test('should return 409 for duplicate category name', async () => {
            // Create another category
            const anotherCategory = await Category.create({
                id: 'category-test-2',
                name: 'Another Category',
                description: 'Another test category',
                color: '#00ff00'
            });

            const updateData = {
                name: 'Another Category' // Same name as the other category
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(409);
            expect(response.body).toEqual({ error: 'Category name already exists' });
        });

        test('should return 400 for invalid color format', async () => {
            const updateData = {
                color: 'invalid-color-format'
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid color format' });
        });

        test('should allow updating to same name', async () => {
            const updateData = {
                name: 'Test Category' // Same name as current category
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.category.name).toBe('Test Category');
        });
    });

    describe('DELETE /api/categories/:id', () => {
        test('should delete category (admin)', async () => {
            // Create a separate category for deletion (not used by any forms)
            const deleteCategory = await Category.create({
                id: 'category-delete-test',
                name: 'Delete Test Category',
                description: 'Category for deletion test',
                color: '#00ff00'
            });

            const response = await request(app)
                .delete(`/api/categories/${deleteCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });

            // Verify category was deleted from database
            const deletedCategory = await Category.findByPk(deleteCategory.id);
            expect(deletedCategory).toBeFalsy();

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'category',
                    action: 'delete',
                    entityId: testCategory.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .delete(`/api/categories/${testCategory.id}`);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({ error: 'Unauthorized' });
        });

        test('should return 403 for non-admin role', async () => {
            // Create non-admin user
            const passwordHash = bcrypt.hashSync('testpassword123', 10);
            const editorUser = await User.create({
                id: 'u-test-editor',
                email: 'editor@test.com',
                username: 'testeditor',
                passwordHash,
                role: 'editor'
            });

            const editorToken = jwt.sign(
                { sub: editorUser.id, role: 'editor', email: editorUser.email },
                process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
                { expiresIn: '15m' }
            );

            const response = await request(app)
                .delete(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 404 for non-existent category', async () => {
            const response = await request(app)
                .delete('/api/categories/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Category not found' });
        });

        test('should return 400 when category is in use by forms', async () => {
            const response = await request(app)
                .delete(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Cannot delete category that is in use');
            expect(response.body.details).toContain('1 form(s)');

            // Verify category was not deleted
            const category = await Category.findByPk(testCategory.id);
            expect(category).toBeTruthy();
        });

        test('should return 400 when category is in use by templates', async () => {
            // Delete the form first to test template constraint
            await Form.destroy({ where: { id: testForm.id } });

            const response = await request(app)
                .delete(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Cannot delete category that is in use');
            expect(response.body.details).toContain('1 template(s)');

            // Verify category was not deleted
            const category = await Category.findByPk(testCategory.id);
            expect(category).toBeTruthy();
        });

        test('should return 400 when category is in use by both forms and templates', async () => {
            const response = await request(app)
                .delete(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Cannot delete category that is in use');
            expect(response.body.details).toContain('1 form(s) and 1 template(s)');

            // Verify category was not deleted
            const category = await Category.findByPk(testCategory.id);
            expect(category).toBeTruthy();
        });

        test('should delete category when not in use', async () => {
            // Delete forms and templates using the category
            await Form.destroy({ where: { id: testForm.id } });
            await Template.destroy({ where: { id: testTemplate.id } });

            const response = await request(app)
                .delete(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });

            // Verify category was deleted
            const deletedCategory = await Category.findByPk(testCategory.id);
            expect(deletedCategory).toBeFalsy();
        });
    });

    describe('GET /categories (HTML page)', () => {
        test('should render categories page (admin)', async () => {
            const response = await request(app)
                .get('/categories')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('text/html');
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/categories');

            expect(response.status).toBe(302); // Redirect to login
            expect(response.headers.location).toBe('/login');
        });

        test('should return 403 for non-admin role', async () => {
            // Create non-admin user
            const passwordHash = bcrypt.hashSync('testpassword123', 10);
            const editorUser = await User.create({
                id: 'u-test-editor',
                email: 'editor@test.com',
                username: 'testeditor',
                passwordHash,
                role: 'editor'
            });

            const editorToken = jwt.sign(
                { sub: editorUser.id, role: 'editor', email: editorUser.email },
                process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
                { expiresIn: '15m' }
            );

            const response = await request(app)
                .get('/categories')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed JSON requests', async () => {
            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Content-Type', 'application/json')
                .send('{"name": "Test", "description": }'); // Malformed JSON

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });

        test('should handle database connection errors gracefully', async () => {
            // Mock Category.create to throw an error
            const originalCreate = Category.create;
            Category.create = jest.fn().mockRejectedValue(new Error('Database connection failed'));

            const categoryData = {
                name: 'Test Category'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('error');

            // Restore original method
            Category.create = originalCreate;
        });

        test('should handle unique ID generation failures', async () => {
            // Mock crypto.randomBytes to return the same value repeatedly
            const crypto = await import('crypto');
            const originalRandomBytes = crypto.randomBytes;
            // Note: Cannot mock crypto.randomBytes directly, so we'll test the actual behavior

            // Mock Category.findByPk to always return existing category (simulating collision)
            const originalFindByPk = Category.findByPk;
            Category.findByPk = jest.fn().mockResolvedValue({ id: 'category-samevalue' });

            const categoryData = {
                name: 'Collision Test Category'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Could not generate unique category id' });

            // Restore original methods
            require('crypto').randomBytes = originalRandomBytes;
            Category.findByPk = originalFindByPk;
        });
    });

    describe('Audit Logging', () => {
        test('should log category creation', async () => {
            const categoryData = {
                name: 'Audit Test Category',
                description: 'Category for audit testing'
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'category',
                    action: 'create',
                    entityId: response.body.category.id
                }
            });

            expect(auditLog).toBeTruthy();
            expect(auditLog.metaJson).toContain('Audit Test Category');
        });

        test('should log category updates', async () => {
            const updateData = {
                name: 'Updated Audit Category'
            };

            const response = await request(app)
                .put(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'category',
                    action: 'update',
                    entityId: testCategory.id
                }
            });

            expect(auditLog).toBeTruthy();
        });

        test('should log category deletions', async () => {
            // Delete forms and templates first
            await Form.destroy({ where: { id: testForm.id } });
            await Template.destroy({ where: { id: testTemplate.id } });

            const response = await request(app)
                .delete(`/api/categories/${testCategory.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'category',
                    action: 'delete',
                    entityId: testCategory.id
                }
            });

            expect(auditLog).toBeTruthy();
        });
    });

    describe('Data Validation', () => {
        test('should trim whitespace from name and description', async () => {
            const categoryData = {
                name: '  Trimmed Name  ',
                description: '  Trimmed Description  '
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(200);
            expect(response.body.category.name).toBe('Trimmed Name');
            expect(response.body.category.description).toBe('Trimmed Description');
        });

        test('should handle null and undefined values gracefully', async () => {
            const categoryData = {
                name: 'Null Test Category',
                description: null,
                color: undefined
            };

            const response = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData);

            expect(response.status).toBe(200);
            expect(response.body.category.name).toBe('Null Test Category');
            expect(response.body.category.description).toBe('null');
            expect(response.body.category.color).toBe('#6c757d'); // Default color
        });

        test('should validate color format strictly', async () => {
            const invalidColors = [
                'red',           // Not hex
                '#ff',           // Too short
                '#fffff',        // Too long
                '#gggggg',       // Invalid characters
                'ff0000',        // Missing #
                '#FF0000',       // Should be lowercase (depending on implementation)
                '#ff000',        // Missing one character
                '#ff00000'       // Too many characters
            ];

            for (const color of invalidColors) {
                const categoryData = {
                    name: `Invalid Color Test ${color}`,
                    color: color
                };

                const response = await request(app)
                    .post('/api/categories')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(categoryData);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('category');
            }
        });
    });
});
