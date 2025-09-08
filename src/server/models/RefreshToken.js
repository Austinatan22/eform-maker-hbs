// src/server/models/RefreshToken.js
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

export const RefreshToken = sequelize.define('RefreshToken', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  userId: { type: DataTypes.STRING(64), allowNull: false },
  tokenHash: { type: DataTypes.STRING(128), allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false }
}, {
  tableName: 'refresh_tokens',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['expiresAt'] }
  ]
});

