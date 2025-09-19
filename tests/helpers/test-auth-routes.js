// tests/helpers/test-auth-routes.js
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { logAudit } from '../../src/server/services/audit.service.js';
import { isUserLockedOut, recordFailedAttempt, clearFailedAttempts, validatePassword } from '../../src/server/services/password.service.js';
import { logger } from '../../src/server/utils/logger.js';

function createTestAuthRoutes(TestUser, TestRefreshToken, TestUserLockout) {
    const router = express.Router();

    function renderLogin(req, res, opts = {}) {
        res.render('login', {
            title: 'Sign In',
            currentPath: '/login',
            error: opts.error || null,
            hideNavbar: true
        });
    }

    // ---------------- HTML login (session) -----------------
    router.get('/login', (req, res) => {
        if (req.session?.user) return res.redirect('/forms');
        renderLogin(req, res);
    });

    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return renderLogin(req, res, { error: 'Invalid credentials' });
            }

            // Check if user is locked out
            const lockoutResult = await isUserLockedOut(email);
            if (lockoutResult.locked) {
                return renderLogin(req, res, {
                    error: `Account locked until ${lockoutResult.lockedUntil.toLocaleString()}`
                });
            }

            // Find user
            const user = await TestUser.findOne({ where: { email: email.toLowerCase() } });
            if (!user) {
                await recordFailedAttempt(email, null);
                return renderLogin(req, res, { error: 'Invalid credentials' });
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.passwordHash);
            if (!isValidPassword) {
                await recordFailedAttempt(email, user.id);
                return renderLogin(req, res, { error: 'Invalid credentials' });
            }

            // Clear failed attempts on successful login
            await clearFailedAttempts(email);

            // Create session
            req.session.user = {
                id: user.id,
                email: user.email,
                role: user.role
            };

            // Log successful login
            await logAudit('LOGIN', 'User', user.id, { email: user.email });

            res.redirect('/forms');
        } catch (error) {
            logger.error('Login error:', error);
            renderLogin(req, res, { error: 'Login failed' });
        }
    });

    router.post('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                logger.error('Logout error:', err);
            }
            res.redirect('/login');
        });
    });

    // ---------------- API login (JWT) -----------------
    router.post('/api/auth/login', async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Check if user is locked out
            const lockoutResult = await isUserLockedOut(email);
            if (lockoutResult.locked) {
                return res.status(423).json({
                    error: 'Account locked',
                    lockedUntil: lockoutResult.lockedUntil
                });
            }

            // Find user
            const user = await TestUser.findOne({ where: { email: email.toLowerCase() } });
            if (!user) {
                await recordFailedAttempt(email, null);
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.passwordHash);
            if (!isValidPassword) {
                await recordFailedAttempt(email, user.id);
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Clear failed attempts on successful login
            await clearFailedAttempts(email);

            // Generate JWT
            const ACCESS_TTL_SEC = 15 * 60; // 15 minutes
            const accessToken = jwt.sign(
                { sub: user.id, role: user.role, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: ACCESS_TTL_SEC }
            );

            // Generate refresh token
            const refreshToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            await TestRefreshToken.create({
                id: 'rt-' + crypto.randomBytes(9).toString('base64url'),
                userId: user.id,
                tokenHash: refreshToken,
                expiresAt
            });

            // Set refresh token cookie
            res.cookie('rt', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            // Log successful login
            await logAudit('LOGIN', 'User', user.id, { email: user.email });

            res.json({
                accessToken,
                expiresIn: ACCESS_TTL_SEC,
                user: { id: user.id, email: user.email, role: user.role },
                refreshExpiresAt: expiresAt,
                refreshToken
            });
        } catch (error) {
            logger.error('API login error:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    router.post('/api/auth/refresh', async (req, res) => {
        try {
            const refreshToken = req.cookies.rt || req.body.refreshToken;

            if (!refreshToken) {
                return res.status(401).json({ error: 'No refresh token' });
            }

            // Find refresh token
            const tokenRecord = await TestRefreshToken.findOne({
                where: { token: refreshToken }
            });

            if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
                return res.status(401).json({ error: 'Invalid refresh token' });
            }

            // Find user
            const user = await TestUser.findByPk(tokenRecord.userId);
            if (!user) {
                return res.status(401).json({ error: 'User not found' });
            }

            // Generate new access token
            const ACCESS_TTL_SEC = 15 * 60; // 15 minutes
            const accessToken = jwt.sign(
                { sub: user.id, role: user.role, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: ACCESS_TTL_SEC }
            );

            res.json({
                accessToken,
                expiresIn: ACCESS_TTL_SEC,
                user: { id: user.id, email: user.email, role: user.role }
            });
        } catch (error) {
            logger.error('Token refresh error:', error);
            res.status(500).json({ error: 'Token refresh failed' });
        }
    });

    router.post('/api/auth/logout', async (req, res) => {
        try {
            const refreshToken = req.cookies.rt;

            if (refreshToken) {
                await TestRefreshToken.destroy({ where: { token: refreshToken } });
                res.clearCookie('rt');
            }

            res.json({ ok: true });
        } catch (error) {
            logger.error('Logout error:', error);
            res.status(500).json({ error: 'Logout failed' });
        }
    });

    return router;
}

export { createTestAuthRoutes };
