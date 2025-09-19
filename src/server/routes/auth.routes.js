// src/server/routes/auth.routes.js
import express from 'express';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { logAudit } from '../services/audit.service.js';
import { isUserLockedOut, recordFailedAttempt, clearFailedAttempts, validatePassword } from '../services/password.service.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

function renderLogin(req, res, opts = {}) {
  res.render('login', {
    title: 'Sign In',
    currentPath: '/login',
    error: opts.error || null,
    hideNavbar: true
  });
}

const loginLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next() // Skip rate limiting in tests
  : rateLimit({ windowMs: 5 * 60 * 1000, max: 20 });

// ---------------- HTML login (session) -----------------
router.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/forms');
  renderLogin(req, res);
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email = '', password = '' } = req.body || {};
    const e = String(email).trim().toLowerCase();

    // Check if user is locked out
    const lockoutStatus = await isUserLockedOut(e);
    if (lockoutStatus.locked) {
      const lockoutTime = new Date(lockoutStatus.lockedUntil).toLocaleString();
      await logAudit(req, {
        entity: 'auth',
        action: 'login_blocked',
        entityId: null,
        meta: {
          email: e,
          reason: 'account_locked',
          lockoutUntil: lockoutTime,
          failedAttempts: lockoutStatus.failedAttempts || 0
        }
      });
      return renderLogin(req, res, { error: `Account is locked until ${lockoutTime}. Too many failed login attempts.` });
    }

    const bcrypt = await import('bcryptjs');
    const user = await User.findOne({ where: { email: e } });
    if (!user) {
      const attemptResult = await recordFailedAttempt(e);
      await logAudit(req, {
        entity: 'auth',
        action: 'login_failed',
        entityId: null,
        meta: {
          email: e,
          reason: 'user_not_found',
          failedAttempts: attemptResult.failedAttempts || 1
        }
      });
      return renderLogin(req, res, { error: 'Invalid credentials' });
    }

    const ok = bcrypt.compareSync(String(password), user.passwordHash);
    if (!ok) {
      const attemptResult = await recordFailedAttempt(e, user.id);
      await logAudit(req, {
        entity: 'auth',
        action: 'login_failed',
        entityId: user.id,
        meta: {
          email: e,
          reason: 'invalid_password',
          failedAttempts: attemptResult.failedAttempts
        }
      });

      if (attemptResult.locked) {
        const lockoutTime = new Date(attemptResult.lockedUntil).toLocaleString();
        return renderLogin(req, res, { error: `Account locked until ${lockoutTime}. Too many failed login attempts.` });
      }

      return renderLogin(req, res, { error: 'Invalid credentials' });
    }

    // Successful login - clear failed attempts
    await clearFailedAttempts(e);
    req.session.user = { id: user.id, email: user.email, role: user.role };

    // Enhanced successful login audit
    await logAudit(req, {
      entity: 'auth',
      action: 'login',
      entityId: user.id,
      meta: {
        email: user.email,
        username: user.username,
        role: user.role,
        sessionId: req.sessionID,
        loginTime: new Date().toISOString()
      }
    });
    res.redirect('/forms');
  } catch (err) {
    logger.error('Login error:', err);
    renderLogin(req, res, { error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  try {
    const userId = req.session?.user?.id || null;
    req.session?.destroy(async () => {
      res.clearCookie('sid');
      try {
        await logAudit(req, {
          entity: 'auth',
          action: 'logout',
          entityId: userId,
          meta: {
            logoutTime: new Date().toISOString(),
            sessionId: req.sessionID
          }
        });
      } catch { }
      res.redirect('/login');
    });
  } catch {
    res.redirect('/login');
  }
});

// ---------------- JWT helpers -----------------
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
const ACCESS_TTL_SEC = parseInt(process.env.JWT_TTL_SEC || '900', 10); // 15m default
const REFRESH_TTL_SEC = parseInt(process.env.REFRESH_TTL_SEC || '1209600', 10); // 14d default

function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: ACCESS_TTL_SEC });
}

function hashToken(t) {
  return crypto.createHash('sha256').update(String(t)).digest('hex');
}

async function issueRefresh(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const jti = crypto.randomBytes(9).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);
  await RefreshToken.create({ id: jti, userId, tokenHash: hashToken(token), expiresAt });
  return { token, jti, expiresAt };
}

async function invalidateRefresh(token) {
  try {
    const hash = hashToken(token);
    await RefreshToken.destroy({ where: { tokenHash: hash } });
  } catch { }
}

// ---------------- JSON API (JWT) -----------------
router.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email = '', password = '' } = req.body || {};
    const e = String(email).trim().toLowerCase();
    const bcrypt = await import('bcryptjs');
    const user = await User.findOne({ where: { email: e } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const accessToken = signAccess(user);
    const { token: refreshToken, expiresAt } = await issueRefresh(user.id);
    res.cookie?.('rt', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: REFRESH_TTL_SEC * 1000
    });
    res.json({ accessToken, expiresIn: ACCESS_TTL_SEC, user: { id: user.id, email: user.email, role: user.role }, refreshExpiresAt: expiresAt, refreshToken });
  } catch (err) {
    logger.error('API login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/auth/refresh', async (req, res) => {
  try {
    const cookieToken = req.cookies?.rt || req.body?.refreshToken;
    if (!cookieToken) return res.status(401).json({ error: 'No refresh token' });
    const row = await RefreshToken.findOne({ where: { tokenHash: hashToken(cookieToken) } });
    if (!row) return res.status(401).json({ error: 'Invalid refresh' });
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      await row.destroy();
      return res.status(401).json({ error: 'Expired refresh' });
    }
    const user = await User.findByPk(row.userId);
    if (!user) return res.status(401).json({ error: 'Invalid user' });
    const accessToken = signAccess(user);
    res.json({ accessToken, expiresIn: ACCESS_TTL_SEC });
  } catch (err) {
    logger.error('Refresh error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/auth/logout', async (req, res) => {
  try {
    const cookieToken = req.cookies?.rt || req.body?.refreshToken;
    if (cookieToken) await invalidateRefresh(cookieToken);
  } catch { }
  res.clearCookie?.('rt');
  res.json({ ok: true });
});

export default router;
