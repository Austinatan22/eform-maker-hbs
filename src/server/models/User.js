// src/server/models/User.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

export const User = sequelize.define('User', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'editor' } // admin|editor|viewer
}, {
  tableName: 'users',
  timestamps: true
});

