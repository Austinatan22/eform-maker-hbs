// /src/server/models/FormField.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { Form } from './Form.js';


export const FormField = sequelize.define('FormField', {
  id: {
    type: DataTypes.STRING(40),
    primaryKey: true
  },
  formId: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  // Core field definition
  type: {
    type: DataTypes.ENUM(
      'singleLine', 'paragraph', 'dropdown', 'multipleChoice',
      'checkboxes', 'number', 'name', 'email', 'phone', 'password',
      'date', 'time', 'datetime', 'url', 'file', 'richText'
    ),
    allowNull: false
  },
  label: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
  name: { type: DataTypes.STRING(128), allowNull: false, defaultValue: '' },


  // Optional display/config
  placeholder: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
  required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  doNotStore: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },


  // Options (for dropdown/multipleChoice/checkboxes)
  options: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' }, // comma-separated

  // Content for rich text fields
  content: { type: DataTypes.TEXT, allowNull: true },

  // Ordering within form
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'form_fields',
  timestamps: false,
  indexes: [
    { name: 'idx_form_fields_formId', fields: ['formId'] },
    // Enforce uniqueness of field name within a form (requires migration for existing DBs)
    { name: 'uq_form_fields_formId_name', unique: true, fields: ['formId', 'name'] }
  ]
});


// Associations will be defined in app.js after all models are loaded
