// src/server/services/password.service.js
import crypto from 'crypto';
import { UserLockout } from '../models/UserLockout.js';

// Password policy configuration
const PASSWORD_POLICY = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxFailedAttempts: 5,
    lockoutDuration: 30 * 60 * 1000, // 30 minutes in milliseconds
    passwordHistory: 5 // Remember last 5 passwords
};

// Special characters allowed in passwords
const SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

/**
 * Validate password against policy
 */
export function validatePassword(password) {
    const errors = [];

    if (!password || typeof password !== 'string') {
        errors.push('Password is required');
        return { valid: false, errors };
    }

    const pwd = password.trim();

    if (pwd.length < PASSWORD_POLICY.minLength) {
        errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters long`);
    }

    if (pwd.length > PASSWORD_POLICY.maxLength) {
        errors.push(`Password must be no more than ${PASSWORD_POLICY.maxLength} characters long`);
    }

    if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(pwd)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(pwd)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (PASSWORD_POLICY.requireNumbers && !/\d/.test(pwd)) {
        errors.push('Password must contain at least one number');
    }

    if (PASSWORD_POLICY.requireSpecialChars && !new RegExp(`[${SPECIAL_CHARS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(pwd)) {
        errors.push(`Password must contain at least one special character (${SPECIAL_CHARS})`);
    }

    // Removed hidden requirements for better user experience

    return {
        valid: errors.length === 0,
        errors,
        policy: PASSWORD_POLICY
    };
}

/**
 * Check if user is locked out
 */
export async function isUserLockedOut(email) {
    try {
        const lockout = await UserLockout.findOne({ where: { email: email.toLowerCase() } });

        if (!lockout) return { locked: false };

        // Check if lockout has expired
        if (lockout.lockedUntil && new Date() > lockout.lockedUntil) {
            // Clear expired lockout
            await lockout.destroy();
            return { locked: false };
        }

        return {
            locked: !!lockout.lockedUntil,
            lockedUntil: lockout.lockedUntil,
            failedAttempts: lockout.failedAttempts
        };
    } catch (error) {
        console.error('Error checking user lockout:', error);
        return { locked: false };
    }
}

/**
 * Record failed login attempt
 */
export async function recordFailedAttempt(email, userId = null) {
    try {
        const normalizedEmail = email.toLowerCase();

        let lockout = await UserLockout.findOne({ where: { email: normalizedEmail } });

        if (!lockout) {
            lockout = await UserLockout.create({
                id: 'lockout-' + crypto.randomBytes(8).toString('hex'),
                userId: userId,
                email: normalizedEmail,
                failedAttempts: 1,
                lastAttempt: new Date()
            });
        } else {
            lockout.failedAttempts += 1;
            lockout.lastAttempt = new Date();

            // Lock account if max attempts reached
            if (lockout.failedAttempts >= PASSWORD_POLICY.maxFailedAttempts) {
                lockout.lockedUntil = new Date(Date.now() + PASSWORD_POLICY.lockoutDuration);
            }

            await lockout.save();
        }

        return {
            failedAttempts: lockout.failedAttempts,
            locked: !!lockout.lockedUntil,
            lockedUntil: lockout.lockedUntil
        };
    } catch (error) {
        console.error('Error recording failed attempt:', error);
        return { failedAttempts: 0, locked: false };
    }
}

/**
 * Clear failed attempts on successful login
 */
export async function clearFailedAttempts(email) {
    try {
        await UserLockout.destroy({ where: { email: email.toLowerCase() } });
    } catch (error) {
        console.error('Error clearing failed attempts:', error);
    }
}

/**
 * Get password policy for frontend display
 */
export function getPasswordPolicy() {
    return {
        minLength: PASSWORD_POLICY.minLength,
        maxLength: PASSWORD_POLICY.maxLength,
        requireUppercase: PASSWORD_POLICY.requireUppercase,
        requireLowercase: PASSWORD_POLICY.requireLowercase,
        requireNumbers: PASSWORD_POLICY.requireNumbers,
        requireSpecialChars: PASSWORD_POLICY.requireSpecialChars,
        specialChars: SPECIAL_CHARS,
        maxFailedAttempts: PASSWORD_POLICY.maxFailedAttempts,
        lockoutDurationMinutes: PASSWORD_POLICY.lockoutDuration / (60 * 1000)
    };
}
