// /src/server/models/FormSubmission.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { Form } from './Form.js';

/**
 * FormSubmission = optional stored copy of a user's submission
 * (only if they consent; canonical data is forwarded to client's DB).
 */
export const FormSubmission = sequelize.define('FormSubmission', {
  id: {
    type: DataTypes.STRING(40),
    primaryKey: true
  },
  formId: {
    type: DataTypes.STRING(64),
    allowNull: false,
    references: {
      model: 'forms',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  payloadJson: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '{}',
    get() {
      const raw = this.getDataValue('payloadJson');
      try { return JSON.parse(raw ?? '{}'); } catch { return {}; }
    },
    set(val) {
      try {
        const json = JSON.stringify(val ?? {});
        this.setDataValue('payloadJson', json);
      } catch {
        this.setDataValue('payloadJson', '{}');
      }
    }
  }
}, {
  tableName: 'form_submissions',
  timestamps: true,
  indexes: [
    { name: 'idx_form_submissions_formId', fields: ['formId'] }
  ]
});

// Define associations
Form.hasMany(FormSubmission, { foreignKey: 'formId', as: 'submissions', onDelete: 'CASCADE' });
FormSubmission.belongsTo(Form, { foreignKey: 'formId', as: 'form' });
