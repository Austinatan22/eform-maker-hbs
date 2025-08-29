// /models/Form.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

export const Form = sequelize.define('Form', {
  id: {
    type: DataTypes.STRING(64),   // was 40; 64 gives more room for long titles + suffix
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: '',
    unique: true                  // you asked earlier for unique titles; keeping it
  }
}, {
  tableName: 'forms',
  timestamps: true
});
