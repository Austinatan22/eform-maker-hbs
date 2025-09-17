// scripts/migrate-templates.js
import crypto from 'crypto';
import { sequelize } from '../src/server/db.js';
import { Template } from '../src/server/models/Template.js';
import { Category } from '../src/server/models/Category.js';
import { logger } from '../src/server/utils/logger.js';

// ID generation helpers (matching forms pattern)
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shortRand = (n = 8) => Array.from(crypto.randomBytes(n)).map(b => B62[b % 62]).join('');
const generateTemplateId = () => `template-${shortRand(8)}`;
const generateCategoryId = () => `category-${shortRand(8)}`;

// Original templates from forms.hbs
const ORIGINAL_TEMPLATES = {
    newsletter: {
        name: 'Newsletter Signup',
        categoryId: 'cat-survey',
        fields: [
            { type: 'name', label: 'Full Name', name: 'fullName', placeholder: '', required: true },
            { type: 'email', label: 'Email', name: 'email', placeholder: 'you@example.com', required: true }
        ]
    },
    complaints: {
        name: 'Complaints',
        categoryId: 'cat-feedback',
        fields: [
            { type: 'name', label: 'Full Name', name: 'fullName', placeholder: '' },
            { type: 'email', label: 'Email', name: 'email', placeholder: 'you@example.com' },
            { type: 'dropdown', label: 'Issue Type', name: 'issueType', options: 'Billing,Bug,Feature Request,Other', required: true },
            { type: 'paragraph', label: 'Describe the issue', name: 'details', placeholder: 'Tell us what went wrong...', required: true }
        ]
    },
    profile: {
        name: 'Profile',
        categoryId: 'cat-survey',
        fields: [
            { type: 'name', label: 'Full Name', name: 'fullName', placeholder: '', required: true },
            { type: 'email', label: 'Email', name: 'email', placeholder: 'you@example.com' },
            { type: 'phone', label: 'Phone Number', name: 'phone', placeholder: '' }
        ]
    },
    rsvp: {
        name: 'Event RSVP',
        categoryId: 'cat-registration',
        fields: [
            { type: 'name', label: 'Full Name', name: 'fullName', placeholder: '', required: true },
            { type: 'email', label: 'Email', name: 'email', placeholder: 'you@example.com' },
            { type: 'multipleChoice', label: 'Attending?', name: 'attending', options: 'Yes,No', required: true },
            { type: 'number', label: 'Guests', name: 'guests', placeholder: '0' }
        ]
    },
    contact: {
        name: 'Contact Us',
        categoryId: 'cat-contact',
        fields: [
            { type: 'name', label: 'Full Name', name: 'fullName', required: true },
            { type: 'email', label: 'Email', name: 'email', placeholder: 'you@example.com', required: true },
            { type: 'phone', label: 'Phone Number', name: 'phone' },
            { type: 'dropdown', label: 'Reason', name: 'reason', options: 'Sales,Support,General', required: true },
            { type: 'paragraph', label: 'Message', name: 'message', placeholder: 'How can we help?', required: true }
        ]
    },
    support: {
        name: 'Support Ticket',
        categoryId: 'cat-feedback',
        fields: [
            { type: 'name', label: 'Full Name', name: 'fullName', required: true },
            { type: 'email', label: 'Email', name: 'email', placeholder: 'you@example.com', required: true },
            { type: 'dropdown', label: 'Priority', name: 'priority', options: 'Low,Medium,High,Urgent', required: true },
            { type: 'dropdown', label: 'Product', name: 'product', options: 'Web,Mobile,API,Other', required: true },
            { type: 'paragraph', label: 'Issue Details', name: 'details', placeholder: 'Describe your issue...', required: true }
        ]
    },
    job: {
        name: 'Job Application',
        categoryId: 'cat-registration',
        fields: [
            { type: 'name', label: 'Full Name', name: 'fullName', required: true },
            { type: 'email', label: 'Email', name: 'email', placeholder: 'you@example.com', required: true },
            { type: 'phone', label: 'Phone Number', name: 'phone' },
            { type: 'dropdown', label: 'Position', name: 'position', options: 'Designer,Engineer,Product Manager,Other', required: true },
            { type: 'dropdown', label: 'Experience Level', name: 'experience', options: 'Junior,Mid,Senior,Lead', required: true },
            { type: 'paragraph', label: 'Cover Letter', name: 'coverLetter', placeholder: 'Tell us about yourself', required: true }
        ]
    },
    nps: {
        name: 'NPS Survey',
        categoryId: 'cat-survey',
        fields: [
            { type: 'multipleChoice', label: 'How likely are you to recommend us?', name: 'nps', options: '1,2,3,4,5,6,7,8,9,10', required: true },
            { type: 'paragraph', label: 'What is the primary reason for your score?', name: 'reason', placeholder: '(optional)' }
        ]
    }
};

async function migrateTemplates() {
    try {
        // Connect to database
        logger.info('Connecting to database...');
        await sequelize.authenticate();
        await sequelize.query('PRAGMA foreign_keys = ON;');
        logger.info('Database connection established');

        // Sync models
        logger.info('Syncing database models...');
        await Template.sync();
        await Category.sync();
        logger.info('Models synced successfully');

        logger.info('Starting template migration...');

        // Check if templates already exist
        const existingTemplates = await Template.findAll();
        if (existingTemplates.length > 0) {
            logger.info(`Found ${existingTemplates.length} existing templates. Skipping migration.`);
            return;
        }

        // Create default categories if they don't exist
        const defaultCategories = [
            { name: 'Survey', description: 'Survey forms', color: '#6c757d' },
            { name: 'Feedback', description: 'Feedback and complaint forms', color: '#fd7e14' },
            { name: 'Registration', description: 'Registration and application forms', color: '#20c997' },
            { name: 'Contact', description: 'Contact and inquiry forms', color: '#0d6efd' }
        ];

        const categoryMap = {}; // Map old IDs to new IDs

        for (const catData of defaultCategories) {
            // Check if category with this name already exists
            const existing = await Category.findOne({ where: { name: catData.name } });
            if (!existing) {
                // Generate unique id with collision detection
                let categoryId;
                for (let tries = 0; tries < 5; tries++) {
                    const candidate = generateCategoryId();
                    const existingId = await Category.findByPk(candidate);
                    if (!existingId) {
                        categoryId = candidate;
                        break;
                    }
                }
                if (!categoryId) {
                    throw new Error(`Could not generate unique category id for ${catData.name}`);
                }

                await Category.create({
                    id: categoryId,
                    name: catData.name,
                    description: catData.description,
                    color: catData.color
                });
                logger.info(`Created category: ${catData.name} with ID: ${categoryId}`);

                // Map old ID to new ID for template references
                if (catData.name === 'Survey') categoryMap['cat-survey'] = categoryId;
                else if (catData.name === 'Feedback') categoryMap['cat-feedback'] = categoryId;
                else if (catData.name === 'Registration') categoryMap['cat-registration'] = categoryId;
                else if (catData.name === 'Contact') categoryMap['cat-contact'] = categoryId;
            } else {
                // Map old ID to existing ID
                if (catData.name === 'Survey') categoryMap['cat-survey'] = existing.id;
                else if (catData.name === 'Feedback') categoryMap['cat-feedback'] = existing.id;
                else if (catData.name === 'Registration') categoryMap['cat-registration'] = existing.id;
                else if (catData.name === 'Contact') categoryMap['cat-contact'] = existing.id;
            }
        }

        // Create templates
        for (const [key, templateData] of Object.entries(ORIGINAL_TEMPLATES)) {
            // Generate unique id with collision detection
            let templateId;
            for (let tries = 0; tries < 5; tries++) {
                const candidate = generateTemplateId();
                const existing = await Template.findByPk(candidate);
                if (!existing) {
                    templateId = candidate;
                    break;
                }
            }
            if (!templateId) {
                throw new Error(`Could not generate unique template id for ${templateData.name}`);
            }

            await Template.create({
                id: templateId,
                name: templateData.name,
                description: `Pre-built ${templateData.name.toLowerCase()} template`,
                fields: templateData.fields,
                categoryId: categoryMap[templateData.categoryId] || null
            });

            logger.info(`Created template: ${templateData.name} with ID: ${templateId}`);
        }

        logger.info('Template migration completed successfully!');

    } catch (error) {
        logger.error('Template migration failed:', error);
        if (error.message.includes('database')) {
            logger.error('Database connection issue. Please ensure the database is properly configured.');
        }
        throw error;
    } finally {
        try {
            await sequelize.close();
            logger.info('Database connection closed');
        } catch (closeError) {
            logger.warn('Error closing database connection:', closeError);
        }
    }
}

// Run migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    migrateTemplates()
        .then(() => {
            logger.info('Migration script completed');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('Migration script failed:', error);
            process.exit(1);
        });
}

export { migrateTemplates };
