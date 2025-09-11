// src/server/models/AuditLog.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import { User } from './User.js';

export const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.STRING(40), primaryKey: true },
  entity: { type: DataTypes.STRING(24), allowNull: false },
  action: { type: DataTypes.STRING(24), allowNull: false },
  entityId: { type: DataTypes.STRING(64), allowNull: true },
  userId: {
    type: DataTypes.STRING(64),
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  ua: { type: DataTypes.TEXT, allowNull: true },
  metaJson: { type: DataTypes.TEXT, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'audit_logs',
  updatedAt: false,
  indexes: [
    { name: 'idx_audit_createdAt', fields: ['createdAt'] },
    { name: 'idx_audit_entity', fields: ['entity'] },
    { name: 'idx_audit_action', fields: ['action'] },
    { name: 'idx_audit_userId', fields: ['userId'] }
  ]
});

// Define associations
User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs', onDelete: 'SET NULL' });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

