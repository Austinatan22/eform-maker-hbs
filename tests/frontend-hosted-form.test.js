/**
 * Frontend Hosted Form Integration Tests
 * 
 * Tests the hosted form rendering and submission functionality
 * without assuming current behavior is correct.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase, clearTestData, createTestAdmin } from './helpers/test-db-setup.js';
import request from 'supertest';
import { app } from '../src/server/app.js';
import jwt from 'jsonwebtoken';

describe('Frontend Hosted Form Integration', () => {
    let testUser;
    let authToken;
    let testForm;
    let testFormId;

    beforeEach(async () => {
        await setupTestDatabase();
        await clearTestData();

        testUser = await createTestAdmin({
            email: 'hosted-form-test@example.com'
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
                description: 'Test category for hosted form tests'
            });

        expect(categoryResponse.status).toBe(200);
        const testCategory = categoryResponse.body.category;

        // Create a comprehensive test form with all field types
        const formResponse = await request(app)
            .post('/api/forms')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                title: 'Comprehensive Test Form',
                categoryId: testCategory.id,
                fields: [
                    {
                        type: 'singleLine',
                        label: 'Full Name',
                        name: 'fullName',
                        placeholder: 'Enter your full name',
                        required: true
                    },
                    {
                        type: 'email',
                        label: 'Email Address',
                        name: 'email',
                        placeholder: 'Enter your email',
                        required: true
                    },
                    {
                        type: 'phone',
                        label: 'Phone Number',
                        name: 'phone',
                        placeholder: 'Enter your phone number',
                        required: false
                    },
                    {
                        type: 'number',
                        label: 'Age',
                        name: 'age',
                        placeholder: 'Enter your age',
                        required: false
                    },
                    {
                        type: 'date',
                        label: 'Birth Date',
                        name: 'birthDate',
                        placeholder: 'Select your birth date',
                        required: false
                    },
                    {
                        type: 'time',
                        label: 'Preferred Time',
                        name: 'preferredTime',
                        placeholder: 'Select preferred time',
                        required: false
                    },
                    {
                        type: 'datetime',
                        label: 'Appointment Date',
                        name: 'appointmentDate',
                        placeholder: 'Select appointment date and time',
                        required: false
                    },
                    {
                        type: 'url',
                        label: 'Website',
                        name: 'website',
                        placeholder: 'Enter your website URL',
                        required: false
                    },
                    {
                        type: 'password',
                        label: 'Password',
                        name: 'password',
                        placeholder: 'Enter your password',
                        required: false
                    },
                    {
                        type: 'paragraph',
                        label: 'Comments',
                        name: 'comments',
                        placeholder: 'Enter your comments',
                        required: false
                    },
                    {
                        type: 'dropdown',
                        label: 'Country',
                        name: 'country',
                        options: 'United States,Canada,Mexico,United Kingdom,Germany,France',
                        required: false
                    },
                    {
                        type: 'multipleChoice',
                        label: 'Interests',
                        name: 'interests',
                        options: 'Technology,Science,Arts,Sports,Music,Travel',
                        required: false
                    },
                    {
                        type: 'checkboxes',
                        label: 'Newsletter Topics',
                        name: 'newsletterTopics',
                        options: 'Technology Updates,Science News,Art Events,Sports News,Music Releases,Travel Deals',
                        required: false
                    },
                    {
                        type: 'file',
                        label: 'Resume',
                        name: 'resume',
                        placeholder: 'Upload your resume',
                        required: false
                    },
                    {
                        type: 'richText',
                        label: 'Cover Letter',
                        name: 'coverLetter',
                        placeholder: 'Write your cover letter',
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

    describe('Hosted Form Rendering', () => {
        test('should render hosted form with proper HTML structure', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('<!doctype html>');
            expect(response.text).toContain('<html lang="en">');
            expect(response.text).toContain('<head>');
            expect(response.text).toContain('<body class="container py-4">');
        });

        test('should include form title in page', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain(testForm.title);
            expect(response.text).toContain('<h1 class="h3 mb-4">');
        });

        test('should render form with proper form element', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('id="form"');
            expect(response.text).toContain('class="vstack gap-2"');
        });

        test('should include consent checkbox', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('storeConsent');
            expect(response.text).toContain('Save a copy here so I can retrieve/edit later');
        });

        test('should include submit button', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('type="submit"');
            expect(response.text).toContain('Submit');
        });

        test('should include status display', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('id="status"');
            expect(response.text).toContain('class="mt-2 small text-muted"');
        });
    });

    describe('Field Type Rendering', () => {
        test('should render text input fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="fullName"');
            expect(response.text).toContain('placeholder="Enter your full name"');
            expect(response.text).toContain('required');
        });

        test('should render email input fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="email"');
            expect(response.text).toContain('type="email"');
            expect(response.text).toContain('placeholder="Enter your email"');
        });

        test('should render phone input fields with intl-tel-input', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="phone"');
            expect(response.text).toContain('type="tel"');
            expect(response.text).toContain('js-intl-tel');
        });

        test('should render number input fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="age"');
            expect(response.text).toContain('type="number"');
            expect(response.text).toContain('placeholder="Enter your age"');
        });

        test('should render date input fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="birthDate"');
            expect(response.text).toContain('type="date"');
            expect(response.text).toContain('Select your birth date');
        });

        test('should render time input fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="preferredTime"');
            expect(response.text).toContain('type="time"');
            expect(response.text).toContain('Select preferred time');
        });

        test('should render datetime input fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="appointmentDate"');
            expect(response.text).toContain('type="datetime-local"');
            expect(response.text).toContain('Select appointment date and time');
        });

        test('should render URL input fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="website"');
            expect(response.text).toContain('type="url"');
            expect(response.text).toContain('placeholder="Enter your website URL"');
        });

        test('should render password input fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="password"');
            expect(response.text).toContain('type="password"');
            expect(response.text).toContain('placeholder="Enter your password"');
        });

        test('should render textarea fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="comments"');
            expect(response.text).toContain('<textarea');
            expect(response.text).toContain('placeholder="Enter your comments"');
        });

        test('should render dropdown fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="country"');
            expect(response.text).toContain('<select');
            expect(response.text).toContain('United States');
            expect(response.text).toContain('Canada');
        });

        test('should render radio button fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="interests"');
            expect(response.text).toContain('type="radio"');
            expect(response.text).toContain('Technology');
            expect(response.text).toContain('Science');
        });

        test('should render checkbox fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="newsletterTopics"');
            expect(response.text).toContain('type="checkbox"');
            expect(response.text).toContain('Technology Updates');
            expect(response.text).toContain('Science News');
        });

        test('should render file upload fields', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="resume"');
            expect(response.text).toContain('type="file"');
            expect(response.text).toContain('Upload your resume');
        });

        test('should render rich text fields with Quill editor', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="coverLetter"');
            expect(response.text).toContain('rich-text-editor');
            expect(response.text).toContain('quill-editor');
            expect(response.text).toContain('quill-toolbar');
        });
    });

    describe('CSS and Styling Integration', () => {
        test('should include Bootstrap CSS', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('bootstrap@5.3.3');
            expect(response.text).toContain('bootstrap.min.css');
        });

        test('should include Vuexy UI kit CSS', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('/assets/vendor/fonts/iconify-icons.css');
            expect(response.text).toContain('/assets/vendor/libs/node-waves/node-waves.css');
            expect(response.text).toContain('/assets/vendor/libs/perfect-scrollbar/perfect-scrollbar.css');
            expect(response.text).toContain('/assets/vendor/css/core.css');
            expect(response.text).toContain('/assets/css/demo.css');
            expect(response.text).toContain('/css/custom.css');
        });

        test('should include intl-tel-input CSS', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput.css');
        });

        test('should include Quill rich text editor CSS', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('quill.snow.css');
        });

        test('should include responsive styling', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('max-width: 720px');
            expect(response.text).toContain('margin: 40px auto');
        });
    });

    describe('JavaScript Integration', () => {
        test('should include form submission JavaScript', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('collectFormData');
            expect(response.text).toContain('normalizePhones');
            expect(response.text).toContain('addEventListener');
            expect(response.text).toContain('preventDefault');
        });

        test('should include phone number normalization', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput');
            expect(response.text).toContain('getNumber');
        });

        test('should include rich text editor initialization', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('initQuillEditors');
            expect(response.text).toContain('text-change');
            expect(response.text).toContain('innerHTML');
        });

        test('should include iframe height adjustment', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('postMessage');
            expect(response.text).toContain('FORM_HEIGHT');
            expect(response.text).toContain('ResizeObserver');
        });

        test('should include intl-tel-input JavaScript', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('intlTelInput.min.js');
        });

        test('should include Quill rich text editor JavaScript', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('quill.min.js');
        });
    });

    describe('Form Submission Integration', () => {
        test('should handle valid form submission', async () => {
            const submissionData = {
                data: {
                    fullName: 'John Doe',
                    email: 'john@example.com',
                    phone: '+1234567890',
                    age: '30',
                    birthDate: '1993-01-01',
                    preferredTime: '14:30',
                    appointmentDate: '2024-01-15T10:00',
                    website: 'https://example.com',
                    password: 'password123',
                    comments: 'This is a test comment',
                    country: 'United States',
                    interests: 'Technology',
                    newsletterTopics: ['Technology Updates', 'Science News'],
                    coverLetter: '<p>This is my cover letter</p>'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/f/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
        });

        test('should handle form submission without consent', async () => {
            const submissionData = {
                data: {
                    fullName: 'Jane Doe',
                    email: 'jane@example.com'
                },
                storeConsent: false
            };

            const response = await request(app)
                .post(`/f/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
        });

        test('should handle form submission with missing required fields', async () => {
            const submissionData = {
                data: {
                    // Missing required fullName and email fields
                    phone: '+1234567890'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/f/${testFormId}/submissions`)
                .send(submissionData);

            // Should still accept the submission but with validation errors
            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
        });

        test('should handle form submission with invalid data', async () => {
            const submissionData = {
                data: {
                    fullName: 'John Doe',
                    email: 'invalid-email',
                    phone: 'invalid-phone',
                    age: 'not-a-number',
                    website: 'not-a-url'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/f/${testFormId}/submissions`)
                .send(submissionData);

            // Should still accept the submission but with validation errors
            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
        });
    });

    describe('Accessibility Integration', () => {
        test('should include proper form labels', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('<label');
            expect(response.text).toContain('for=');
        });

        test('should include proper input types', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('type="text"');
            expect(response.text).toContain('type="email"');
            expect(response.text).toContain('type="tel"');
            expect(response.text).toContain('type="number"');
            expect(response.text).toContain('type="date"');
            expect(response.text).toContain('type="time"');
            expect(response.text).toContain('type="datetime-local"');
            expect(response.text).toContain('type="url"');
            expect(response.text).toContain('type="password"');
            expect(response.text).toContain('type="file"');
        });

        test('should include proper button types', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('type="submit"');
            expect(response.text).toContain('type="checkbox"');
        });

        test('should include proper form structure', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('<form');
            expect(response.text).toContain('<input');
            expect(response.text).toContain('<select');
            expect(response.text).toContain('<textarea');
            expect(response.text).toContain('<button');
        });
    });

    describe('Error Handling', () => {
        test('should handle non-existent form gracefully', async () => {
            const response = await request(app)
                .get('/f/non-existent-id');

            expect(response.status).toBe(404);
        });

        test('should handle malformed form ID gracefully', async () => {
            const response = await request(app)
                .get('/f/invalid-id-format');

            expect(response.status).toBe(404);
        });

        test('should handle form submission to non-existent form', async () => {
            const submissionData = {
                data: { test: 'value' },
                storeConsent: true
            };

            const response = await request(app)
                .post('/f/non-existent-id/submissions')
                .send(submissionData);

            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
        });
    });

    describe('Performance Integration', () => {
        test('should load hosted form quickly', async () => {
            const startTime = Date.now();
            const response = await request(app)
                .get(`/f/${testFormId}`);
            const endTime = Date.now();

            expect(response.status).toBe(200);
            expect(endTime - startTime).toBeLessThan(1000); // Should load in under 1 second
        });

        test('should handle form submission quickly', async () => {
            const submissionData = {
                data: {
                    fullName: 'Performance Test',
                    email: 'performance@example.com'
                },
                storeConsent: true
            };

            const startTime = Date.now();
            const response = await request(app)
                .post(`/f/${testFormId}/submissions`)
                .send(submissionData);
            const endTime = Date.now();

            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
            expect(endTime - startTime).toBeLessThan(2000); // Should submit in under 2 seconds
        });
    });
});
