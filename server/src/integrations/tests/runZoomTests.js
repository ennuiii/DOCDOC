/**
 * Zoom Integration Test Runner
 * Dedicated test runner for running Zoom-specific tests
 */

const chalk = require('chalk');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ZoomTestRunner {
  constructor() {
    this.testSuites = {
      oauth: 'ZoomOAuthProvider Tests',
      meeting: 'ZoomMeetingService Tests',
      webhook: 'ZoomWebhookService Tests',
      integration: 'Integration Workflow Tests',
      error: 'Error Handling Tests',
      performance: 'Performance Tests',
      security: 'Security Tests',
      all: 'All Zoom Tests'
    };

    this.requiredEnvVars = [
      'ZOOM_CLIENT_ID',
      'ZOOM_CLIENT_SECRET',
      'ZOOM_REDIRECT_URI',
      'ZOOM_WEBHOOK_SECRET'
    ];

    this.testFile = path.join(__dirname, 'ZoomIntegration.test.js');
  }

  /**
   * Display available test options
   */
  showHelp() {
    console.log(chalk.blue.bold('\n📧 PharmaDOC Zoom Integration Test Runner\n'));
    console.log(chalk.yellow('Available test suites:'));
    
    Object.entries(this.testSuites).forEach(([key, description]) => {
      console.log(chalk.cyan(`  ${key.padEnd(12)} - ${description}`));
    });

    console.log(chalk.yellow('\nUsage examples:'));
    console.log(chalk.gray('  node runZoomTests.js oauth        # Run OAuth tests only'));
    console.log(chalk.gray('  node runZoomTests.js meeting      # Run meeting service tests'));
    console.log(chalk.gray('  node runZoomTests.js webhook      # Run webhook tests'));
    console.log(chalk.gray('  node runZoomTests.js all          # Run all tests'));
    console.log(chalk.gray('  node runZoomTests.js --coverage   # Run with coverage'));
    console.log(chalk.gray('  node runZoomTests.js --verbose    # Run with verbose output'));
    console.log(chalk.gray('  node runZoomTests.js --watch      # Run in watch mode\n'));
  }

  /**
   * Validate environment setup
   */
  validateEnvironment() {
    console.log(chalk.blue('🔍 Validating test environment...'));
    
    const missing = this.requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      console.log(chalk.red('\n❌ Missing required environment variables:'));
      missing.forEach(varName => {
        console.log(chalk.red(`   - ${varName}`));
      });
      console.log(chalk.yellow('\n💡 Set these in your .env file or environment'));
      return false;
    }

    // Check if test file exists
    if (!fs.existsSync(this.testFile)) {
      console.log(chalk.red(`\n❌ Test file not found: ${this.testFile}`));
      return false;
    }

    console.log(chalk.green('✅ Environment validation passed'));
    return true;
  }

  /**
   * Run specific test suite
   */
  async runTests(suite = 'all', options = {}) {
    if (!this.validateEnvironment()) {
      process.exit(1);
    }

    const jestArgs = this.buildJestArgs(suite, options);
    
    console.log(chalk.blue(`\n🚀 Running Zoom ${this.testSuites[suite]}...\n`));
    
    const jestProcess = spawn('npx', ['jest', ...jestArgs], {
      stdio: 'pipe',
      shell: true,
      cwd: path.dirname(this.testFile)
    });

    // Handle jest output with custom formatting
    jestProcess.stdout.on('data', (data) => {
      this.formatJestOutput(data.toString());
    });

    jestProcess.stderr.on('data', (data) => {
      this.formatJestError(data.toString());
    });

    jestProcess.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green.bold('\n✅ All Zoom tests passed!'));
        this.showSummary(suite);
      } else {
        console.log(chalk.red.bold('\n❌ Some Zoom tests failed!'));
        console.log(chalk.yellow('Check the output above for details.'));
      }
      
      process.exit(code);
    });

    jestProcess.on('error', (error) => {
      console.log(chalk.red(`\n❌ Failed to run tests: ${error.message}`));
      process.exit(1);
    });
  }

  /**
   * Build Jest command arguments
   */
  buildJestArgs(suite, options) {
    const args = [this.testFile];

    // Add test name pattern based on suite
    if (suite !== 'all') {
      const patterns = {
        oauth: 'ZoomOAuthProvider Tests',
        meeting: 'ZoomMeetingService Tests',
        webhook: 'ZoomWebhookService Tests',
        integration: 'Integration Workflow Tests',
        error: 'Error Handling Tests',
        performance: 'Performance Tests',
        security: 'Security Tests'
      };
      
      if (patterns[suite]) {
        args.push('--testNamePattern', `"${patterns[suite]}"`);
      }
    }

    // Add common Jest options
    args.push('--colors');
    args.push('--passWithNoTests');

    // Add conditional options
    if (options.coverage) {
      args.push('--coverage');
      args.push('--coverageDirectory', 'coverage/zoom');
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    if (options.watch) {
      args.push('--watch');
    }

    // Increase timeout for integration tests
    args.push('--testTimeout', '30000');

    return args;
  }

  /**
   * Format Jest output with colors and emojis
   */
  formatJestOutput(output) {
    const lines = output.split('\n');
    
    lines.forEach(line => {
      if (line.includes('PASS')) {
        console.log(chalk.green('✅ ' + line));
      } else if (line.includes('FAIL')) {
        console.log(chalk.red('❌ ' + line));
      } else if (line.includes('Test Suites:')) {
        console.log(chalk.blue('📊 ' + line));
      } else if (line.includes('Tests:')) {
        console.log(chalk.blue('🧪 ' + line));
      } else if (line.includes('Snapshots:')) {
        console.log(chalk.blue('📸 ' + line));
      } else if (line.includes('Time:')) {
        console.log(chalk.blue('⏱️ ' + line));
      } else if (line.trim()) {
        console.log(line);
      }
    });
  }

  /**
   * Format Jest error output
   */
  formatJestError(output) {
    const lines = output.split('\n');
    
    lines.forEach(line => {
      if (line.includes('Error:') || line.includes('Failed:')) {
        console.log(chalk.red('💥 ' + line));
      } else if (line.includes('Warning:')) {
        console.log(chalk.yellow('⚠️ ' + line));
      } else if (line.trim()) {
        console.log(chalk.gray(line));
      }
    });
  }

  /**
   * Show test summary and recommendations
   */
  showSummary(suite) {
    console.log(chalk.blue('\n📋 Test Summary:'));
    console.log(chalk.gray(`   Suite: ${this.testSuites[suite]}`));
    console.log(chalk.gray(`   File: ${path.basename(this.testFile)}`));
    
    if (suite === 'all') {
      console.log(chalk.blue('\n🎯 Next Steps:'));
      console.log(chalk.gray('   • Review test coverage reports'));
      console.log(chalk.gray('   • Run performance benchmarks'));
      console.log(chalk.gray('   • Test with real Zoom API (optional)'));
      console.log(chalk.gray('   • Update documentation if needed'));
    }

    console.log(chalk.blue('\n📚 Related Commands:'));
    console.log(chalk.gray('   npm run test:integration    # Run all integration tests'));
    console.log(chalk.gray('   npm run test:coverage       # Generate coverage report'));
    console.log(chalk.gray('   npm run lint                # Check code style'));
  }

  /**
   * Interactive test menu
   */
  async showInteractiveMenu() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(chalk.blue.bold('\n📧 PharmaDOC Zoom Integration Test Menu\n'));
    
    Object.entries(this.testSuites).forEach(([key, description], index) => {
      console.log(chalk.cyan(`${index + 1}. ${description}`));
    });

    console.log(chalk.cyan('\n0. Exit'));

    const answer = await new Promise(resolve => {
      rl.question(chalk.yellow('\nSelect test suite (1-8, 0 to exit): '), resolve);
    });

    rl.close();

    const choice = parseInt(answer);
    const suites = Object.keys(this.testSuites);

    if (choice === 0) {
      console.log(chalk.gray('Goodbye! 👋'));
      process.exit(0);
    } else if (choice >= 1 && choice <= suites.length) {
      const selectedSuite = suites[choice - 1];
      await this.runTests(selectedSuite);
    } else {
      console.log(chalk.red('Invalid selection. Please try again.'));
      await this.showInteractiveMenu();
    }
  }
}

// Main execution
async function main() {
  const runner = new ZoomTestRunner();
  const args = process.argv.slice(2);

  // Parse command line arguments
  const suite = args.find(arg => !arg.startsWith('--')) || 'help';
  const options = {
    coverage: args.includes('--coverage'),
    verbose: args.includes('--verbose'),
    watch: args.includes('--watch')
  };

  // Handle different commands
  switch (suite) {
    case 'help':
    case '--help':
    case '-h':
      runner.showHelp();
      break;
      
    case 'menu':
    case 'interactive':
      await runner.showInteractiveMenu();
      break;
      
    default:
      if (runner.testSuites[suite]) {
        await runner.runTests(suite, options);
      } else {
        console.log(chalk.red(`\n❌ Unknown test suite: ${suite}`));
        runner.showHelp();
        process.exit(1);
      }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.log(chalk.red('💥 Unhandled Rejection at:'), promise);
  console.log(chalk.red('📝 Reason:'), reason);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.log(chalk.red(`\n💥 Fatal error: ${error.message}`));
    process.exit(1);
  });
}

module.exports = ZoomTestRunner; 