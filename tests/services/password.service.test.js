// tests/services/password.service.test.js
import { describe, it, expect } from '@jest/globals';
import {
    validatePassword,
    getPasswordPolicy
} from '../../src/server/services/password.service.js';

describe('Password Service', () => {
    describe('validatePassword', () => {
        describe('valid passwords', () => {
            it('should accept a valid password with all requirements', () => {
                const result = validatePassword('ValidPassword123!');

                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
                expect(result.policy).toBeDefined();
            });

            it('should accept password with minimum length', () => {
                const result = validatePassword('MinLen8!');

                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });

            it('should accept password with maximum length', () => {
                const maxLengthPassword = 'A'.repeat(124) + 'a1!'; // 128 characters total
                const result = validatePassword(maxLengthPassword);

                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });
        });

        describe('invalid passwords', () => {
            it('should reject empty password', () => {
                const result = validatePassword('');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password is required');
            });

            it('should reject null password', () => {
                const result = validatePassword(null);

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password is required');
            });

            it('should reject undefined password', () => {
                const result = validatePassword(undefined);

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password is required');
            });

            it('should reject password that is too short', () => {
                const result = validatePassword('Short1!');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password must be at least 8 characters long');
            });

            it('should reject password that is too long', () => {
                const tooLongPassword = 'A'.repeat(130) + '1!'; // 132 characters - exceeds 128 limit
                const result = validatePassword(tooLongPassword);

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password must be no more than 128 characters long');
            });

            it('should reject password without uppercase letter', () => {
                const result = validatePassword('validpassword123!');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password must contain at least one uppercase letter');
            });

            it('should reject password without lowercase letter', () => {
                const result = validatePassword('VALIDPASSWORD123!');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password must contain at least one lowercase letter');
            });

            it('should reject password without numbers', () => {
                const result = validatePassword('ValidPassword!');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password must contain at least one number');
            });

            it('should reject password without special characters', () => {
                const result = validatePassword('ValidPassword123');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password must contain at least one special character');
            });

            it('should reject whitespace-only password', () => {
                const result = validatePassword('   ');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Password is required');
            });
        });

        describe('multiple validation errors', () => {
            it('should return multiple errors for password with multiple issues', () => {
                const result = validatePassword('short');

                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(1);
                expect(result.errors).toContain('Password must be at least 8 characters long');
                expect(result.errors).toContain('Password must contain at least one uppercase letter');
                expect(result.errors).toContain('Password must contain at least one number');
                expect(result.errors).toContain('Password must contain at least one special character');
            });
        });
    });

    describe('getPasswordPolicy', () => {
        it('should return password policy configuration', () => {
            const policy = getPasswordPolicy();

            expect(policy).toBeDefined();
            expect(policy.minLength).toBe(8);
            expect(policy.maxLength).toBe(128);
            expect(policy.requireUppercase).toBe(true);
            expect(policy.requireLowercase).toBe(true);
            expect(policy.requireNumbers).toBe(true);
            expect(policy.requireSpecialChars).toBe(true);
            expect(policy.maxFailedAttempts).toBe(5);
            expect(policy.lockoutDurationMinutes).toBe(30);
            expect(policy.specialChars).toBeDefined();
        });

        it('should include special characters list', () => {
            const policy = getPasswordPolicy();

            expect(policy.specialChars).toContain('!');
            expect(policy.specialChars).toContain('@');
            expect(policy.specialChars).toContain('#');
            expect(policy.specialChars).toContain('$');
        });
    });
});