// src/utils/env.ts - Enhanced environment configuration with production safety
import 'dotenv/config';

// Environment type validation
type Environment = 'development' | 'production' | 'staging';

// Configuration interface
interface Config {
  // API Configuration
  BASE: string;
  APIKEY: string;
  AGENCY_UID: string;
  THROTTLE_MS: number;
  
  // Server Configuration
  PORT: number;
  NODE_ENV: Environment;
  
  // Security Configuration
  ALLOWED_ORIGINS: string[];
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW_MS: number;
  
  // Optional Authentication
  JWT_SECRET?: string;
  API_KEY_PREFIX?: string;
  
  // Database (if you add one later)
  DATABASE_URL?: string;
  
  // Logging
  LOG_LEVEL: string;
  
  // Feature flags
  ENABLE_GRAPHQL: boolean;
  ENABLE_DESCRIPTIONS_API: boolean;
}

// Validate environment
function validateEnvironment(): Environment {
  const env = process.env.NODE_ENV?.toLowerCase();
  if (env === 'production' || env === 'staging' || env === 'development') {
    return env as Environment;
  }
  console.warn(`Unknown NODE_ENV: ${env}, defaulting to 'development'`);
  return 'development';
}

// Parse allowed origins from environment
function parseAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS;
  if (!origins) {
    return validateEnvironment() === 'production' 
      ? [] // No origins allowed in production by default - must be explicitly set
      : ['http://localhost:3000', 'http://127.0.0.1:3000']; // Dev defaults
  }
  
  return origins.split(',').map(origin => origin.trim());
}

// Create configuration object
const config: Config = {
  // API Configuration (Required)
  BASE: process.env.HOSTFULLY_BASE!,
  APIKEY: process.env.HOSTFULLY_APIKEY!,
  AGENCY_UID: process.env.AGENCY_UID!,
  THROTTLE_MS: Number(process.env.THROTTLE_MS) || 1000,
  
  // Server Configuration
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: validateEnvironment(),
  
  // Security Configuration
  ALLOWED_ORIGINS: parseAllowedOrigins(),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || (validateEnvironment() === 'production' ? 100 : 1000),
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || (15 * 60 * 1000), // 15 minutes
  
  // Optional Authentication
  JWT_SECRET: process.env.JWT_SECRET,
  API_KEY_PREFIX: process.env.API_KEY_PREFIX || 'hf_',
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || (validateEnvironment() === 'production' ? 'info' : 'debug'),
  
  // Feature flags
  ENABLE_GRAPHQL: process.env.ENABLE_GRAPHQL?.toLowerCase() === 'true' || false,
  ENABLE_DESCRIPTIONS_API: process.env.ENABLE_DESCRIPTIONS_API?.toLowerCase() !== 'false', // Default true
};

// Validation function for required environment variables
function validateRequiredEnvVars(): void {
  const required = ['BASE', 'APIKEY', 'AGENCY_UID'] as const;
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    const missingVars = missing.map(key => {
      // Map back to environment variable names
      const envMap = {
        BASE: 'HOSTFULLY_BASE',
        APIKEY: 'HOSTFULLY_APIKEY',
        AGENCY_UID: 'AGENCY_UID'
      };
      return envMap[key];
    });
    
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Production security validation
function validateProductionSecurity(): void {
  if (config.NODE_ENV === 'production') {
    const warnings: string[] = [];
    
    // Check for weak API configuration
    if (config.APIKEY.length < 32) {
      warnings.push('API key appears to be too short for production use');
    }
    
    // Check CORS configuration
    if (config.ALLOWED_ORIGINS.length === 0) {
      throw new Error('ALLOWED_ORIGINS must be set in production');
    }
    
    if (config.ALLOWED_ORIGINS.includes('*')) {
      throw new Error('Wildcard CORS origins not allowed in production');
    }
    
    // Check for localhost in production origins
    const hasLocalhost = config.ALLOWED_ORIGINS.some(origin => 
      origin.includes('localhost') || origin.includes('127.0.0.1')
    );
    if (hasLocalhost) {
      warnings.push('Production CORS includes localhost - this may not be intended');
    }
    
    // Check rate limiting
    if (config.RATE_LIMIT_MAX > 1000) {
      warnings.push('Rate limit may be too high for production');
    }
    
    // Check JWT secret
    if (!config.JWT_SECRET) {
      warnings.push('No JWT_SECRET set - authentication features will be disabled');
    }
    
    if (warnings.length > 0) {
      console.warn('Production Security Warnings:');
      warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
  }
}

// Runtime configuration validation
function validateConfiguration(): void {
  try {
    validateRequiredEnvVars();
    validateProductionSecurity();
    
    console.log(`Configuration loaded for ${config.NODE_ENV} environment`);
    if (config.NODE_ENV === 'development') {
      console.log(`CORS Origins: ${config.ALLOWED_ORIGINS.join(', ')}`);
      console.log(`Rate Limit: ${config.RATE_LIMIT_MAX} requests per ${config.RATE_LIMIT_WINDOW_MS / 1000}s`);
    }
    
  } catch (error) {
    console.error('Configuration Error:', error.message);
    process.exit(1);
  }
}

// Additional helper functions
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isProduction = () => config.NODE_ENV === 'production';
export const isStaging = () => config.NODE_ENV === 'staging';

// Create safe config for client-side (removes sensitive data)
export function getClientConfig() {
  return {
    NODE_ENV: config.NODE_ENV,
    ENABLE_DESCRIPTIONS_API: config.ENABLE_DESCRIPTIONS_API,
    // Don't include any API keys, secrets, or server details
  };
}

// Sanitize config for logging (removes sensitive values)
export function getSanitizedConfig() {
  return {
    ...config,
    APIKEY: config.APIKEY ? `${config.APIKEY.substring(0, 8)}...` : 'NOT_SET',
    JWT_SECRET: config.JWT_SECRET ? '[HIDDEN]' : 'NOT_SET',
  };
}

// Run validation on import
validateConfiguration();

// Export the main configuration as ENV for backwards compatibility
export const ENV = config;

// Export individual config sections for cleaner imports
export const serverConfig = {
  PORT: config.PORT,
  NODE_ENV: config.NODE_ENV,
  LOG_LEVEL: config.LOG_LEVEL,
};

export const securityConfig = {
  ALLOWED_ORIGINS: config.ALLOWED_ORIGINS,
  RATE_LIMIT_MAX: config.RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS: config.RATE_LIMIT_WINDOW_MS,
  JWT_SECRET: config.JWT_SECRET,
};

export const apiConfig = {
  BASE: config.BASE,
  APIKEY: config.APIKEY,
  AGENCY_UID: config.AGENCY_UID,
  THROTTLE_MS: config.THROTTLE_MS,
};

export const featureFlags = {
  ENABLE_GRAPHQL: config.ENABLE_GRAPHQL,
  ENABLE_DESCRIPTIONS_API: config.ENABLE_DESCRIPTIONS_API,
};

export default config;