// models/Form.js
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

// /models/Form.js
export const Form = sequelize.define('Form', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true   // will start at 1 and increment
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: ''
  },
  fieldsJson: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '[]',
    get() {
      const raw = this.getDataValue('fieldsJson');
      try { return JSON.parse(raw ?? '[]'); } catch { return []; }
    },
    set(val) {
      try {
        const json = JSON.stringify(val ?? []);
        this.setDataValue('fieldsJson', json);
      } catch {
        this.setDataValue('fieldsJson', '[]');
      }
    }
  }
}, {
  tableName: 'forms',
  timestamps: true
});
