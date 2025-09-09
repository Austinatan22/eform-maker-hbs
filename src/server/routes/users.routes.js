// src/server/routes/users.routes.js
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const router = express.Router();

// --- Auth guards (copy of simple guards used elsewhere) ---
function ensureAuth(req, res, next) {
  if (process.env.AUTH_ENABLED !== '1') return next();
  if (req.session?.user) return next();
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    try {
      const payload = jwt.verify(m[1], process.env.JWT_SECRET || 'dev_jwt_secret_change_me');
      req.user = { id: payload.sub, role: payload.role, email: payload.email };
      return next();
    } catch {}
  }
  if (req.accepts('html')) return res.redirect('/login');
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  if (process.env.AUTH_ENABLED !== '1') return next();
  const role = (req.session?.user && req.session.user.role) || (req.user && req.user.role) || null;
  if (role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

// --- HTML page: Admin Users ---
router.get('/admin/users', ensureAuth, requireAdmin, async (_req, res) => {
  const rows = await User.findAll({ order: [['createdAt','DESC']] });
  const users = rows.map(u => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt }));
  res.render('admin-users', { title: 'Users', currentPath: '/admin/users', users });
});

// --- API: list users ---
router.get('/api/users', ensureAuth, requireAdmin, async (_req, res) => {
  const rows = await User.findAll({ order: [['createdAt','DESC']] });
  const users = rows.map(u => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt }));
  res.json({ ok: true, users });
});

// --- API: create user ---
router.post('/api/users', ensureAuth, requireAdmin, async (req, res) => {
  try {
    const { email = '', password = '', role = 'editor' } = req.body || {};
    const e = String(email).trim().toLowerCase();
    if (!e || !e.includes('@')) return res.status(400).json({ error: 'Valid email required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const r = ['admin','editor','viewer'].includes(String(role)) ? String(role) : 'editor';
    const exists = await User.findOne({ where: { email: e } });
    if (exists) return res.status(409).json({ error: 'Email already in use' });
    const bcrypt = await import('bcryptjs');
    const id = 'u-' + crypto.randomBytes(8).toString('hex');
    const hash = bcrypt.hashSync(String(password), 10);
    const user = await User.create({ id, email: e, passwordHash: hash, role: r });
    res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- API: update role / reset password ---
router.put('/api/users/:id', ensureAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const patch = {};
    if (req.body?.role != null) {
      const r = String(req.body.role);
      if (!['admin','editor','viewer'].includes(r)) return res.status(400).json({ error: 'Invalid role' });
      patch.role = r;
    }
    if (req.body?.password != null) {
      const p = String(req.body.password);
      if (p.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const bcrypt = await import('bcryptjs');
      patch.passwordHash = bcrypt.hashSync(p, 10);
    }
    await user.update(patch);
    res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- API: delete user ---
router.delete('/api/users/:id', ensureAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    await user.destroy();
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
