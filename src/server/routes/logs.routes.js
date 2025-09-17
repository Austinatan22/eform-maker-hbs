// src/server/routes/logs.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { Op } from 'sequelize';

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
                logger.warn('Failed to parse metaJson for log', r.id, ':', e.message);
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
        const where = {};

        // Apply filters
        if (req.query.entity) where.entity = String(req.query.entity);
        if (req.query.action) where.action = String(req.query.action);
        if (req.query.userId) where.userId = String(req.query.userId);

        // DataTables server-side processing parameters
        const draw = parseInt(req.query.draw) || 1;
        const start = parseInt(req.query.start) || 0;
        const length = parseInt(req.query.length) || 10;
        const searchValue = req.query.search?.value || '';

        // Add search functionality
        if (searchValue) {
            where[Op.or] = [
                { entity: { [Op.like]: `%${searchValue}%` } },
                { action: { [Op.like]: `%${searchValue}%` } },
                { entityId: { [Op.like]: `%${searchValue}%` } },
                { ip: { [Op.like]: `%${searchValue}%` } }
            ];
        }

        // Get total count for pagination info
        const totalRecords = await AuditLog.count({ where });

        // Get paginated logs
        const rows = await AuditLog.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: length,
            offset: start
        });

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
                    logger.warn('Failed to parse metaJson for log', r.id, ':', e.message);
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

        // Return in DataTables expected format with server-side processing
        res.json({
            draw: draw,
            recordsTotal: totalRecords,
            recordsFiltered: totalRecords, // Same as total since we're not doing complex filtering
            data: logs
        });
    } catch (error) {
        logger.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

export default router;


