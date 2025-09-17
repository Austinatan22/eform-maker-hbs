// Test for validation service
import { describe, it, expect, beforeEach } from '@jest/globals';
import { sanitize, validate, formFieldValidation, formValidation } from '../../src/server/services/validation.service.js';

describe('Validation Service', () => {
    beforeEach(() => {
        // Reset any mocks or state
    });

    describe('sanitize.html', () => {
        it('should remove HTML tags', () => {
            const input = '<p>Hello <b>World</b></p>';
            const result = sanitize.html(input);
            expect(result).toBe('Hello World');
        });

        it('should remove script tags', () => {
            const input = '<script>alert("xss")</script>Hello';
            const result = sanitize.html(input);
            expect(result).toBe('Hello');
        });

        it('should handle non-string input', () => {
            const input = 123;
            const result = sanitize.html(input);
            expect(result).toBe(123);
        });
    });

    describe('formFieldValidation', () => {
        it('should validate field label', () => {
            const result = formFieldValidation.label('Test Label');
            expect(result).toBeNull(); // null means valid
        });

        it('should reject empty field label', () => {
            const result = formFieldValidation.label('');
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should validate field name', () => {
            const result = formFieldValidation.name('testField');
            expect(result).toBeNull(); // null means valid
        });

        it('should reject invalid field name', () => {
            const result = formFieldValidation.name('123invalid');
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should validate dropdown options', () => {
            const result = formFieldValidation.options('Red, Green, Blue', 'dropdown');
            expect(result).toBeNull(); // null means valid
        });

        it('should reject empty dropdown options', () => {
            const result = formFieldValidation.options('', 'dropdown');
            expect(result).toBeDefined();
            expect(result).toContain('required');
        });
    });

    describe('validate object', () => {
        it('should validate required fields', () => {
            const result = validate.required('test', 'Test field');
            expect(result).toBeNull(); // null means valid
        });

        it('should reject empty required fields', () => {
            const result = validate.required('', 'Test field');
            expect(result).toBeDefined();
            expect(result).toContain('required');
        });

        it('should validate email format', () => {
            const result = validate.email('test@example.com', 'Email');
            expect(result).toBeNull(); // null means valid
        });

        it('should reject invalid email format', () => {
            const result = validate.email('invalid-email', 'Email');
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });
    });
});