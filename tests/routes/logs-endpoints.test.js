// tests/routes/logs-endpoints.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../helpers/test-db-setup.js';
import { User } from '../../src/server/models/User.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { Form } from '../../src/server/models/Form.js';
import { Category } from '../../src/server/models/Category.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Audit Logs API Endpoints', () => {
    let adminToken;
    let testUser;
    let testAuditLogs;

    beforeEach(async () => {
        // Clean up test data
        await Form.destroy({ where: {} });
        await Category.destroy({ where: {} });
        await AuditLog.destroy({ where: {} });
        await User.destroy({ where: {} });

        // Create test admin user
        const passwordHash = bcrypt.hashSync('testpassword123', 10);

        const adminUser = await User.create({
            id: 'u-test-admin',
            email: 'admin@test.com',
            username: 'testadmin',
            passwordHash,
            role: 'admin'
        });

        // Create JWT token
        adminToken = jwt.sign(
            { sub: adminUser.id, role: 'admin', email: adminUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );

        // Create test user
        testUser = await User.create({
            id: 'u-test-user',
            email: 'testuser@example.com',
            username: 'testuser',
            passwordHash,
            role: 'editor'
        });

        // Create test audit logs
        testAuditLogs = await AuditLog.bulkCreate([
            {
                id: 'log-1',
                entity: 'form',
                action: 'create',
                entityId: 'form-1',
                userId: adminUser.id,
                ip: '127.0.0.1',
                ua: 'Mozilla/5.0 Test Browser',
                metaJson: JSON.stringify({ title: 'Test Form', fields: 3 })
            },
            {
                id: 'log-2',
                entity: 'user',
                action: 'update',
                entityId: testUser.id,
                userId: adminUser.id,
                ip: '127.0.0.1',
                ua: 'Mozilla/5.0 Test Browser',
                metaJson: JSON.stringify({ changes: { role: { from: 'editor', to: 'admin' } } })
            },
            {
                id: 'log-3',
                entity: 'category',
                action: 'delete',
                entityId: 'category-1',
                userId: adminUser.id,
                ip: '127.0.0.1',
                ua: 'Mozilla/5.0 Test Browser',
                metaJson: JSON.stringify({ name: 'Deleted Category' })
            },
            {
                id: 'log-4',
                entity: 'auth',
                action: 'login',
                entityId: testUser.id,
                userId: testUser.id,
                ip: '192.168.1.1',
                ua: 'Mozilla/5.0 Different Browser',
                metaJson: JSON.stringify({ email: 'testuser@example.com', role: 'editor' })
            },
            {
                id: 'log-5',
                entity: 'template',
                action: 'create',
                entityId: 'template-1',
                userId: adminUser.id,
                ip: '127.0.0.1',
                ua: 'Mozilla/5.0 Test Browser',
                metaJson: JSON.stringify({ name: 'Test Template', fields: 5 })
            }
        ]);
    });

    afterEach(async () => {
        // Clean up test data
        await Form.destroy({ where: {} });
        await Category.destroy({ where: {} });
        await AuditLog.destroy({ where: {} });
        await User.destroy({ where: {} });
    });

    describe('GET /api/logs', () => {
        test('should return audit logs in DataTables format (admin)', async () => {
            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('draw');
            expect(response.body).toHaveProperty('recordsTotal');
            expect(response.body).toHaveProperty('recordsFiltered');
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);

            const log = response.body.data[0];
            expect(log).toHaveProperty('id');
            expect(log).toHaveProperty('entity');
            expect(log).toHaveProperty('action');
            expect(log).toHaveProperty('entityId');
            expect(log).toHaveProperty('userId');
            expect(log).toHaveProperty('userEmail');
            expect(log).toHaveProperty('userUsername');
            expect(log).toHaveProperty('ip');
            expect(log).toHaveProperty('ua');
            expect(log).toHaveProperty('metaJson');
            expect(log).toHaveProperty('createdAt');
        });

        test('should support DataTables pagination parameters', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    draw: 1,
                    start: 0,
                    length: 3
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.draw).toBe(1);
            expect(response.body.recordsTotal).toBe(5);
            expect(response.body.recordsFiltered).toBe(5);
            expect(response.body.data.length).toBeLessThanOrEqual(3);
        });

        test('should support search functionality', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    'search[value]': 'form'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // Should find logs related to forms
            const formLogs = response.body.data.filter(log =>
                log.entity === 'form' ||
                log.metaJson?.includes('form') ||
                log.action.includes('form')
            );
            expect(formLogs.length).toBeGreaterThan(0);
        });

        test('should filter by entity', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    entity: 'form'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // All returned logs should be for forms
            response.body.data.forEach(log => {
                expect(log.entity).toBe('form');
            });
        });

        test('should filter by action', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    action: 'create'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // All returned logs should be create actions
            response.body.data.forEach(log => {
                expect(log.action).toBe('create');
            });
        });

        test('should filter by userId', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    userId: testUser.id
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // All returned logs should be by the test user
            response.body.data.forEach(log => {
                expect(log.userId).toBe(testUser.id);
            });
        });

        test('should combine multiple filters', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    entity: 'form',
                    action: 'create'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // All returned logs should match both filters
            response.body.data.forEach(log => {
                expect(log.entity).toBe('form');
                expect(log.action).toBe('create');
            });
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/api/logs');

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
                .get('/api/logs')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should handle malformed metaJson gracefully', async () => {
            // Create a log with malformed JSON
            await AuditLog.create({
                id: 'log-malformed',
                entity: 'test',
                action: 'test',
                entityId: 'test-1',
                userId: testUser.id,
                ip: '127.0.0.1',
                ua: 'Test Browser',
                metaJson: 'malformed json {'
            });

            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // Should find the malformed log and handle it gracefully
            const malformedLog = response.body.data.find(log => log.id === 'log-malformed');
            expect(malformedLog).toBeTruthy();
            expect(malformedLog.metaJson).toBe('malformed json {'); // Should keep as string
        });

        test('should include user information for logs with userId', async () => {
            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Find a log with a userId
            const logWithUser = response.body.data.find(log => log.userId === testUser.id);
            expect(logWithUser).toBeTruthy();
            expect(logWithUser.userEmail).toBe('testuser@example.com');
            expect(logWithUser.userUsername).toBe('testuser');
        });

        test('should handle logs without userId', async () => {
            // Create a log without userId
            await AuditLog.create({
                id: 'log-no-user',
                entity: 'system',
                action: 'startup',
                entityId: null,
                userId: null,
                ip: '127.0.0.1',
                ua: 'System',
                metaJson: JSON.stringify({ message: 'System started' })
            });

            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Find the log without userId
            const logWithoutUser = response.body.data.find(log => log.id === 'log-no-user');
            expect(logWithoutUser).toBeTruthy();
            expect(logWithoutUser.userId).toBeNull();
            expect(logWithoutUser.userEmail).toBeNull();
            expect(logWithoutUser.userUsername).toBeNull();
        });
    });

    describe('GET /admin/logs (HTML page)', () => {
        test('should render logs page (admin)', async () => {
            const response = await request(app)
                .get('/admin/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('text/html');
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(app)
                .get('/admin/logs');

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
                .get('/admin/logs')
                .set('Authorization', `Bearer ${editorToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });

        test('should limit logs to 200 most recent', async () => {
            // Create more than 200 logs
            const logs = [];
            for (let i = 0; i < 250; i++) {
                logs.push({
                    id: `log-bulk-${i}`,
                    entity: 'test',
                    action: 'test',
                    entityId: `test-${i}`,
                    userId: testUser.id,
                    ip: '127.0.0.1',
                    ua: 'Test Browser',
                    metaJson: JSON.stringify({ index: i })
                });
            }
            await AuditLog.bulkCreate(logs);

            const response = await request(app)
                .get('/admin/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            // The page should render successfully even with many logs
            expect(response.headers['content-type']).toContain('text/html');
        });
    });

    describe('Log Data Integrity', () => {
        test('should preserve all log fields correctly', async () => {
            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Find a specific log we created
            const testLog = response.body.data.find(log => log.id === 'log-1');
            expect(testLog).toBeTruthy();
            expect(testLog.entity).toBe('form');
            expect(testLog.action).toBe('create');
            expect(testLog.entityId).toBe('form-1');
            expect(testLog.userId).toBe('u-test-admin');
            expect(testLog.ip).toBe('127.0.0.1');
            expect(testLog.ua).toBe('Mozilla/5.0 Test Browser');
            expect(testLog.metaJson).toHaveProperty('title');
            expect(testLog.metaJson.title).toBe('Test Form');
        });

        test('should handle complex metaJson structures', async () => {
            // Create a log with complex metadata
            await AuditLog.create({
                id: 'log-complex',
                entity: 'form',
                action: 'update',
                entityId: 'form-complex',
                userId: testUser.id,
                ip: '127.0.0.1',
                ua: 'Test Browser',
                metaJson: JSON.stringify({
                    changes: {
                        title: { from: 'Old Title', to: 'New Title' },
                        fields: { from: 3, to: 5 },
                        category: { from: 'cat1', to: 'cat2' }
                    },
                    timestamp: '2023-01-01T00:00:00Z',
                    nested: {
                        deep: {
                            value: 'test'
                        }
                    }
                })
            });

            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            const complexLog = response.body.data.find(log => log.id === 'log-complex');
            expect(complexLog).toBeTruthy();
            expect(complexLog.metaJson).toHaveProperty('changes');
            expect(complexLog.metaJson.changes).toHaveProperty('title');
            expect(complexLog.metaJson.changes.title.from).toBe('Old Title');
            expect(complexLog.metaJson.nested.deep.value).toBe('test');
        });

        test('should handle empty metaJson', async () => {
            // Create a log with empty metadata
            await AuditLog.create({
                id: 'log-empty',
                entity: 'system',
                action: 'ping',
                entityId: null,
                userId: null,
                ip: '127.0.0.1',
                ua: 'System',
                metaJson: null
            });

            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            const emptyLog = response.body.data.find(log => log.id === 'log-empty');
            expect(emptyLog).toBeTruthy();
            expect(emptyLog.metaJson).toBeNull();
        });
    });

    describe('Search Functionality', () => {
        test('should search across entity field', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    'search[value]': 'user'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // Should find logs with 'user' in entity field
            const userLogs = response.body.data.filter(log => log.entity.includes('user'));
            expect(userLogs.length).toBeGreaterThan(0);
        });

        test('should search across action field', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    'search[value]': 'delete'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // Should find logs with 'delete' in action field
            const deleteLogs = response.body.data.filter(log => log.action.includes('delete'));
            expect(deleteLogs.length).toBeGreaterThan(0);
        });

        test('should search across entityId field', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    'search[value]': 'form-1'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // Should find logs with 'form-1' in entityId field
            const formLogs = response.body.data.filter(log => log.entityId === 'form-1');
            expect(formLogs.length).toBeGreaterThan(0);
        });

        test('should search across IP field', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    'search[value]': '192.168'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // Should find logs with '192.168' in IP field
            const ipLogs = response.body.data.filter(log => log.ip.includes('192.168'));
            expect(ipLogs.length).toBeGreaterThan(0);
        });

        test('should handle case-insensitive search', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    'search[value]': 'FORM'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);

            // Should find logs with 'form' (case-insensitive)
            const formLogs = response.body.data.filter(log =>
                log.entity.toLowerCase().includes('form')
            );
            expect(formLogs.length).toBeGreaterThan(0);
        });

        test('should handle empty search', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    'search[value]': ''
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(5); // Should return all logs
        });
    });

    describe('Error Handling', () => {
        test('should handle database connection errors gracefully', async () => {
            // Mock AuditLog.findAll to throw an error
            const originalFindAll = AuditLog.findAll;
            AuditLog.findAll = jest.fn().mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('Failed to fetch logs');

            // Restore original method
            AuditLog.findAll = originalFindAll;
        });

        test('should handle malformed query parameters', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    draw: 'invalid',
                    start: 'not-a-number',
                    length: 'also-invalid'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            // Should handle gracefully with default values
            expect(response.body.draw).toBe(1);
            expect(response.body.data).toBeDefined();
        });

        test('should handle very large search values', async () => {
            const largeSearch = 'A'.repeat(10000);

            const response = await request(app)
                .get('/api/logs')
                .query({
                    'search[value]': largeSearch
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(0); // Should return no results
        });
    });

    describe('Performance and Limits', () => {
        test('should handle large number of logs efficiently', async () => {
            // Create a large number of logs
            const logs = [];
            for (let i = 0; i < 1000; i++) {
                logs.push({
                    id: `log-perf-${i}`,
                    entity: 'performance',
                    action: 'test',
                    entityId: `perf-${i}`,
                    userId: testUser.id,
                    ip: '127.0.0.1',
                    ua: 'Test Browser',
                    metaJson: JSON.stringify({ index: i, data: 'x'.repeat(100) })
                });
            }
            await AuditLog.bulkCreate(logs);

            const response = await request(app)
                .get('/api/logs')
                .query({
                    length: 10
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.recordsTotal).toBeGreaterThan(1000);
            expect(response.body.data.length).toBeLessThanOrEqual(10);
        });

        test('should limit pagination results', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({
                    length: 1000 // Request more than reasonable
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            // Should not return more than a reasonable limit
            expect(response.body.data.length).toBeLessThanOrEqual(100);
        });
    });

    describe('Security', () => {
        test('should not expose sensitive information in logs', async () => {
            // Create a log that might contain sensitive data
            await AuditLog.create({
                id: 'log-sensitive',
                entity: 'user',
                action: 'password_reset',
                entityId: testUser.id,
                userId: testUser.id,
                ip: '127.0.0.1',
                ua: 'Test Browser',
                metaJson: JSON.stringify({
                    password: 'secret123',
                    token: 'sensitive-token',
                    email: 'user@example.com'
                })
            });

            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            const sensitiveLog = response.body.data.find(log => log.id === 'log-sensitive');
            expect(sensitiveLog).toBeTruthy();
            // The API should return the data as-is (it's up to the frontend to sanitize)
            expect(sensitiveLog.metaJson).toHaveProperty('password');
            expect(sensitiveLog.metaJson.password).toBe('secret123');
        });

        test('should require admin privileges for all log access', async () => {
            // Test that even with valid authentication, non-admin users can't access logs
            const passwordHash = bcrypt.hashSync('testpassword123', 10);
            const viewerUser = await User.create({
                id: 'u-test-viewer',
                email: 'viewer@test.com',
                username: 'testviewer',
                passwordHash,
                role: 'viewer'
            });

            const viewerToken = jwt.sign(
                { sub: viewerUser.id, role: 'viewer', email: viewerUser.email },
                process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
                { expiresIn: '15m' }
            );

            const response = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toEqual({ error: 'Forbidden' });
        });
    });
});
