export default {
  // Test environment
  testEnvironment: 'node',
  
  // File extensions to consider
  moduleFileExtensions: ['js', 'json'],
  
  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Transform settings for ES modules
  transform: {},
  
  // Module name mapping (if needed)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  
  // Coverage settings
  collectCoverage: false,
  collectCoverageFrom: [
    'src/integrations/services/**/*.js',
    '!src/tests/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Handle ES modules
  extensionsToTreatAsEsm: ['.js'],
  globals: {
    'jest': {
      useESM: true
    }
  }
}; 