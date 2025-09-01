// src/server/controllers/forms.controller.js
import crypto from 'crypto';
import { sequelize } from '../../../db.js';
import { Form } from '../../../models/Form.js';
import { FormSubmission } from '../../../models/FormSubmission.js';
import { FormField } from '../../../models/FormField.js';
import { isValidField, sanitizeFields } from '../validators/forms.validator.js';
import { isTitleTaken, createFormWithFields, updateFormWithFields } from '../services/forms.service.js';

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
const PARTIAL_FOR = {
  singleLine: 'fields/text',
  paragraph: 'fields/textarea',
  dropdown: 'fields/select',
  multipleChoice: 'fields/radios',
  checkboxes: 'fields/checkboxes',
  number: 'fields/number',
  name: 'fields/name',
  email: 'fields/email',
  phone: 'fields/phone'
};

const toVM = (f, idx) => ({
  name: f.name || f.id || `f_${idx}`,
  label: f.label || '',
  required: !!f.required,
  placeholder: f.placeholder || '',
  options: String(f.options || '').split(',').map(s => s.trim()).filter(Boolean)
});

// Submission helpers
const prefixFromTitle = (title) =>
  (title || 'FORM').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const safeKey = (k) => String(k || '').replace(/[^a-zA-Z0-9_]/g, '_');

// ---------------------- Controllers ----------------------
export async function health(_req, res) {
  res.json({ ok: true });
}

export async function createOrUpdateForm(req, res) {
  const { id, title = '', fields = [] } = req.body || {};

  if (!title.trim()) return res.status(400).json({ error: 'Form title is required.' });
  if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });

  const clean = sanitizeFields(fields);
  for (const f of clean) {
    if (!isValidField(f)) {
      return res.status(400).json({ error: 'Invalid field definition: label and name are required; option-based fields need options.' });
    }
  }

  try {
    if (!id) {
      const { form, rows } = await createFormWithFields(title, clean);
      return res.json({ ok: true, form: { id: form.id, title: form.title, fields: rows } });
    } else {
      const out = await updateFormWithFields(id, title, clean);
      if (out?.notFound) return res.status(404).json({ error: 'Not found' });
      const withFields = await Form.findByPk(id, { include: [{ model: FormField, as: 'fields' }] });
      const fieldsOut = (withFields.fields || []).sort((a,b)=>a.position-b.position).map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options, countryIso2: f.countryIso2
      }));
      return res.json({ ok: true, form: { id: withFields.id, title: withFields.title, fields: fieldsOut } });
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
    const rows = await Form.findAll({ order: [['updatedAt', 'DESC']], include: [{ model: FormField, as: 'fields' }] });
    const forms = rows.map(r => ({
      id: r.id,
      title: r.title,
      fields: (r.fields || []).sort((a,b)=>a.position-b.position).map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options, countryIso2: f.countryIso2
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
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).json({ error: 'Not found' });
    const fields = (form.fields || []).sort((a,b)=>a.position-b.position).map(f => ({
      id: f.id, type: f.type, label: f.label, name: f.name,
      placeholder: f.placeholder,
      required: f.required, doNotStore: f.doNotStore,
      options: f.options, countryIso2: f.countryIso2
    }));
    res.json({ ok: true, form: { id: form.id, title: form.title, fields } });
  } catch (err) {
    console.error('Read form error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function updateForm(req, res) {
  const { title, fields } = req.body || {};
  try {
    const form = await Form.findByPk(req.params.id);
    if (!form) return res.status(404).json({ error: 'Not found' });

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ error: 'Form title is required.' });
      }
      // If you want strict unique-before-update, uncomment the next lines:
      // if (await isTitleTaken(title, String(req.params.id))) {
      //   return res.status(409).json({ error: 'Form title already exists. Choose another.' });
      // }
      form.title = title;
    }

    if (fields !== undefined) {
      if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });
      const clean = sanitizeFields(fields);
      for (const f of clean) {
        if (!isValidField(f)) {
          return res.status(400).json({ error: 'Invalid field definition: label and name are required; option-based fields need options.' });
        }
      }
      await updateFormWithFields(form.id, undefined, clean);
    }

    await form.save();

    const withFields = await Form.findByPk(form.id, { include: [{ model: FormField, as: 'fields' }] });
    const fieldsOut = (withFields.fields || []).sort((a,b)=>a.position-b.position).map(f => ({
      id: f.id, type: f.type, label: f.label, name: f.name,
      placeholder: f.placeholder,
      required: f.required, doNotStore: f.doNotStore,
      options: f.options, countryIso2: f.countryIso2
    }));
    res.json({ ok: true, form: { id: form.id, title: form.title, fields: fieldsOut } });
  } catch (err) {
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
    const prefix = prefixFromTitle(form.title);

    if (storeConsent) {
      const reduced = {};
      for (const [k, v] of Object.entries(data)) {
        const f = byKey.get(k);
        if (f?.doNotStore) continue;
        reduced[`${prefix}_${safeKey(k)}`] = v;
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

      await FormField.destroy({ where: { formId: form.id }, transaction: t });
      await FormSubmission.destroy({ where: { formId: form.id }, transaction: t });
      await form.destroy({ transaction: t });

      res.json({ ok: true });
    });
  } catch (err) {
    console.error('Delete form error:', err);
    res.status(500).json({ error: 'Could not delete form' });
  }
}

export async function hostedForm(req, res) {
  try {
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).send('Form not found');
    const fields = (form.fields || []).sort((a,b)=>a.position-b.position);
    const vmFields = fields.map((f, idx) => ({
      partial: PARTIAL_FOR[f.type] || 'fields/text',
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
    const form = await Form.findByPk(req.params.id, { include: [{ model: FormField, as: 'fields' }] });
    if (!form) return res.status(404).send('Form not found');

    const formPlain = form.get({ plain: true });
    const fields = (formPlain.fields || [])
      .sort((a,b)=>a.position-b.position)
      .map(f => ({
        id: f.id, type: f.type, label: f.label, name: f.name,
        placeholder: f.placeholder,
        required: f.required, doNotStore: f.doNotStore,
        options: f.options, countryIso2: f.countryIso2
      }));

    const preload = JSON.stringify({ id: formPlain.id, title: formPlain.title || '', fields });

    res.render('builder', {
      title: `Editing: ${formPlain.title || '(Untitled)'}`,
      currentPath: '/builder',
      form: formPlain,
      preloadJson: preload
    });
  } catch (err) {
    console.error('Open builder error:', err);
    res.status(500).send('Server error');
  }
}

// Optional UI endpoints (not required by tests, but handy)
export async function listFormsPage(_req, res) {
  try {
    const rows = await Form.findAll({ order: [['updatedAt', 'DESC']] });
    const forms = rows.map(r => ({ id: r.id, title: r.title || '(Untitled)', createdAt: formatDate(r.createdAt), updatedAt: formatDate(r.updatedAt) }));
    res.render('forms', { title: 'Forms', currentPath: '/forms', forms });
  } catch (err) {
    console.error('List page error:', err);
    res.status(500).send('Server error');
  }
}
