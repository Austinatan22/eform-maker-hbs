// src/server/routes/forms.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  health,
  createOrUpdateForm,
  listForms,
  readForm,
  updateForm,
  hostedForm,
  builderPage,
  builderNewPage,
  listFormsPage,
  checkTitleUnique,
  publicSubmit,
  deleteForm
} from '../controllers/forms.controller.js';

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
    } catch (e) {}
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

// Health
router.get('/api/health', health);

// Forms API
router.post('/api/forms', ensureAuth, requireRole('admin','editor'), createOrUpdateForm);
router.get('/api/forms', ensureAuth, requireRole('admin','editor','viewer'), listForms);
// Place specific route before dynamic :id to avoid conflicts
router.get('/api/forms/check-title', checkTitleUnique);
router.get('/api/forms/:id', ensureAuth, requireRole('admin','editor','viewer'), readForm);
router.put('/api/forms/:id', ensureAuth, requireRole('admin','editor'), updateForm);
router.delete('/api/forms/:id', ensureAuth, requireRole('admin','editor'), deleteForm);

// Hosted form
router.get('/f/:id', hostedForm);
router.post('/public/forms/:id/submissions', publicSubmit);

// Builder deep-link
// Place specific route before dynamic to avoid catching '/builder/new' as :id
router.get('/builder/new', ensureAuth, requireRole('admin','editor','viewer'), builderNewPage);
router.get('/builder/:id', ensureAuth, requireRole('admin','editor','viewer'), builderPage);

// UI pages (optional)
router.get('/forms', ensureAuth, requireRole('admin','editor','viewer'), listFormsPage);

export default router;

