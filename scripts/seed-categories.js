// scripts/seed-categories.js
import { sequelize } from '../src/server/db.js';
import { Category } from '../src/server/models/Category.js';

const defaultCategories = [
    {
        id: 'cat-survey',
        name: 'Survey',
        description: 'General surveys and questionnaires',
        color: '#3b82f6'
    },
    {
        id: 'cat-quiz',
        name: 'Quiz',
        description: 'Educational quizzes and assessments',
        color: '#10b981'
    },
    {
        id: 'cat-feedback',
        name: 'Feedback',
        description: 'Customer feedback and reviews',
        color: '#f59e0b'
    },
    {
        id: 'cat-registration',
        name: 'Registration',
        description: 'Event and user registration forms',
        color: '#8b5cf6'
    },
    {
        id: 'cat-contact',
        name: 'Contact',
        description: 'Contact forms and inquiries',
        color: '#ef4444'
    }
];

async function seedCategories() {
    try {
        console.log('Seeding categories...');

        // Sync the Category model
        await Category.sync();

        for (const categoryData of defaultCategories) {
            const [category, created] = await Category.findOrCreate({
                where: { id: categoryData.id },
                defaults: categoryData
            });

            if (created) {
                console.log(`Created category: ${category.name}`);
            } else {
                console.log(`Category already exists: ${category.name}`);
            }
        }

        console.log('Category seeding completed!');
    } catch (error) {
        console.error('Error seeding categories:', error);
    } finally {
        await sequelize.close();
    }
}

seedCategories();
