#!/usr/bin/env node
// tests/run-form-crud-tests.js
// Test runner for Form CRUD Operations

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Running Form CRUD Operations Tests...\n');

// Test files to run
const testFiles = [
    'tests/routes/forms-crud.test.js',
    'tests/routes/forms-crud-update-delete.test.js'
];

// Run each test file
async function runTests() {
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    for (const testFile of testFiles) {
        console.log(`📋 Running ${testFile}...`);

        try {
            const result = await runTestFile(testFile);
            totalTests += result.total;
            passedTests += result.passed;
            failedTests += result.failed;

            if (result.failed > 0) {
                console.log(`❌ ${testFile} - ${result.failed} failed, ${result.passed} passed\n`);
            } else {
                console.log(`✅ ${testFile} - All ${result.passed} tests passed\n`);
            }
        } catch (error) {
            console.error(`💥 Error running ${testFile}:`, error.message);
            failedTests++;
        }
    }

    // Summary
    console.log('📊 Test Summary:');
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${failedTests}`);
    console.log(`   Success Rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);

    if (failedTests === 0) {
        console.log('\n🎉 All Form CRUD tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed. Please review the output above.');
        process.exit(1);
    }
}

function runTestFile(testFile) {
    return new Promise((resolve, reject) => {
        const jest = spawn('npx', ['jest', testFile, '--verbose', '--no-coverage'], {
            stdio: 'pipe',
            cwd: path.join(__dirname, '..')
        });

        let output = '';
        let errorOutput = '';

        jest.stdout.on('data', (data) => {
            output += data.toString();
        });

        jest.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        jest.on('close', (code) => {
            // Parse Jest output to extract test results
            const testResults = parseJestOutput(output);

            if (code === 0) {
                resolve(testResults);
            } else {
                console.error('Jest Error Output:', errorOutput);
                reject(new Error(`Jest exited with code ${code}`));
            }
        });

        jest.on('error', (error) => {
            reject(error);
        });
    });
}

function parseJestOutput(output) {
    // Simple parsing of Jest output
    const lines = output.split('\n');
    let total = 0;
    let passed = 0;
    let failed = 0;

    for (const line of lines) {
        if (line.includes('Tests:')) {
            const match = line.match(/(\d+) total/);
            if (match) total = parseInt(match[1]);
        }
        if (line.includes('✓')) {
            passed++;
        }
        if (line.includes('✗') || line.includes('×')) {
            failed++;
        }
    }

    return { total, passed, failed };
}

// Run the tests
runTests().catch((error) => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
});
