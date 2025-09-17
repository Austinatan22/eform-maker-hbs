// src/server/services/templates.service.js
import crypto from 'crypto';
import { Template } from '../models/Template.js';
import { Category } from '../models/Category.js';
import { logger } from '../utils/logger.js';

/**
 * Generate a unique template ID (template-XXXXXXXX format, 8 base62 characters)
 */
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shortRand = (n = 8) => Array.from(crypto.randomBytes(n)).map(b => B62[b % 62]).join('');
export function generateTemplateId() {
    return `template-${shortRand(8)}`;
}

/**
 * Check if a template name is already taken (case-insensitive)
 */
export async function isTemplateNameTaken(name, excludeId = null) {
    try {
        const whereClause = {
            name: {
                [require('sequelize').Op.iLike]: name.trim()
            }
        };

        if (excludeId) {
            whereClause.id = {
                [require('sequelize').Op.ne]: excludeId
            };
        }

        const existing = await Template.findOne({ where: whereClause });
        return !!existing;
    } catch (err) {
        logger.error('Error checking template name:', err);
        return false;
    }
}

/**
 * Create a new template with fields
 */
export async function createTemplate(name, description, fields, categoryId, createdBy = null) {
    try {
        // Generate unique id with collision detection (retry on collision)
        let templateId;
        for (let tries = 0; tries < 5; tries++) {
            const candidate = generateTemplateId();
            const existing = await Template.findByPk(candidate);
            if (!existing) {
                templateId = candidate;
                break;
            }
        }
        if (!templateId) throw new Error('Could not generate unique template id');

        const template = await Template.create({
            id: templateId,
            name: name.trim(),
            description: description?.trim() || '',
            fields: Array.isArray(fields) ? fields : [],
            categoryId: categoryId || null,
            createdBy: createdBy || null
        });

        return template;
    } catch (err) {
        logger.error('Error creating template:', err);
        throw err;
    }
}

/**
 * Update an existing template
 */
export async function updateTemplate(templateId, updates) {
    try {
        const template = await Template.findByPk(templateId);
        if (!template) {
            return { notFound: true };
        }

        const allowedUpdates = ['name', 'description', 'fields', 'categoryId'];
        const updateData = {};

        for (const key of allowedUpdates) {
            if (updates[key] !== undefined) {
                if (key === 'name') {
                    updateData[key] = updates[key].trim();
                } else if (key === 'description') {
                    updateData[key] = updates[key]?.trim() || '';
                } else if (key === 'fields') {
                    updateData[key] = Array.isArray(updates[key]) ? updates[key] : [];
                } else {
                    updateData[key] = updates[key];
                }
            }
        }

        await template.update(updateData);
        return template;
    } catch (err) {
        logger.error('Error updating template:', err);
        throw err;
    }
}

/**
 * Get all templates with category information
 */
export async function getAllTemplates() {
    try {
        const templates = await Template.findAll({
            include: [
                { model: Category, as: 'category' }
            ],
            order: [['updatedAt', 'DESC']]
        });

        return templates.map(template => ({
            id: template.id,
            name: template.name,
            description: template.description,
            categoryId: template.categoryId,
            category: template.category ? {
                id: template.category.id,
                name: template.category.name,
                description: template.category.description,
                color: template.category.color
            } : null,
            fields: template.fields || [],
            createdBy: template.createdBy,
            createdAt: template.createdAt,
            updatedAt: template.updatedAt
        }));
    } catch (err) {
        logger.error('Error getting all templates:', err);
        throw err;
    }
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(templateId) {
    try {
        const template = await Template.findByPk(templateId, {
            include: [
                { model: Category, as: 'category' }
            ]
        });

        if (!template) {
            return null;
        }

        return {
            id: template.id,
            name: template.name,
            description: template.description,
            categoryId: template.categoryId,
            category: template.category ? {
                id: template.category.id,
                name: template.category.name,
                description: template.category.description,
                color: template.category.color
            } : null,
            fields: template.fields || [],
            createdBy: template.createdBy,
            createdAt: template.createdAt,
            updatedAt: template.updatedAt
        };
    } catch (err) {
        logger.error('Error getting template by ID:', err);
        throw err;
    }
}

/**
 * Delete a template
 */
export async function deleteTemplate(templateId) {
    try {
        const template = await Template.findByPk(templateId);
        if (!template) {
            return { notFound: true };
        }

        await template.destroy();
        return { success: true };
    } catch (err) {
        logger.error('Error deleting template:', err);
        throw err;
    }
}

/**
 * Get all templates (replaces getActiveTemplates)
 */
export async function getAllTemplatesForSelection() {
    try {
        const templates = await Template.findAll({
            include: [
                { model: Category, as: 'category' }
            ],
            order: [['name', 'ASC']]
        });

        return templates.map(template => ({
            id: template.id,
            name: template.name,
            description: template.description,
            categoryId: template.categoryId,
            category: template.category ? {
                id: template.category.id,
                name: template.category.name,
                description: template.category.description,
                color: template.category.color
            } : null,
            fields: template.fields || []
        }));
    } catch (err) {
        logger.error('Error getting templates for selection:', err);
        throw err;
    }
}
