// tests/routes/form-submissions.test.js
// Form Submission Tests - Real Application Tests
// Tests the actual form submission functionality using real routes and controllers

import request from 'supertest';
import express from 'express';
import { setupTestDatabase, clearTestData } from '../helpers/test-db-setup.js';
import jwt from 'jsonwebtoken';

// Simple JWT generation for tests
const generateTestJWT = (user) => {
    return jwt.sign(
        {
            sub: user.id,
            email: user.email,
            role: user.role
        },
        process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
        { expiresIn: '1h' }
    );
};

describe('Form Submissions - Real Application Tests', () => {
    let app;
    let testAdmin, testEditor, testViewer;
    let adminToken, editorToken, viewerToken;
    let testCategory, testForm;

    beforeAll(async () => {
        // Setup test database
        await setupTestDatabase();

        // Import real application routes
        const { default: formsRoutes } = await import('../../src/server/routes/forms.routes.js');

        // Create Express app with real routes
        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Mount real application routes
        app.use(formsRoutes);
    });

    afterAll(async () => {
        await clearTestData();
    });

    beforeEach(async () => {
        // Enable authentication for tests
        process.env.AUTH_ENABLED = '1';
        process.env.JWT_SECRET = 'dev_jwt_secret_change_me';

        // Clear test data
        await clearTestData();

        // Create test users
        const { User } = await import('../../src/server/models/User.js');
        testAdmin = await User.create({
            id: 'admin-submissions',
            email: 'admin@submissions.com',
            passwordHash: '$2b$10$test.hash.for.admin',
            role: 'admin'
        });

        testEditor = await User.create({
            id: 'editor-submissions',
            email: 'editor@submissions.com',
            passwordHash: '$2b$10$test.hash.for.editor',
            role: 'editor'
        });

        testViewer = await User.create({
            id: 'viewer-submissions',
            email: 'viewer@submissions.com',
            passwordHash: '$2b$10$test.hash.for.viewer',
            role: 'viewer'
        });

        // Generate JWT tokens
        adminToken = await generateTestJWT(testAdmin);
        editorToken = await generateTestJWT(testEditor);
        viewerToken = await generateTestJWT(testViewer);

        // Create test category
        const { Category } = await import('../../src/server/models/Category.js');
        testCategory = await Category.create({
            id: 'cat-submissions',
            name: 'Submissions Test Category',
            description: 'Category for submission tests',
            color: '#00FF00'
        });

        // Create test form with various field types
        const formData = {
            title: 'Submission Test Form',
            fields: [
                {
                    type: 'singleLine',
                    label: 'Full Name',
                    name: 'fullName',
                    required: true,
                    placeholder: 'Enter your full name'
                },
                {
                    type: 'email',
                    label: 'Email Address',
                    name: 'email',
                    required: true
                },
                {
                    type: 'dropdown',
                    label: 'Country',
                    name: 'country',
                    required: true,
                    options: 'USA,Canada,Mexico,UK,Germany,France'
                },
                {
                    type: 'checkboxes',
                    label: 'Interests',
                    name: 'interests',
                    required: false,
                    options: 'Technology,Sports,Music,Travel,Reading'
                },
                {
                    type: 'number',
                    label: 'Age',
                    name: 'age',
                    required: true
                },
                {
                    type: 'paragraph',
                    label: 'Comments',
                    name: 'comments',
                    required: false,
                    placeholder: 'Any additional comments...'
                },
                {
                    type: 'singleLine',
                    label: 'Sensitive Data',
                    name: 'sensitiveData',
                    required: false,
                    doNotStore: true // This field should not be stored even with consent
                }
            ],
            categoryId: testCategory.id
        };

        const createResponse = await request(app)
            .post('/api/forms')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(formData)
            .expect(200);

        testForm = createResponse.body.form;
    });

    describe('POST /public/forms/:id/submissions', () => {
        it('should submit form with valid data and store consent', async () => {
            const submissionData = {
                data: {
                    fullName: 'John Doe',
                    email: 'john.doe@example.com',
                    country: 'USA',
                    interests: 'Technology,Travel',
                    age: '28',
                    comments: 'This is a test submission with comprehensive data.',
                    sensitiveData: 'This should not be stored'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was stored in the submissions database
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson).toMatchObject({
                fullName: 'John Doe',
                email: 'john.doe@example.com',
                country: 'USA',
                interests: 'Technology,Travel',
                age: '28',
                comments: 'This is a test submission with comprehensive data.'
            });

            // Verify sensitive data was not stored (doNotStore field)
            expect(submissions[0].payloadJson).not.toHaveProperty('sensitiveData');
        });

        it('should submit form with valid data but no storage consent', async () => {
            const submissionData = {
                data: {
                    fullName: 'Jane Smith',
                    email: 'jane.smith@example.com',
                    country: 'Canada',
                    age: '32',
                    comments: 'This submission should not be stored.'
                },
                storeConsent: false
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was NOT stored in the submissions database
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(0);
        });

        it('should handle submission with missing required fields', async () => {
            const submissionData = {
                data: {
                    fullName: 'Bob Wilson',
                    // Missing required email field
                    country: 'Germany',
                    age: '25'
                },
                storeConsent: true
            };

            // Note: The current implementation doesn't validate required fields
            // This test documents the current behavior - submissions are accepted
            // even with missing required fields
            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was stored despite missing required field
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson).toMatchObject({
                fullName: 'Bob Wilson',
                country: 'Germany',
                age: '25'
            });
        });

        it('should handle submission with invalid data types', async () => {
            const submissionData = {
                data: {
                    fullName: 'Alice Johnson',
                    email: 'alice.johnson@example.com',
                    country: 'UK',
                    age: 'not-a-number', // Invalid number
                    comments: 'This should still be accepted.'
                },
                storeConsent: true
            };

            // Note: The current implementation doesn't validate data types
            // This test documents the current behavior - invalid data types are accepted
            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was stored with invalid data type
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson).toMatchObject({
                fullName: 'Alice Johnson',
                email: 'alice.johnson@example.com',
                country: 'UK',
                age: 'not-a-number',
                comments: 'This should still be accepted.'
            });
        });

        it('should handle submission with extra fields not in form definition', async () => {
            const submissionData = {
                data: {
                    fullName: 'Charlie Brown',
                    email: 'charlie.brown@example.com',
                    country: 'France',
                    age: '30',
                    extraField: 'This field is not in the form definition',
                    anotherExtraField: 'Another extra field'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was stored with extra fields
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson).toMatchObject({
                fullName: 'Charlie Brown',
                email: 'charlie.brown@example.com',
                country: 'France',
                age: '30',
                extraField: 'This field is not in the form definition',
                anotherExtraField: 'Another extra field'
            });
        });

        it('should sanitize field keys using safeKey function', async () => {
            const submissionData = {
                data: {
                    'field-with-special-chars!@#$%': 'Value with special chars',
                    'normal_field': 'Normal value',
                    'field with spaces': 'Value with spaces',
                    'field/with/slashes': 'Value with slashes'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was stored with sanitized field keys
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson).toMatchObject({
                'field_with_special_chars_____': 'Value with special chars',
                'normal_field': 'Normal value',
                'field_with_spaces': 'Value with spaces',
                'field_with_slashes': 'Value with slashes'
            });
        });

        it('should return 404 for non-existent form', async () => {
            const submissionData = {
                data: {
                    fullName: 'Test User',
                    email: 'test@example.com'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post('/public/forms/non-existent-form-id/submissions')
                .send(submissionData)
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Form not found');
        });

        it('should handle empty submission data', async () => {
            const submissionData = {
                data: {},
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify empty submission was stored
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson).toEqual({});
        });

        it('should handle malformed JSON in request body', async () => {
            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .set('Content-Type', 'application/json')
                .send('invalid json')
                .expect(400);

            // Express should handle malformed JSON and return 400
            expect(response.status).toBe(400);
        });

        it('should handle missing request body', async () => {
            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was NOT stored when there's no request body
            // (because storeConsent defaults to false when body is missing)
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(0);
        });
    });

    describe('Form Submission Data Integrity', () => {
        it('should handle multiple submissions to the same form', async () => {
            const submissions = [
                {
                    data: { fullName: 'User 1', email: 'user1@example.com', country: 'USA', age: '25' },
                    storeConsent: true
                },
                {
                    data: { fullName: 'User 2', email: 'user2@example.com', country: 'Canada', age: '30' },
                    storeConsent: true
                },
                {
                    data: { fullName: 'User 3', email: 'user3@example.com', country: 'Mexico', age: '35' },
                    storeConsent: true
                }
            ];

            for (const submission of submissions) {
                const response = await request(app)
                    .post(`/public/forms/${testForm.id}/submissions`)
                    .send(submission)
                    .expect(200);

                expect(response.body).toHaveProperty('ok', true);
            }

            // Verify all submissions were stored
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const storedSubmissions = await FormSubmission.findAll({
                where: { formId: testForm.id },
                order: [['createdAt', 'ASC']]
            });

            expect(storedSubmissions).toHaveLength(3);
            expect(storedSubmissions[0].payloadJson.fullName).toBe('User 1');
            expect(storedSubmissions[1].payloadJson.fullName).toBe('User 2');
            expect(storedSubmissions[2].payloadJson.fullName).toBe('User 3');
        });

        it('should handle submissions with special characters and unicode', async () => {
            const submissionData = {
                data: {
                    fullName: 'José María González',
                    email: 'josé.maría@example.com',
                    country: 'México',
                    comments: 'This is a comment with émojis 🎉 and special chars: ñáéíóú'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was stored with special characters
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson).toMatchObject({
                fullName: 'José María González',
                email: 'josé.maría@example.com',
                country: 'México',
                comments: 'This is a comment with émojis 🎉 and special chars: ñáéíóú'
            });
        });

        it('should handle very large submission data', async () => {
            const largeComment = 'A'.repeat(10000); // 10KB comment
            const submissionData = {
                data: {
                    fullName: 'Large Data User',
                    email: 'large@example.com',
                    country: 'USA',
                    comments: largeComment
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${testForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify large submission was stored
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson.comments).toBe(largeComment);
        });
    });

    describe('Form Submission Edge Cases', () => {
        it('should handle form with no fields', async () => {
            // Create a form with no fields
            const emptyFormData = {
                title: 'Empty Form',
                fields: [],
                categoryId: testCategory.id
            };

            const createResponse = await request(app)
                .post('/api/forms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(emptyFormData)
                .expect(200);

            const emptyForm = createResponse.body.form;

            const submissionData = {
                data: {
                    someField: 'Some value'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/public/forms/${emptyForm.id}/submissions`)
                .send(submissionData)
                .expect(200);

            expect(response.body).toHaveProperty('ok', true);

            // Verify submission was stored (no field filtering for empty form)
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: emptyForm.id }
            });

            expect(submissions).toHaveLength(1);
            expect(submissions[0].payloadJson).toMatchObject({
                someField: 'Some value'
            });
        });

        it('should handle concurrent submissions', async () => {
            const submissionPromises = [];
            const numSubmissions = 5;

            for (let i = 0; i < numSubmissions; i++) {
                const submissionData = {
                    data: {
                        fullName: `Concurrent User ${i}`,
                        email: `user${i}@example.com`,
                        country: 'USA',
                        age: (20 + i).toString()
                    },
                    storeConsent: true
                };

                submissionPromises.push(
                    request(app)
                        .post(`/public/forms/${testForm.id}/submissions`)
                        .send(submissionData)
                );
            }

            const responses = await Promise.all(submissionPromises);

            // All submissions should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('ok', true);
            });

            // Verify all submissions were stored
            const { FormSubmission } = await import('../../src/server/models/FormSubmission.js');
            const submissions = await FormSubmission.findAll({
                where: { formId: testForm.id }
            });

            expect(submissions).toHaveLength(numSubmissions);
        });
    });
});
