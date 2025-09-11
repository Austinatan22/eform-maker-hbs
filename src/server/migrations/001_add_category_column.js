// src/server/migrations/001_add_category_column.js
// Migration to add category column to forms table

export const up = async (sequelize) => {
    try {
        // Check if column already exists
        const [cols] = await sequelize.query("PRAGMA table_info('forms')");
        const hasCategory = Array.isArray(cols) && cols.some(c => String(c.name).toLowerCase() === 'category');

        if (!hasCategory) {
            await sequelize.getQueryInterface().addColumn('forms', 'category', {
                type: sequelize.Sequelize.DataTypes.STRING(32),
                allowNull: false,
                defaultValue: 'survey'
            });
            console.log('✓ Added category column to forms table');
        } else {
            console.log('✓ Category column already exists in forms table');
        }
    } catch (error) {
        console.error('✗ Failed to add category column:', error.message);
        throw error;
    }
};

export const down = async (sequelize) => {
    try {
        await sequelize.getQueryInterface().removeColumn('forms', 'category');
        console.log('✓ Removed category column from forms table');
    } catch (error) {
        console.error('✗ Failed to remove category column:', error.message);
        throw error;
    }
};
