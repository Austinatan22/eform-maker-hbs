// src/server/models/FormDraft.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { Form } from './Form.js';

export const FormDraft = sequelize.define('FormDraft', {
    id: {
        type: DataTypes.STRING(64),
        primaryKey: true
    },
    formId: {
        type: DataTypes.STRING(64),
        allowNull: true, // null for new forms that haven't been saved yet
        references: {
            model: Form,
            key: 'id'
        }
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
    createdBy: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    lastSavedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    isAutoSave: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, {
    tableName: 'form_drafts',
    timestamps: true,
    indexes: [
        {
            fields: ['formId', 'createdBy']
        },
        {
            fields: ['createdBy', 'lastSavedAt']
        },
        {
            fields: ['lastSavedAt'] // for cleanup job
        }
    ]
});

// Associations will be defined in app.js after all models are loaded
