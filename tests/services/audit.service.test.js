// tests/services/audit.service.test.js
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { logAudit } from '../../src/server/services/audit.service.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';

describe('Audit Service Tests', () => {
    let mockReq;
    let originalCreate;

    beforeEach(async () => {
        // Clean up any existing audit logs
        await AuditLog.destroy({ where: {}, force: true });

        // Store original method
        originalCreate = AuditLog.create;

        // Mock AuditLog.create
        AuditLog.create = jest.fn().mockResolvedValue({ id: 'mock-audit-id-123' });

        // Create mock request object
        mockReq = {
            session: {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    role: 'admin'
                }
            },
            headers: {
                'x-forwarded-for': '192.168.1.1, 10.0.0.1',
                'user-agent': 'Mozilla/5.0 (Test Browser)'
            },
            ip: '127.0.0.1'
        };
    });

    afterEach(async () => {
        // Restore original method
        AuditLog.create = originalCreate;

        // Clean up audit logs
        await AuditLog.destroy({ where: {}, force: true });
    });

    describe('logAudit function', () => {
        it('should create audit log with all required fields', async () => {
            const auditData = {
                entity: 'form',
                action: 'create',
                entityId: 'form-456',
                meta: { title: 'Test Form', fields: 3 }
            };

            await logAudit(mockReq, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'form',
                    action: 'create',
                    entityId: 'form-456',
                    userId: 'user-123',
                    ip: '192.168.1.1', // Should use x-forwarded-for first IP
                    ua: 'Mozilla/5.0 (Test Browser)',
                    metaJson: JSON.stringify({ title: 'Test Form', fields: 3 })
                })
            );
        });

        it('should handle request without session user', async () => {
            const reqWithoutUser = {
                headers: {
                    'user-agent': 'Test Agent'
                },
                ip: '127.0.0.1'
            };

            const auditData = {
                entity: 'auth',
                action: 'login_failed',
                entityId: null,
                meta: { email: 'test@example.com' }
            };

            await logAudit(reqWithoutUser, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'auth',
                    action: 'login_failed',
                    entityId: null,
                    userId: null,
                    ip: '127.0.0.1',
                    ua: 'Test Agent',
                    metaJson: JSON.stringify({ email: 'test@example.com' })
                })
            );
        });

        it('should handle request with req.user instead of session.user', async () => {
            const reqWithUser = {
                user: {
                    id: 'user-789',
                    email: 'api@example.com',
                    role: 'editor'
                },
                headers: {
                    'user-agent': 'API Client'
                },
                ip: '10.0.0.1'
            };

            const auditData = {
                entity: 'template',
                action: 'update',
                entityId: 'template-123'
            };

            await logAudit(reqWithUser, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'template',
                    action: 'update',
                    entityId: 'template-123',
                    userId: 'user-789',
                    ip: '10.0.0.1',
                    ua: 'API Client',
                    metaJson: null
                })
            );
        });

        it('should handle missing x-forwarded-for header', async () => {
            const reqWithoutForwarded = {
                session: { user: { id: 'user-123' } },
                headers: {
                    'user-agent': 'Test Agent'
                },
                ip: '192.168.1.100'
            };

            const auditData = {
                entity: 'category',
                action: 'delete',
                entityId: 'cat-456'
            };

            await logAudit(reqWithoutForwarded, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'category',
                    action: 'delete',
                    entityId: 'cat-456',
                    userId: 'user-123',
                    ip: '192.168.1.100',
                    ua: 'Test Agent',
                    metaJson: null
                })
            );
        });

        it('should handle missing user-agent header', async () => {
            const reqWithoutUA = {
                session: { user: { id: 'user-123' } },
                headers: {},
                ip: '127.0.0.1'
            };

            const auditData = {
                entity: 'user',
                action: 'create',
                entityId: 'user-999'
            };

            await logAudit(reqWithoutUA, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'user',
                    action: 'create',
                    entityId: 'user-999',
                    userId: 'user-123',
                    ip: '127.0.0.1',
                    ua: '',
                    metaJson: null
                })
            );
        });

        it('should handle null meta data', async () => {
            const auditData = {
                entity: 'file',
                action: 'upload',
                entityId: null,
                meta: null
            };

            await logAudit(mockReq, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'file',
                    action: 'upload',
                    entityId: null,
                    userId: 'user-123',
                    ip: '192.168.1.1',
                    ua: 'Mozilla/5.0 (Test Browser)',
                    metaJson: null
                })
            );
        });

        it('should handle undefined meta data', async () => {
            const auditData = {
                entity: 'form',
                action: 'view',
                entityId: 'form-123'
                // meta is undefined
            };

            await logAudit(mockReq, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'form',
                    action: 'view',
                    entityId: 'form-123',
                    userId: 'user-123',
                    ip: '192.168.1.1',
                    ua: 'Mozilla/5.0 (Test Browser)',
                    metaJson: null
                })
            );
        });

        it('should handle complex meta data objects', async () => {
            const complexMeta = {
                formData: {
                    title: 'Complex Form',
                    fields: [
                        { name: 'field1', type: 'text' },
                        { name: 'field2', type: 'email' }
                    ]
                },
                validation: {
                    required: true,
                    maxLength: 100
                },
                timestamp: new Date().toISOString()
            };

            const auditData = {
                entity: 'form',
                action: 'create',
                entityId: 'form-complex',
                meta: complexMeta
            };

            await logAudit(mockReq, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'form',
                    action: 'create',
                    entityId: 'form-complex',
                    userId: 'user-123',
                    ip: '192.168.1.1',
                    ua: 'Mozilla/5.0 (Test Browser)',
                    metaJson: JSON.stringify(complexMeta)
                })
            );
        });

        it('should handle database errors gracefully', async () => {
            const dbError = new Error('Database connection failed');
            AuditLog.create = jest.fn().mockRejectedValueOnce(dbError);

            const auditData = {
                entity: 'form',
                action: 'create',
                entityId: 'form-123'
            };

            // Should not throw error
            await expect(logAudit(mockReq, auditData)).resolves.toBeUndefined();
        });

        it('should handle null request object', async () => {
            const auditData = {
                entity: 'system',
                action: 'startup',
                entityId: null
            };

            // The function should handle null request gracefully
            await expect(logAudit(null, auditData)).resolves.toBeUndefined();

            // Since the function catches errors, we can't easily test the exact call
            // but we can verify it doesn't throw
        });

        it('should handle empty request object', async () => {
            const auditData = {
                entity: 'system',
                action: 'shutdown',
                entityId: null
            };

            // The function should handle empty request gracefully
            await expect(logAudit({}, auditData)).resolves.toBeUndefined();

            // Since the function catches errors, we can't easily test the exact call
            // but we can verify it doesn't throw
        });

        it('should handle multiple IPs in x-forwarded-for header', async () => {
            const reqWithMultipleIPs = {
                session: { user: { id: 'user-123' } },
                headers: {
                    'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
                    'user-agent': 'Test Agent'
                },
                ip: '127.0.0.1'
            };

            const auditData = {
                entity: 'auth',
                action: 'login',
                entityId: 'user-123'
            };

            await logAudit(reqWithMultipleIPs, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity: 'auth',
                    action: 'login',
                    entityId: 'user-123',
                    userId: 'user-123',
                    ip: '203.0.113.195', // Should use first IP
                    ua: 'Test Agent',
                    metaJson: null
                })
            );
        });

        it('should handle all entity types correctly', async () => {
            const entities = ['form', 'category', 'template', 'user', 'auth', 'file', 'system'];

            for (const entity of entities) {
                const auditData = {
                    entity,
                    action: 'test',
                    entityId: `${entity}-123`
                };

                await logAudit(mockReq, auditData);

                expect(AuditLog.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        entity,
                        action: 'test',
                        entityId: `${entity}-123`
                    })
                );
            }
        });

        it('should handle all action types correctly', async () => {
            const actions = ['create', 'read', 'update', 'delete', 'login', 'logout', 'upload', 'download'];

            for (const action of actions) {
                const auditData = {
                    entity: 'test',
                    action,
                    entityId: 'test-123'
                };

                await logAudit(mockReq, auditData);

                expect(AuditLog.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        entity: 'test',
                        action,
                        entityId: 'test-123'
                    })
                );
            }
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle very long meta data', async () => {
            const longMeta = {
                data: 'x'.repeat(10000), // Very long string
                array: Array(1000).fill('test'),
                nested: {
                    deep: {
                        object: {
                            with: {
                                many: {
                                    levels: 'value'
                                }
                            }
                        }
                    }
                }
            };

            const auditData = {
                entity: 'form',
                action: 'create',
                entityId: 'form-long',
                meta: longMeta
            };

            await logAudit(mockReq, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    metaJson: JSON.stringify(longMeta)
                })
            );
        });

        it('should handle special characters in meta data', async () => {
            const specialMeta = {
                unicode: '🚀 Test with émojis and ñ characters',
                quotes: 'Text with "double" and \'single\' quotes',
                newlines: 'Text with\nnewlines and\ttabs',
                json: '{"nested": "json", "array": [1, 2, 3]}'
            };

            const auditData = {
                entity: 'form',
                action: 'create',
                entityId: 'form-special',
                meta: specialMeta
            };

            await logAudit(mockReq, auditData);

            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    metaJson: JSON.stringify(specialMeta)
                })
            );
        });
    });
});