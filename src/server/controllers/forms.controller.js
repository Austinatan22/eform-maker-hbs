// src/server/controllers/forms.controller.js
import crypto from 'crypto';
import { sequelize, submissionsSequelize } from '../db.js';
import { Form } from '../models/Form.js';
import { FormSubmission } from '../models/FormSubmission.js';
import { FormField } from '../models/FormField.js';
import { Category } from '../models/Category.js';
import { logAudit } from '../services/audit.service.js';
import { isTitleTaken, createFormWithFields, updateFormWithFields, normalizeTitle } from '../services/forms.service.js';
import { createSubmission, deleteSubmissionsByFormId } from '../services/submissions.service.js';
import { getFileUrl } from '../middleware/upload.js';
import { formValidation, formFieldValidation, sanitize, runValidation, validate } from '../services/validation.service.js';
import { logger } from '../utils/logger.js';

// ---------------------- Helpers (render mapping) ----------------------

const rid = () => crypto.randomBytes(9).toString('base64url');

// Helper functions for field validation and sanitization
function sanitizeFields(fields = []) {
  return fields.map(field => {
    const cleaned = { ...field };

    // Sanitize text fields
    if (cleaned.label) cleaned.label = sanitize.html(cleaned.label);
    if (cleaned.placeholder) cleaned.placeholder = sanitize.html(cleaned.placeholder);
    if (cleaned.name) cleaned.name = sanitize.database(cleaned.name);

    // Handle options for dropdown/radio/checkbox fields
    const needsOptions = ['dropdown', 'multipleChoice', 'checkboxes'];
    if (needsOptions.includes(cleaned.type)) {
      if (Array.isArray(cleaned.options)) {
        cleaned.options = cleaned.options.map(opt => sanitize.html(String(opt))).join(', ');
      } else {
        cleaned.options = String(cleaned.options || '').split(',')
          .map(opt => sanitize.html(opt.trim()))
          .filter(Boolean)
          .join(', ');
      }
    } else {
      delete cleaned.options;
    }

    // Remove auto-generated fields
    delete cleaned.autoName;

    return cleaned;
  });
}

function isValidField(field) {
  if (!field) return false;

  // Check required fields
  const labelError = formFieldValidation.label(field.label);
  if (labelError) return false;

  const nameError = formFieldValidation.name(field.name);
  if (nameError) return false;

  // Check options for fields that need them
  const optionsError = formFieldValidation.options(field.options, field.type);
  if (optionsError) return false;

  return true;
}

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(new Date(date));
}

// Map builder field.type -> partial path (under views/partials/fields)
const PARTIAL_FOR = {
  singleLine: 'fields/text',
  paragraph: 'fields/textarea',
  dropdown: 'fields/select',
  multipleChoice: 'fields/radios',
  checkboxes: 'fields/checkboxes',
  number: 'fields/number',
  name: 'fields/name',
  email: 'fields/email',
  phone: 'fields/phone',
  password: 'fields/password',
  date: 'fields/date',
  time: 'fields/time',
  datetime: 'fields/datetime',
  url: 'fields/url',
  file: 'fields/file',
  richText: 'fields/rich-text'
};

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
  const { id, title = '', fields = [], categoryId } = req.body || {};

  // Enhanced form validation
  const formValidationResult = runValidation({ title, fields }, {
    title: formValidation.title,
    fields: formValidation.fields
  });

  if (!formValidationResult.valid) {
    return res.status(400).json({
      error: 'Form validation failed',
      details: formValidationResult.errors
    });
  }

  // Validate categoryId if provided
  let category = null;
  if (categoryId) {
    category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(400).json({
        error: 'Invalid category ID'
      });
    }
  }

  const normalizedTitle = normalizeTitle(sanitize.html(title));

  // Enhanced field validation
  const clean = sanitizeFields(fields);
  const fieldErrors = [];

  for (let i = 0; i < clean.length; i++) {
    const field = clean[i];

    // Validate each field property
    const labelError = formFieldValidation.label(field.label);
    if (labelError) fieldErrors.push(`Field ${i + 1}: ${labelError}`);

    const nameError = formFieldValidation.name(field.name);
    if (nameError) fieldErrors.push(`Field ${i + 1}: ${nameError}`);

    const placeholderError = formFieldValidation.placeholder(field.placeholder);
    if (placeholderError) fieldErrors.push(`Field ${i + 1}: ${placeholderError}`);

    const optionsError = formFieldValidation.options(field.options, field.type);
    if (optionsError) fieldErrors.push(`Field ${i + 1}: ${optionsError}`);

    if (!isValidField(field)) {
      fieldErrors.push(`Field ${i + 1}: Invalid field definition`);
    }
  }

  if (fieldErrors.length > 0) {
    return res.status(400).json({
      error: 'Field validation failed',
      details: fieldErrors
    });
  }

  // Ensure field names are unique within the form
  const seen = new Set();
  for (const f of clean) {
    const key = String(f.name || '');
    if (seen.has(key)) {
      return res.status(400).json({ error: 'Field names must be unique within a form.' });
    }
    seen.add(key);
  }

  try {
    // Enforce case-insensitive title uniqueness on create
    if (!id) {
      if (await isTitleTaken(normalizedTitle)) {
        return res.status(409).json({ error: 'Form title already exists. Choose another.' });
      }
    }
    if (!id) {
      const reqUser = req.session?.user || req.user || null;
      const createdBy = process.env.AUTH_ENABLED === '1' ? (reqUser?.id || null) : null;
      const { form, rows } = await createFormWithFields(normalizedTitle, clean, categoryId, createdBy);
      await logAudit(req, {
        entity: 'form',
        action: 'create',
        entityId: form.id,
        meta: {
          title: form.title,
          category,
          fieldCount: clean.length,
          fields: clean.map(f => ({ type: f.type, label: f.label, required: f.required }))
        }
      });
      return res.json({ ok: true, form: { id: form.id, title: form.title, fields: rows } });
    } else {
      // Enforce uniqueness on update (when using POST /api/forms with id)
      if (await isTitleTaken(normalizedTitle, String(id))) {
        return res.status(409).json({ error: 'Form title already exists. Choose another.' });
      }

      // Get the current form state before update for audit logging
      const currentForm = await Form.findByPk(id, { include: [{ model: FormField, as: 'fields' }] });
      if (!currentForm) return res.status(404).json({ error: 'Not found' });

      // Ownership restrictions removed - editors can now edit any form
      const out = await updateFormWithFields(id, normalizedTitle, clean, categoryId);
      if (out?.notFound) return res.status(404).json({ error: 'Not found' });

      const withFields = await Form.findByPk(id, {
        include: [
          { model: FormField, as: 'fields' },
          { model: Category, as: 'category' }
        ]
      });
      const fieldsOut = (withFields.fields || []).sort((a, b) => a.position - b.position).map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options
      }));

      // Enhanced audit logging with before/after states
      const changes = {};

      if (currentForm.title !== withFields.title) {
        changes.title = { from: currentForm.title, to: withFields.title };
      }
      if (currentForm.category !== withFields.category) {
        changes.category = { from: currentForm.category, to: withFields.category };
      }

      // Check for field changes using content-based comparison
      const currentFields = (currentForm.fields || []).sort((a, b) => a.position - b.position);
      const newFields = fieldsOut;

      if (currentFields.length !== newFields.length) {
        changes.fieldCount = { from: currentFields.length, to: newFields.length };
      }

      // Check for individual field changes using content-based comparison
      const fieldChanges = [];

      // Create maps for efficient lookup
      const currentFieldMap = new Map();
      const newFieldMap = new Map();

      currentFields.forEach(field => {
        const key = `${field.label}|${field.type}|${field.required}|${JSON.stringify(field.options || {})}`;
        currentFieldMap.set(key, field);
      });

      newFields.forEach(field => {
        const key = `${field.label}|${field.type}|${field.required}|${JSON.stringify(field.options || {})}`;
        newFieldMap.set(key, field);
      });

      // Find added fields (in new but not in current)
      newFields.forEach(newField => {
        const key = `${newField.label}|${newField.type}|${newField.required}|${JSON.stringify(newField.options || {})}`;
        if (!currentFieldMap.has(key)) {
          fieldChanges.push({ action: 'added', field: { label: newField.label, type: newField.type } });
        }
      });

      // Find removed fields (in current but not in new)
      currentFields.forEach(currentField => {
        const key = `${currentField.label}|${currentField.type}|${currentField.required}|${JSON.stringify(currentField.options || {})}`;
        if (!newFieldMap.has(key)) {
          fieldChanges.push({ action: 'removed', field: { label: currentField.label, type: currentField.type } });
        }
      });

      // Find moved fields (same content, different position)
      const movedFields = [];
      currentFields.forEach((currentField, currentIndex) => {
        const currentKey = `${currentField.label}|${currentField.type}|${currentField.required}|${JSON.stringify(currentField.options || {})}`;
        const newIndex = newFields.findIndex(newField => {
          const newKey = `${newField.label}|${newField.type}|${newField.required}|${JSON.stringify(newField.options || {})}`;
          return newKey === currentKey;
        });

        if (newIndex !== -1 && newIndex !== currentIndex) {
          // Field exists in both but at different positions
          const isAlreadyTracked = movedFields.some(moved =>
            moved.field.label === currentField.label &&
            moved.field.type === currentField.type
          );

          if (!isAlreadyTracked) {
            movedFields.push({
              action: 'moved',
              field: { label: currentField.label, type: currentField.type },
              changes: { position: { from: currentIndex, to: newIndex } }
            });
          }
        }
      });

      fieldChanges.push(...movedFields);

      if (fieldChanges.length > 0) {
        changes.fields = fieldChanges;
      }

      await logAudit(req, {
        entity: 'form',
        action: 'update',
        entityId: withFields.id,
        meta: {
          title: withFields.title,
          categoryId: withFields.categoryId,
          changes: Object.keys(changes).length > 0 ? changes : 'No changes detected'
        }
      });
      return res.json({
        ok: true,
        form: {
          id: withFields.id,
          title: withFields.title,
          categoryId: withFields.categoryId,
          category: withFields.category ? {
            id: withFields.category.id,
            name: withFields.category.name,
            description: withFields.category.description,
            color: withFields.category.color
          } : null,
          fields: fieldsOut
        }
      });
    }
  } catch (err) {
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Uniqueness constraint failed.' });
    }
    logger.error('Create/update form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listForms(_req, res) {
  try {
    const rows = await Form.findAll({
      order: [['updatedAt', 'DESC']],
      include: [
        { model: FormField, as: 'fields' },
        { model: Category, as: 'category' }
      ]
    });
    const forms = rows.map(r => ({
      id: r.id,
      title: r.title,
      categoryId: r.categoryId,
      category: r.category ? {
        id: r.category.id,
        name: r.category.name,
        description: r.category.description,
        color: r.category.color
      } : null,
      fields: (r.fields || []).sort((a, b) => a.position - b.position).map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options, countryIso2: f.countryIso2
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    // Return in DataTables expected format
    res.json({ data: forms });
  } catch (err) {
    logger.error('List forms error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function readForm(req, res) {
  try {
    const form = await Form.findByPk(req.params.id, {
      include: [
        { model: FormField, as: 'fields' },
        { model: Category, as: 'category' }
      ]
    });
    if (!form) return res.status(404).json({ error: 'Not found' });
    const fields = (form.fields || []).sort((a, b) => a.position - b.position).map(f => ({
      id: f.id, type: f.type, label: f.label, name: f.name,
      placeholder: f.placeholder,
      required: f.required, doNotStore: f.doNotStore,
      options: f.options
    }));
    res.json({
      ok: true,
      form: {
        id: form.id,
        title: form.title,
        categoryId: form.categoryId,
        category: form.category ? {
          id: form.category.id,
          name: form.category.name,
          description: form.category.description,
          color: form.category.color
        } : null,
        fields
      }
    });
  } catch (err) {
    logger.error('Read form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function updateForm(req, res) {
  const { title, fields, categoryId } = req.body || {};

  // Validate categoryId if provided
  let category = null;
  if (categoryId) {
    category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(400).json({
        error: 'Invalid category ID'
      });
    }
  }
  try {
    // Get current form state for audit logging (save original values)
    const currentForm = await Form.findByPk(req.params.id, {
      include: [
        { model: FormField, as: 'fields' },
        { model: Category, as: 'category' }
      ]
    });
    if (!currentForm) return res.status(404).json({ error: 'Not found' });

    // Save original values before any changes
    const originalTitle = currentForm.title;
    const originalCategoryId = currentForm.categoryId;

    const form = currentForm; // Use the same instance
    // Ownership restrictions removed - editors can now edit any form

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ error: 'Form title is required.' });
      }
      const normalizedTitle = normalizeTitle(title);

      // Strict unique-before-update (case-insensitive)
      if (await isTitleTaken(normalizedTitle, String(req.params.id))) {
        return res.status(409).json({ error: 'Form title already exists. Choose another.' });
      }
      form.title = normalizedTitle;
    }

    if (categoryId !== undefined) {
      form.categoryId = categoryId;
    }

    if (fields !== undefined) {
      if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });
      const clean = sanitizeFields(fields);
      for (const f of clean) {
        if (!isValidField(f)) {
          return res.status(400).json({ error: 'Invalid field definition: label and name are required; option-based fields need options.' });
        }
      }
      // Ensure field names are unique within the form
      const seen = new Set();
      for (const f of clean) {
        const key = String(f.name || '');
        if (seen.has(key)) {
          return res.status(400).json({ error: 'Field names must be unique within a form.' });
        }
        seen.add(key);
      }
      await updateFormWithFields(form.id, undefined, clean);
    }

    // Save the form if title or category changed (fields are handled by updateFormWithFields)
    if (title !== undefined || categoryId !== undefined) {
      await form.save();
    }

    const withFields = await Form.findByPk(form.id, {
      include: [
        { model: FormField, as: 'fields' },
        { model: Category, as: 'category' }
      ]
    });
    const fieldsOut = (withFields.fields || []).sort((a, b) => a.position - b.position).map(f => ({
      id: f.id, type: f.type, label: f.label, name: f.name,
      placeholder: f.placeholder,
      required: f.required, doNotStore: f.doNotStore,
      options: f.options
    }));

    // Enhanced audit logging with before/after states
    const changes = {};

    // Normalize both titles for comparison
    const originalTitleNormalized = normalizeTitle(originalTitle);
    const newTitleNormalized = normalizeTitle(withFields.title);

    if (originalTitleNormalized !== newTitleNormalized) {
      changes.title = { from: originalTitle, to: withFields.title };
    }
    if (originalCategoryId !== withFields.categoryId) {
      changes.categoryId = { from: originalCategoryId, to: withFields.categoryId };
    }

    // Check for field changes if fields were updated
    if (fields !== undefined) {
      const currentFields = (currentForm.fields || []).sort((a, b) => a.position - b.position);
      const newFields = fieldsOut;

      if (currentFields.length !== newFields.length) {
        changes.fieldCount = { from: currentFields.length, to: newFields.length };
      }

      // Check for individual field changes using content-based comparison
      const fieldChanges = [];

      // Create maps for efficient lookup
      const currentFieldMap = new Map();
      const newFieldMap = new Map();

      currentFields.forEach(field => {
        const key = `${field.label}|${field.type}|${field.required}|${JSON.stringify(field.options || {})}`;
        currentFieldMap.set(key, field);
      });

      newFields.forEach(field => {
        const key = `${field.label}|${field.type}|${field.required}|${JSON.stringify(field.options || {})}`;
        newFieldMap.set(key, field);
      });

      // Find added fields (in new but not in current)
      newFields.forEach(newField => {
        const key = `${newField.label}|${newField.type}|${newField.required}|${JSON.stringify(newField.options || {})}`;
        if (!currentFieldMap.has(key)) {
          fieldChanges.push({ action: 'added', field: { label: newField.label, type: newField.type } });
        }
      });

      // Find removed fields (in current but not in new)
      currentFields.forEach(currentField => {
        const key = `${currentField.label}|${currentField.type}|${currentField.required}|${JSON.stringify(currentField.options || {})}`;
        if (!newFieldMap.has(key)) {
          fieldChanges.push({ action: 'removed', field: { label: currentField.label, type: currentField.type } });
        }
      });

      // Find moved fields (same content, different position)
      const movedFields = [];
      currentFields.forEach((currentField, currentIndex) => {
        const currentKey = `${currentField.label}|${currentField.type}|${currentField.required}|${JSON.stringify(currentField.options || {})}`;
        const newIndex = newFields.findIndex(newField => {
          const newKey = `${newField.label}|${newField.type}|${newField.required}|${JSON.stringify(newField.options || {})}`;
          return newKey === currentKey;
        });

        if (newIndex !== -1 && newIndex !== currentIndex) {
          // Field exists in both but at different positions
          const isAlreadyTracked = movedFields.some(moved =>
            moved.field.label === currentField.label &&
            moved.field.type === currentField.type
          );

          if (!isAlreadyTracked) {
            movedFields.push({
              action: 'moved',
              field: { label: currentField.label, type: currentField.type },
              changes: { position: { from: currentIndex, to: newIndex } }
            });
          }
        }
      });

      fieldChanges.push(...movedFields);

      if (fieldChanges.length > 0) {
        changes.fields = fieldChanges;
      }
    }

    // Log audit if there were changes
    if (Object.keys(changes).length > 0) {
      await logAudit(req, {
        entity: 'form',
        action: 'update',
        entityId: form.id,
        meta: {
          title: withFields.title,
          category: withFields.category,
          changes: changes
        }
      });
    }

    // Reload form with category information for response
    const updatedForm = await Form.findByPk(form.id, {
      include: [{ model: Category, as: 'category' }]
    });

    res.json({
      ok: true,
      form: {
        id: updatedForm.id,
        title: updatedForm.title,
        categoryId: updatedForm.categoryId,
        category: updatedForm.category ? {
          id: updatedForm.category.id,
          name: updatedForm.category.name,
          description: updatedForm.category.description,
          color: updatedForm.category.color
        } : null,
        fields: fieldsOut
      }
    });
  } catch (err) {
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Form title already exists. Choose another.' });
    }
    logger.error('Update form error:', err);
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
    logger.error('check-title error:', err);
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
      await createSubmission(form.id, reduced);
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error('Public submit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteForm(req, res) {
  try {
    let formTitle = null;
    await sequelize.transaction(async (t) => {
      const form = await Form.findByPk(req.params.id, { transaction: t });
      if (!form) return res.status(404).json({ error: 'Not found' });

      // Store title for audit logging outside transaction
      formTitle = form.title;

      // Ownership restrictions removed - editors can now delete any form

      // Delete in order of dependencies for better performance
      await FormField.destroy({ where: { formId: form.id }, transaction: t });

      // Delete submissions from the separate submissions database
      await deleteSubmissionsByFormId(form.id);

      await form.destroy({ transaction: t });
    });

    // Log audit after successful deletion (outside transaction)
    await logAudit(req, {
      entity: 'form',
      action: 'delete',
      entityId: req.params.id,
      meta: {
        title: formTitle,
        category: form.category,
        fieldCount: form.fields?.length || 0,
        deletedAt: new Date().toISOString()
      }
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete form error:', err);
    res.status(500).json({ error: 'Could not delete form' });
  }
}

export async function uploadFile(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: getFileUrl(file.filename, req)
    }));

    // Log file upload
    await logAudit(req, {
      entity: 'file',
      action: 'upload',
      entityId: null,
      meta: {
        files: uploadedFiles.map(f => ({ name: f.originalName, size: f.size }))
      }
    });

    res.json({
      ok: true,
      files: uploadedFiles,
      message: `${uploadedFiles.length} file(s) uploaded successfully`
    });
  } catch (err) {
    logger.error('File upload error:', err);
    res.status(500).json({ error: 'File upload failed' });
  }
}

export async function hostedForm(req, res) {
  try {
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).send('Form not found');
    const fields = (form.fields || []).sort((a, b) => a.position - b.position);
    const vmFields = fields.map((f, idx) => ({
      partial: PARTIAL_FOR[f.type] || 'fields/text',
      ...toVM({
        name: f.name, label: f.label, required: f.required,
        placeholder: f.placeholder, options: f.options,
      }, idx)
    }));
    res.render('hosted-form', { layout: false, formId: form.id, title: form.title || 'Form', fields: vmFields });
  } catch (err) {
    logger.error('Render hosted form error:', err);
    res.status(500).send('Server error');
  }
}

export async function builderPage(req, res) {
  try {
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).send('Form not found');

    const formPlain = form.get({ plain: true });
    const fields = (formPlain.fields || [])
      .sort((a, b) => a.position - b.position)
      .map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options
      }));

    const preload = JSON.stringify({ id: formPlain.id, title: formPlain.title || '', category: formPlain.category || 'survey', fields });
    const preloadB64 = Buffer.from(preload, 'utf8').toString('base64');

    res.render('builder', {
      title: `Editing: ${formPlain.title || '(Untitled)'}`,
      currentPath: '/builder',
      form: formPlain,
      preloadB64
    });
  } catch (err) {
    logger.error('Open builder error:', err);
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
    logger.error('Open new builder error:', err);
    res.status(500).send('Server error');
  }
}

// Optional UI endpoints (not required by tests, but handy)
export async function listFormsPage(_req, res) {
  try {
    const rows = await Form.findAll({
      order: [['updatedAt', 'DESC']],
      include: [{ model: Category, as: 'category' }]
    });
    const forms = rows.map(r => ({
      id: r.id,
      title: r.title || '(Untitled)',
      categoryId: r.categoryId,
      category: r.category ? {
        id: r.category.id,
        name: r.category.name,
        description: r.category.description,
        color: r.category.color
      } : null,
      createdAt: formatDate(r.createdAt),
      updatedAt: formatDate(r.updatedAt)
    }));

    // Get all categories for the dropdown
    const categories = await Category.findAll({
      order: [['name', 'ASC']]
    });
    const categoriesData = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      color: cat.color
    }));

    res.render('forms', { title: 'Forms', currentPath: '/forms', forms, categories: categoriesData });
  } catch (err) {
    logger.error('List page error:', err);
    res.status(500).send('Server error');
  }
}
