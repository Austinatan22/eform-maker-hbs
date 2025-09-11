// src/server/routes/logs.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';

const router = express.Router();

// --- Auth guards ---
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

function requireAdmin(_req, res, next) {
    if (process.env.AUTH_ENABLED !== '1') return next();
    const role = (res.locals.user && res.locals.user.role) || null;
    if (role === 'admin') return next();
    return res.status(403).json({ error: 'Forbidden' });
}

// HTML: Admin Logs page
router.get('/admin/logs', ensureAuth, requireAdmin, async (_req, res) => {
    const rows = await AuditLog.findAll({ order: [['createdAt', 'DESC']], limit: 200 });
    // Preload some user info for display
    const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))];
    const users = userIds.length ? await User.findAll({ where: { id: userIds } }) : [];
    const byId = new Map(users.map(u => [u.id, { email: u.email, username: u.username }]));
    const logs = rows.map(r => ({
        id: r.id,
        entity: r.entity,
        action: r.action,
        entityId: r.entityId,
        userId: r.userId,
        userEmail: byId.get(r.userId)?.email || null,
        userUsername: byId.get(r.userId)?.username || null,
        ip: r.ip,
        ua: r.ua,
        metaJson: r.metaJson,
        createdAt: r.createdAt
    }));
    res.render('admin-logs', { title: 'Logs', currentPath: '/admin/logs', logs });
});

// API: list logs (optional filters: entity, action, userId)
router.get('/api/logs', ensureAuth, requireAdmin, async (req, res) => {
    const where = {};
    if (req.query.entity) where.entity = String(req.query.entity);
    if (req.query.action) where.action = String(req.query.action);
    if (req.query.userId) where.userId = String(req.query.userId);
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || '200', 10)));
    const rows = await AuditLog.findAll({ where, order: [['createdAt', 'DESC']], limit });
    // Attach user email/username for convenience
    const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))];
    const users = userIds.length ? await User.findAll({ where: { id: userIds } }) : [];
    const byId = new Map(users.map(u => [u.id, { email: u.email, username: u.username }]));
    const logs = rows.map(r => ({
        id: r.id,
        entity: r.entity,
        action: r.action,
        entityId: r.entityId,
        userId: r.userId,
        userEmail: byId.get(r.userId)?.email || null,
        userUsername: byId.get(r.userId)?.username || null,
        ip: r.ip,
        ua: r.ua,
        metaJson: r.metaJson,
        createdAt: r.createdAt
    }));
    res.json({ ok: true, logs });
});

export default router;


