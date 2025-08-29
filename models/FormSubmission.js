// /models/FormSubmission.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

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
    type: DataTypes.STRING(40),
    allowNull: false,
    index: true
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
  timestamps: true
});