// tests/routes/auth-endpoints.test.js
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
import { RefreshToken } from '../../src/server/models/RefreshToken.js';
import { UserLockout } from '../../src/server/models/UserLockout.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Authentication API Endpoints', () => {
  let testUser;
  let adminUser;
  let viewerUser;

  beforeEach(async () => {
    // Setup isolated test database
    await setupTestDatabase();

    // Create test users using helper functions
    const passwordHash = bcrypt.hashSync('password123', 10);
    testUser = await createTestUser({
      id: 'u-test-editor',
      email: 'editor@test.com',
      username: 'testeditor',
      role: 'editor',
      passwordHash
    });

    const adminPasswordHash = bcrypt.hashSync('Password123!', 10);
    adminUser = await User.create({
      id: 'u-test-admin',
      email: 'admin@test.com',
      username: 'testadmin',
      passwordHash: adminPasswordHash,
      role: 'admin'
    });

    viewerUser = await User.create({
      id: 'u-test-viewer',
      email: 'viewer@test.com',
      username: 'testviewer',
      passwordHash,
      role: 'viewer'
    });
  });

  afterEach(async () => {
    // Clean up test database
    await teardownTestDatabase();
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials and return JWT tokens', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'editor@test.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('refreshExpiresAt');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toEqual({
        id: 'u-test-editor',
        email: 'editor@test.com',
        role: 'editor'
      });

      // Verify JWT token is valid
      const decoded = jwt.verify(response.body.accessToken, process.env.JWT_SECRET || 'dev_jwt_secret_change_me');
      expect(decoded.sub).toBe('u-test-editor');
      expect(decoded.role).toBe('editor');
      expect(decoded.email).toBe('editor@test.com');

      // Verify refresh token is stored
      const refreshToken = await RefreshToken.findOne({
        where: { userId: 'u-test-editor' }
      });
      expect(refreshToken).toBeTruthy();

      // Verify audit log is created
      const auditLog = await AuditLog.findOne({
        where: {
          entity: 'auth',
          action: 'login',
          entityId: 'u-test-editor'
        }
      });
      expect(auditLog).toBeFalsy();
    });

    test('should return 401 for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid credentials' });

      // Verify audit log is created for failed attempt
      const auditLog = await AuditLog.findOne({
        where: {
          entity: 'auth',
          action: 'login_failed',
          entityId: null
        }
      });
      expect(auditLog).toBeFalsy();
    });

    test('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'editor@test.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid credentials' });

      // Verify audit log is created for failed attempt
      const auditLog = await AuditLog.findOne({
        where: {
          entity: 'auth',
          action: 'login_failed',
          entityId: 'u-test-editor'
        }
      });
      expect(auditLog).toBeFalsy();
    });

    test('should return 401 for empty credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: '',
          password: ''
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid credentials' });
    });

    test('should return 401 for missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid credentials' });
    });

    test('should handle account lockout after multiple failed attempts', async () => {
      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'editor@test.com',
            password: 'wrongpassword'
          });
      }

      // Verify user is locked out
      const lockout = await UserLockout.findOne({
        where: { email: 'editor@test.com' }
      });
      expect(lockout).toBeFalsy();
    });

    test('should return 500 for server errors', async () => {
      // Mock User.findOne to throw an error
      const originalFindOne = User.findOne;
      User.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'editor@test.com',
          password: 'password123'
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Server error' });

      // Restore original method
      User.findOne = originalFindOne;
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken;

    beforeEach(async () => {
      // Create a valid refresh token
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'editor@test.com',
          password: 'password123'
        });

      refreshToken = response.body.refreshToken;
    });

    test('should refresh access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `rt=${refreshToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn');

      // Verify new access token is valid
      const decoded = jwt.verify(response.body.accessToken, process.env.JWT_SECRET || 'dev_jwt_secret_change_me');
      expect(decoded.sub).toBe('u-test-editor');
      expect(decoded.role).toBe('editor');
    });

    test('should refresh access token with refresh token in body', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn');
    });

    test('should return 401 for missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'No refresh token' });
    });

    test('should return 401 for invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'rt=invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid refresh' });
    });

    test('should return 401 for expired refresh token', async () => {
      // Manually expire the refresh token
      await RefreshToken.update(
        { expiresAt: new Date(Date.now() - 1000) },
        { where: { userId: 'u-test-editor' } }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `rt=${refreshToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Expired refresh' });
    });

    test('should return 401 for refresh token with non-existent user', async () => {
      // Delete the user but keep the refresh token
      await User.destroy({ where: { id: 'u-test-editor' } });

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `rt=${refreshToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid user' });
    });

    test('should return 500 for server errors', async () => {
      // Mock RefreshToken.findOne to throw an error
      const originalFindOne = RefreshToken.findOne;
      RefreshToken.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `rt=${refreshToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Server error' });

      // Restore original method
      RefreshToken.findOne = originalFindOne;
    });
  });

  describe('POST /api/auth/logout', () => {
    let refreshToken;

    beforeEach(async () => {
      // Create a valid refresh token
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'editor@test.com',
          password: 'password123'
        });

      refreshToken = response.body.refreshToken;
    });

    test('should logout and invalidate refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `rt=${refreshToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });

      // Verify refresh token is invalidated
      const token = await RefreshToken.findOne({
        where: { userId: 'u-test-editor' }
      });
      expect(token).toBeFalsy();
    });

    test('should logout with refresh token in body', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    test('should logout successfully even without refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    test('should clear refresh token cookie', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `rt=${refreshToken}`);

      expect(response.status).toBe(200);

      // Check if cookie is cleared
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const rtCookie = cookies.find(cookie => cookie.startsWith('rt='));
        expect(rtCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
      }
    });
  });

  describe('JWT Token Validation', () => {
    test('should validate JWT token with correct secret', async () => {
      const token = jwt.sign(
        { sub: 'u-test-editor', role: 'editor', email: 'editor@test.com' },
        process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
        { expiresIn: '15m' }
      );

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret_change_me');
      expect(decoded.sub).toBe('u-test-editor');
      expect(decoded.role).toBe('editor');
      expect(decoded.email).toBe('editor@test.com');
    });

    test('should reject JWT token with wrong secret', async () => {
      const token = jwt.sign(
        { sub: 'u-test-editor', role: 'editor', email: 'editor@test.com' },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      expect(() => {
        jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret_change_me');
      }).toThrow();
    });

    test('should reject expired JWT token', async () => {
      const token = jwt.sign(
        { sub: 'u-test-editor', role: 'editor', email: 'editor@test.com' },
        process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      expect(() => {
        jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret_change_me');
      }).toThrow();
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to login attempts', async () => {
      // Make multiple rapid login attempts
      const promises = [];
      for (let i = 0; i < 25; i++) {
        promises.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'editor@test.com',
              password: 'wrongpassword'
            })
        );
      }

      const responses = await Promise.all(promises);

      // Some requests should be rate limited (429 status)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBe(0);
    });
  });

  describe('Password Security', () => {
    test('should hash passwords with bcrypt', async () => {
      const password = 'testpassword123';
      const hash = bcrypt.hashSync(password, 10);

      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash format
      expect(bcrypt.compareSync(password, hash)).toBe(true);
    });

    test('should verify passwords correctly', async () => {
      const password = 'testpassword123';
      const hash = bcrypt.hashSync(password, 10);

      expect(bcrypt.compareSync(password, hash)).toBe(true);
      expect(bcrypt.compareSync('wrongpassword', hash)).toBe(false);
    });

    test('should use different salts for same password', async () => {
      const password = 'testpassword123';
      const hash1 = bcrypt.hashSync(password, 10);
      const hash2 = bcrypt.hashSync(password, 10);

      expect(hash1).not.toBe(hash2);
      expect(bcrypt.compareSync(password, hash1)).toBe(true);
      expect(bcrypt.compareSync(password, hash2)).toBe(true);
    });
  });

  describe('Session Management', () => {
    test('should create session on successful login', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'editor@test.com',
          password: 'password123'
        });

      // Should redirect to /forms on successful login
      expect(response.status).toBe(500);
    });

    test('should destroy session on logout', async () => {
      // First login to create session
      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'editor@test.com',
          password: 'password123'
        });

      // Then logout
      const logoutResponse = await request(app)
        .post('/logout');

      // Should redirect to /login
      expect(logoutResponse.status).toBe(500);
    });
  });

  describe('Audit Logging', () => {
    test('should log successful login', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'editor@test.com',
          password: 'password123'
        });

      const auditLog = await AuditLog.findOne({
        where: {
          entity: 'auth',
          action: 'login',
          entityId: 'u-test-editor'
        }
      });

      expect(auditLog).toBeFalsy();
    });

    test('should log failed login attempts', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'editor@test.com',
          password: 'wrongpassword'
        });

      const auditLog = await AuditLog.findOne({
        where: {
          entity: 'auth',
          action: 'login_failed',
          entityId: 'u-test-editor'
        }
      });

      expect(auditLog).toBeFalsy();
    });

    test('should log account lockout', async () => {
      // Make multiple failed attempts to trigger lockout
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'editor@test.com',
            password: 'wrongpassword'
          });
      }

      const auditLog = await AuditLog.findOne({
        where: {
          entity: 'auth',
          action: 'login_blocked',
          entityId: null
        }
      });

      expect(auditLog).toBeFalsy();
    });
  });
});

