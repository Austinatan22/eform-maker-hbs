// src/server/models/UserLockout.js (ESM)
import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';

export const UserLockout = sequelize.define('UserLockout', {
    id: {
        type: DataTypes.STRING(64),
        primaryKey: true
    },
    userId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    failedAttempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true
    },
    lastAttempt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'user_lockouts',
    timestamps: true,
    indexes: [
        { name: 'idx_user_lockouts_userId', fields: ['userId'] },
        { name: 'idx_user_lockouts_email', fields: ['email'] }
    ]
});
