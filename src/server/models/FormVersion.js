// src/server/models/FormVersion.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { Form } from './Form.js';

export const FormVersion = sequelize.define('FormVersion', {
    id: {
        type: DataTypes.STRING(64),
        primaryKey: true
    },
    formId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        references: {
            model: Form,
            key: 'id'
        }
    },
    versionNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: ''
    },
    categoryId: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    fieldsData: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
    isPublished: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    publishedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    createdBy: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    changeDescription: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'form_versions',
    timestamps: true,
    indexes: [
        {
            fields: ['formId', 'versionNumber'],
            unique: true
        },
        {
            fields: ['formId', 'isPublished']
        }
    ]
});

// Associations will be defined in app.js after all models are loaded
