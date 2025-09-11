// src/server/models/RefreshToken.js
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { User } from './User.js';

export const RefreshToken = sequelize.define('RefreshToken', {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  userId: {
    type: DataTypes.STRING(64),
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  tokenHash: { type: DataTypes.STRING(128), allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false }
}, {
  tableName: 'refresh_tokens',
  timestamps: true,
  indexes: [
    { name: 'idx_refresh_tokens_userId', fields: ['userId'] },
    { name: 'idx_refresh_tokens_expiresAt', fields: ['expiresAt'] }
  ]
});

// Define associations
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

