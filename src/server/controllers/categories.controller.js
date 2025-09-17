// src/server/controllers/categories.controller.js
import crypto from 'crypto';
import { Op } from 'sequelize';
import { Category } from '../models/Category.js';
import { Form } from '../models/Form.js';
import { logAudit } from '../services/audit.service.js';

// ---------------------- Controllers ----------------------
export async function listCategories(req, res) {
    try {
        const categories = await Category.findAll({
            order: [['name', 'ASC']]
        });

        // Return in DataTables expected format
        res.json({ data: categories });
    } catch (err) {
        console.error('List categories error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

export async function createCategory(req, res) {
    try {
        const { name = '', description = '', color = '#6c757d' } = req.body || {};

        // Validation
        const trimmedName = String(name).trim();
        if (!trimmedName) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        if (trimmedName.length > 255) {
            return res.status(400).json({ error: 'Category name is too long' });
        }

        // Check if category name already exists
        const existing = await Category.findOne({ where: { name: trimmedName } });
        if (existing) {
            return res.status(409).json({ error: 'Category name already exists' });
        }

        // Validate color format
        const colorRegex = /^#[0-9A-Fa-f]{6}$/;
        if (color && !colorRegex.test(color)) {
            return res.status(400).json({ error: 'Invalid color format' });
        }

        // Generate unique id with collision detection (retry on collision)
        const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        const shortRand = (n = 8) => Array.from(crypto.randomBytes(n)).map(b => B62[b % 62]).join('');

        let id;
        for (let tries = 0; tries < 5; tries++) {
            const candidate = `category-${shortRand(8)}`;
            const existing = await Category.findByPk(candidate);
            if (!existing) {
                id = candidate;
                break;
            }
        }
        if (!id) {
            return res.status(500).json({ error: 'Could not generate unique category id' });
        }
        const category = await Category.create({
            id,
            name: trimmedName,
            description: String(description).trim(),
            color: color || '#6c757d'
        });

        // Log category creation
        await logAudit(req, {
            entity: 'category',
            action: 'create',
            entityId: category.id,
            meta: {
                name: category.name,
                description: category.description,
                color: category.color
            }
        });

        res.json({ ok: true, category });
    } catch (err) {
        console.error('Create category error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

export async function updateCategory(req, res) {
    try {
        const category = await Category.findByPk(req.params.id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const { name, description, color } = req.body || {};

        // Store original values for audit
        const originalValues = {
            name: category.name,
            description: category.description,
            color: category.color
        };

        const patch = {};
        const changes = {};

        if (name !== undefined) {
            const trimmedName = String(name).trim();
            if (!trimmedName) {
                return res.status(400).json({ error: 'Category name is required' });
            }

            if (trimmedName.length > 255) {
                return res.status(400).json({ error: 'Category name is too long' });
            }

            // Check if new name conflicts with existing category
            const existing = await Category.findOne({
                where: {
                    name: trimmedName,
                    id: { [Op.ne]: category.id }
                }
            });
            if (existing) {
                return res.status(409).json({ error: 'Category name already exists' });
            }

            patch.name = trimmedName;
            if (originalValues.name !== trimmedName) {
                changes.name = { from: originalValues.name, to: trimmedName };
            }
        }

        if (description !== undefined) {
            const trimmedDesc = String(description).trim();
            patch.description = trimmedDesc;
            if (originalValues.description !== trimmedDesc) {
                changes.description = { from: originalValues.description, to: trimmedDesc };
            }
        }

        if (color !== undefined) {
            const colorRegex = /^#[0-9A-Fa-f]{6}$/;
            if (color && !colorRegex.test(color)) {
                return res.status(400).json({ error: 'Invalid color format' });
            }

            patch.color = color || '#6c757d';
            if (originalValues.color !== patch.color) {
                changes.color = { from: originalValues.color, to: patch.color };
            }
        }


        await category.update(patch);

        // Log category update if there were changes
        if (Object.keys(changes).length > 0) {
            await logAudit(req, {
                entity: 'category',
                action: 'update',
                entityId: category.id,
                meta: {
                    name: category.name,
                    changes
                }
            });
        }

        res.json({ ok: true, category });
    } catch (err) {
        console.error('Update category error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

export async function deleteCategory(req, res) {
    try {
        const category = await Category.findByPk(req.params.id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Check if category is in use by any forms
        const formsUsingCategory = await Form.count({ where: { categoryId: category.id } });
        if (formsUsingCategory > 0) {
            return res.status(400).json({
                error: 'Cannot delete category that is in use by forms',
                details: `${formsUsingCategory} form(s) are using this category`
            });
        }

        // Store category info for audit before deletion
        const categoryInfo = {
            name: category.name,
            description: category.description,
            color: category.color
        };

        await category.destroy();

        // Log category deletion
        await logAudit(req, {
            entity: 'category',
            action: 'delete',
            entityId: req.params.id,
            meta: {
                ...categoryInfo
            }
        });

        res.json({ ok: true });
    } catch (err) {
        console.error('Delete category error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

export async function categoriesPage(req, res) {
    try {
        const categories = await Category.findAll({
            order: [['name', 'ASC']]
        });

        // Convert Sequelize instances to plain objects for Handlebars
        const categoriesData = categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            description: cat.description,
            color: cat.color,
            createdAt: cat.createdAt,
            updatedAt: cat.updatedAt
        }));

        res.render('admin-categories', {
            title: 'Categories',
            currentPath: '/categories',
            categories: categoriesData
        });
    } catch (err) {
        console.error('Categories page error:', err);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load categories page'
        });
    }
}
