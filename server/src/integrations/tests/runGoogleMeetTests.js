#!/usr/bin/env node

/**
 * Google Meet Integration Test Runner
 * Dedicated runner for Google Meet functionality tests in PharmaDOC
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for colored output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Print colored output to console
 */
function printColor(text, color = 'white') {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

/**
 * Print section header with decorative border
 */
function printHeader(title) {
  const border = '='.repeat(60);
  console.log();
  printColor(border, 'cyan');
  printColor(`  ${title.toUpperCase()}`, 'cyan');
  printColor(border, 'cyan');
  console.log();
}

/**
 * Print subsection header
 */
function printSubHeader(title) {
  console.log();
  printColor(`--- ${title} ---`, 'yellow');
}

/**
 * Validate test environment and dependencies
 */
function validateEnvironment() {
  printHeader('Environment Validation');

  const checks = [
    {
      name: 'Node.js version',
      check: () => {
        const version = process.version;
        const majorVersion = parseInt(version.slice(1).split('.')[0]);
        return majorVersion >= 16;
      },
      success: `Node.js ${process.version} ✓`,
      failure: 'Node.js 16+ required ✗'
    },
    {
      name: 'Jest availability',
      check: () => {
        try {
          execSync('npx jest --version', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      success: 'Jest available ✓',
      failure: 'Jest not found ✗'
    },
    {
      name: 'Test file exists',
      check: () => {
        const testFile = path.join(__dirname, 'GoogleMeetIntegration.test.js');
        return fs.existsSync(testFile);
      },
      success: 'Test file found ✓',
      failure: 'GoogleMeetIntegration.test.js not found ✗'
    },
    {
      name: 'Services directory',
      check: () => {
        const servicesDir = path.join(__dirname, '..', 'services');
        return fs.existsSync(servicesDir);
      },
      success: 'Services directory found ✓',
      failure: 'Services directory not found ✗'
    },
    {
      name: 'Google Meet Service',
      check: () => {
        const serviceFile = path.join(__dirname, '..', 'services', 'GoogleMeetService.js');
        return fs.existsSync(serviceFile);
      },
      success: 'GoogleMeetService.js found ✓',
      failure: 'GoogleMeetService.js not found ✗'
    },
    {
      name: 'Mobile Deep Link Service',
      check: () => {
        const serviceFile = path.join(__dirname, '..', 'services', 'MobileDeepLinkService.js');
        return fs.existsSync(serviceFile);
      },
      success: 'MobileDeepLinkService.js found ✓',
      failure: 'MobileDeepLinkService.js not found ✗'
    }
  ];

  let allPassed = true;

  checks.forEach(({ name, check, success, failure }) => {
    try {
      if (check()) {
        printColor(`  ${success}`, 'green');
      } else {
        printColor(`  ${failure}`, 'red');
        allPassed = false;
      }
    } catch (error) {
      printColor(`  ${name}: Error - ${error.message} ✗`, 'red');
      allPassed = false;
    }
  });

  console.log();
  if (allPassed) {
    printColor('All environment checks passed!', 'green');
  } else {
    printColor('Some environment checks failed. Please address the issues above.', 'red');
    process.exit(1);
  }

  return allPassed;
}

/**
 * Check for Google API credentials and configuration
 */
function checkGoogleConfiguration() {
  printSubHeader('Google API Configuration Check');

  const checks = [
    {
      name: 'GOOGLE_CLIENT_ID',
      check: () => process.env.GOOGLE_CLIENT_ID || false,
      required: false
    },
    {
      name: 'GOOGLE_CLIENT_SECRET',
      check: () => process.env.GOOGLE_CLIENT_SECRET || false,
      required: false
    },
    {
      name: 'GOOGLE_REDIRECT_URI',
      check: () => process.env.GOOGLE_REDIRECT_URI || false,
      required: false
    }
  ];

  let hasCredentials = false;

  checks.forEach(({ name, check, required }) => {
    const value = check();
    if (value) {
      printColor(`  ${name}: Configured ✓`, 'green');
      hasCredentials = true;
    } else {
      const status = required ? 'Missing (Required) ✗' : 'Missing (Optional for tests) ⚠';
      const color = required ? 'red' : 'yellow';
      printColor(`  ${name}: ${status}`, color);
    }
  });

  if (!hasCredentials) {
    console.log();
    printColor('Note: Google API credentials not found in environment.', 'yellow');
    printColor('Tests will run with mocked Google APIs.', 'yellow');
    printColor('For integration testing, set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.', 'dim');
  }

  return true;
}

/**
 * Available test suites
 */
const testSuites = {
  all: {
    name: 'All Google Meet Tests',
    pattern: 'GoogleMeetIntegration.test.js',
    description: 'Run complete Google Meet integration test suite'
  },
  unit: {
    name: 'Google Meet Unit Tests',
    pattern: 'GoogleMeetIntegration.test.js -t "GoogleMeetService Unit Tests"',
    description: 'Test individual GoogleMeetService methods'
  },
  integration: {
    name: 'Calendar Integration Tests',
    pattern: 'GoogleMeetIntegration.test.js -t "Google Calendar Sync Integration Tests"',
    description: 'Test Google Meet with Calendar API integration'
  },
  security: {
    name: 'Security and Privacy Tests',
    pattern: 'GoogleMeetIntegration.test.js -t "Security and Privacy Tests"',
    description: 'Test security configurations and access controls'
  },
  mobile: {
    name: 'Mobile Deep Linking Tests',
    pattern: 'GoogleMeetIntegration.test.js -t "Mobile Deep Linking Tests"',
    description: 'Test mobile app deep linking functionality'
  },
  workflow: {
    name: 'End-to-End Workflow Tests',
    pattern: 'GoogleMeetIntegration.test.js -t "End-to-End Workflow Tests"',
    description: 'Test complete meeting creation workflows'
  },
  performance: {
    name: 'Performance Tests',
    pattern: 'GoogleMeetIntegration.test.js -t "Performance and Load Tests"',
    description: 'Test concurrent operations and caching'
  },
  errors: {
    name: 'Error Handling Tests',
    pattern: 'GoogleMeetIntegration.test.js -t "Error Handling and Edge Cases"',
    description: 'Test error scenarios and edge cases'
  }
};

/**
 * Run specific test suite
 */
function runTestSuite(suiteKey, options = {}) {
  const suite = testSuites[suiteKey];
  if (!suite) {
    printColor(`Unknown test suite: ${suiteKey}`, 'red');
    return false;
  }

  printSubHeader(`Running ${suite.name}`);
  printColor(suite.description, 'dim');
  console.log();

  const jestConfig = {
    testMatch: [`**/${suite.pattern.split(' -t ')[0]}`],
    verbose: options.verbose || false,
    coverage: options.coverage || false,
    detectOpenHandles: true,
    forceExit: true,
    testTimeout: 30000
  };

  let jestCommand = `npx jest ${suite.pattern}`;
  
  if (options.verbose) {
    jestCommand += ' --verbose';
  }
  
  if (options.coverage) {
    jestCommand += ' --coverage --coverageDirectory=coverage/google-meet';
  }

  if (options.watch) {
    jestCommand += ' --watch';
  }

  try {
    console.log();
    printColor(`Executing: ${jestCommand}`, 'dim');
    console.log();
    
    execSync(jestCommand, { 
      stdio: 'inherit',
      cwd: __dirname
    });
    
    printColor(`✓ ${suite.name} completed successfully`, 'green');
    return true;
  } catch (error) {
    printColor(`✗ ${suite.name} failed`, 'red');
    if (options.verbose) {
      console.error(error.message);
    }
    return false;
  }
}

/**
 * Display usage information
 */
function showUsage() {
  printHeader('Google Meet Integration Test Runner');
  
  console.log('Usage: node runGoogleMeetTests.js [suite] [options]');
  console.log();
  
  printColor('Available Test Suites:', 'yellow');
  Object.entries(testSuites).forEach(([key, suite]) => {
    console.log(`  ${key.padEnd(12)} - ${suite.description}`);
  });
  
  console.log();
  printColor('Options:', 'yellow');
  console.log('  --verbose    - Detailed test output');
  console.log('  --coverage   - Generate code coverage report');
  console.log('  --watch      - Watch mode for development');
  console.log('  --help       - Show this help message');
  
  console.log();
  printColor('Examples:', 'yellow');
  console.log('  node runGoogleMeetTests.js all');
  console.log('  node runGoogleMeetTests.js unit --verbose');
  console.log('  node runGoogleMeetTests.js security --coverage');
  console.log('  node runGoogleMeetTests.js integration --watch');
  console.log();
}

/**
 * Main execution function
 */
function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options = {
    verbose: args.includes('--verbose'),
    coverage: args.includes('--coverage'),
    watch: args.includes('--watch'),
    help: args.includes('--help')
  };
  
  const suiteKey = args.find(arg => !arg.startsWith('--')) || 'all';
  
  if (options.help) {
    showUsage();
    return;
  }
  
  console.log();
  printColor('🚀 PharmaDOC Google Meet Integration Test Runner', 'bright');
  
  // Validate environment
  if (!validateEnvironment()) {
    process.exit(1);
  }
  
  // Check Google configuration
  checkGoogleConfiguration();
  
  // Run tests
  const success = runTestSuite(suiteKey, options);
  
  console.log();
  if (success) {
    printColor('🎉 All tests completed successfully!', 'green');
    
    if (options.coverage) {
      console.log();
      printColor('📊 Coverage report generated in: coverage/google-meet/', 'cyan');
    }
  } else {
    printColor('❌ Some tests failed. Check the output above for details.', 'red');
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  runTestSuite,
  validateEnvironment,
  testSuites
}; 