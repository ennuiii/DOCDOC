#!/usr/bin/env node

/**
 * CalDAV Integration Test Runner
 * Dedicated test runner for CalDAV functionality in PharmaDOC
 * 
 * Usage:
 *   node runCalDAVTests.js                    # Run all tests
 *   node runCalDAVTests.js --client           # Run CalDAVClient tests only
 *   node runCalDAVTests.js --sync             # Run CalDAVSyncService tests only
 *   node runCalDAVTests.js --provider apple   # Run provider-specific tests
 *   node runCalDAVTests.js --env              # Validate environment only
 *   node runCalDAVTests.js --help             # Show help
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader() {
  console.log(colorize('\n🔗 CalDAV Integration Test Runner', 'cyan'));
  console.log(colorize('=====================================', 'cyan'));
  console.log('Testing universal calendar integration (Apple iCloud, Yahoo, Generic CalDAV)');
  console.log('');
}

function printHelp() {
  console.log(colorize('Usage:', 'bright'));
  console.log('  node runCalDAVTests.js [options]');
  console.log('');
  console.log(colorize('Options:', 'bright'));
  console.log('  --client          Run CalDAVClient tests only');
  console.log('  --sync            Run CalDAVSyncService tests only');
  console.log('  --provider apple  Run Apple iCloud specific tests');
  console.log('  --provider yahoo  Run Yahoo Calendar specific tests');
  console.log('  --provider generic Run Generic CalDAV specific tests');
  console.log('  --security        Run security and encryption tests');
  console.log('  --performance     Run performance and load tests');
  console.log('  --env             Validate test environment only');
  console.log('  --verbose         Show detailed test output');
  console.log('  --help            Show this help message');
  console.log('');
  console.log(colorize('Examples:', 'bright'));
  console.log('  node runCalDAVTests.js --client --verbose');
  console.log('  node runCalDAVTests.js --provider apple');
  console.log('  node runCalDAVTests.js --sync --performance');
  console.log('');
}

function validateEnvironment() {
  console.log(colorize('🔍 Validating Test Environment...', 'yellow'));
  
  const checks = [
    {
      name: 'Node.js version',
      check: () => {
        const version = process.version;
        const major = parseInt(version.slice(1).split('.')[0]);
        return major >= 16;
      },
      value: () => process.version,
      required: true
    },
    {
      name: 'Jest availability',
      check: () => {
        try {
          require.resolve('jest');
          return true;
        } catch {
          return false;
        }
      },
      value: () => 'Available',
      required: true
    },
    {
      name: 'Test file exists',
      check: () => fs.existsSync(path.join(__dirname, 'CalDAVIntegration.test.js')),
      value: () => 'CalDAVIntegration.test.js',
      required: true
    },
    {
      name: 'CalDAVClient module',
      check: () => {
        try {
          require.resolve('../providers/caldav/CalDAVClient');
          return true;
        } catch {
          return false;
        }
      },
      value: () => 'Available',
      required: true
    },
    {
      name: 'CalDAVSyncService module',
      check: () => {
        try {
          require.resolve('../services/CalDAVSyncService');
          return true;
        } catch {
          return false;
        }
      },
      value: () => 'Available',
      required: true
    },
    {
      name: 'Supabase client',
      check: () => {
        try {
          require.resolve('@supabase/supabase-js');
          return true;
        } catch {
          return false;
        }
      },
      value: () => 'Available',
      required: false
    },
    {
      name: 'HTTP client (axios)',
      check: () => {
        try {
          require.resolve('axios');
          return true;
        } catch {
          return false;
        }
      },
      value: () => 'Available',
      required: true
    },
    {
      name: 'XML parser',
      check: () => {
        try {
          require.resolve('fast-xml-parser');
          return true;
        } catch {
          return false;
        }
      },
      value: () => 'Available',
      required: true
    },
    {
      name: 'iCal parser',
      check: () => {
        try {
          require.resolve('ical');
          return true;
        } catch {
          return false;
        }
      },
      value: () => 'Available',
      required: true
    }
  ];

  let allPassed = true;
  
  checks.forEach(({ name, check, value, required }) => {
    const passed = check();
    const status = passed ? colorize('✓', 'green') : colorize('✗', 'red');
    const requirement = required ? '(required)' : '(optional)';
    
    console.log(`  ${status} ${name}: ${value()} ${requirement}`);
    
    if (!passed && required) {
      allPassed = false;
    }
  });

  console.log('');
  
  if (allPassed) {
    console.log(colorize('✓ Environment validation passed', 'green'));
    return true;
  } else {
    console.log(colorize('✗ Environment validation failed', 'red'));
    console.log('Please install missing dependencies before running tests.');
    return false;
  }
}

function buildJestCommand(options) {
  const testFile = path.join(__dirname, 'CalDAVIntegration.test.js');
  const jestPath = path.join(__dirname, '../../../../node_modules/.bin/jest');
  
  let args = [testFile];
  
  // Add Jest configuration
  args.push('--config', JSON.stringify({
    testEnvironment: 'node',
    setupFilesAfterEnv: [],
    moduleNameMapping: {},
    transform: {},
    collectCoverageFrom: [
      'src/integrations/providers/caldav/**/*.js',
      'src/integrations/services/CalDAVSyncService.js'
    ],
    coverageDirectory: 'coverage/caldav',
    coverageReporters: ['text', 'lcov', 'html']
  }));

  // Filter tests based on options
  if (options.client) {
    args.push('--testNamePattern', 'CalDAVClient');
  } else if (options.sync) {
    args.push('--testNamePattern', 'CalDAVSyncService');
  } else if (options.provider) {
    switch (options.provider) {
      case 'apple':
        args.push('--testNamePattern', 'Apple iCloud');
        break;
      case 'yahoo':
        args.push('--testNamePattern', 'Yahoo Calendar');
        break;
      case 'generic':
        args.push('--testNamePattern', 'Generic CalDAV');
        break;
    }
  } else if (options.security) {
    args.push('--testNamePattern', 'Security Tests');
  } else if (options.performance) {
    args.push('--testNamePattern', 'Performance Tests');
  }

  // Add verbose output if requested
  if (options.verbose) {
    args.push('--verbose');
  }

  // Add coverage if running all tests
  if (!options.client && !options.sync && !options.provider && !options.security && !options.performance) {
    args.push('--coverage');
  }

  return { command: jestPath, args };
}

function runTests(options) {
  return new Promise((resolve) => {
    console.log(colorize('🚀 Starting CalDAV Integration Tests...', 'green'));
    console.log('');

    const { command, args } = buildJestCommand(options);
    
    // Log the command being run
    if (options.verbose) {
      console.log(colorize('Command:', 'cyan'), command, args.join(' '));
      console.log('');
    }

    const testProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '../../../..')
    });

    testProcess.on('close', (code) => {
      console.log('');
      
      if (code === 0) {
        console.log(colorize('✓ All CalDAV tests passed!', 'green'));
        
        // Display post-test information
        console.log('');
        console.log(colorize('CalDAV Integration Features Tested:', 'cyan'));
        console.log('  • Apple iCloud CalDAV integration');
        console.log('  • Yahoo Calendar synchronization');
        console.log('  • Generic CalDAV server support');
        console.log('  • Bidirectional calendar sync');
        console.log('  • Event creation and updates');
        console.log('  • Conflict resolution strategies');
        console.log('  • Authentication with app passwords');
        console.log('  • iCalendar format processing');
        console.log('  • Real-time webhook handling');
        console.log('  • Security and encryption');
        
        if (!options.client && !options.sync && !options.provider && !options.security && !options.performance) {
          console.log('');
          console.log(colorize('📊 Coverage report generated in coverage/caldav/', 'cyan'));
        }
      } else {
        console.log(colorize('✗ Some CalDAV tests failed', 'red'));
        console.log('');
        console.log(colorize('Troubleshooting Tips:', 'yellow'));
        console.log('  • Verify all dependencies are installed');
        console.log('  • Check CalDAV service implementations');
        console.log('  • Review mock configurations in test file');
        console.log('  • Run with --verbose for detailed output');
      }
      
      resolve(code);
    });

    testProcess.on('error', (error) => {
      console.error(colorize('Failed to start test process:', 'red'), error.message);
      resolve(1);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line options
  const options = {
    client: args.includes('--client'),
    sync: args.includes('--sync'),
    provider: null,
    security: args.includes('--security'),
    performance: args.includes('--performance'),
    env: args.includes('--env'),
    verbose: args.includes('--verbose'),
    help: args.includes('--help')
  };

  // Check for provider-specific tests
  const providerIndex = args.indexOf('--provider');
  if (providerIndex !== -1 && args[providerIndex + 1]) {
    options.provider = args[providerIndex + 1];
  }

  printHeader();

  if (options.help) {
    printHelp();
    return;
  }

  // Validate environment first
  if (!validateEnvironment()) {
    process.exit(1);
  }

  if (options.env) {
    console.log(colorize('Environment validation completed.', 'green'));
    return;
  }

  console.log('');

  // Run the tests
  const exitCode = await runTests(options);
  process.exit(exitCode);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(colorize('Uncaught Exception:', 'red'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(colorize('Unhandled Rejection at:', 'red'), promise, colorize('reason:', 'red'), reason);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(colorize('Test runner failed:', 'red'), error.message);
    process.exit(1);
  });
}

module.exports = {
  validateEnvironment,
  runTests,
  buildJestCommand
};
