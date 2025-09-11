// src/server/migrations/003_add_username_column.js
// Migration to add username column to users table

export const up = async (sequelize) => {
    try {
        // Check if column already exists
        const [cols] = await sequelize.query("PRAGMA table_info('users')");
        const hasUsername = Array.isArray(cols) && cols.some(c => String(c.name).toLowerCase() === 'username');

        if (!hasUsername) {
            await sequelize.getQueryInterface().addColumn('users', 'username', {
                type: sequelize.Sequelize.DataTypes.STRING(64),
                allowNull: true
            });
            console.log('✓ Added username column to users table');
        } else {
            console.log('✓ Username column already exists in users table');
        }
    } catch (error) {
        console.error('✗ Failed to add username column:', error.message);
        throw error;
    }
};

export const down = async (sequelize) => {
    try {
        await sequelize.getQueryInterface().removeColumn('users', 'username');
        console.log('✓ Removed username column from users table');
    } catch (error) {
        console.error('✗ Failed to remove username column:', error.message);
        throw error;
    }
};
