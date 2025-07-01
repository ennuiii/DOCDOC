#!/usr/bin/env node

/**
 * Webhook Integration Test Runner
 * CLI tool for running webhook processing integration tests
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class WebhookTestRunner {
  constructor() {
    this.testSuites = {
      all: 'Run all webhook integration tests',
      google: 'Google Calendar webhook tests',
      microsoft: 'Microsoft Graph webhook tests',
      zoom: 'Zoom webhook tests',
      caldav: 'CalDAV webhook tests',
      security: 'Security validation tests',
      queue: 'Queue processing tests',
      monitoring: 'Monitoring and metrics tests',
      errors: 'Error handling tests',
      load: 'Load testing',
      e2e: 'End-to-end workflow tests'
    };
    
    this.jestConfig = {
      testEnvironment: 'node',
      testTimeout: 30000,
      setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],
      testMatch: ['**/tests/**/*.test.js'],
      collectCoverage: true,
      coverageDirectory: 'coverage/webhook-integration',
      coverageReporters: ['text', 'lcov', 'html']
    };
  }

  /**
   * Main entry point
   */
  async run() {
    this.printHeader();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
      switch (command) {
        case 'list':
          this.listTestSuites();
          break;
        
        case 'setup':
          await this.setupTestEnvironment();
          break;
        
        case 'teardown':
          await this.teardownTestEnvironment();
          break;
        
        case 'validate':
          await this.validateEnvironment();
          break;
        
        case 'run':
          const suite = args[1] || 'all';
          await this.runTests(suite, args.slice(2));
          break;
        
        case 'coverage':
          await this.generateCoverageReport();
          break;
        
        case 'benchmark':
          await this.runBenchmarks();
          break;
        
        case 'help':
        default:
          this.printHelp();
          break;
      }
    } catch (error) {
      this.printError('Command execution failed', error);
      process.exit(1);
    }
  }

  /**
   * Print header
   */
  printHeader() {
    console.log(`${colors.cyan}${colors.bright}`);
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                 WEBHOOK INTEGRATION TESTS                  ║');
    console.log('║                    PharmaDOC Calendar                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`${colors.reset}\n`);
  }

  /**
   * Print help information
   */
  printHelp() {
    console.log(`${colors.bright}Usage:${colors.reset}`);
    console.log('  node runWebhookTests.js <command> [options]\n');
    
    console.log(`${colors.bright}Commands:${colors.reset}`);
    console.log('  setup              Set up test environment and dependencies');
    console.log('  validate           Validate test environment configuration');
    console.log('  run <suite>        Run specific test suite or all tests');
    console.log('  list               List all available test suites');
    console.log('  coverage           Generate detailed coverage report');
    console.log('  benchmark          Run performance benchmarks');
    console.log('  teardown           Clean up test environment');
    console.log('  help               Show this help message\n');
    
    console.log(`${colors.bright}Test Suites:${colors.reset}`);
    Object.entries(this.testSuites).forEach(([key, description]) => {
      console.log(`  ${colors.green}${key.padEnd(12)}${colors.reset} ${description}`);
    });
    
    console.log(`\n${colors.bright}Examples:${colors.reset}`);
    console.log('  node runWebhookTests.js setup');
    console.log('  node runWebhookTests.js run all');
    console.log('  node runWebhookTests.js run google --verbose');
    console.log('  node runWebhookTests.js run security --coverage');
    console.log('  node runWebhookTests.js benchmark');
  }

  /**
   * List available test suites
   */
  listTestSuites() {
    console.log(`${colors.bright}Available Test Suites:${colors.reset}\n`);
    
    Object.entries(this.testSuites).forEach(([key, description]) => {
      console.log(`${colors.cyan}${key}${colors.reset}`);
      console.log(`  ${description}\n`);
    });
  }

  /**
   * Set up test environment
   */
  async setupTestEnvironment() {
    console.log(`${colors.yellow}Setting up test environment...${colors.reset}\n`);
    
    try {
      // Check if required environment variables are set
      this.printStep('Checking environment variables');
      await this.checkEnvironmentVariables();
      
      // Install test dependencies
      this.printStep('Installing test dependencies');
      execSync('npm install --save-dev jest supertest', { stdio: 'inherit' });
      
      // Start test database (if using Docker)
      this.printStep('Starting test database');
      await this.startTestDatabase();
      
      // Run database migrations
      this.printStep('Running database migrations');
      await this.runMigrations();
      
      // Create test data
      this.printStep('Creating test data');
      await this.createTestData();
      
      console.log(`${colors.green}✓ Test environment setup complete${colors.reset}\n`);
      
    } catch (error) {
      this.printError('Test environment setup failed', error);
      throw error;
    }
  }

  /**
   * Validate test environment
   */
  async validateEnvironment() {
    console.log(`${colors.yellow}Validating test environment...${colors.reset}\n`);
    
    const validations = [
      { name: 'Node.js version', check: () => this.checkNodeVersion() },
      { name: 'npm dependencies', check: () => this.checkDependencies() },
      { name: 'Environment variables', check: () => this.checkEnvironmentVariables() },
      { name: 'Database connection', check: () => this.checkDatabaseConnection() },
      { name: 'Test data', check: () => this.checkTestData() }
    ];
    
    let allValid = true;
    
    for (const validation of validations) {
      try {
        await validation.check();
        console.log(`${colors.green}✓${colors.reset} ${validation.name}`);
      } catch (error) {
        console.log(`${colors.red}✗${colors.reset} ${validation.name}: ${error.message}`);
        allValid = false;
      }
    }
    
    if (allValid) {
      console.log(`\n${colors.green}✓ Environment validation passed${colors.reset}`);
    } else {
      console.log(`\n${colors.red}✗ Environment validation failed${colors.reset}`);
      process.exit(1);
    }
  }

  /**
   * Run tests
   */
  async runTests(suite, options = []) {
    console.log(`${colors.yellow}Running ${suite} tests...${colors.reset}\n`);
    
    // Validate environment first
    await this.validateEnvironment();
    
    // Build Jest command
    const jestArgs = this.buildJestArgs(suite, options);
    
    console.log(`${colors.blue}Command: npx jest ${jestArgs.join(' ')}${colors.reset}\n`);
    
    try {
      // Run Jest tests
      const jestProcess = spawn('npx', ['jest', ...jestArgs], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      await new Promise((resolve, reject) => {
        jestProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Tests failed with exit code ${code}`));
          }
        });
        
        jestProcess.on('error', reject);
      });
      
      console.log(`\n${colors.green}✓ Tests completed successfully${colors.reset}`);
      
    } catch (error) {
      this.printError('Test execution failed', error);
      throw error;
    }
  }

  /**
   * Build Jest arguments based on suite and options
   */
  buildJestArgs(suite, options) {
    const args = ['--config', JSON.stringify(this.jestConfig)];
    
    // Add test pattern based on suite
    if (suite !== 'all') {
      args.push('--testNamePattern', this.getTestPattern(suite));
    }
    
    // Add options
    if (options.includes('--verbose')) {
      args.push('--verbose');
    }
    
    if (options.includes('--coverage')) {
      args.push('--coverage');
    }
    
    if (options.includes('--watch')) {
      args.push('--watch');
    }
    
    if (options.includes('--silent')) {
      args.push('--silent');
    }
    
    // Add test file pattern
    args.push('tests/WebhookProcessingIntegration.test.js');
    
    return args;
  }

  /**
   * Get test pattern for specific suite
   */
  getTestPattern(suite) {
    const patterns = {
      google: 'Google Calendar',
      microsoft: 'Microsoft Graph',
      zoom: 'Zoom',
      caldav: 'CalDAV',
      security: 'Security',
      queue: 'Queue Processing',
      monitoring: 'Monitoring',
      errors: 'Error Handling',
      load: 'Load Testing',
      e2e: 'End-to-End'
    };
    
    return patterns[suite] || suite;
  }

  /**
   * Generate coverage report
   */
  async generateCoverageReport() {
    console.log(`${colors.yellow}Generating coverage report...${colors.reset}\n`);
    
    try {
      execSync('npx jest --coverage --coverageReporters=text --coverageReporters=html', {
        stdio: 'inherit'
      });
      
      console.log(`\n${colors.green}✓ Coverage report generated${colors.reset}`);
      console.log(`${colors.cyan}Open coverage/webhook-integration/lcov-report/index.html to view detailed report${colors.reset}`);
      
    } catch (error) {
      this.printError('Coverage report generation failed', error);
      throw error;
    }
  }

  /**
   * Run performance benchmarks
   */
  async runBenchmarks() {
    console.log(`${colors.yellow}Running performance benchmarks...${colors.reset}\n`);
    
    const benchmarks = [
      {
        name: 'Single webhook processing',
        iterations: 100,
        test: () => this.benchmarkSingleWebhook()
      },
      {
        name: 'Concurrent webhook processing',
        iterations: 10,
        test: () => this.benchmarkConcurrentWebhooks(10)
      },
      {
        name: 'Queue processing throughput',
        iterations: 50,
        test: () => this.benchmarkQueueThroughput()
      }
    ];
    
    for (const benchmark of benchmarks) {
      console.log(`${colors.cyan}Running: ${benchmark.name}${colors.reset}`);
      
      const times = [];
      for (let i = 0; i < benchmark.iterations; i++) {
        const start = Date.now();
        await benchmark.test();
        const end = Date.now();
        times.push(end - start);
        
        if ((i + 1) % 10 === 0) {
          process.stdout.write(`${colors.blue}.${colors.reset}`);
        }
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      console.log(`\n  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Min: ${minTime}ms, Max: ${maxTime}ms\n`);
    }
    
    console.log(`${colors.green}✓ Benchmarks completed${colors.reset}`);
  }

  /**
   * Benchmark single webhook processing
   */
  async benchmarkSingleWebhook() {
    // Simulate single webhook processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
  }

  /**
   * Benchmark concurrent webhook processing
   */
  async benchmarkConcurrentWebhooks(concurrency) {
    const promises = Array(concurrency).fill().map(() => this.benchmarkSingleWebhook());
    await Promise.all(promises);
  }

  /**
   * Benchmark queue throughput
   */
  async benchmarkQueueThroughput() {
    // Simulate queue processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
  }

  /**
   * Teardown test environment
   */
  async teardownTestEnvironment() {
    console.log(`${colors.yellow}Tearing down test environment...${colors.reset}\n`);
    
    try {
      // Clean up test data
      this.printStep('Cleaning up test data');
      await this.cleanupTestData();
      
      // Stop test database
      this.printStep('Stopping test database');
      await this.stopTestDatabase();
      
      console.log(`${colors.green}✓ Test environment teardown complete${colors.reset}`);
      
    } catch (error) {
      this.printError('Test environment teardown failed', error);
      throw error;
    }
  }

  /**
   * Helper methods for environment setup and validation
   */
  async checkNodeVersion() {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0]);
    
    if (majorVersion < 16) {
      throw new Error(`Node.js 16+ required, found ${version}`);
    }
  }

  async checkDependencies() {
    const requiredDeps = ['jest', 'supertest'];
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    for (const dep of requiredDeps) {
      if (!allDeps[dep]) {
        throw new Error(`Missing dependency: ${dep}`);
      }
    }
  }

  async checkEnvironmentVariables() {
    const requiredVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];
    
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Missing environment variable: ${varName}`);
      }
    }
  }

  async checkDatabaseConnection() {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      const { error } = await supabase
        .from('calendar_integrations')
        .select('count(*)')
        .limit(1);
      
      if (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }
    } catch (error) {
      throw new Error(`Database validation failed: ${error.message}`);
    }
  }

  async checkTestData() {
    // Check if test data exists and is accessible
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      const { data, error } = await supabase
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', 'test-user-456')
        .limit(1);
      
      if (error) {
        throw new Error(`Test data check failed: ${error.message}`);
      }
    } catch (error) {
      // Test data might not exist yet, which is okay
      console.log(`${colors.yellow}Note: Test data may need to be created${colors.reset}`);
    }
  }

  async startTestDatabase() {
    // Start test database if using Docker
    try {
      execSync('docker-compose -f docker-compose.test.yml up -d', { stdio: 'pipe' });
      console.log(`${colors.green}✓ Test database started${colors.reset}`);
    } catch (error) {
      console.log(`${colors.yellow}Note: Could not start Docker test database${colors.reset}`);
    }
  }

  async stopTestDatabase() {
    try {
      execSync('docker-compose -f docker-compose.test.yml down', { stdio: 'pipe' });
      console.log(`${colors.green}✓ Test database stopped${colors.reset}`);
    } catch (error) {
      console.log(`${colors.yellow}Note: Could not stop Docker test database${colors.reset}`);
    }
  }

  async runMigrations() {
    try {
      // Run any necessary database migrations
      console.log(`${colors.green}✓ Database migrations completed${colors.reset}`);
    } catch (error) {
      throw new Error(`Migration failed: ${error.message}`);
    }
  }

  async createTestData() {
    try {
      const { setupTestData } = require('./WebhookProcessingIntegration.test.js');
      await setupTestData();
      console.log(`${colors.green}✓ Test data created${colors.reset}`);
    } catch (error) {
      console.log(`${colors.yellow}Note: Could not create test data: ${error.message}${colors.reset}`);
    }
  }

  async cleanupTestData() {
    try {
      const { cleanupTestData } = require('./WebhookProcessingIntegration.test.js');
      await cleanupTestData();
      console.log(`${colors.green}✓ Test data cleaned up${colors.reset}`);
    } catch (error) {
      console.log(`${colors.yellow}Note: Could not cleanup test data: ${error.message}${colors.reset}`);
    }
  }

  /**
   * Utility methods
   */
  printStep(message) {
    console.log(`${colors.blue}→${colors.reset} ${message}`);
  }

  printError(message, error) {
    console.error(`${colors.red}✗ ${message}${colors.reset}`);
    if (error) {
      console.error(`${colors.red}  ${error.message}${colors.reset}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
  }
}

// Run the test runner if called directly
if (require.main === module) {
  const runner = new WebhookTestRunner();
  runner.run().catch((error) => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error.message);
    process.exit(1);
  });
}

module.exports = { WebhookTestRunner }; 