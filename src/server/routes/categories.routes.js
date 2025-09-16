// src/server/routes/categories.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    categoriesPage
} from '../controllers/categories.controller.js';

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

function requireAdmin(req, res, next) {
    if (process.env.AUTH_ENABLED !== '1') return next();
    const role = (req.session?.user && req.session.user.role) || (req.user && req.user.role) || null;
    if (role === 'admin') return next();
    return res.status(403).json({ error: 'Forbidden' });
}

// --- HTML page: Admin Categories ---
router.get('/categories', ensureAuth, requireAdmin, categoriesPage);

// --- API: list categories ---
router.get('/api/categories', ensureAuth, requireAdmin, listCategories);

// --- API: create category ---
router.post('/api/categories', ensureAuth, requireAdmin, createCategory);

// --- API: update category ---
router.put('/api/categories/:id', ensureAuth, requireAdmin, updateCategory);

// --- API: delete category ---
router.delete('/api/categories/:id', ensureAuth, requireAdmin, deleteCategory);

export default router;
