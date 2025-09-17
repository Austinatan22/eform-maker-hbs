// src/server/routes/users.routes.js
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { logAudit } from '../services/audit.service.js';
import { validatePassword } from '../services/password.service.js';
import { logger } from '../utils/logger.js';
import { Op } from 'sequelize';

const router = express.Router();

// Identify the main admin account (seeded or configured)
function isMainAdmin(user) {
  if (!user) return false;
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const email = String(user.email || '').toLowerCase();
  return user.id === 'u-admin' || email === adminEmail;
}

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
    } catch { }
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
  const rows = await User.findAll({ order: [['updatedAt', 'DESC']] });
  const users = rows.map(u => ({ id: u.id, email: u.email, username: u.username, role: u.role, updatedAt: u.updatedAt }));
  const main = rows.find(u => isMainAdmin(u));
  const protectedAdminId = main ? main.id : 'u-admin';
  res.render('admin-users', { title: 'Users', currentPath: '/admin/users', users, protectedAdminId });
});

// --- API: list users ---
router.get('/api/users', ensureAuth, requireAdmin, async (req, res) => {
  try {
    // DataTables server-side processing parameters
    const draw = parseInt(req.query.draw) || 1;
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;
    const searchValue = req.query.search?.value || '';

    const where = {};

    // Add search functionality
    if (searchValue) {
      where[Op.or] = [
        { email: { [Op.like]: `%${searchValue}%` } },
        { username: { [Op.like]: `%${searchValue}%` } },
        { role: { [Op.like]: `%${searchValue}%` } }
      ];
    }

    // Get total count for pagination info
    const totalRecords = await User.count({ where });

    // Get paginated users
    const rows = await User.findAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit: length,
      offset: start
    });

    const users = rows.map(u => ({ id: u.id, email: u.email, username: u.username, role: u.role, updatedAt: u.updatedAt }));

    // Return in DataTables expected format with server-side processing
    res.json({
      draw: draw,
      recordsTotal: totalRecords,
      recordsFiltered: totalRecords,
      data: users
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// --- API: create user ---
router.post('/api/users', ensureAuth, requireAdmin, async (req, res) => {
  try {
    const { email = '', password = '', role = 'editor', username = '' } = req.body || {};
    const e = String(email).trim().toLowerCase();
    if (!e || !e.includes('@')) return res.status(400).json({ error: 'Valid email required' });

    // Validate password against policy
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: 'Password does not meet requirements', details: passwordValidation.errors });
    }
    const r = ['admin', 'editor', 'viewer'].includes(String(role)) ? String(role) : 'editor';
    const exists = await User.findOne({ where: { email: e } });
    if (exists) return res.status(409).json({ error: 'Email already in use' });
    const bcrypt = await import('bcryptjs');
    const id = 'u-' + crypto.randomBytes(8).toString('hex');
    const hash = bcrypt.hashSync(String(password), 10);
    const uname = String(username || e.split('@')[0]).trim().slice(0, 64) || null;
    const user = await User.create({ id, email: e, username: uname, passwordHash: hash, role: r });

    // Log user creation
    await logAudit(req, {
      entity: 'user',
      action: 'create',
      entityId: user.id,
      meta: {
        email: user.email,
        username: user.username,
        role: user.role
      }
    });

    res.json({ ok: true, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  } catch (err) {
    logger.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- API: update role / reset password ---
router.put('/api/users/:id', ensureAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });

    // Store original values for audit
    const originalValues = {
      role: user.role,
      username: user.username
    };

    const patch = {};
    const changes = {};

    if (req.body?.role != null) {
      const r = String(req.body.role);
      if (!['admin', 'editor', 'viewer'].includes(r)) return res.status(400).json({ error: 'Invalid role' });
      patch.role = r;
      if (originalValues.role !== r) {
        changes.role = { from: originalValues.role, to: r };
      }
    }
    if (req.body?.username != null) {
      const uname = String(req.body.username || '').trim();
      if (!uname) return res.status(400).json({ error: 'Username required' });
      // Optional: check uniqueness among non-null usernames
      const dupe = await User.findOne({ where: { username: uname } });
      if (dupe && dupe.id !== user.id) return res.status(409).json({ error: 'Username already in use' });
      patch.username = uname;
      if (originalValues.username !== uname) {
        changes.username = { from: originalValues.username, to: uname };
      }
    }
    const changingPassword = req.body?.password != null;
    if (changingPassword) {
      const p = String(req.body.password);

      // Validate password against policy
      const passwordValidation = validatePassword(p);
      if (!passwordValidation.valid) {
        return res.status(400).json({ error: 'Password does not meet requirements', details: passwordValidation.errors });
      }

      const bcrypt = await import('bcryptjs');
      patch.passwordHash = bcrypt.hashSync(p, 10);
      changes.password = { from: '[HIDDEN]', to: '[RESET]' };
    }

    await user.update(patch);

    // Log user update if there were changes
    if (Object.keys(changes).length > 0) {
      await logAudit(req, {
        entity: 'user',
        action: 'update',
        entityId: user.id,
        meta: {
          email: user.email,
          changes
        }
      });
    }
    // If the current user changed their own password, destroy the session and ask for reauth
    const currentUserId = (req.session?.user && req.session.user.id) || (req.user && req.user.id) || null;
    const changedOwnPassword = changingPassword && currentUserId && currentUserId === user.id;
    if (changedOwnPassword && req.session) {
      return req.session.destroy(() => {
        res.json({ ok: true, user: { id: user.id, email: user.email, username: user.username, role: user.role }, reauth: true });
      });
    }
    res.json({ ok: true, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  } catch (err) {
    logger.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- API: delete user ---
router.delete('/api/users/:id', ensureAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (isMainAdmin(user)) return res.status(400).json({ error: 'Cannot delete main admin user' });

    // Store user info for audit before deletion
    const userInfo = {
      email: user.email,
      username: user.username,
      role: user.role
    };

    await user.destroy();

    // Log user deletion
    await logAudit(req, {
      entity: 'user',
      action: 'delete',
      entityId: req.params.id,
      meta: {
        ...userInfo
      }
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
