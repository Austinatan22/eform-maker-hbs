// src/server/services/forms.service.js
import { sequelize } from '../db.js';
import crypto from 'crypto';
import { Form } from '../models/Form.js';
import { FormField } from '../models/FormField.js';

export const normalizeTitle = (t) => String(t || '').normalize('NFKC').trim();

export async function isTitleTaken(title, excludeId = null) {
  const tnorm = normalizeTitle(title);
  
  // Use Sequelize ORM instead of raw SQL to prevent injection
  const whereClause = { title: tnorm };
  if (excludeId) {
    whereClause.id = { [sequelize.Sequelize.Op.ne]: String(excludeId) };
  }
  
  const form = await Form.findOne({ 
    where: whereClause,
    attributes: ['id']
  });
  
  return !!form;
}

// Helpers for ID generation: form-XXXXXXXX (8 random base62, non-colliding)
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shortRand = (n = 8) => Array.from(crypto.randomBytes(n)).map(b => B62[b % 62]).join('');
export const makeReadableId = () => `form-${shortRand(8)}`;

// Create a form and its fields inside a transaction
export async function createFormWithFields(title, cleanFields, category = 'survey', createdBy = null) {
  return sequelize.transaction(async (t) => {
    // Generate unique id: form-XXXXXXXX (retry on collision)
    let newId;
    for (let tries = 0; tries < 5; tries++) {
      const candidate = makeReadableId();
      const hit = await Form.findByPk(candidate, { transaction: t });
      if (!hit) { newId = candidate; break; }
    }
    if (!newId) throw new Error('Could not generate unique form id');

    const form = await Form.create({ id: newId, title, category, createdBy }, { transaction: t });

    const rows = cleanFields.map((f, idx) => ({
      id: f.id && String(f.id).trim() ? f.id : crypto.randomBytes(9).toString('base64url'),
      formId: form.id,
      type: f.type,
      label: f.label,
      name: f.name,
      placeholder: f.placeholder || '',
      required: !!f.required,
      doNotStore: !!f.doNotStore,
      options: f.options || '',
      position: idx
    }));

    await FormField.bulkCreate(rows, { transaction: t });
    return { form, rows };
  });
}

// Update a form title and replace its fields
export async function updateFormWithFields(id, titleOrNull, cleanFieldsOrNull, categoryOrNull) {
  return sequelize.transaction(async (t) => {
    const form = await Form.findByPk(id, { transaction: t });
    if (!form) return { notFound: true };

    if (titleOrNull !== undefined) {
      form.title = titleOrNull;
      await form.save({ transaction: t });
    }

    if (categoryOrNull !== undefined) {
      form.category = categoryOrNull;
      await form.save({ transaction: t });
    }

    if (cleanFieldsOrNull !== undefined) {
      await FormField.destroy({ where: { formId: form.id }, transaction: t });
      const rows = cleanFieldsOrNull.map((f, idx) => ({
        id: f.id && String(f.id).trim() ? f.id : crypto.randomBytes(9).toString('base64url'),
        formId: form.id,
        type: f.type,
        label: f.label,
        name: f.name,
        placeholder: f.placeholder || '',
        required: !!f.required,
        doNotStore: !!f.doNotStore,
        options: f.options || '',
        position: idx
      }));
      await FormField.bulkCreate(rows, { transaction: t });
    }

    return { form };
  });
}
