// src/server/services/versioning.service.js
import crypto from 'crypto';
import { sequelize } from '../db.js';
import { Form } from '../models/Form.js';
import { FormVersion } from '../models/FormVersion.js';
import { FormDraft } from '../models/FormDraft.js';
import { FormField } from '../models/FormField.js';
import { Category } from '../models/Category.js';

const rid = () => crypto.randomBytes(9).toString('base64url');

// Create a new version of a form
export async function createFormVersion(formId, title, fields, categoryId, createdBy, changeDescription = null) {
    return sequelize.transaction(async (t) => {
        const form = await Form.findByPk(formId, { transaction: t });
        if (!form) {
            throw new Error('Form not found');
        }

        // Get the next version number
        const nextVersionNumber = form.currentVersionNumber + 1;

        // Create the version record
        const version = await FormVersion.create({
            id: rid(),
            formId,
            versionNumber: nextVersionNumber,
            title,
            categoryId,
            fieldsData: fields,
            isPublished: false,
            createdBy,
            changeDescription
        }, { transaction: t });

        // Update the form's current version number
        await form.update({ currentVersionNumber: nextVersionNumber }, { transaction: t });

        return version;
    });
}

// Publish a specific version
export async function publishVersion(formId, versionId, createdBy) {
    return sequelize.transaction(async (t) => {
        const form = await Form.findByPk(formId, { transaction: t });
        if (!form) {
            throw new Error('Form not found');
        }

        const version = await FormVersion.findOne({
            where: { id: versionId, formId },
            transaction: t
        });
        if (!version) {
            throw new Error('Version not found');
        }

        // Unpublish any currently published version
        await FormVersion.update(
            { isPublished: false, publishedAt: null },
            { where: { formId, isPublished: true }, transaction: t }
        );

        // Publish the selected version
        await version.update({
            isPublished: true,
            publishedAt: new Date()
        }, { transaction: t });

        // Update the form's published state and reference
        await form.update({
            isPublished: true,
            publishedAt: new Date(),
            lastPublishedVersionId: versionId
        }, { transaction: t });

        // Update the form's current fields to match the published version
        await updateFormFieldsFromVersion(formId, version.fieldsData, t);

        return version;
    });
}

// Update form fields from version data
async function updateFormFieldsFromVersion(formId, fieldsData, transaction) {
    // Delete existing fields
    await FormField.destroy({
        where: { formId },
        transaction
    });

    // Create new fields from version data
    if (fieldsData && fieldsData.length > 0) {
        const fieldRows = fieldsData.map((field, idx) => ({
            id: field.id || rid(),
            formId,
            type: field.type,
            label: field.label,
            name: field.name,
            placeholder: field.placeholder || '',
            required: !!field.required,
            doNotStore: !!field.doNotStore,
            options: field.options || '',
            position: idx
        }));

        await FormField.bulkCreate(fieldRows, { transaction });
    }
}

// Save a draft
export async function saveDraft(formId, title, fields, categoryId, createdBy, isAutoSave = false) {
    return sequelize.transaction(async (t) => {
        // If formId is null, this is a new form draft
        if (!formId) {
            const draft = await FormDraft.create({
                id: rid(),
                formId: null,
                title,
                categoryId,
                fieldsData: fields,
                createdBy,
                isAutoSave
            }, { transaction: t });
            return draft;
        }

        // Check if there's an existing draft for this form and user
        const existingDraft = await FormDraft.findOne({
            where: { formId, createdBy },
            transaction: t
        });

        if (existingDraft) {
            // Update existing draft
            await existingDraft.update({
                title,
                categoryId,
                fieldsData: fields,
                lastSavedAt: new Date(),
                isAutoSave
            }, { transaction: t });
            return existingDraft;
        } else {
            // Create new draft
            const draft = await FormDraft.create({
                id: rid(),
                formId,
                title,
                categoryId,
                fieldsData: fields,
                createdBy,
                isAutoSave
            }, { transaction: t });
            return draft;
        }
    });
}

// Get drafts for a user
export async function getUserDrafts(createdBy, includeAutoSave = false) {
    const whereClause = { createdBy };
    if (!includeAutoSave) {
        whereClause.isAutoSave = false;
    }

    return FormDraft.findAll({
        where: whereClause,
        include: [
            { model: Form, as: 'form' },
            { model: Category, as: 'category' }
        ],
        order: [['lastSavedAt', 'DESC']]
    });
}

// Get form versions
export async function getFormVersions(formId) {
    return FormVersion.findAll({
        where: { formId },
        include: [
            { model: Form, as: 'form' },
            { model: Category, as: 'category' }
        ],
        order: [['versionNumber', 'DESC']]
    });
}

// Get published version of a form
export async function getPublishedVersion(formId) {
    return FormVersion.findOne({
        where: { formId, isPublished: true },
        include: [
            { model: Form, as: 'form' },
            { model: Category, as: 'category' }
        ]
    });
}

// Delete a draft
export async function deleteDraft(draftId, createdBy) {
    const draft = await FormDraft.findOne({
        where: { id: draftId, createdBy }
    });

    if (!draft) {
        throw new Error('Draft not found');
    }

    await draft.destroy();
    return true;
}

// Convert draft to form (publish draft as new form)
export async function publishDraftAsForm(draftId, createdBy) {
    return sequelize.transaction(async (t) => {
        const draft = await FormDraft.findOne({
            where: { id: draftId, createdBy },
            transaction: t
        });

        if (!draft) {
            throw new Error('Draft not found');
        }

        // Create the form
        const form = await Form.create({
            id: rid(),
            title: draft.title,
            categoryId: draft.categoryId,
            createdBy,
            currentVersionNumber: 1,
            isPublished: true,
            publishedAt: new Date()
        }, { transaction: t });

        // Create the first version
        const version = await FormVersion.create({
            id: rid(),
            formId: form.id,
            versionNumber: 1,
            title: draft.title,
            categoryId: draft.categoryId,
            fieldsData: draft.fieldsData,
            isPublished: true,
            publishedAt: new Date(),
            createdBy,
            changeDescription: 'Initial version from draft'
        }, { transaction: t });

        // Update form with version reference
        await form.update({
            lastPublishedVersionId: version.id
        }, { transaction: t });

        // Create form fields
        await updateFormFieldsFromVersion(form.id, draft.fieldsData, t);

        // Delete the draft
        await draft.destroy({ transaction: t });

        return { form, version };
    });
}

// Rollback to a specific version
export async function rollbackToVersion(formId, versionId, createdBy) {
    return sequelize.transaction(async (t) => {
        const version = await FormVersion.findOne({
            where: { id: versionId, formId },
            transaction: t
        });

        if (!version) {
            throw new Error('Version not found');
        }

        // Create a new version with the rollback data
        const newVersion = await createFormVersion(
            formId,
            version.title,
            version.fieldsData,
            version.categoryId,
            createdBy,
            `Rollback to version ${version.versionNumber}`
        );

        // Publish the new version
        await publishVersion(formId, newVersion.id, createdBy);

        return newVersion;
    });
}

// Clean up old drafts (for cleanup job)
export async function cleanupOldDrafts(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const deletedCount = await FormDraft.destroy({
        where: {
            lastSavedAt: {
                [sequelize.Sequelize.Op.lt]: cutoffDate
            }
        }
    });

    return deletedCount;
}
