// tests/routes/users-endpoints.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
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
import { AuditLog } from '../../src/server/models/AuditLog.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Users Management API Endpoints', () => {
    let adminToken;
    let testUser;
    let mainAdminUser;

    beforeEach(async () => {
        // Setup isolated test database
        await setupTestDatabase();

        // Create test admin user using helper function
        mainAdminUser = await createTestAdmin({
            id: 'u-admin',
            email: 'admin@example.com',
            username: 'admin'
        });

        // Create JWT token
        adminToken = jwt.sign(
            { sub: mainAdminUser.id, role: 'admin', email: mainAdminUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );

        // Create test user
        const passwordHash = bcrypt.hashSync('testpassword123', 10);
        testUser = await User.create({
            id: 'u-test-user',
            email: 'testuser@example.com',
            username: 'testuser',
            passwordHash,
            role: 'editor'
        });
    });

    afterEach(async () => {
        // Clean up test database
        await teardownTestDatabase();
    });

    describe('GET /api/users', () => {
        test('should return users list in DataTables format (admin)', async () => {
            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('draw');
            expect(response.body).toHaveProperty('recordsTotal');
            expect(response.body).toHaveProperty('recordsFiltered');
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);

            const user = response.body.data[0];
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('email');
            expect(user).toHaveProperty('username');
            expect(user).toHaveProperty('role');
            expect(user).toHaveProperty('updatedAt');
        });

        test('should support DataTables pagination parameters', async () => {
            const response = await request(app)
                .get('/api/users')
                .query({
                    draw: 1,
                    start: 0,
                    length: 10
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.draw).toBe(1);
            expect(response.body.recordsTotal).toBeGreaterThan(0);
            expect(response.body.recordsFiltered).toBeGreaterThan(0);
        });

        test('should support search functionality', async () => {
            const response = await request(app)
                .get('/api/users')
                .query({
                    'search[value]': 'testuser'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // Should find the test user
            const foundUser = response.body.data.find(u => u.email === 'testuser@example.com');
            expect(foundUser).toBeTruthy();
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/api/users');

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
                .get('/api/users')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });
    });

    describe('POST /api/users', () => {
        test('should create user with valid data (admin)', async () => {
            const userData = {
                email: 'newuser@example.com',
                password: 'NewPassword123!',
                role: 'editor',
                username: 'newuser'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('id');
            expect(response.body.user.email).toBe('newuser@example.com');
            expect(response.body.user.username).toBe('newuser');
            expect(response.body.user.role).toBe('editor');

            // Verify user was created in database
            const createdUser = await User.findByPk(response.body.user.id);
            expect(createdUser).toBeTruthy();
            expect(createdUser.email).toBe('newuser@example.com');
            expect(createdUser.username).toBe('newuser');
            expect(createdUser.role).toBe('editor');

            // Verify password was hashed
            expect(createdUser.passwordHash).not.toBe('newpassword123');
            expect(bcrypt.compareSync('NewPassword123!', createdUser.passwordHash)).toBe(true);

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'user',
                    action: 'create',
                    entityId: response.body.user.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should create user with minimal data (admin)', async () => {
            const userData = {
                email: 'minimal@example.com',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);
            expect(response.body.user.email).toBe('minimal@example.com');
            expect(response.body.user.role).toBe('editor'); // Default role
            expect(response.body.user.username).toBe('minimal'); // Generated from email
        });

        test('should return 401 for unauthenticated request', async () => {
            const userData = {
                email: 'unauth@example.com',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData);

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

            const userData = {
                email: 'editoruser@example.com',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${editorToken}`)
                .send(userData);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 400 for missing email', async () => {
            const userData = {
                password: 'Password123!',
                role: 'editor'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Valid email required' });
        });

        test('should return 400 for invalid email format', async () => {
            const userData = {
                email: 'invalid-email',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Valid email required' });
        });

        test('should return 400 for weak password', async () => {
            const userData = {
                email: 'weakpass@example.com',
                password: '123' // Too short
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Password does not meet requirements');
            expect(response.body).toHaveProperty('details');
        });

        test('should return 409 for duplicate email', async () => {
            const userData = {
                email: 'testuser@example.com', // Same email as existing user
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(409);
            expect(response.body).toEqual({ error: 'Email already in use' });
        });

        test('should validate role values', async () => {
            const userData = {
                email: 'invalidrole@example.com',
                password: 'Password123!',
                role: 'invalid-role'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);
            expect(response.body.user.role).toBe('editor'); // Should default to editor
        });

        test('should accept valid roles', async () => {
            const validRoles = ['admin', 'editor', 'viewer'];

            for (const role of validRoles) {
                const userData = {
                    email: `${role}@example.com`,
                    password: 'Password123!',
                    role: role
                };

                const response = await request(app)
                    .post('/api/users')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(userData);

                expect(response.status).toBe(200);
                expect(response.body.user.role).toBe(role);
            }
        });

        test('should generate username from email when not provided', async () => {
            const userData = {
                email: 'generated.username@example.com',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);
            expect(response.body.user.username).toBe('generated.username');
        });

        test('should truncate long usernames', async () => {
            const userData = {
                email: 'verylongusername@example.com',
                password: 'Password123!',
                username: 'A'.repeat(100) // Very long username
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);
            expect(response.body.user.username.length).toBeLessThanOrEqual(64);
        });
    });

    describe('PUT /api/users/:id', () => {
        test('should update user role (admin)', async () => {
            const updateData = {
                role: 'admin'
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.role).toBe('admin');

            // Verify user was updated in database
            const updatedUser = await User.findByPk(testUser.id);
            expect(updatedUser.role).toBe('admin');

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'user',
                    action: 'update',
                    entityId: testUser.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should update user username (admin)', async () => {
            const updateData = {
                username: 'updatedusername'
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.user.username).toBe('updatedusername');

            // Verify user was updated in database
            const updatedUser = await User.findByPk(testUser.id);
            expect(updatedUser.username).toBe('updatedusername');
        });

        test('should update user password (admin)', async () => {
            const updateData = {
                password: 'NewPassword123!'
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('ok', true);

            // Verify password was updated in database
            const updatedUser = await User.findByPk(testUser.id);
            expect(bcrypt.compareSync('NewPassword123!', updatedUser.passwordHash)).toBe(true);
        });

        test('should update multiple fields at once', async () => {
            const updateData = {
                role: 'viewer',
                username: 'multiusername'
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.user.role).toBe('viewer');
            expect(response.body.user.username).toBe('multiusername');

            // Verify both fields were updated in database
            const updatedUser = await User.findByPk(testUser.id);
            expect(updatedUser.role).toBe('viewer');
            expect(updatedUser.username).toBe('multiusername');
        });

        test('should return 401 for unauthenticated request', async () => {
            const updateData = {
                role: 'admin'
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
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
                role: 'admin'
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${editorToken}`)
                .send(updateData);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 404 for non-existent user', async () => {
            const updateData = {
                role: 'admin'
            };

            const response = await request(app)
                .put('/api/users/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not found' });
        });

        test('should return 400 for invalid role', async () => {
            const updateData = {
                role: 'invalid-role'
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid role' });
        });

        test('should return 400 for empty username', async () => {
            const updateData = {
                username: ''
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Username required' });
        });

        test('should return 409 for duplicate username', async () => {
            // Create another user with a specific username
            const passwordHash = bcrypt.hashSync('testpassword123', 10);
            await User.create({
                id: 'u-test-user-2',
                email: 'user2@example.com',
                username: 'uniqueusername',
                passwordHash,
                role: 'editor'
            });

            const updateData = {
                username: 'uniqueusername' // Same username as the other user
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(409);
            expect(response.body).toEqual({ error: 'Username already in use' });
        });

        test('should return 400 for weak password', async () => {
            const updateData = {
                password: '123' // Too short
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Password does not meet requirements');
        });

        test('should handle self-password change with session destruction', async () => {
            // Create a session-based request (simulate web login)
            const updateData = {
                password: 'NewPassword123!'
            };

            const response = await request(app)
                .put(`/api/users/${mainAdminUser.id}`) // Update the current admin user
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('reauth', true);

            // Verify password was updated
            const updatedUser = await User.findByPk(mainAdminUser.id);
            expect(bcrypt.compareSync('NewPassword123!', updatedUser.passwordHash)).toBe(true);
        });
    });

    describe('DELETE /api/users/:id', () => {
        test('should delete user (admin)', async () => {
            const response = await request(app)
                .delete(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });

            // Verify user was deleted from database
            const deletedUser = await User.findByPk(testUser.id);
            expect(deletedUser).toBeFalsy();

            // Verify audit log
            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'user',
                    action: 'delete',
                    entityId: testUser.id
                }
            });
            expect(auditLog).toBeTruthy();
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .delete(`/api/users/${testUser.id}`);

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
                .delete(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should return 404 for non-existent user', async () => {
            const response = await request(app)
                .delete('/api/users/nonexistent-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Not found' });
        });

        test('should return 400 for attempting to delete main admin', async () => {
            const response = await request(app)
                .delete(`/api/users/${mainAdminUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Cannot delete main admin user' });

            // Verify main admin was not deleted
            const adminUser = await User.findByPk(mainAdminUser.id);
            expect(adminUser).toBeTruthy();
        });

        test('should prevent deletion of main admin by email', async () => {
            // Create another admin user with a different email
            const passwordHash = bcrypt.hashSync('Password123!', 10);
            const anotherAdmin = await User.create({
                id: 'u-another-admin',
                email: 'another@example.com', // Different email
                username: 'anotheradmin',
                passwordHash,
                role: 'admin'
            });

            const response = await request(app)
                .delete(`/api/users/${anotherAdmin.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Cannot delete main admin user' });

            // Verify admin was not deleted
            const adminUser = await User.findByPk(anotherAdmin.id);
            expect(adminUser).toBeTruthy();
        });
    });

    describe('GET /admin/users (HTML page)', () => {
        test('should render users page (admin)', async () => {
            const response = await request(app)
                .get('/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('text/html');
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/admin/users');

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
                .get('/admin/users')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });
    });

    describe('Password Validation', () => {
        test('should validate password strength requirements', async () => {
            const weakPasswords = [
                '123',           // Too short
                'password',      // No numbers
                '12345678',      // No letters
                'Password',      // No numbers
                'pass123',       // Too short
                'PASSWORD123',   // No lowercase
                'password123'    // No uppercase
            ];

            for (const password of weakPasswords) {
                const userData = {
                    email: `weakpass${Math.random()}@example.com`,
                    password: password
                };

                const response = await request(app)
                    .post('/api/users')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(userData);

                expect(response.status).toBe(400);
                expect(response.body).toHaveProperty('error');
                expect(response.body.error).toContain('Password does not meet requirements');
            }
        });

        test('should accept strong passwords', async () => {
            const strongPasswords = [
                'Password123',
                'MySecure123',
                'Test123!',
                'StrongPass1',
                'ValidPass123'
            ];

            for (const password of strongPasswords) {
                const userData = {
                    email: `strongpass${Math.random()}@example.com`,
                    password: password
                };

                const response = await request(app)
                    .post('/api/users')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(userData);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('user');
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed JSON requests', async () => {
            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Content-Type', 'application/json')
                .send('{"email": "test@example.com", "password": }'); // Malformed JSON

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });

        test('should handle database connection errors gracefully', async () => {
            // Mock User.create to throw an error
            const originalCreate = User.create;
            User.create = jest.fn().mockRejectedValue(new Error('Database connection failed'));

            const userData = {
                email: 'test@example.com',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Server error');

            // Restore original method
            User.create = originalCreate;
        });

        test('should handle unique ID generation failures', async () => {
            // Mock crypto.randomBytes to return the same value repeatedly
            const crypto = await import('crypto');
            const originalRandomBytes = crypto.randomBytes;
            crypto.randomBytes = jest.fn().mockReturnValue(Buffer.from('samevalue'));

            // Mock User.findByPk to always return existing user (simulating collision)
            const originalFindByPk = User.findByPk;
            User.findByPk = jest.fn().mockResolvedValue({ id: 'u-samevalue' });

            const userData = {
                email: 'collision@example.com',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Server error');

            // Restore original methods
            require('crypto').randomBytes = originalRandomBytes;
            User.findByPk = originalFindByPk;
        });
    });

    describe('Audit Logging', () => {
        test('should log user creation with all details', async () => {
            const userData = {
                email: 'audit@example.com',
                password: 'Password123!',
                role: 'editor',
                username: 'audituser'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'user',
                    action: 'create',
                    entityId: response.body.user.id
                }
            });

            expect(auditLog).toBeTruthy();
            expect(auditLog.metaJson).toContain('audit@example.com');
            expect(auditLog.metaJson).toContain('audituser');
            expect(auditLog.metaJson).toContain('editor');
        });

        test('should log user updates with change details', async () => {
            const updateData = {
                role: 'admin',
                username: 'updateduser'
            };

            const response = await request(app)
                .put(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'user',
                    action: 'update',
                    entityId: testUser.id
                }
            });

            expect(auditLog).toBeTruthy();
            expect(auditLog.metaJson).toContain('changes');
        });

        test('should log user deletions', async () => {
            const response = await request(app)
                .delete(`/api/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            const auditLog = await AuditLog.findOne({
                where: {
                    entity: 'user',
                    action: 'delete',
                    entityId: testUser.id
                }
            });

            expect(auditLog).toBeTruthy();
            expect(auditLog.metaJson).toContain('testuser@example.com');
        });
    });

    describe('Data Validation', () => {
        test('should trim whitespace from email and username', async () => {
            const userData = {
                email: '  trimmed@example.com  ',
                password: 'Password123!',
                username: '  trimmeduser  '
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);
            expect(response.body.user.email).toBe('trimmed@example.com');
            expect(response.body.user.username).toBe('trimmeduser');
        });

        test('should convert email to lowercase', async () => {
            const userData = {
                email: 'UPPERCASE@EXAMPLE.COM',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);
            expect(response.body.user.email).toBe('uppercase@example.com');
        });

        test('should handle null and undefined values gracefully', async () => {
            const userData = {
                email: 'nulltest@example.com',
                password: 'Password123!',
                username: null,
                role: undefined
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(200);
            expect(response.body.user.email).toBe('nulltest@example.com');
            expect(response.body.user.username).toBe('nulltest'); // Generated from email
            expect(response.body.user.role).toBe('editor'); // Default role
        });
    });
});
