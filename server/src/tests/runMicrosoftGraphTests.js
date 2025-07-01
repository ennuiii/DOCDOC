#!/usr/bin/env node

/**
 * Microsoft Graph Integration Test Runner
 * Runs comprehensive tests for all Microsoft Graph functionality
 * 
 * Usage:
 *   node runMicrosoftGraphTests.js [options]
 * 
 * Options:
 *   --help              Show this help message
 *   --verbose           Enable verbose output
 *   --coverage          Run with test coverage
 *   --suite <name>      Run specific test suite (oauth|sync|teams|webhook|integration|errors|performance)
 *   --timeout <ms>      Set test timeout (default: 30000)
 *   --bail              Stop after first test failure
 *   --watch             Watch for file changes and re-run tests
 */

const { spawn } = require('child_process');
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

// Configuration
const config = {
    testFile: path.join(__dirname, 'integration', 'MicrosoftGraphIntegration.test.js'),
    setupFile: path.join(__dirname, 'setup.js'),
    verbose: false,
    coverage: false,
    suite: null,
    timeout: 30000,
    bail: false,
    watch: false
};

// Test suites mapping
const testSuites = {
    oauth: '1. Microsoft OAuth Provider',
    sync: '2. Outlook Calendar Sync Service',
    teams: '3. Microsoft Teams Meeting Service',
    webhook: '4. Microsoft Graph Webhook Service',
    integration: '5. Integration Testing - End-to-End Workflows',
    errors: '6. Error Handling and Edge Cases',
    performance: '7. Performance Testing'
};

function printHeader() {
    console.log(colors.cyan + colors.bright);
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Microsoft Graph Integration Test Runner             ║');
    console.log('║                                                              ║');
    console.log('║  Comprehensive testing for Outlook Calendar & Teams APIs    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(colors.reset);
}

function printHelp() {
    console.log(colors.bright + 'Microsoft Graph Integration Test Runner' + colors.reset);
    console.log('');
    console.log('Usage:');
    console.log('  node runMicrosoftGraphTests.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --help              Show this help message');
    console.log('  --verbose           Enable verbose output');
    console.log('  --coverage          Run with test coverage');
    console.log('  --suite <name>      Run specific test suite');
    console.log('  --timeout <ms>      Set test timeout (default: 30000)');
    console.log('  --bail              Stop after first test failure');
    console.log('  --watch             Watch for file changes and re-run tests');
    console.log('');
    console.log('Available test suites:');
    Object.entries(testSuites).forEach(([key, description]) => {
        console.log(`  ${colors.cyan}${key.padEnd(12)}${colors.reset} ${description}`);
    });
    console.log('');
    console.log('Examples:');
    console.log('  node runMicrosoftGraphTests.js --verbose');
    console.log('  node runMicrosoftGraphTests.js --suite oauth --verbose');
    console.log('  node runMicrosoftGraphTests.js --coverage --bail');
    console.log('  node runMicrosoftGraphTests.js --watch --suite teams');
}

function parseArguments() {
    const args = process.argv.slice(2);
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
                break;
                
            case '--verbose':
            case '-v':
                config.verbose = true;
                break;
                
            case '--coverage':
            case '-c':
                config.coverage = true;
                break;
                
            case '--suite':
            case '-s':
                if (i + 1 < args.length) {
                    const suiteName = args[i + 1];
                    if (testSuites[suiteName]) {
                        config.suite = suiteName;
                        i++; // Skip next argument
                    } else {
                        console.error(colors.red + `Error: Unknown test suite "${suiteName}"` + colors.reset);
                        console.error('Available suites: ' + Object.keys(testSuites).join(', '));
                        process.exit(1);
                    }
                } else {
                    console.error(colors.red + 'Error: --suite requires a suite name' + colors.reset);
                    process.exit(1);
                }
                break;
                
            case '--timeout':
            case '-t':
                if (i + 1 < args.length) {
                    const timeout = parseInt(args[i + 1]);
                    if (!isNaN(timeout) && timeout > 0) {
                        config.timeout = timeout;
                        i++; // Skip next argument
                    } else {
                        console.error(colors.red + 'Error: --timeout requires a positive number' + colors.reset);
                        process.exit(1);
                    }
                } else {
                    console.error(colors.red + 'Error: --timeout requires a timeout value' + colors.reset);
                    process.exit(1);
                }
                break;
                
            case '--bail':
            case '-b':
                config.bail = true;
                break;
                
            case '--watch':
            case '-w':
                config.watch = true;
                break;
                
            default:
                console.error(colors.red + `Error: Unknown option "${arg}"` + colors.reset);
                console.error('Use --help to see available options');
                process.exit(1);
        }
    }
}

function checkEnvironment() {
    console.log(colors.bright + 'Environment Check:' + colors.reset);
    
    // Check if test file exists
    if (!fs.existsSync(config.testFile)) {
        console.error(colors.red + '✗ Test file not found: ' + config.testFile + colors.reset);
        process.exit(1);
    }
    console.log(colors.green + '✓ Test file found' + colors.reset);
    
    // Check if setup file exists
    if (fs.existsSync(config.setupFile)) {
        console.log(colors.green + '✓ Setup file found' + colors.reset);
    } else {
        console.log(colors.yellow + '⚠ Setup file not found (optional)' + colors.reset);
    }
    
    // Check environment variables
    const requiredEnvVars = [
        'MICROSOFT_CLIENT_ID',
        'MICROSOFT_CLIENT_SECRET',
        'MICROSOFT_REDIRECT_URI'
    ];
    
    const optionalEnvVars = [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'TEST_MICROSOFT_ACCESS_TOKEN',
        'TEST_MICROSOFT_REFRESH_TOKEN'
    ];
    
    console.log('\nEnvironment Variables:');
    
    let missingRequired = [];
    requiredEnvVars.forEach(envVar => {
        if (process.env[envVar]) {
            console.log(colors.green + `✓ ${envVar}` + colors.reset);
        } else {
            console.log(colors.red + `✗ ${envVar} (required)` + colors.reset);
            missingRequired.push(envVar);
        }
    });
    
    optionalEnvVars.forEach(envVar => {
        if (process.env[envVar]) {
            console.log(colors.green + `✓ ${envVar}` + colors.reset);
        } else {
            console.log(colors.yellow + `⚠ ${envVar} (optional)` + colors.reset);
        }
    });
    
    if (missingRequired.length > 0) {
        console.log(colors.red + '\nError: Missing required environment variables:' + colors.reset);
        missingRequired.forEach(envVar => {
            console.log(colors.red + `  - ${envVar}` + colors.reset);
        });
        console.log('\nPlease set these variables in your .env file or environment.');
        process.exit(1);
    }
    
    console.log(colors.green + '\n✓ Environment check passed' + colors.reset);
}

function buildJestCommand() {
    const jestCmd = ['jest'];
    
    // Test file
    jestCmd.push(config.testFile);
    
    // Setup file
    if (fs.existsSync(config.setupFile)) {
        jestCmd.push('--setupFilesAfterEnv', config.setupFile);
    }
    
    // Verbose output
    if (config.verbose) {
        jestCmd.push('--verbose');
    }
    
    // Coverage
    if (config.coverage) {
        jestCmd.push('--coverage');
        jestCmd.push('--collectCoverageFrom', 'server/src/integrations/**/*.js');
        jestCmd.push('--coverageDirectory', 'coverage/microsoft-graph');
    }
    
    // Specific test suite
    if (config.suite) {
        const suitePattern = testSuites[config.suite];
        jestCmd.push('--testNamePattern', `"${suitePattern}"`);
    }
    
    // Timeout
    jestCmd.push('--testTimeout', config.timeout.toString());
    
    // Bail on first failure
    if (config.bail) {
        jestCmd.push('--bail');
    }
    
    // Watch mode
    if (config.watch) {
        jestCmd.push('--watch');
    }
    
    // Force color output
    jestCmd.push('--colors');
    
    // Run in band (sequential) for integration tests
    jestCmd.push('--runInBand');
    
    return jestCmd;
}

function runTests() {
    const jestCmd = buildJestCommand();
    
    console.log('\n' + colors.bright + 'Running Tests:' + colors.reset);
    console.log(colors.cyan + jestCmd.join(' ') + colors.reset);
    console.log('');
    
    const jestProcess = spawn('npx', jestCmd, {
        stdio: 'inherit',
        shell: true,
        cwd: path.join(__dirname, '../../..')
    });
    
    jestProcess.on('exit', (code) => {
        console.log('');
        if (code === 0) {
            console.log(colors.green + colors.bright + '✓ All tests passed!' + colors.reset);
        } else {
            console.log(colors.red + colors.bright + '✗ Some tests failed!' + colors.reset);
            process.exit(code);
        }
    });
    
    jestProcess.on('error', (error) => {
        console.error(colors.red + 'Error running tests:' + colors.reset);
        console.error(error.message);
        process.exit(1);
    });
}

function printTestSummary() {
    console.log('\n' + colors.bright + 'Test Configuration:' + colors.reset);
    console.log(`File: ${config.testFile}`);
    console.log(`Verbose: ${config.verbose ? colors.green + 'enabled' : colors.red + 'disabled'}${colors.reset}`);
    console.log(`Coverage: ${config.coverage ? colors.green + 'enabled' : colors.red + 'disabled'}${colors.reset}`);
    console.log(`Suite: ${config.suite ? colors.cyan + config.suite + colors.reset : colors.yellow + 'all' + colors.reset}`);
    console.log(`Timeout: ${config.timeout}ms`);
    console.log(`Bail: ${config.bail ? colors.green + 'enabled' : colors.red + 'disabled'}${colors.reset}`);
    console.log(`Watch: ${config.watch ? colors.green + 'enabled' : colors.red + 'disabled'}${colors.reset}`);
    
    if (config.suite) {
        console.log(`Suite Description: ${colors.cyan}${testSuites[config.suite]}${colors.reset}`);
    }
}

// Main execution
function main() {
    try {
        parseArguments();
        printHeader();
        checkEnvironment();
        printTestSummary();
        runTests();
    } catch (error) {
        console.error(colors.red + 'Error:' + colors.reset, error.message);
        process.exit(1);
    }
}

// Handle process signals
process.on('SIGINT', () => {
    console.log(colors.yellow + '\nTest run interrupted by user' + colors.reset);
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log(colors.yellow + '\nTest run terminated' + colors.reset);
    process.exit(1);
});

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    config,
    testSuites,
    runTests,
    checkEnvironment
}; 