// src/server/services/submissions.service.js
import crypto from 'crypto';
import { FormSubmission } from '../models/FormSubmission.js';

/**
 * Service for handling form submissions in the separate submissions database
 * This ensures data isolation between application data and client form submissions
 */

/**
 * Create a new form submission in the submissions database
 * @param {string} formId - The form ID
 * @param {Object} payload - The submission data
 * @returns {Promise<Object>} The created submission
 */
export async function createSubmission(formId, payload) {
    const submission = await FormSubmission.create({
        id: crypto.randomBytes(9).toString('base64url'),
        formId,
        payloadJson: payload
    });
    return submission;
}

/**
 * Get submissions for a specific form
 * @param {string} formId - The form ID
 * @param {Object} options - Query options (limit, offset, order)
 * @returns {Promise<Array>} Array of submissions
 */
export async function getSubmissionsByFormId(formId, options = {}) {
    const { limit = 100, offset = 0, order = [['createdAt', 'DESC']] } = options;

    const submissions = await FormSubmission.findAndCountAll({
        where: { formId },
        limit,
        offset,
        order,
        raw: true
    });

    return submissions;
}

/**
 * Count submissions for a specific form
 * @param {string} formId - The form ID
 * @returns {Promise<number>} Number of submissions
 */
export async function countSubmissionsByFormId(formId) {
    return await FormSubmission.count({ where: { formId } });
}

/**
 * Delete all submissions for a specific form
 * @param {string} formId - The form ID
 * @returns {Promise<number>} Number of deleted submissions
 */
export async function deleteSubmissionsByFormId(formId) {
    const count = await FormSubmission.count({ where: { formId } });

    if (count > 1000) {
        // Use raw SQL for better performance on large datasets
        await FormSubmission.sequelize.query('DELETE FROM form_submissions WHERE formId = ?', {
            replacements: [formId]
        });
    } else {
        await FormSubmission.destroy({ where: { formId } });
    }

    return count;
}

/**
 * Get a specific submission by ID
 * @param {string} submissionId - The submission ID
 * @returns {Promise<Object|null>} The submission or null if not found
 */
export async function getSubmissionById(submissionId) {
    return await FormSubmission.findByPk(submissionId);
}

/**
 * Delete a specific submission by ID
 * @param {string} submissionId - The submission ID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
export async function deleteSubmissionById(submissionId) {
    const deleted = await FormSubmission.destroy({ where: { id: submissionId } });
    return deleted > 0;
}
