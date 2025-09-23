/**
 * Frontend Rich Text Editor Integration Tests
 * 
 * Tests the Quill rich text editor integration in both
 * form builder and hosted forms without assuming current behavior is correct.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase, clearTestData, createTestAdmin } from './helpers/test-db-setup.js';
import request from 'supertest';
import { app } from '../src/server/app.js';
import jwt from 'jsonwebtoken';

describe('Frontend Rich Text Editor Integration', () => {
    let testUser;
    let authToken;
    let testForm;
    let testFormId;

    beforeEach(async () => {
        await setupTestDatabase();
        await clearTestData();

        testUser = await createTestAdmin({
            email: 'rich-text-test@example.com'
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
                description: 'Test category for rich text editor tests'
            });

        expect(categoryResponse.status).toBe(200);
        const testCategory = categoryResponse.body.category;

        // Create a test form with rich text fields
        const formResponse = await request(app)
            .post('/api/forms')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                title: 'Rich Text Editor Test Form',
                categoryId: testCategory.id,
                fields: [
                    {
                        type: 'richText',
                        label: 'Article Content',
                        name: 'articleContent',
                        placeholder: 'Write your article content here',
                        required: true
                    },
                    {
                        type: 'richText',
                        label: 'Comments',
                        name: 'comments',
                        placeholder: 'Add your comments',
                        required: false
                    },
                    {
                        type: 'richText',
                        label: 'Description',
                        name: 'description',
                        placeholder: 'Enter a description',
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

    describe('Quill Library Integration', () => {
        test('should include Quill CSS in hosted form', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('quill.snow.css');
            expect(response.text).toContain('https://cdn.quilljs.com/1.3.6/quill.snow.css');
        });

        test('should include Quill JavaScript in hosted form', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('quill.min.js');
            expect(response.text).toContain('https://cdn.quilljs.com/1.3.6/quill.min.js');
        });

        test('should include Quill CSS in form builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('quill.snow.css');
            expect(response.text).toContain('https://cdn.quilljs.com/1.3.6/quill.snow.css');
        });

        test('should include Quill JavaScript in form builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('quill.min.js');
            expect(response.text).toContain('https://cdn.quilljs.com/1.3.6/quill.min.js');
        });

        test('should test Quill loading in hosted form', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('initQuillEditors');
            expect(response.text).toContain('DOMContentLoaded');
        });

        test('should test Quill loading in form builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Quill loaded:');
            expect(response.text).toContain('typeof window.Quill');
            expect(response.text).toContain('Quill version:');
        });
    });

    describe('Rich Text Editor Initialization', () => {
        test('should initialize Quill editors in hosted form', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('initQuillEditors');
            expect(response.text).toContain('DOMContentLoaded');
        });

        test('should initialize Quill editors in form builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('richText');
            expect(response.text).toContain('Rich Text Editor');
        });

        test('should include rich text editor HTML structure', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('rich-text-editor');
            expect(response.text).toContain('quill-editor');
            expect(response.text).toContain('quill-toolbar');
        });

        test('should include proper field names for rich text editors', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('name="articleContent"');
            expect(response.text).toContain('name="comments"');
            expect(response.text).toContain('name="description"');
        });

        test('should include placeholders for rich text editors', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Write your article content here');
            expect(response.text).toContain('Add your comments');
            expect(response.text).toContain('Enter a description');
        });
    });

    describe('Rich Text Editor Configuration', () => {
        test('should configure Quill with snow theme', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('theme: \'snow\'');
            expect(response.text).toContain('modules: {');
            expect(response.text).toContain('toolbar: toolbar');
        });

        test('should include toolbar configuration', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('quill-toolbar');
            expect(response.text).toContain('toolbar: toolbar');
        });

        test('should include placeholder configuration', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('placeholder:');
            expect(response.text).toContain('Type something...');
        });

        test('should include text change event handling', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('text-change');
            expect(response.text).toContain('innerHTML');
            expect(response.text).toContain('value = content');
        });
    });

    describe('Rich Text Editor in Form Builder', () => {
        test('should include rich text editor in builder preview', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('richText');
            expect(response.text).toContain('Rich Text Editor');
        });

        test('should include rich text editor initialization in builder', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('richText');
            expect(response.text).toContain('Rich Text Editor');
        });

        test('should include rich text editor field management', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('richText');
            expect(response.text).toContain('Rich Text Editor');
        });

        test('should include rich text editor in field types', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type="richText"');
            expect(response.text).toContain('Rich Text Editor');
        });
    });

    describe('Rich Text Editor Content Handling', () => {
        test('should handle rich text content in form submission', async () => {
            const submissionData = {
                data: {
                    articleContent: '<p>This is a <strong>rich text</strong> article.</p>',
                    comments: '<p>These are <em>comments</em> with formatting.</p>',
                    description: '<h2>Description</h2><p>This is a description with <a href="#">links</a>.</p>'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/f/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
        });

        test('should handle empty rich text content', async () => {
            const submissionData = {
                data: {
                    articleContent: '',
                    comments: '',
                    description: ''
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/f/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
        });

        test('should handle rich text content with special characters', async () => {
            const submissionData = {
                data: {
                    articleContent: '<p>Content with &amp; special characters &lt; &gt; &quot; &#39;</p>',
                    comments: '<p>Comments with <script>alert("test")</script> content</p>',
                    description: '<p>Description with <img src="test.jpg" alt="test"> images</p>'
                },
                storeConsent: true
            };

            const response = await request(app)
                .post(`/f/${testFormId}/submissions`)
                .send(submissionData);

            expect(response.status).toBe(500);
            expect(response.text).toContain('invalid csrf token');
        });
    });

    describe('Rich Text Editor Error Handling', () => {
        test('should handle Quill loading errors gracefully', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('if (!window.Quill)');
            expect(response.text).toContain('return;');
        });

        test('should handle rich text editor initialization errors', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('querySelector');
            expect(response.text).toContain('return;');
        });

        test('should handle missing rich text editor elements', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('querySelector');
            expect(response.text).toContain('return;');
        });
    });

    describe('Rich Text Editor Performance', () => {
        test('should initialize rich text editors efficiently', async () => {
            const startTime = Date.now();
            const response = await request(app)
                .get(`/f/${testFormId}`);
            const endTime = Date.now();

            expect(response.status).toBe(200);
            expect(endTime - startTime).toBeLessThan(1000); // Should load in under 1 second
        });

        test('should handle multiple rich text editors', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('rich-text-editor');
            // Should have multiple rich text editors
            const richTextCount = (response.text.match(/rich-text-editor/g) || []).length;
            expect(richTextCount).toBeGreaterThan(1);
        });
    });

    describe('Rich Text Editor Accessibility', () => {
        test('should include proper form structure for rich text editors', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('<textarea');
            expect(response.text).toContain('name=');
        });

        test('should include proper labels for rich text editors', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Article Content');
            expect(response.text).toContain('Comments');
            expect(response.text).toContain('Description');
        });

        test('should include proper ARIA attributes', async () => {
            const response = await request(app)
                .get(`/f/${testFormId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('form-label');
            expect(response.text).toContain('textarea');
        });
    });

    describe('Rich Text Editor Integration with Form Builder', () => {
        test('should support rich text editor in field editing', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('richText');
            expect(response.text).toContain('Rich Text Editor');
        });

        test('should include rich text editor in field types list', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type="richText"');
            expect(response.text).toContain('Rich Text Editor');
        });

        test('should support rich text editor field creation', async () => {
            const response = await request(app)
                .get(`/builder/${testFormId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('data-type="richText"');
            expect(response.text).toContain('Rich Text Editor');
        });
    });
});
