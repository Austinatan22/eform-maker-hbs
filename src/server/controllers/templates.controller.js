// src/server/controllers/templates.controller.js
import { Template } from '../models/Template.js';
import { Category } from '../models/Category.js';
import { logAudit } from '../services/audit.service.js';
import {
    createTemplate,
    updateTemplate,
    getAllTemplates,
    getTemplateById,
    deleteTemplate,
    getAllTemplatesForSelection,
    isTemplateNameTaken
} from '../services/templates.service.js';
import { validateFields, ensureUniqueFieldNames } from '../utils/field-validation.js';
import { logger } from '../utils/logger.js';

/**
 * Create a new template
 */
export async function createOrUpdateTemplate(req, res) {
    const { id, name = '', description = '', fields = [], categoryId } = req.body || {};

    // Validate required fields
    if (!name.trim()) {
        return res.status(400).json({ error: 'Template name is required' });
    }

    // Validate categoryId if provided
    let category = null;
    if (categoryId) {
        category = await Category.findByPk(categoryId);
        if (!category) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
    }

    // Check field count limit
    if (fields.length > 100) {
        return res.status(413).json({
            error: 'Too many fields',
            details: `Maximum 100 fields allowed, received ${fields.length}`
        });
    }

    // Validate fields
    const { clean, fieldErrors } = validateFields(fields);
    if (fieldErrors.length > 0) {
        return res.status(400).json({
            error: 'Field validation failed',
            details: fieldErrors
        });
    }

    // Ensure field names are unique within the template
    try {
        ensureUniqueFieldNames(clean);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        if (!id) {
            // Create new template
            if (await isTemplateNameTaken(name)) {
                return res.status(409).json({ error: 'Template name already exists. Choose another.' });
            }

            const reqUser = req.session?.user || req.user || null;
            const createdBy = process.env.AUTH_ENABLED === '1' ? (reqUser?.id || null) : null;

            const template = await createTemplate(name, description, clean, categoryId, createdBy);

            await logAudit(req, {
                entity: 'template',
                action: 'create',
                entityId: template.id,
                meta: {
                    name: template.name,
                    category: category?.name || 'Uncategorized',
                    fields: clean.map(f => ({ type: f.type, label: f.label, required: f.required }))
                }
            });

            return res.json({
                ok: true,
                template: {
                    id: template.id,
                    name: template.name,
                    description: template.description,
                    categoryId: template.categoryId,
                    fields: clean
                }
            });
        } else {
            // Update existing template
            if (await isTemplateNameTaken(name, id)) {
                return res.status(409).json({ error: 'Template name already exists. Choose another.' });
            }

            const result = await updateTemplate(id, {
                name,
                description,
                fields: clean,
                categoryId
            });

            if (result.notFound) {
                return res.status(404).json({ error: 'Template not found' });
            }

            await logAudit(req, {
                entity: 'template',
                action: 'update',
                entityId: id,
                meta: {
                    name: result.name,
                    category: category?.name || 'Uncategorized',
                    fields: clean.map(f => ({ type: f.type, label: f.label, required: f.required }))
                }
            });

            return res.json({
                ok: true,
                template: {
                    id: result.id,
                    name: result.name,
                    description: result.description,
                    categoryId: result.categoryId,
                    fields: clean
                }
            });
        }
    } catch (err) {
        if (err?.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'Template name already exists. Choose another.' });
        }
        logger.error('Create/update template error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

/**
 * Get all templates
 */
export async function listTemplates(_req, res) {
    try {
        const templates = await getAllTemplates();
        res.json({ data: templates });
    } catch (err) {
        logger.error('List templates error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

/**
 * Get templates (for form creation)
 */
export async function listActiveTemplates(_req, res) {
    try {
        const templates = await getAllTemplatesForSelection();
        res.json({ data: templates });
    } catch (err) {
        logger.error('List templates error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

/**
 * Get a single template
 */
export async function readTemplate(req, res) {
    try {
        const template = await getTemplateById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json({ ok: true, template });
    } catch (err) {
        logger.error('Read template error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

/**
 * Update a template
 */
export async function updateTemplateById(req, res) {
    const { name, description, fields, categoryId } = req.body || {};

    // Validate categoryId if provided
    let category = null;
    if (categoryId) {
        category = await Category.findByPk(categoryId);
        if (!category) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
    }

    try {
        const updates = {};

        if (name !== undefined) {
            if (!String(name).trim()) {
                return res.status(400).json({ error: 'Template name is required.' });
            }

            if (await isTemplateNameTaken(name, req.params.id)) {
                return res.status(409).json({ error: 'Template name already exists. Choose another.' });
            }
            updates.name = name.trim();
        }

        if (description !== undefined) {
            updates.description = description?.trim() || '';
        }

        if (categoryId !== undefined) {
            updates.categoryId = categoryId;
        }


        if (fields !== undefined) {
            if (!Array.isArray(fields)) {
                return res.status(400).json({ error: 'fields must be an array' });
            }

            // Check field count limit
            if (fields.length > 100) {
                return res.status(413).json({
                    error: 'Too many fields',
                    details: `Maximum 100 fields allowed, received ${fields.length}`
                });
            }

            const { clean, fieldErrors } = validateFields(fields);
            if (fieldErrors.length > 0) {
                return res.status(400).json({
                    error: 'Field validation failed',
                    details: fieldErrors
                });
            }

            try {
                ensureUniqueFieldNames(clean);
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }

            updates.fields = clean;
        }

        const result = await updateTemplate(req.params.id, updates);
        if (result.notFound) {
            return res.status(404).json({ error: 'Template not found' });
        }

        await logAudit(req, {
            entity: 'template',
            action: 'update',
            entityId: req.params.id,
            meta: {
                name: result.name,
                category: category?.name || 'Uncategorized',
                changes: Object.keys(updates)
            }
        });

        res.json({
            ok: true,
            template: {
                id: result.id,
                name: result.name,
                description: result.description,
                categoryId: result.categoryId,
                fields: result.fields,
                isActive: result.isActive
            }
        });
    } catch (err) {
        if (err?.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'Template name already exists. Choose another.' });
        }
        logger.error('Update template error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

/**
 * Delete a template
 */
export async function deleteTemplateById(req, res) {
    try {
        const template = await getTemplateById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const result = await deleteTemplate(req.params.id);
        if (result.notFound) {
            return res.status(404).json({ error: 'Template not found' });
        }

        await logAudit(req, {
            entity: 'template',
            action: 'delete',
            entityId: req.params.id,
            meta: {
                name: template.name,
                category: template.category?.name || 'Uncategorized',
                deletedAt: new Date().toISOString()
            }
        });

        res.json({ ok: true });
    } catch (err) {
        logger.error('Delete template error:', err);
        res.status(500).json({ error: 'Could not delete template' });
    }
}

/**
 * Check if template name is unique
 */
export async function checkTemplateNameUnique(req, res) {
    try {
        const name = String(req.query.name || '');
        const excludeId = req.query.excludeId ? String(req.query.excludeId) : null;
        if (!name.trim()) return res.json({ unique: false });
        const taken = await isTemplateNameTaken(name, excludeId);
        res.json({ unique: !taken });
    } catch (err) {
        logger.error('check-template-name error:', err);
        res.status(500).json({ unique: false, error: 'Server error' });
    }
}

/**
 * Templates page
 */
export async function listTemplatesPage(_req, res) {
    try {
        const templates = await getAllTemplates();
        const categories = await Category.findAll({
            order: [['name', 'ASC']]
        });

        const categoriesData = categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            description: cat.description,
            color: cat.color
        }));

        res.render('templates', {
            title: 'Templates',
            currentPath: '/templates',
            templates,
            categories: categoriesData
        });
    } catch (err) {
        logger.error('Templates page error:', err);
        res.status(500).send('Server error');
    }
}
