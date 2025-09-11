// src/server/config/env.js
// Environment configuration with proper validation and defaults

import { config } from 'dotenv';

// Load environment variables
config();

// Validate required environment variables
const requiredEnvVars = [
  'SESSION_SECRET',
  'JWT_SECRET'
];

// Check if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Validate required environment variables in production
if (isProduction) {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

// Environment configuration with secure defaults
export const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5173', 10),
  
  // Database
  DB_FILE: process.env.DB_FILE,
  
  // Security
  SESSION_SECRET: process.env.SESSION_SECRET || (isProduction ? null : 'dev_session_secret_change_in_production'),
  JWT_SECRET: process.env.JWT_SECRET || (isProduction ? null : 'dev_jwt_secret_change_in_production'),
  JWT_TTL_SEC: parseInt(process.env.JWT_TTL_SEC || '900', 10), // 15 minutes
  REFRESH_TTL_SEC: parseInt(process.env.REFRESH_TTL_SEC || '1209600', 10), // 14 days
  
  // Features
  AUTH_ENABLED: process.env.AUTH_ENABLED === '1',
  CSP_ENABLED: process.env.CSP_ENABLED === '1',
  
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  CSP_CONNECT_SRC: process.env.CSP_CONNECT_SRC,
  
  // Admin
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@example.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || (isProduction ? null : 'admin123'),
  
  // Security validation
  validate() {
    if (isProduction) {
      if (!this.SESSION_SECRET || this.SESSION_SECRET === 'dev_session_secret_change_in_production') {
        throw new Error('SESSION_SECRET must be set in production');
      }
      if (!this.JWT_SECRET || this.JWT_SECRET === 'dev_jwt_secret_change_in_production') {
        throw new Error('JWT_SECRET must be set in production');
      }
      if (!this.ADMIN_PASSWORD || this.ADMIN_PASSWORD === 'admin123') {
        throw new Error('ADMIN_PASSWORD must be changed in production');
      }
    }
  }
};

// Validate configuration on import
env.validate();
