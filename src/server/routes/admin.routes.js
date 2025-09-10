// src/server/routes/admin.routes.js
import express from 'express';
import { Op } from 'sequelize';
import { AuditLog } from '../models/AuditLog.js';

const router = express.Router();

// --- Auth guards (copied pattern) ---
function ensureAuth(req, res, next) {
  if (process.env.AUTH_ENABLED !== '1') return next();
  if (req.session?.user) return next();
  if (req.accepts('html')) return res.redirect('/login');
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (process.env.AUTH_ENABLED !== '1') return next();
    const role = (req.session?.user && req.session.user.role) || (req.user && req.user.role) || null;
    if (role && roles.includes(role)) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

// GET /admin/logs - Admin-only audit logs list
router.get('/admin/logs', ensureAuth, requireRole('admin'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 100);
    const offset = (page - 1) * limit;

    const entity = (req.query.entity || '').trim();
    const action = (req.query.action || '').trim();
    const userId = (req.query.userId || '').trim();
    const q = (req.query.q || '').trim();

    const where = {};
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (q) {
      const like = { [Op.like]: `%${q}%` };
      where[Op.or] = [
        { entity: like },
        { action: like },
        { entityId: like },
        { userId: like },
        { ip: like },
        { ua: like },
        { metaJson: like }
      ];
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.max(1, Math.ceil(count / limit));
    const entities = await AuditLog.aggregate('entity', 'DISTINCT', { plain: false });
    const actions = await AuditLog.aggregate('action', 'DISTINCT', { plain: false });

    res.render('admin-logs', {
      title: 'Audit Logs',
      currentPath: '/admin/logs',
      logs: rows.map(r => r.get({ plain: true })),
      page,
      limit,
      total: count,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
      filters: { entity, action, userId, q },
      entityOptions: entities.map(e => e.DISTINCT || e.distinct).filter(Boolean).sort(),
      actionOptions: actions.map(a => a.DISTINCT || a.distinct).filter(Boolean).sort()
    });
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).send('Server error');
  }
});

export default router;

