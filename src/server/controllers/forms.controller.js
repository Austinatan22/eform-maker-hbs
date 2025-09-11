// src/server/controllers/forms.controller.js
import crypto from 'crypto';
import { sequelize } from '../db.js';
import { Form } from '../models/Form.js';
import { FormSubmission } from '../models/FormSubmission.js';
import { FormField } from '../models/FormField.js';
import { logAudit } from '../services/audit.service.js';
import { isTitleTaken, createFormWithFields, updateFormWithFields, normalizeTitle } from '../services/forms.service.js';
import { env } from '../config/env.js';
import { PARTIAL_FOR, FORM_CATEGORIES } from '../../shared/constants.js';
import { validateFields, validateFormTitle, validateFormCategory, sanitizeFields } from '../utils/validation.js';

// ---------------------- Helpers (render mapping) ----------------------

const rid = () => crypto.randomBytes(9).toString('base64url');

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(new Date(date));
}

// Map builder field.type -> partial path (under views/partials/fields)
const PARTIAL_FOR_SERVER = Object.fromEntries(
  Object.entries(PARTIAL_FOR).map(([key, value]) => [key, `fields/${value}`])
);

const toVM = (f, idx) => ({
  name: f.name || f.id || `f_${idx}`,
  label: f.label || '',
  required: !!f.required,
  placeholder: f.placeholder || '',
  options: String(f.options || '').split(',').map(s => s.trim()).filter(Boolean)
});

// Submission helpers
const safeKey = (k) => String(k || '').replace(/[^a-zA-Z0-9_]/g, '_');

// ---------------------- Controllers ----------------------
export async function health(_req, res) {
  res.json({ ok: true });
}

export async function createOrUpdateForm(req, res) {
  const { id, title = '', fields = [], category: rawCategory } = req.body || {};

  const category = FORM_CATEGORIES.has(String(rawCategory || '').toLowerCase())
    ? String(rawCategory).toLowerCase()
    : 'survey';

  // Validate form title
  const titleErrors = validateFormTitle(title);
  if (titleErrors.length > 0) {
    return res.status(400).json({ error: titleErrors.join('; ') });
  }

  // Validate form category
  const categoryErrors = validateFormCategory(rawCategory);
  if (categoryErrors.length > 0) {
    return res.status(400).json({ error: categoryErrors.join('; ') });
  }

  const normalizedTitle = normalizeTitle(title);

  // Validate fields
  const fieldErrors = validateFields(fields);
  if (fieldErrors.length > 0) {
    return res.status(400).json({ error: fieldErrors.join('; ') });
  }

  const clean = sanitizeFields(fields);

  try {
    // Enforce case-insensitive title uniqueness on create
    if (!id) {
      if (await isTitleTaken(normalizedTitle)) {
        return res.status(409).json({ error: 'Form title already exists. Choose another.' });
      }
    }
    if (!id) {
      const reqUser = req.session?.user || req.user || null;
      const createdBy = env.AUTH_ENABLED ? (reqUser?.id || null) : null;
      const { form, rows } = await createFormWithFields(normalizedTitle, clean, category, createdBy);
      await logAudit(req, { entity: 'form', action: 'create', entityId: form.id, meta: { title: form.title, category } });
      return res.json({ ok: true, form: { id: form.id, title: form.title, fields: rows } });
    } else {
      // Enforce uniqueness on update (when using POST /api/forms with id)
      if (await isTitleTaken(normalizedTitle, String(id))) {
        return res.status(409).json({ error: 'Form title already exists. Choose another.' });
      }
      // Owner-or-admin enforcement when auth enabled
      if (env.AUTH_ENABLED) {
        const f = await Form.findByPk(id);
        const reqUser = req.session?.user || req.user || null;
        const role = reqUser?.role || 'viewer';
        const isOwner = f && reqUser && f.createdBy && f.createdBy === reqUser.id;
        const isAdmin = role === 'admin';
        if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
      }
      const out = await updateFormWithFields(id, normalizedTitle, clean, category);
      if (out?.notFound) return res.status(404).json({ error: 'Not found' });
      const withFields = await Form.findByPk(id, { include: [{ model: FormField, as: 'fields' }] });
      const fieldsOut = (withFields.fields || []).sort((a, b) => a.position - b.position).map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options
      }));
      await logAudit(req, { entity: 'form', action: 'update', entityId: withFields.id, meta: { title: withFields.title, category: withFields.category } });
      return res.json({ ok: true, form: { id: withFields.id, title: withFields.title, category: withFields.category, fields: fieldsOut } });
    }
  } catch (err) {
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Uniqueness constraint failed.' });
    }
    console.error('Create/update form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listForms(_req, res) {
  try {
    const rows = await Form.findAll({
      order: [['updatedAt', 'DESC']],
      include: [{
        model: FormField,
        as: 'fields',
        order: [['position', 'ASC']] // Order fields by position in the query
      }]
    });

    const forms = rows.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      fields: (r.fields || []).map(f => ({
        id: f.id,
        type: f.type,
        label: f.label,
        name: f.name,
        placeholder: f.placeholder,
        required: f.required,
        doNotStore: f.doNotStore,
        options: f.options,
        countryIso2: f.countryIso2
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    res.json({ ok: true, forms });
  } catch (err) {
    console.error('List forms error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function readForm(req, res) {
  try {
    const form = await Form.findByPk(req.params.id, {
      include: [{
        model: FormField,
        as: 'fields',
        order: [['position', 'ASC']] // Order fields by position in the query
      }]
    });

    if (!form) return res.status(404).json({ error: 'Not found' });

    const fields = (form.fields || []).map(f => ({
      id: f.id,
      type: f.type,
      label: f.label,
      name: f.name,
      placeholder: f.placeholder,
      required: f.required,
      doNotStore: f.doNotStore,
      options: f.options
    }));

    res.json({ ok: true, form: { id: form.id, title: form.title, fields } });
  } catch (err) {
    console.error('Read form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function updateForm(req, res) {
  const { title, fields, category: rawCategory } = req.body || {};
  const category = rawCategory !== undefined
    ? (FORM_CATEGORIES.has(String(rawCategory || '').toLowerCase()) ? String(rawCategory).toLowerCase() : 'survey')
    : undefined;
  try {
    const form = await Form.findByPk(req.params.id);
    if (!form) return res.status(404).json({ error: 'Not found' });
    // Owner-or-admin enforcement when auth enabled
    if (env.AUTH_ENABLED) {
      const reqUser = req.session?.user || req.user || null;
      const role = reqUser?.role || 'viewer';
      const isOwner = reqUser && form.createdBy && form.createdBy === reqUser.id;
      const isAdmin = role === 'admin';
      if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
    }

    if (title !== undefined) {
      const titleErrors = validateFormTitle(title);
      if (titleErrors.length > 0) {
        return res.status(400).json({ error: titleErrors.join('; ') });
      }
      const normalizedTitle = normalizeTitle(title);
      // Strict unique-before-update (case-insensitive)
      if (await isTitleTaken(normalizedTitle, String(req.params.id))) {
        return res.status(409).json({ error: 'Form title already exists. Choose another.' });
      }
      form.title = normalizedTitle;
    }

    if (category !== undefined) {
      form.category = category;
    }

    if (fields !== undefined) {
      const fieldErrors = validateFields(fields);
      if (fieldErrors.length > 0) {
        return res.status(400).json({ error: fieldErrors.join('; ') });
      }
      const clean = sanitizeFields(fields);
      await updateFormWithFields(form.id, undefined, clean);
    }

    await form.save();

    const withFields = await Form.findByPk(form.id, {
      include: [{
        model: FormField,
        as: 'fields',
        order: [['position', 'ASC']] // Order fields by position in the query
      }]
    });

    const fieldsOut = (withFields.fields || []).map(f => ({
      id: f.id,
      type: f.type,
      label: f.label,
      name: f.name,
      placeholder: f.placeholder,
      required: f.required,
      doNotStore: f.doNotStore,
      options: f.options
    }));
    res.json({ ok: true, form: { id: form.id, title: form.title, category: form.category, fields: fieldsOut } });
  } catch (err) {
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Form title already exists. Choose another.' });
    }
    console.error('Update form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function checkTitleUnique(req, res) {
  try {
    const title = String(req.query.title || '');
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : null;
    if (!title.trim()) return res.json({ unique: false });
    const taken = await isTitleTaken(title, excludeId);
    res.json({ unique: !taken });
  } catch (err) {
    console.error('check-title error:', err);
    res.status(500).json({ unique: false, error: 'Server error' });
  }
}

export async function publicSubmit(req, res) {
  try {
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const fields = form.fields || [];
    const { data = {}, storeConsent = false } = req.body || {};
    const byKey = new Map(fields.map(f => [f.name, f]));

    if (storeConsent) {
      const reduced = {};
      for (const [k, v] of Object.entries(data)) {
        const f = byKey.get(k);
        if (f?.doNotStore) continue;
        // Store by safe field key without any title prefix or suffix
        reduced[safeKey(k)] = v;
      }
      await FormSubmission.create({
        id: crypto.randomBytes(9).toString('base64url'),
        formId: form.id,
        payloadJson: reduced
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Public submit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteForm(req, res) {
  try {
    await sequelize.transaction(async (t) => {
      const form = await Form.findByPk(req.params.id, { transaction: t });
      if (!form) return res.status(404).json({ error: 'Not found' });
      // Owner-or-admin enforcement when auth enabled
      if (env.AUTH_ENABLED) {
        const reqUser = req.session?.user || req.user || null;
        const role = reqUser?.role || 'viewer';
        const isOwner = reqUser && form.createdBy && form.createdBy === reqUser.id;
        const isAdmin = role === 'admin';
        if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
      }

      await FormField.destroy({ where: { formId: form.id }, transaction: t });
      await FormSubmission.destroy({ where: { formId: form.id }, transaction: t });
      await form.destroy({ transaction: t });
      // Log after successful delete inside transaction
      await logAudit(req, { entity: 'form', action: 'delete', entityId: req.params.id, meta: { title: form.title } });
      res.json({ ok: true });
    });
  } catch (err) {
    console.error('Delete form error:', err);
    res.status(500).json({ error: 'Could not delete form' });
  }
}

export async function hostedForm(req, res) {
  try {
    const form = await Form.findByPk(req.params.id, {
      include: [{
        model: FormField,
        as: 'fields',
        order: [['position', 'ASC']] // Order fields by position in the query
      }]
    });

    if (!form) return res.status(404).send('Form not found');

    const fields = form.fields || [];
    const vmFields = fields.map((f, idx) => ({
      partial: PARTIAL_FOR_SERVER[f.type] || 'fields/text',
      ...toVM({
        name: f.name, label: f.label, required: f.required,
        placeholder: f.placeholder, options: f.options,
      }, idx)
    }));
    res.render('hosted-form', { layout: false, formId: form.id, title: form.title || 'Form', fields: vmFields });
  } catch (err) {
    console.error('Render hosted form error:', err);
    res.status(500).send('Server error');
  }
}

export async function builderPage(req, res) {
  try {
    const form = await Form.findByPk(req.params.id, {
      include: [{
        model: FormField,
        as: 'fields',
        order: [['position', 'ASC']] // Order fields by position in the query
      }]
    });

    if (!form) return res.status(404).send('Form not found');

    const formPlain = form.get({ plain: true });
    const fields = (formPlain.fields || []).map(f => ({
      id: f.id,
      type: f.type,
      label: f.label,
      name: f.name,
      placeholder: f.placeholder,
      required: f.required,
      doNotStore: f.doNotStore,
      options: f.options
    }));

    const preload = JSON.stringify({ id: formPlain.id, title: formPlain.title || '', fields });
    const preloadB64 = Buffer.from(preload, 'utf8').toString('base64');

    res.render('builder', {
      title: `Editing: ${formPlain.title || '(Untitled)'}`,
      currentPath: '/builder',
      form: formPlain,
      preloadB64
    });
  } catch (err) {
    console.error('Open builder error:', err);
    res.status(500).send('Server error');
  }
}

export async function builderNewPage(_req, res) {
  try {
    // Render builder without preload; client will read localStorage if present
    res.render('builder', {
      title: 'New Form',
      currentPath: '/builder'
    });
  } catch (err) {
    console.error('Open new builder error:', err);
    res.status(500).send('Server error');
  }
}

// Optional UI endpoints (not required by tests, but handy)
export async function listFormsPage(_req, res) {
  try {
    const rows = await Form.findAll({ order: [['updatedAt', 'DESC']] });
    const forms = rows.map(r => ({ id: r.id, title: r.title || '(Untitled)', category: r.category || 'survey', createdAt: formatDate(r.createdAt), updatedAt: formatDate(r.updatedAt) }));
    res.render('forms', { title: 'Forms', currentPath: '/forms', forms });
  } catch (err) {
    console.error('List page error:', err);
    res.status(500).send('Server error');
  }
}
