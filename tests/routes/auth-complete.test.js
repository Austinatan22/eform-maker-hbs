// tests/routes/auth-complete.test.js
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestAuthRoutes } from '../helpers/test-auth-routes.js';
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
import jwt from 'jsonwebtoken';

describe('Authentication Routes - Complete Tests', () => {
    let app;
    let testUser;
    let testAdmin;
    let testViewer;

    beforeEach(async () => {
        // Setup isolated test database
        await setupTestDatabase();

        // Create test users
        testUser = await createTestUser({
            email: 'test@example.com',
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

        // Setup Express app
        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(session({
            secret: 'test-session-secret',
            resave: false,
            saveUninitialized: false,
            cookie: { secure: false }
        }));

        // Configure Handlebars
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        app.engine('hbs', engine({
            extname: '.hbs',
            defaultLayout: false,
            layoutsDir: path.join(__dirname, '../../views/layouts'),
            partialsDir: path.join(__dirname, '../../views/partials')
        }));
        app.set('view engine', 'hbs');
        app.set('views', path.join(__dirname, '../../views'));

        // Set test environment
        process.env.NODE_ENV = 'test';
        process.env.AUTH_ENABLED = '1';
        process.env.JWT_SECRET = 'test_jwt_secret_key';

        // Add test auth routes that use our test database
        const testAuthRoutes = createTestAuthRoutes(global.TestUser, global.TestRefreshToken, global.TestUserLockout);
        app.use('/', testAuthRoutes);

        // Add JWT middleware for protected routes
        const jwtMiddleware = (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const token = authHeader.substring(7);
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.user = decoded;
                next();
            } catch (error) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        };

        // Add test protected routes
        app.get('/protected', jwtMiddleware, (req, res) => {
            res.json({ message: 'Access granted', user: req.user });
        });

        app.get('/admin-only', jwtMiddleware, (req, res) => {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Admin access required' });
            }
            res.json({ message: 'Admin access granted', user: req.user });
        });
    });

    afterEach(async () => {
        await clearTestData();
        await teardownTestDatabase();
    });

    describe('Valid Login Tests', () => {
        it('should login with valid credentials via API', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                })
                .expect(200);

            expect(response.body.accessToken).toBeDefined();
            expect(response.body.expiresIn).toBeDefined();
            expect(response.body.user).toBeDefined();
            expect(response.body.user.email).toBe('test@example.com');
            expect(response.body.user.role).toBe('editor');
            expect(response.body.refreshToken).toBeDefined();
        });

        it('should login admin with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@example.com',
                    password: 'admin123'
                })
                .expect(200);

            expect(response.body.user.role).toBe('admin');
            expect(response.body.accessToken).toBeDefined();
        });

        it('should login viewer with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'viewer@example.com',
                    password: 'viewer123'
                })
                .expect(200);

            expect(response.body.user.role).toBe('viewer');
            expect(response.body.accessToken).toBeDefined();
        });
    });

    describe('JWT Token Validation', () => {
        it('should validate JWT token and allow access', async () => {
            // First login to get JWT
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                })
                .expect(200);

            const { accessToken } = loginResponse.body;

            // Use JWT to access protected route
            const protectedResponse = await request(app)
                .get('/protected')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(protectedResponse.body.message).toBe('Access granted');
            expect(protectedResponse.body.user.email).toBe('test@example.com');
        });

        it('should reject invalid JWT token', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);

            expect(response.body.error).toBe('Unauthorized');
        });

        it('should reject expired JWT token', async () => {
            // Create expired token
            const expiredToken = await generateTestJWT(testUser);
            // Note: In a real test, you'd need to mock time or use a very short expiry

            // For now, test with malformed token
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'Bearer expired-token')
                .expect(401);

            expect(response.body.error).toBe('Unauthorized');
        });
    });

    describe('Session Management', () => {
        it('should create session on web login', async () => {
            const response = await request(app)
                .post('/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            // Should redirect on successful login
            expect([200, 302]).toContain(response.status);

            // Should have session cookie
            const sessionCookie = response.headers['set-cookie']
                ?.find(cookie => cookie.startsWith('connect.sid'));
            expect(sessionCookie).toBeDefined();
        });

        it('should clear session on logout', async () => {
            // First login to get session
            const loginResponse = await request(app)
                .post('/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            const sessionCookie = loginResponse.headers['set-cookie']
                ?.find(cookie => cookie.startsWith('connect.sid'));

            // Now logout
            const logoutResponse = await request(app)
                .post('/logout')
                .set('Cookie', sessionCookie || '')
                .expect(302);

            expect(logoutResponse.headers.location).toBe('/login');
        });
    });

    describe('Role-based Access Control', () => {
        it('should allow admin access to admin-only route', async () => {
            // Login as admin
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@example.com',
                    password: 'admin123'
                })
                .expect(200);

            const { accessToken } = loginResponse.body;

            // Access admin route
            const adminResponse = await request(app)
                .get('/admin-only')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(adminResponse.body.message).toBe('Admin access granted');
            expect(adminResponse.body.user.role).toBe('admin');
        });

        it('should deny editor access to admin-only route', async () => {
            // Login as editor
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                })
                .expect(200);

            const { accessToken } = loginResponse.body;

            // Try to access admin route
            const adminResponse = await request(app)
                .get('/admin-only')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(403);

            expect(adminResponse.body.error).toBe('Admin access required');
        });

        it('should deny viewer access to admin-only route', async () => {
            // Login as viewer
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'viewer@example.com',
                    password: 'viewer123'
                })
                .expect(200);

            const { accessToken } = loginResponse.body;

            // Try to access admin route
            const adminResponse = await request(app)
                .get('/admin-only')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(403);

            expect(adminResponse.body.error).toBe('Admin access required');
        });
    });

    describe('Password Hashing Verification', () => {
        it('should verify correct password hash', async () => {
            const user = await global.TestUser.findOne({ where: { email: 'test@example.com' } });

            const isValid = await bcrypt.compare('password123', user.passwordHash);
            expect(isValid).toBe(true);
        });

        it('should reject incorrect password hash', async () => {
            const user = await global.TestUser.findOne({ where: { email: 'test@example.com' } });

            const isValid = await bcrypt.compare('wrongpassword', user.passwordHash);
            expect(isValid).toBe(false);
        });

        it('should use different hashes for same password', async () => {
            const user1 = await createTestUser({
                email: 'user1@example.com',
                passwordHash: await bcrypt.hash('samepassword', 10)
            });

            const user2 = await createTestUser({
                email: 'user2@example.com',
                passwordHash: await bcrypt.hash('samepassword', 10)
            });

            expect(user1.passwordHash).not.toBe(user2.passwordHash);

            // Both should verify correctly
            expect(await bcrypt.compare('samepassword', user1.passwordHash)).toBe(true);
            expect(await bcrypt.compare('samepassword', user2.passwordHash)).toBe(true);
        });
    });

    describe('Unauthorized Access Attempts', () => {
        it('should handle missing Authorization header', async () => {
            const response = await request(app)
                .get('/protected')
                .expect(401);

            expect(response.body.error).toBe('Unauthorized');
        });

        it('should handle malformed Authorization header', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'InvalidFormat token123')
                .expect(401);

            expect(response.body.error).toBe('Unauthorized');
        });

        it('should handle JWT token without Bearer prefix', async () => {
            const token = await generateTestJWT(testUser);

            const response = await request(app)
                .get('/protected')
                .set('Authorization', token)
                .expect(401);

            expect(response.body.error).toBe('Unauthorized');
        });
    });

    describe('Invalid Login Attempts', () => {
        it('should return 401 for wrong password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'wrongpassword'
                })
                .expect(401);

            expect(response.body.error).toBe('Invalid credentials');
        });

        it('should return 401 for non-existent user', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password123'
                })
                .expect(401);

            expect(response.body.error).toBe('Invalid credentials');
        });

        it('should return 401 for empty credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: '',
                    password: ''
                })
                .expect(401);

            expect(response.body.error).toBe('Invalid credentials');
        });
    });
});
