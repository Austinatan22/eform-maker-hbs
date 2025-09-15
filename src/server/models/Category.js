// /src/server/models/Category.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

export const Category = sequelize.define('Category', {
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
    color: {
        type: DataTypes.STRING(7), // Hex color code
        allowNull: true,
        defaultValue: '#6c757d'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    }
}, {
    tableName: 'categories',
    timestamps: true
});
