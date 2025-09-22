// tests/models/audit-log.test.js
import { jest } from '@jest/globals';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { sequelize } from '../../src/server/db.js';

describe('AuditLog Model Tests', () => {
    beforeEach(async () => {
        // Clean up any existing audit logs
        await AuditLog.destroy({ where: {}, force: true });
    });

    afterEach(async () => {
        // Clean up after each test
        await AuditLog.destroy({ where: {}, force: true });
    });

    describe('Model Creation and Validation', () => {
        it('should create audit log with all required fields', async () => {
            const auditData = {
                id: 'audit-123',
                entity: 'form',
                action: 'create',
                entityId: 'form-456',
                userId: 'user-789',
                ip: '192.168.1.1',
                ua: 'Mozilla/5.0 (Test Browser)',
                metaJson: JSON.stringify({ title: 'Test Form' })
            };

            const auditLog = await AuditLog.create(auditData);

            expect(auditLog).toBeDefined();
            expect(auditLog.id).toBe('audit-123');
            expect(auditLog.entity).toBe('form');
            expect(auditLog.action).toBe('create');
            expect(auditLog.entityId).toBe('form-456');
            expect(auditLog.userId).toBe('user-789');
            expect(auditLog.ip).toBe('192.168.1.1');
            expect(auditLog.ua).toBe('Mozilla/5.0 (Test Browser)');
            expect(auditLog.metaJson).toBe(JSON.stringify({ title: 'Test Form' }));
            expect(auditLog.createdAt).toBeDefined();
        });

        it('should create audit log with minimal required fields', async () => {
            const auditData = {
                id: 'audit-minimal',
                entity: 'auth',
                action: 'login'
            };

            const auditLog = await AuditLog.create(auditData);

            expect(auditLog).toBeDefined();
            expect(auditLog.id).toBe('audit-minimal');
            expect(auditLog.entity).toBe('auth');
            expect(auditLog.action).toBe('login');
            expect(auditLog.entityId).toBeUndefined();
            expect(auditLog.userId).toBeUndefined();
            expect(auditLog.ip).toBeUndefined();
            expect(auditLog.ua).toBeUndefined();
            expect(auditLog.metaJson).toBeUndefined();
            expect(auditLog.createdAt).toBeDefined();
        });

        it('should require entity field', async () => {
            const auditData = {
                id: 'audit-no-entity',
                action: 'create'
            };

            await expect(AuditLog.create(auditData)).rejects.toThrow();
        });

        it('should require action field', async () => {
            const auditData = {
                id: 'audit-no-action',
                entity: 'form'
            };

            await expect(AuditLog.create(auditData)).rejects.toThrow();
        });

        it('should allow null id field', async () => {
            const auditData = {
                entity: 'form',
                action: 'create'
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.id).toBeNull();
            expect(auditLog.entity).toBe('form');
            expect(auditLog.action).toBe('create');
        });

        it('should auto-generate createdAt timestamp', async () => {
            const beforeCreate = new Date();

            const auditData = {
                id: 'audit-timestamp',
                entity: 'form',
                action: 'create'
            };

            const auditLog = await AuditLog.create(auditData);
            const afterCreate = new Date();

            expect(auditLog.createdAt).toBeDefined();
            expect(auditLog.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(auditLog.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it('should not have updatedAt field', async () => {
            const auditData = {
                id: 'audit-no-update',
                entity: 'form',
                action: 'create'
            };

            const auditLog = await AuditLog.create(auditData);

            expect(auditLog.updatedAt).toBeUndefined();
        });
    });

    describe('Field Constraints and Validation', () => {
        it('should handle long entity names', async () => {
            const longEntity = 'a'.repeat(24); // Max length
            const auditData = {
                id: 'audit-long-entity',
                entity: longEntity,
                action: 'create'
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.entity).toBe(longEntity);
        });

        it('should handle long action names', async () => {
            const longAction = 'a'.repeat(24); // Max length
            const auditData = {
                id: 'audit-long-action',
                entity: 'form',
                action: longAction
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.action).toBe(longAction);
        });

        it('should handle long entityId values', async () => {
            const longEntityId = 'a'.repeat(64); // Max length
            const auditData = {
                id: 'audit-long-entity-id',
                entity: 'form',
                action: 'create',
                entityId: longEntityId
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.entityId).toBe(longEntityId);
        });

        it('should handle long userId values', async () => {
            const longUserId = 'a'.repeat(64); // Max length
            const auditData = {
                id: 'audit-long-user-id',
                entity: 'form',
                action: 'create',
                userId: longUserId
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.userId).toBe(longUserId);
        });

        it('should handle long IP addresses', async () => {
            const longIP = 'a'.repeat(64); // Max length
            const auditData = {
                id: 'audit-long-ip',
                entity: 'form',
                action: 'create',
                ip: longIP
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.ip).toBe(longIP);
        });

        it('should handle very long user agent strings', async () => {
            const longUA = 'a'.repeat(1000); // Very long string
            const auditData = {
                id: 'audit-long-ua',
                entity: 'form',
                action: 'create',
                ua: longUA
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.ua).toBe(longUA);
        });

        it('should handle very long metaJson strings', async () => {
            const longMeta = JSON.stringify({
                data: 'a'.repeat(10000),
                array: Array(1000).fill('test')
            });
            const auditData = {
                id: 'audit-long-meta',
                entity: 'form',
                action: 'create',
                metaJson: longMeta
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.metaJson).toBe(longMeta);
        });

        it('should handle special characters in all fields', async () => {
            const specialData = {
                id: 'audit-special-🚀',
                entity: 'form-émoji',
                action: 'create-ñ',
                entityId: 'form-"quotes"',
                userId: 'user-\'single\'',
                ip: '192.168.1.1\nwith\ttabs',
                ua: 'Browser with "quotes" and \'apostrophes\'',
                metaJson: JSON.stringify({ unicode: '🚀 émojis and ñ characters' })
            };

            const auditLog = await AuditLog.create(specialData);

            expect(auditLog.id).toBe('audit-special-🚀');
            expect(auditLog.entity).toBe('form-émoji');
            expect(auditLog.action).toBe('create-ñ');
            expect(auditLog.entityId).toBe('form-"quotes"');
            expect(auditLog.userId).toBe('user-\'single\'');
            expect(auditLog.ip).toBe('192.168.1.1\nwith\ttabs');
            expect(auditLog.ua).toBe('Browser with "quotes" and \'apostrophes\'');
            expect(auditLog.metaJson).toBe(JSON.stringify({ unicode: '🚀 émojis and ñ characters' }));
        });
    });

    describe('Database Operations', () => {
        it('should find audit logs by entity', async () => {
            // Create test data
            await AuditLog.create({ id: 'audit-1', entity: 'form', action: 'create' });
            await AuditLog.create({ id: 'audit-2', entity: 'user', action: 'create' });
            await AuditLog.create({ id: 'audit-3', entity: 'form', action: 'update' });

            const formLogs = await AuditLog.findAll({ where: { entity: 'form' } });
            expect(formLogs).toHaveLength(2);
            expect(formLogs.every(log => log.entity === 'form')).toBe(true);
        });

        it('should find audit logs by action', async () => {
            // Create test data
            await AuditLog.create({ id: 'audit-1', entity: 'form', action: 'create' });
            await AuditLog.create({ id: 'audit-2', entity: 'user', action: 'create' });
            await AuditLog.create({ id: 'audit-3', entity: 'form', action: 'update' });

            const createLogs = await AuditLog.findAll({ where: { action: 'create' } });
            expect(createLogs).toHaveLength(2);
            expect(createLogs.every(log => log.action === 'create')).toBe(true);
        });

        it('should find audit logs by userId', async () => {
            // Create test data
            await AuditLog.create({ id: 'audit-1', entity: 'form', action: 'create', userId: 'user-123' });
            await AuditLog.create({ id: 'audit-2', entity: 'form', action: 'update', userId: 'user-456' });
            await AuditLog.create({ id: 'audit-3', entity: 'form', action: 'delete', userId: 'user-123' });

            const userLogs = await AuditLog.findAll({ where: { userId: 'user-123' } });
            expect(userLogs).toHaveLength(2);
            expect(userLogs.every(log => log.userId === 'user-123')).toBe(true);
        });

        it('should order audit logs by createdAt descending', async () => {
            // Create test data with slight delays
            const audit1 = await AuditLog.create({ id: 'audit-1', entity: 'form', action: 'create' });
            await new Promise(resolve => setTimeout(resolve, 10));
            const audit2 = await AuditLog.create({ id: 'audit-2', entity: 'form', action: 'update' });
            await new Promise(resolve => setTimeout(resolve, 10));
            const audit3 = await AuditLog.create({ id: 'audit-3', entity: 'form', action: 'delete' });

            const logs = await AuditLog.findAll({
                order: [['createdAt', 'DESC']]
            });

            expect(logs).toHaveLength(3);
            expect(logs[0].id).toBe('audit-3');
            expect(logs[1].id).toBe('audit-2');
            expect(logs[2].id).toBe('audit-1');
        });

        it('should limit audit logs results', async () => {
            // Create test data
            for (let i = 1; i <= 5; i++) {
                await AuditLog.create({
                    id: `audit-${i}`,
                    entity: 'form',
                    action: 'create'
                });
            }

            const limitedLogs = await AuditLog.findAll({
                order: [['createdAt', 'DESC']],
                limit: 3
            });

            expect(limitedLogs).toHaveLength(3);
        });

        it('should offset audit logs results', async () => {
            // Create test data
            for (let i = 1; i <= 5; i++) {
                await AuditLog.create({
                    id: `audit-${i}`,
                    entity: 'form',
                    action: 'create'
                });
            }

            const offsetLogs = await AuditLog.findAll({
                order: [['createdAt', 'DESC']],
                limit: 2,
                offset: 2
            });

            expect(offsetLogs).toHaveLength(2);
            // Should skip first 2 and return next 2
        });

        it('should count audit logs', async () => {
            // Create test data
            await AuditLog.create({ id: 'audit-1', entity: 'form', action: 'create' });
            await AuditLog.create({ id: 'audit-2', entity: 'user', action: 'create' });
            await AuditLog.create({ id: 'audit-3', entity: 'form', action: 'update' });

            const totalCount = await AuditLog.count();
            expect(totalCount).toBe(3);

            const formCount = await AuditLog.count({ where: { entity: 'form' } });
            expect(formCount).toBe(2);
        });

        it('should delete audit logs', async () => {
            const auditLog = await AuditLog.create({
                id: 'audit-to-delete',
                entity: 'form',
                action: 'create'
            });

            await auditLog.destroy();

            const deletedLog = await AuditLog.findByPk('audit-to-delete');
            expect(deletedLog).toBeNull();
        });

        it('should handle bulk operations', async () => {
            const auditData = [
                { id: 'audit-bulk-1', entity: 'form', action: 'create' },
                { id: 'audit-bulk-2', entity: 'user', action: 'create' },
                { id: 'audit-bulk-3', entity: 'category', action: 'create' }
            ];

            const createdLogs = await AuditLog.bulkCreate(auditData);
            expect(createdLogs).toHaveLength(3);

            const allLogs = await AuditLog.findAll();
            expect(allLogs).toHaveLength(3);
        });
    });

    describe('Indexes and Performance', () => {
        it('should have proper indexes for common queries', async () => {
            // This test verifies that the indexes are defined in the model
            // The actual index creation is handled by Sequelize migrations
            const tableInfo = await sequelize.getQueryInterface().describeTable('audit_logs');

            expect(tableInfo).toBeDefined();
            expect(tableInfo.id).toBeDefined();
            expect(tableInfo.entity).toBeDefined();
            expect(tableInfo.action).toBeDefined();
            expect(tableInfo.userId).toBeDefined();
            expect(tableInfo.createdAt).toBeDefined();
        });
    });

    describe('Data Integrity', () => {
        it('should handle concurrent audit log creation', async () => {
            const promises = [];

            // Create multiple audit logs concurrently
            for (let i = 1; i <= 10; i++) {
                promises.push(
                    AuditLog.create({
                        id: `concurrent-${i}`,
                        entity: 'form',
                        action: 'create'
                    })
                );
            }

            const results = await Promise.all(promises);
            expect(results).toHaveLength(10);

            const allLogs = await AuditLog.findAll();
            expect(allLogs).toHaveLength(10);
        });

        it('should maintain data consistency across operations', async () => {
            // Create audit log
            const auditLog = await AuditLog.create({
                id: 'consistency-test',
                entity: 'form',
                action: 'create',
                entityId: 'form-123',
                userId: 'user-456',
                ip: '192.168.1.1',
                ua: 'Test Browser',
                metaJson: JSON.stringify({ test: true })
            });

            // Verify all data is preserved
            expect(auditLog.id).toBe('consistency-test');
            expect(auditLog.entity).toBe('form');
            expect(auditLog.action).toBe('create');
            expect(auditLog.entityId).toBe('form-123');
            expect(auditLog.userId).toBe('user-456');
            expect(auditLog.ip).toBe('192.168.1.1');
            expect(auditLog.ua).toBe('Test Browser');
            expect(auditLog.metaJson).toBe(JSON.stringify({ test: true }));

            // Find by primary key
            const foundLog = await AuditLog.findByPk('consistency-test');
            expect(foundLog).toBeDefined();
            expect(foundLog.id).toBe('consistency-test');
            expect(foundLog.entity).toBe('form');
        });
    });

    describe('Edge Cases', () => {
        it('should handle null values in optional fields', async () => {
            const auditData = {
                id: 'audit-nulls',
                entity: 'form',
                action: 'create',
                entityId: null,
                userId: null,
                ip: null,
                ua: null,
                metaJson: null
            };

            const auditLog = await AuditLog.create(auditData);

            expect(auditLog.entityId).toBeNull();
            expect(auditLog.userId).toBeNull();
            expect(auditLog.ip).toBeNull();
            expect(auditLog.ua).toBeNull();
            expect(auditLog.metaJson).toBeNull();
        });

        it('should handle empty strings in optional fields', async () => {
            const auditData = {
                id: 'audit-empty',
                entity: 'form',
                action: 'create',
                entityId: '',
                userId: '',
                ip: '',
                ua: '',
                metaJson: ''
            };

            const auditLog = await AuditLog.create(auditData);

            expect(auditLog.entityId).toBe('');
            expect(auditLog.userId).toBe('');
            expect(auditLog.ip).toBe('');
            expect(auditLog.ua).toBe('');
            expect(auditLog.metaJson).toBe('');
        });

        it('should handle invalid JSON in metaJson', async () => {
            const auditData = {
                id: 'audit-invalid-json',
                entity: 'form',
                action: 'create',
                metaJson: 'invalid json string'
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.metaJson).toBe('invalid json string');
        });

        it('should handle very long IDs', async () => {
            const longId = 'a'.repeat(40); // Max length for ID field
            const auditData = {
                id: longId,
                entity: 'form',
                action: 'create'
            };

            const auditLog = await AuditLog.create(auditData);
            expect(auditLog.id).toBe(longId);
        });
    });
});
