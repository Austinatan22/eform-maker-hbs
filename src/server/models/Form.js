// /src/server/models/Form.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

export const Form = sequelize.define('Form', {
  id: {
    type: DataTypes.STRING(64),
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: '',
    unique: true
  }
}, {
  tableName: 'forms',
  timestamps: true
});
