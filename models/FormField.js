// /models/FormField.js (ESM)
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
allowNull: false,
index: true
},
// New derived key (from user-entered suffix), stored as field_key
fieldKey: { type: DataTypes.STRING(128), allowNull: false, defaultValue: '', field: 'field_key' },
// Core field definition
type: {
type: DataTypes.ENUM(
'singleLine', 'paragraph', 'dropdown', 'multipleChoice',
'checkboxes', 'number', 'name', 'email', 'phone'
),
allowNull: false
},
label: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
name: { type: DataTypes.STRING(128), allowNull: false, defaultValue: '' },


// Optional display/config
placeholder: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
customClass: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
doNotStore: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
countryIso2: { type: DataTypes.STRING(8), allowNull: false, defaultValue: '' },


// Options (for dropdown/multipleChoice/checkboxes)
options: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' }, // comma-separated
dataSource: { type: DataTypes.STRING(512), allowNull: false, defaultValue: '' },


// Ordering within form
position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
tableName: 'form_fields',
timestamps: true,
indexes: [
    {
      // make it unique *within the same form*
      unique: true,
      fields: ['formId', 'field_key'],
      name: 'uk_form_fields_formId_field_key'
    }
]
});


Form.hasMany(FormField, { foreignKey: 'formId', as: 'fields', onDelete: 'CASCADE' });
FormField.belongsTo(Form, { foreignKey: 'formId', as: 'form' });
