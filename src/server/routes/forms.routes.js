// src/server/routes/forms.routes.js
import express from 'express';
import {
  health,
  createOrUpdateForm,
  listForms,
  readForm,
  updateForm,
  hostedForm,
  builderPage,
  listFormsPage,
  checkTitleUnique,
  publicSubmit,
  deleteForm
} from '../controllers/forms.controller.js';

const router = express.Router();

// Health
router.get('/api/health', health);

// Forms API
router.post('/api/forms', createOrUpdateForm);
router.get('/api/forms', listForms);
router.get('/api/forms/:id', readForm);
router.put('/api/forms/:id', updateForm);
router.get('/api/forms/check-title', checkTitleUnique);
router.delete('/api/forms/:id', deleteForm);

// Hosted form
router.get('/f/:id', hostedForm);
router.post('/public/forms/:id/submissions', publicSubmit);

// Builder deep-link
router.get('/builder/:id', builderPage);

// UI pages (optional)
router.get('/forms', listFormsPage);

export default router;
