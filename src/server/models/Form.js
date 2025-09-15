// /src/server/models/Form.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { Category } from './Category.js';

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
  createdBy: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  categoryId: {
    type: DataTypes.STRING(64),
    allowNull: true,
    references: {
      model: Category,
      key: 'id'
    }
  }
}, {
  tableName: 'forms',
  timestamps: true
});

// Associations will be defined in app.js after all models are loaded
