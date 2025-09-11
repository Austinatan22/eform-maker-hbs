// src/server/routes/auth.routes.js
import express from 'express';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { logAudit } from '../services/audit.service.js';
import { env } from '../config/env.js';

const router = express.Router();

function renderLogin(req, res, opts = {}) {
  res.render('login', {
    title: 'Sign In',
    currentPath: '/login',
    error: opts.error || null,
    hideNavbar: true
  });
}

const loginLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 20 });

// ---------------- HTML login (session) -----------------
router.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/forms');
  renderLogin(req, res);
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email = '', password = '' } = req.body || {};
    const e = String(email).trim().toLowerCase();
    const bcrypt = await import('bcryptjs');
    const user = await User.findOne({ where: { email: e } });
    if (!user) {
      await logAudit(req, { entity: 'auth', action: 'login_failed', entityId: null, meta: { email: e } });
      return renderLogin(req, res, { error: 'Invalid credentials' });
    }
    const ok = bcrypt.compareSync(String(password), user.passwordHash);
    if (!ok) {
      await logAudit(req, { entity: 'auth', action: 'login_failed', entityId: user.id, meta: { email: e } });
      return renderLogin(req, res, { error: 'Invalid credentials' });
    }
    req.session.user = { id: user.id, email: user.email, role: user.role };
    await logAudit(req, { entity: 'auth', action: 'login', entityId: user.id, meta: { email: user.email } });
    res.redirect('/forms');
  } catch (err) {
    console.error('login error:', err);
    renderLogin(req, res, { error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  try {
    const userId = req.session?.user?.id || null;
    req.session?.destroy(async () => {
      res.clearCookie('sid');
      try { await logAudit(req, { entity: 'auth', action: 'logout', entityId: userId, meta: {} }); } catch {}
      res.redirect('/login');
    });
  } catch {
    res.redirect('/login');
  }
});

// ---------------- JWT helpers -----------------
const JWT_SECRET = env.JWT_SECRET;
const ACCESS_TTL_SEC = env.JWT_TTL_SEC; // 15m default
const REFRESH_TTL_SEC = env.REFRESH_TTL_SEC; // 14d default

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
  } catch {}
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
    res.json({ accessToken, expiresIn: ACCESS_TTL_SEC, user: { id: user.id, email: user.email, role: user.role }, refreshExpiresAt: expiresAt });
  } catch (err) {
    console.error('api login error:', err);
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
    console.error('refresh error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/auth/logout', async (req, res) => {
  try {
    const cookieToken = req.cookies?.rt || req.body?.refreshToken;
    if (cookieToken) await invalidateRefresh(cookieToken);
  } catch {}
  res.clearCookie?.('rt');
  res.json({ ok: true });
});

export default router;
