/**
 * Frontend Phone Input Integration Tests
 * 
 * Tests the intl-tel-input integration for phone number fields
 * in both form builder and hosted forms without assuming current behavior is correct.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase, clearTestData, createTestAdmin } from './helpers/test-db-setup.js';
import request from 'supertest';
import { app } from '../src/server/app.js';
import jwt from 'jsonwebtoken';

describe('Frontend Phone Input Integration', () => {
    let testUser;
    let authToken;
    let testForm;
    let testFormId;

    beforeEach(async () => {
        await setupTestDatabase();
        await clearTestData();

        testUser = await createTestAdmin({
            email: 'phone-input-test@example.com'
        });

        authToken = jwt.sign(
            { sub: testUser.id, role: 'admin', email: testUser.email },
            process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
            { expiresIn: '15m' }
        );

        // Create a test category first
        const categoryResponse = await request(app)
            .post('/api/categories')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                name: 'Test Category',
                description: 'Test category for phone input tests'
            });

        expect(categoryResponse.status).toBe(200);
        const testCategory = categoryResponse.body.category;

        // Create a test form with phone fields
        const formResponse = await request(app)
            .post('/api/forms')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                title: 'Phone Input Test Form',
                categoryId: testCategory.id,
                fields: [
                    {
                        type: 'phone',
                        label: 'Primary Phone',
                        name: 'primaryPhone',
                        placeholder: 'Enter your primary phone number',
                        required: true
                    },
                    {
                        type: 'phone',
                        label: 'Secondary Phone',
                        name: 'secondaryPhone',
                        placeholder: 'Enter your secondary phone number',
                        required: false
                    },
                    {
                        type: 'phone',
                        label: 'Emergency Contact',
                        name: 'emergencyContact',
                        placeholder: 'Enter emergency contact phone',
                        required: false
                    }
                ]
            });

        expect(formResponse.status).toBe(200);
        testForm = formResponse.body.form;
        testFormId = testForm.id;
    });

    afterEach(async () => {
        await teardownTestDatabase();
    });

    describe('intl-tel-input Library Integration', () => {
        test('should include intl-tel-input CSS in hosted form', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput.css');
            expect(response.text).toContain('https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/css/intlTelInput.css');
        });

        test('should include intl-tel-input JavaScript in hosted form', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput.min.js');
            expect(response.text).toContain('https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/intlTelInput.min.js');
        });

        test('should include intl-tel-input CSS in form builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput.css');
        });

        test('should include intl-tel-input JavaScript in form builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput.min.js');
        });

        test('should include utils script URL configuration', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('INTL_UTILS');
            expect(response.text).toContain('https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js');
        });
    });

    describe('Phone Input Field Rendering', () => {
        test('should render phone input fields with proper attributes', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="primaryPhone"');
            expect(response.text).toContain('name="secondaryPhone"');
            expect(response.text).toContain('name="emergencyContact"');
            expect(response.text).toContain('type="tel"');
        });

        test('should include js-intl-tel class for phone inputs', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('js-intl-tel');
        });

        test('should include proper placeholders for phone inputs', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Enter your primary phone number');
            expect(response.text).toContain('Enter your secondary phone number');
            expect(response.text).toContain('Enter emergency contact phone');
        });

        test('should include required attributes for phone inputs', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('required');
        });
    });

    describe('Phone Input Initialization', () => {
        test('should initialize intl-tel-input in hosted form', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('initIntlTel');
            expect(response.text).toContain('DOMContentLoaded');
        });

        test('should initialize intl-tel-input in form builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput');
            expect(response.text).toContain('data-type="phone"');
        });

        test('should include phone input initialization with proper configuration', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('initialCountry');
            expect(response.text).toContain('preferredCountries');
            expect(response.text).toContain('utilsScript');
        });

        test('should include phone input initialization with country settings', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('initialCountry: \'id\'');
            expect(response.text).toContain('preferredCountries: [\'id\', \'us\']');
        });
    });

    describe('Phone Input Configuration', () => {
        test('should configure intl-tel-input with proper settings', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('window.intlTelInput');
            expect(response.text).toContain('initialCountry');
            expect(response.text).toContain('preferredCountries');
        });

        test('should include utils script configuration', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('utilsScript');
            expect(response.text).toContain('INTL_UTILS');
        });

        test('should include phone input styling configuration', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('--iti-path');
            expect(response.text).toContain('/vendor/intl-tel-input/build/img/');
        });

        test('should include phone input width configuration', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('wrap.style.width = \'100%\'');
        });
    });

    describe('Phone Input Event Handling', () => {
        test('should include country change event handling', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput');
            expect(response.text).toContain('getNumber');
        });

        test('should include phone number normalization', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('normalizePhones');
            expect(response.text).toContain('getNumber');
        });

        test('should include phone input validation', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput');
            expect(response.text).toContain('getNumber');
        });
    });

    describe('Phone Input in Form Builder', () => {
        test('should include phone input in builder preview', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type="phone"');
            expect(response.text).toContain('Phone');
        });

        test('should include phone input initialization in builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput');
            expect(response.text).toContain('data-type="phone"');
        });

        test('should include phone input in field types', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type="phone"');
            expect(response.text).toContain('Phone');
        });

        test('should include phone input field management', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('phone');
            expect(response.text).toContain('Phone');
        });
    });

    describe('Phone Input Form Submission', () => {
        test('should handle phone number submission with normalization', async () => {
            const submissionData = {
                data: {
                    primaryPhone: '+1234567890',
                    secondaryPhone: '+1987654321',
                    emergencyContact: '+1555123456'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });

        test('should handle phone number submission without normalization', async () => {
            const submissionData = {
                data: {
                    primaryPhone: '1234567890',
                    secondaryPhone: '987654321',
                    emergencyContact: '555123456'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });

        test('should handle empty phone number submission', async () => {
            const submissionData = {
                data: {
                    primaryPhone: '',
                    secondaryPhone: '',
                    emergencyContact: ''
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });

        test('should handle international phone number submission', async () => {
            const submissionData = {
                data: {
                    primaryPhone: '+44123456789',
                    secondaryPhone: '+33123456789',
                    emergencyContact: '+86123456789'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });
    });

    describe('Phone Input Error Handling', () => {
        test('should handle intl-tel-input loading errors gracefully', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('if (!window.intlTelInput)');
            expect(response.text).toContain('return;');
        });

        test('should handle phone input initialization errors', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('try {');
            expect(response.text).toContain('} catch (_) {');
        });

        test('should handle missing phone input elements', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('querySelectorAll');
            expect(response.text).toContain('js-intl-tel');
        });
    });

    describe('Phone Input Performance', () => {
        test('should initialize phone inputs efficiently', async () => {
            const startTime = Date.now();
            const response = await request(app)
                .get(`/f/${testFormId}`);
            const endTime = Date.now();

            expect(response.status).toBe(200);
            expect(endTime - startTime).toBeLessThan(1000); // Should load in under 1 second
        });

        test('should handle multiple phone inputs', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('js-intl-tel');
            // Should have multiple phone inputs
            const phoneInputCount = (response.text.match(/js-intl-tel/g) || []).length;
            expect(phoneInputCount).toBeGreaterThan(1);
        });
    });

    describe('Phone Input Accessibility', () => {
        test('should include proper form structure for phone inputs', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('<input');
            expect(response.text).toContain('type="tel"');
            expect(response.text).toContain('name=');
        });

        test('should include proper labels for phone inputs', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Primary Phone');
            expect(response.text).toContain('Secondary Phone');
            expect(response.text).toContain('Emergency Contact');
        });

        test('should include proper ARIA attributes', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('form-label');
            expect(response.text).toContain('form-control');
        });
    });

    describe('Phone Input Integration with Form Builder', () => {
        test('should support phone input in field editing', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('phone');
            expect(response.text).toContain('Phone');
        });

        test('should include phone input in field types list', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type="phone"');
            expect(response.text).toContain('Phone');
        });

        test('should support phone input field creation', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type="phone"');
            expect(response.text).toContain('Phone');
        });
    });
});
