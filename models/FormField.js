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
type: DataTypes.STRING(40),
allowNull: false,
index: true
},
prefix:    { type: DataTypes.STRING(128), allowNull: false, defaultValue: '' },
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
suffix:{ type: DataTypes.STRING(128), allowNull: false, defaultValue: '' },


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
      fields: ['formId', 'prefix', 'suffix'],
      name: 'uk_form_fields_formId_prefix_suffix'
    }
]
});


Form.hasMany(FormField, { foreignKey: 'formId', as: 'fields', onDelete: 'CASCADE' });
FormField.belongsTo(Form, { foreignKey: 'formId', as: 'form' });