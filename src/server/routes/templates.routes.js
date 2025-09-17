// src/server/routes/templates.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import {
    createOrUpdateTemplate,
    listTemplates,
    listActiveTemplates,
    readTemplate,
    updateTemplateById,
    deleteTemplateById,
    checkTemplateNameUnique,
    listTemplatesPage
} from '../controllers/templates.controller.js';

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
        } catch (e) { }
    }
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ error: 'Unauthorized' });
}

// --- RBAC ---
function requireRole(...roles) {
    return (req, res, next) => {
        if (process.env.AUTH_ENABLED !== '1') return next();
        const role = (req.session?.user && req.session.user.role) || (req.user && req.user.role) || null;
        if (role && roles.includes(role)) return next();
        return res.status(403).json({ error: 'Forbidden' });
    };
}

// Templates API
router.post('/api/templates', ensureAuth, requireRole('admin', 'editor'), createOrUpdateTemplate);
router.get('/api/templates', ensureAuth, requireRole('admin', 'editor', 'viewer'), listTemplates);
router.get('/api/templates/active', ensureAuth, requireRole('admin', 'editor', 'viewer'), listActiveTemplates);
router.get('/api/templates/check-name', checkTemplateNameUnique);
router.put('/api/templates/:id', ensureAuth, requireRole('admin', 'editor'), updateTemplateById);
router.delete('/api/templates/:id', ensureAuth, requireRole('admin', 'editor'), deleteTemplateById);
router.get('/api/templates/:id', ensureAuth, requireRole('admin', 'editor', 'viewer'), readTemplate);

// UI page
router.get('/templates', ensureAuth, requireRole('admin', 'editor', 'viewer'), listTemplatesPage);

export default router;
