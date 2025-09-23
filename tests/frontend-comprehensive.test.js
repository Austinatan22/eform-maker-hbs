/**
 * Comprehensive Frontend Integration Tests
 * 
 * Consolidates all frontend testing into a single comprehensive test suite.
 * Combines functionality from:
 * - frontend-integration.test.js (general frontend integration)
 * - frontend-builder-dnd.test.js (drag & drop functionality)
 * - frontend-rich-text-editor.test.js (rich text editor)
 * - frontend-phone-input.test.js (phone input functionality)
 * - frontend-hosted-form.test.js (hosted form rendering)
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase, clearTestData, createTestAdmin } from './helpers/test-db-setup.js';
import {
    standardBeforeAll,
    standardAfterAll,
    generateTestJWT,
    setupTestEnvironment,
    cleanupTestEnvironment
} from './helpers/test-setup-utils.js';
import { authTestPatterns, createTestData, validateResponse } from './helpers/auth-test-utils.js';
import request from 'supertest';

describe('Frontend - Comprehensive Integration Testing', () => {
    let testUser;
    let authToken;
    let testForm;
    let testFormId;
    let testCategory;
    let app;

    beforeAll(async () => {
        // Import app dynamically to avoid teardown issues
        const { app: importedApp } = await import('../src/server/app.js');
        app = importedApp;

        await standardBeforeAll();
    });

    afterAll(async () => {
        await standardAfterAll();
    });

    beforeEach(async () => {
        await clearTestData();

        // Create test admin user
        testUser = await createTestAdmin({
            email: 'frontend-test@example.com'
        });

        authToken = generateTestJWT(testUser);

        // Create test category
        const { Category } = await import('../src/server/models/Category.js');
        testCategory = await Category.create({
            id: 'cat-frontend-test',
            name: 'Frontend Test Category',
            description: 'Test category for frontend tests',
            color: '#ff0000'
        });
    });

    // ============================================================================
    // FORM BUILDER FUNCTIONALITY
    // ============================================================================

    describe('Form Builder - Drag & Drop', () => {
        test('should render form builder page with drag & drop interface', async () => {
            const response = await request(app)
                .get('/builder')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
        });

        test('should handle form creation with drag & drop fields', async () => {
            const formData = {
                title: 'Drag & Drop Test Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Full Name',
                        name: 'fullName',
                        required: true
                    },
                    {
                        type: 'email',
                        label: 'Email Address',
                        name: 'email',
                        required: true
                    },
                    {
                        type: 'phone',
                        label: 'Phone Number',
                        name: 'phone'
                    }
                ],
                categoryId: testCategory.id
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form).toBeDefined();
            expect(response.body.form.fields).toHaveLength(3);

            testForm = response.body.form;
            testFormId = testForm.id;
        });

        test('should handle field reordering in form builder', async () => {
            const formData = {
                title: 'Reorder Test Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'First Field',
                        name: 'firstField',
                        order: 1
                    },
                    {
                        type: 'email',
                        label: 'Second Field',
                        name: 'secondField',
                        order: 2
                    }
                ],
                categoryId: testCategory.id
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields[0].order).toBe(1);
            expect(response.body.form.fields[1].order).toBe(2);
        });

        test('should handle field deletion in form builder', async () => {
            const formData = {
                title: 'Delete Field Test Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Keep This Field',
                        name: 'keepField'
                    },
                    {
                        type: 'email',
                        label: 'Delete This Field',
                        name: 'deleteField'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            // Update form to remove one field
            const updateData = {
                title: 'Delete Field Test Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Keep This Field',
                        name: 'keepField'
                    }
                ]
            };

            const updateResponse = await request(app)
                .put(`/api/forms/${formId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData);

            expect(updateResponse.status).toBe(200);
            expect(updateResponse.body.form.fields).toHaveLength(1);
        });
    });

    // ============================================================================
    // RICH TEXT EDITOR FUNCTIONALITY
    // ============================================================================

    describe('Rich Text Editor Integration', () => {
        test('should create form with rich text field', async () => {
            const formData = {
                title: 'Rich Text Form',
                fields: [
                    {
                        type: 'richText',
                        label: 'Rich Content',
                        name: 'richContent',
                        content: '<p>This is <strong>rich text</strong> content with <em>formatting</em>.</p>'
                    }
                ],
                categoryId: testCategory.id
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields[0].type).toBe('richText');
            expect(response.body.form.fields[0].content).toContain('<strong>');
        });

        test('should handle rich text field submission', async () => {
            const formData = {
                title: 'Rich Text Submission Form',
                fields: [
                    {
                        type: 'richText',
                        label: 'Comments',
                        name: 'comments'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const submissionData = {
                data: {
                    comments: '<p>This is a <strong>rich text</strong> comment with <em>formatting</em>.</p>'
                },
                storeConsent: true
            };

            const submitResponse = await request(app)
                .post(`/public/forms/${formId}/submissions`)
                .send(submissionData);

            expect(submitResponse.status).toBe(200);
            expect(submitResponse.body.ok).toBe(true);
        });

        test('should handle rich text field with complex HTML', async () => {
            const complexHtml = `
                <div>
                    <h2>Section Title</h2>
                    <p>This is a paragraph with <a href="https://example.com">a link</a>.</p>
                    <ul>
                        <li>List item 1</li>
                        <li>List item 2</li>
                    </ul>
                    <blockquote>
                        <p>This is a quote.</p>
                    </blockquote>
                </div>
            `;

            const formData = {
                title: 'Complex Rich Text Form',
                fields: [
                    {
                        type: 'richText',
                        label: 'Complex Content',
                        name: 'complexContent',
                        content: complexHtml
                    }
                ],
                categoryId: testCategory.id
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields[0].content).toContain('<h2>');
            expect(response.body.form.fields[0].content).toContain('<ul>');
        });
    });

    // ============================================================================
    // PHONE INPUT FUNCTIONALITY
    // ============================================================================

    describe('Phone Input Integration', () => {
        test('should create form with phone input field', async () => {
            const formData = {
                title: 'Phone Input Form',
                fields: [
                    {
                        type: 'phone',
                        label: 'Phone Number',
                        name: 'phoneNumber',
                        required: true
                    }
                ],
                categoryId: testCategory.id
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields[0].type).toBe('phone');
        });

        test('should handle phone number submission with various formats', async () => {
            const formData = {
                title: 'Phone Submission Form',
                fields: [
                    {
                        type: 'phone',
                        label: 'Phone Number',
                        name: 'phoneNumber'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const phoneNumbers = [
                '+1234567890',
                '(123) 456-7890',
                '123-456-7890',
                '123.456.7890',
                '+1 (123) 456-7890'
            ];

            for (const phone of phoneNumbers) {
                const submissionData = {
                    data: {
                        phoneNumber: phone
                    },
                    storeConsent: true
                };

                const response = await request(app)
                    .post(`/public/forms/${formId}/submissions`)
                    .send(submissionData);

                expect(response.status).toBe(200);
                expect(response.body.ok).toBe(true);
            }
        });

        test('should handle international phone numbers', async () => {
            const formData = {
                title: 'International Phone Form',
                fields: [
                    {
                        type: 'phone',
                        label: 'International Phone',
                        name: 'internationalPhone'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const internationalPhones = [
                '+44 20 7946 0958', // UK
                '+33 1 42 86 83 26', // France
                '+49 30 12345678', // Germany
                '+81 3 1234 5678', // Japan
                '+86 10 1234 5678' // China
            ];

            for (const phone of internationalPhones) {
                const submissionData = {
                    data: {
                        internationalPhone: phone
                    },
                    storeConsent: true
                };

                const response = await request(app)
                    .post(`/public/forms/${formId}/submissions`)
                    .send(submissionData);

                expect(response.status).toBe(200);
                expect(response.body.ok).toBe(true);
            }
        });
    });

    // ============================================================================
    // HOSTED FORM RENDERING
    // ============================================================================

    describe('Hosted Form Rendering', () => {
        beforeEach(async () => {
            // Create a test form for hosted form tests
            const formData = {
                title: 'Hosted Form Test',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Full Name',
                        name: 'fullName',
                        required: true
                    },
                    {
                        type: 'email',
                        label: 'Email',
                        name: 'email',
                        required: true
                    },
                    {
                        type: 'phone',
                        label: 'Phone',
                        name: 'phone'
                    },
                    {
                        type: 'richText',
                        label: 'Comments',
                        name: 'comments'
                    }
                ],
                categoryId: testCategory.id
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            testForm = response.body.form;
            testFormId = testForm.id;
        });

        test('should render hosted form page', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('form-container');
            expect(response.text).toContain('Full Name');
            expect(response.text).toContain('Email');
        });

        test('should render hosted form with all field types', async () => {
            const allFieldsFormData = {
                title: 'All Fields Hosted Form',
                fields: [
                    { type: 'singleLine', label: 'Text', name: 'text' },
                    { type: 'paragraph', label: 'Textarea', name: 'textarea' },
                    { type: 'dropdown', label: 'Select', name: 'select', options: ['Option 1', 'Option 2'] },
                    { type: 'multipleChoice', label: 'Radio', name: 'radio', options: ['Choice 1', 'Choice 2'] },
                    { type: 'checkboxes', label: 'Checkboxes', name: 'checkboxes', options: ['Check 1', 'Check 2'] },
                    { type: 'number', label: 'Number', name: 'number' },
                    { type: 'name', label: 'Name', name: 'name' },
                    { type: 'email', label: 'Email', name: 'email' },
                    { type: 'phone', label: 'Phone', name: 'phone' },
                    { type: 'password', label: 'Password', name: 'password' },
                    { type: 'date', label: 'Date', name: 'date' },
                    { type: 'time', label: 'Time', name: 'time' },
                    { type: 'datetime', label: 'DateTime', name: 'datetime' },
                    { type: 'url', label: 'URL', name: 'url' },
                    { type: 'file', label: 'File', name: 'file' },
                    { type: 'richText', label: 'Rich Text', name: 'richText' }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(allFieldsFormData);

            const allFieldsFormId = createResponse.body.form.id;

            const response = await request(app)
                .get(`/f/${allFieldsFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Text');
            expect(response.text).toContain('Textarea');
            expect(response.text).toContain('Select');
            expect(response.text).toContain('Radio');
            expect(response.text).toContain('Checkboxes');
        });

        test('should handle hosted form submission', async () => {
            const submissionData = {
                data: {
                    fullName: 'John Doe',
                    email: 'john.doe@example.com',
                    phone: '+1234567890',
                    comments: '<p>This is a test comment</p>'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });

        test('should handle hosted form with validation', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('required');
            expect(response.text).toContain('validation');
        });

        test('should handle hosted form with custom styling', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('css');
            expect(response.text).toContain('style');
        });
    });

    // ============================================================================
    // FORM PREVIEW FUNCTIONALITY
    // ============================================================================

    describe('Form Preview Integration', () => {
        test('should render form preview in builder', async () => {
            const response = await request(app)
                .get('/builder')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('preview');
            expect(response.text).toContain('form-preview');
        });

        test('should handle form preview with different field types', async () => {
            const formData = {
                title: 'Preview Test Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Preview Field',
                        name: 'previewField'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const response = await request(app)
                .get(`/api/forms/${formId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.form.fields).toHaveLength(1);
        });
    });

    // ============================================================================
    // CLIENT-SIDE VALIDATION
    // ============================================================================

    describe('Client-Side Validation', () => {
        test('should handle required field validation', async () => {
            const formData = {
                title: 'Required Fields Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Required Field',
                        name: 'requiredField',
                        required: true
                    },
                    {
                        type: 'email',
                        label: 'Required Email',
                        name: 'requiredEmail',
                        required: true
                    }
                ],
                categoryId: testCategory.id
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            expect(response.status).toBe(200);
            expect(response.body.form.fields[0].required).toBe(true);
            expect(response.body.form.fields[1].required).toBe(true);
        });

        test('should handle email validation', async () => {
            const formData = {
                title: 'Email Validation Form',
                fields: [
                    {
                        type: 'email',
                        label: 'Email Field',
                        name: 'emailField',
                        required: true
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            // Test with valid email
            const validSubmission = {
                data: {
                    emailField: 'test@example.com'
                },
                storeConsent: true
            };

            const validResponse = await request(app)
                .post(`/public/forms/${formId}/submissions`)
                .send(validSubmission);

            expect(validResponse.status).toBe(200);
            expect(validResponse.body.ok).toBe(true);
        });

        test('should handle phone number validation', async () => {
            const formData = {
                title: 'Phone Validation Form',
                fields: [
                    {
                        type: 'phone',
                        label: 'Phone Field',
                        name: 'phoneField',
                        required: true
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            // Test with valid phone
            const validSubmission = {
                data: {
                    phoneField: '+1234567890'
                },
                storeConsent: true
            };

            const validResponse = await request(app)
                .post(`/public/forms/${formId}/submissions`)
                .send(validSubmission);

            expect(validResponse.status).toBe(200);
            expect(validResponse.body.ok).toBe(true);
        });
    });

    // ============================================================================
    // FORM SUBMISSION INTEGRATION
    // ============================================================================

    describe('Form Submission Integration', () => {
        test('should handle form submission with all field types', async () => {
            const formData = {
                title: 'Complete Submission Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name',
                        required: true
                    },
                    {
                        type: 'email',
                        label: 'Email',
                        name: 'email',
                        required: true
                    },
                    {
                        type: 'phone',
                        label: 'Phone',
                        name: 'phone'
                    },
                    {
                        type: 'richText',
                        label: 'Comments',
                        name: 'comments'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const submissionData = {
                data: {
                    name: 'John Doe',
                    email: 'john.doe@example.com',
                    phone: '+1234567890',
                    comments: '<p>This is a test submission</p>'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${formId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });

        test('should handle form submission without storage consent', async () => {
            const formData = {
                title: 'No Storage Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const submissionData = {
                data: {
                    name: 'Jane Doe'
                },
                storeConsent: false
            };

            const response = await request(app)
                .post(`/public/forms/${formId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });

        test('should handle multiple form submissions', async () => {
            const formData = {
                title: 'Multiple Submissions Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const submissions = [
                { name: 'User 1' },
                { name: 'User 2' },
                { name: 'User 3' }
            ];

            for (const submission of submissions) {
                const response = await request(app)
                    .post(`/public/forms/${formId}/submissions`)
                    .send({
                        data: submission,
                        storeConsent: true
                    });

                expect(response.status).toBe(200);
                expect(response.body.ok).toBe(true);
            }
        });
    });

    // ============================================================================
    // ERROR HANDLING AND EDGE CASES
    // ============================================================================

    describe('Error Handling and Edge Cases', () => {
        test('should handle non-existent form in hosted view', async () => {
            const response = await request(app)
                .get('/f/non-existent-id');

            expect(response.status).toBe(404);
        });

        test('should handle malformed form data', async () => {
            const malformedData = {
                title: 'Malformed Form',
                fields: [
                    {
                        type: 'invalidType',
                        label: 'Invalid Field',
                        name: 'invalidField'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(malformedData);

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('field type');
        });

        test('should handle empty form submission', async () => {
            const formData = {
                title: 'Empty Submission Form',
                fields: [],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const submissionData = {
                data: {},
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${formId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });

        test('should handle concurrent form submissions', async () => {
            const formData = {
                title: 'Concurrent Submission Form',
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Name',
                        name: 'name'
                    }
                ],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(formData);

            const formId = createResponse.body.form.id;

            const submissionData = {
                data: {
                    name: 'Concurrent User'
                },
                storeConsent: true
            };

            // Submit multiple requests concurrently
            const promises = Array(5).fill().map(() =>
                request(app)
                    .post(`/public/forms/${formId}/submissions`)
                    .send(submissionData)
            );

            const responses = await Promise.all(promises);

            // All should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.body.ok).toBe(true);
            });
        });
    });
});
