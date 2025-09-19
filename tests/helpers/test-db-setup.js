// tests/helpers/test-db-setup.js
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { User } from '../../src/server/models/User.js';
import { UserLockout } from '../../src/server/models/UserLockout.js';
import { RefreshToken } from '../../src/server/models/RefreshToken.js';
import { Form } from '../../src/server/models/Form.js';
import { FormField } from '../../src/server/models/FormField.js';
import { Category } from '../../src/server/models/Category.js';
import { Template } from '../../src/server/models/Template.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { FormSubmission } from '../../src/server/models/FormSubmission.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');

// Create unique test database files for each test run
const testId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
const TEST_DB_FILE = path.join(ROOT, 'data', `test-${testId}.sqlite`);
const TEST_SUBMISSIONS_DB_FILE = path.join(ROOT, 'data', `test-submissions-${testId}.sqlite`);

let testSequelize = null;
let testSubmissionsSequelize = null;

export async function setupTestDatabase() {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.DB_FILE = TEST_DB_FILE;
    process.env.SUBMISSIONS_DB_FILE = TEST_SUBMISSIONS_DB_FILE;

    // Create fresh database connections for tests
    testSequelize = new Sequelize({
        dialect: 'sqlite',
        storage: TEST_DB_FILE,
        logging: false,
    });

    testSubmissionsSequelize = new Sequelize({
        dialect: 'sqlite',
        storage: TEST_SUBMISSIONS_DB_FILE,
        logging: false,
    });

    // Configure SQLite for better test performance
    await testSequelize.query('PRAGMA foreign_keys = OFF');
    await testSequelize.query('PRAGMA journal_mode = WAL');
    await testSequelize.query('PRAGMA synchronous = NORMAL');

    await testSubmissionsSequelize.query('PRAGMA foreign_keys = OFF');
    await testSubmissionsSequelize.query('PRAGMA journal_mode = WAL');
    await testSubmissionsSequelize.query('PRAGMA synchronous = NORMAL');

    // Create test models with our test database connections
    const TestUser = testSequelize.define('User', {
        id: { type: 'STRING(64)', primaryKey: true },
        email: { type: 'STRING(255)', allowNull: false, unique: true },
        username: { type: 'STRING(64)', allowNull: true, unique: false },
        passwordHash: { type: 'STRING(255)', allowNull: false },
        role: { type: 'STRING(32)', allowNull: false, defaultValue: 'editor' }
    }, {
        tableName: 'users',
        timestamps: true
    });

    const TestUserLockout = testSequelize.define('UserLockout', {
        id: { type: 'STRING(64)', primaryKey: true },
        userId: { type: 'STRING(64)', allowNull: true },
        email: { type: 'STRING(255)', allowNull: false },
        failedAttempts: { type: 'INTEGER', allowNull: false, defaultValue: 0 },
        lockedUntil: { type: 'DATE', allowNull: true },
        lastAttempt: { type: 'DATE', allowNull: true }
    }, {
        tableName: 'user_lockouts',
        timestamps: true
    });

    const TestRefreshToken = testSequelize.define('RefreshToken', {
        id: { type: 'STRING(64)', primaryKey: true },
        userId: { type: 'STRING(64)', allowNull: false },
        token: { type: 'TEXT', allowNull: false },
        expiresAt: { type: 'DATE', allowNull: false }
    }, {
        tableName: 'refresh_tokens',
        timestamps: true
    });

    // Sync all models
    await testSequelize.sync({ force: true });
    await testSubmissionsSequelize.sync({ force: true });

    // Re-enable foreign keys
    await testSequelize.query('PRAGMA foreign_keys = ON');
    await testSubmissionsSequelize.query('PRAGMA foreign_keys = ON');

    // Store models globally for tests to use
    global.testSequelize = testSequelize;
    global.testSubmissionsSequelize = testSubmissionsSequelize;
    global.TestUser = TestUser;
    global.TestUserLockout = TestUserLockout;
    global.TestRefreshToken = TestRefreshToken;

    // Override the main database connection for tests
    // This ensures auth routes use our test database
    const { sequelize } = await import('../../src/server/db.js');

    // Replace the sequelize instance with our test instance
    Object.setPrototypeOf(sequelize, testSequelize);
    Object.assign(sequelize, testSequelize);

    // Update the models to use our test database
    const { User } = await import('../../src/server/models/User.js');
    const { RefreshToken } = await import('../../src/server/models/RefreshToken.js');
    const { UserLockout } = await import('../../src/server/models/UserLockout.js');

    // Replace the sequelize instance in the models
    User.sequelize = testSequelize;
    RefreshToken.sequelize = testSequelize;
    UserLockout.sequelize = testSequelize;

    return { testSequelize, testSubmissionsSequelize, TestUser, TestUserLockout, TestRefreshToken };
}

export async function teardownTestDatabase() {
    try {
        if (testSequelize) {
            await testSequelize.close();
            testSequelize = null;
        }
        if (testSubmissionsSequelize) {
            await testSubmissionsSequelize.close();
            testSubmissionsSequelize = null;
        }

        // Clean up test database files
        if (fs.existsSync(TEST_DB_FILE)) {
            fs.unlinkSync(TEST_DB_FILE);
        }
        if (fs.existsSync(TEST_SUBMISSIONS_DB_FILE)) {
            fs.unlinkSync(TEST_SUBMISSIONS_DB_FILE);
        }

        // Clear global references
        global.testSequelize = null;
        global.testSubmissionsSequelize = null;
        global.TestUser = null;
        global.TestUserLockout = null;
        global.TestRefreshToken = null;
    } catch (error) {
        console.warn('Error during test database teardown:', error.message);
    }
}

export async function clearTestData() {
    if (!testSequelize) return;

    try {
        // Temporarily disable foreign keys for cleanup
        await testSequelize.query('PRAGMA foreign_keys = OFF');

        // Clear all tables (only clear tables that exist)
        const tables = ['refresh_tokens', 'user_lockouts', 'users'];
        for (const table of tables) {
            try {
                await testSequelize.query(`DELETE FROM ${table}`);
            } catch (error) {
                // Table doesn't exist, skip
            }
        }

        // Reset auto-increment sequences
        await testSequelize.query('DELETE FROM sqlite_sequence');

        // Re-enable foreign keys
        await testSequelize.query('PRAGMA foreign_keys = ON');
    } catch (error) {
        console.warn('Error clearing test data:', error.message);
    }
}

export async function createTestUser(userData = {}) {
    const defaultData = {
        id: 'u-test-' + crypto.randomBytes(6).toString('hex'),
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'editor'
    };

    const user = await global.TestUser.create({ ...defaultData, ...userData });
    return user;
}

export async function createTestAdmin(userData = {}) {
    const defaultData = {
        id: 'u-admin-' + crypto.randomBytes(6).toString('hex'),
        email: 'admin@example.com',
        passwordHash: await bcrypt.hash('admin123', 10),
        role: 'admin'
    };

    const user = await global.TestUser.create({ ...defaultData, ...userData });
    return user;
}

export async function createTestViewer(userData = {}) {
    const defaultData = {
        id: 'u-viewer-' + crypto.randomBytes(6).toString('hex'),
        email: 'viewer@example.com',
        passwordHash: await bcrypt.hash('viewer123', 10),
        role: 'viewer'
    };

    const user = await global.TestUser.create({ ...defaultData, ...userData });
    return user;
}

export async function createTestUserLockout(lockoutData = {}) {
    const defaultData = {
        id: 'ul-' + crypto.randomBytes(6).toString('hex'),
        email: 'test@example.com',
        failedAttempts: 0,
        lockedUntil: null
    };

    const lockout = await global.TestUserLockout.create({ ...defaultData, ...lockoutData });
    return lockout;
}

export async function generateTestJWT(user) {
    const jwt = await import('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'test_jwt_secret_key';

    return jwt.default.sign(
        {
            sub: user.id,
            role: user.role,
            email: user.email
        },
        secret,
        { expiresIn: '15m' }
    );
}

// Export the test database connections for use in tests
export { testSequelize, testSubmissionsSequelize };
