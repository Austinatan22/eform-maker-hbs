// /src/server/models/Template.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { Category } from './Category.js';

export const Template = sequelize.define('Template', {
    id: {
        type: DataTypes.STRING(64),
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: ''
    },
    categoryId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        references: {
            model: Category,
            key: 'id'
        }
    },
    fields: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
    createdBy: {
        type: DataTypes.STRING(64),
        allowNull: true
    }
}, {
    tableName: 'templates',
    timestamps: true
});

// Associations will be defined in app.js after all models are loaded
