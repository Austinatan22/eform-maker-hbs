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
    defaultValue: ''
  },
  category: {
    // survey | quiz | feedback (free text with controlled values at controller)
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'survey'
  }
}, {
  tableName: 'forms',
  timestamps: true
});
