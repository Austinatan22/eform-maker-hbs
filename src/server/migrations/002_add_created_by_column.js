// src/server/migrations/002_add_created_by_column.js
// Migration to add createdBy column to forms table

export const up = async (sequelize) => {
    try {
        // Check if column already exists
        const [cols] = await sequelize.query("PRAGMA table_info('forms')");
        const hasCreatedBy = Array.isArray(cols) && cols.some(c => String(c.name).toLowerCase() === 'createdby');

        if (!hasCreatedBy) {
            await sequelize.getQueryInterface().addColumn('forms', 'createdBy', {
                type: sequelize.Sequelize.DataTypes.STRING(64),
                allowNull: true
            });
            console.log('✓ Added createdBy column to forms table');
        } else {
            console.log('✓ CreatedBy column already exists in forms table');
        }
    } catch (error) {
        console.error('✗ Failed to add createdBy column:', error.message);
        throw error;
    }
};

export const down = async (sequelize) => {
    try {
        await sequelize.getQueryInterface().removeColumn('forms', 'createdBy');
        console.log('✓ Removed createdBy column from forms table');
    } catch (error) {
        console.error('✗ Failed to remove createdBy column:', error.message);
        throw error;
    }
};
