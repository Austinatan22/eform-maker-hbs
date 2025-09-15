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

function requireAdmin(req, res, next) {
    if (process.env.AUTH_ENABLED !== '1') return next();
    const role = (req.session?.user?.role) || (req.user?.role) || null;
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
    const logs = rows.map(r => {
        // Parse metaJson if it exists
        let metaJson = null;
        if (r.metaJson) {
            try {
                metaJson = JSON.parse(r.metaJson);
            } catch (e) {
                console.warn('Failed to parse metaJson for log', r.id, ':', e.message);
                metaJson = r.metaJson; // Keep as string if parsing fails
            }
        }

        return {
            id: r.id,
            entity: r.entity,
            action: r.action,
            entityId: r.entityId,
            userId: r.userId,
            userEmail: byId.get(r.userId)?.email || null,
            userUsername: byId.get(r.userId)?.username || null,
            ip: r.ip,
            ua: r.ua,
            metaJson: metaJson,
            createdAt: r.createdAt
        };
    });
    res.render('admin-logs', { title: 'Logs', currentPath: '/admin/logs', logs });
});

// API: list logs (DataTables format)
router.get('/api/logs', ensureAuth, requireAdmin, async (req, res) => {
    try {
        console.log('API /api/logs called');
        const where = {};

        // Apply filters
        if (req.query.entity) where.entity = String(req.query.entity);
        if (req.query.action) where.action = String(req.query.action);
        if (req.query.userId) where.userId = String(req.query.userId);

        // Get all logs (DataTables will handle pagination client-side for now)
        const rows = await AuditLog.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: 1000 // Reasonable limit for client-side pagination
        });

        console.log(`Found ${rows.length} audit logs`);

        // Attach user email/username for convenience
        const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))];
        const users = userIds.length ? await User.findAll({ where: { id: userIds } }) : [];
        const byId = new Map(users.map(u => [u.id, { email: u.email, username: u.username }]));

        const logs = rows.map(r => {
            // Parse metaJson if it exists
            let metaJson = null;
            if (r.metaJson) {
                try {
                    metaJson = JSON.parse(r.metaJson);
                } catch (e) {
                    console.warn('Failed to parse metaJson for log', r.id, ':', e.message);
                    metaJson = r.metaJson; // Keep as string if parsing fails
                }
            }

            return {
                id: r.id,
                entity: r.entity,
                action: r.action,
                entityId: r.entityId,
                userId: r.userId,
                userEmail: byId.get(r.userId)?.email || null,
                userUsername: byId.get(r.userId)?.username || null,
                ip: r.ip,
                ua: r.ua,
                metaJson: metaJson,
                createdAt: r.createdAt
            };
        });

        // Return in DataTables expected format
        res.json({ data: logs });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

export default router;


