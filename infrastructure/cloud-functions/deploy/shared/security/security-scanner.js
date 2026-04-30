/**
 * OmniClaw Security Scanner
 * Comprehensive security analysis toolkit for detecting vulnerabilities,
 * leaked credentials, and security misconfigurations.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Patterns for detecting sensitive data
const SECURITY_PATTERNS = {
  // API Keys
  apiKeys: [
    /(?:api[_-]?key|apikey|api[_-]?secret)['"\s]*[:=]['"\s]*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
    /AIza[A-Za-z0-9_\-]{35}/g, // Google API keys
    /AKIA[0-9A-Z]{16}/g, // AWS Access Keys
    /sk_[a-zA-Z0-9]{48}/g, // Stripe keys
    /xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-z0-9]{32}/g, // Slack tokens
  ],

  // Passwords and secrets
  credentials: [
    /(?:password|passwd|pwd)['"\s]*[:=]['"\s]*['"]?([^'\s]+)['"]?/gi,
    /(?:secret|token)['"\s]*[:=]['"\s]*['"]?([^'\s]{10,})['"]?/gi,
    /Bearer\s+[a-zA-Z0-9_\-\.=+/]+/gi,
  ],

  // Database connections
  databaseUrls: [
    /mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi,
    /postgresql?:\/\/[^\s"'`]+/gi,
    /mysql?:\/\/[^\s"'`]+/gi,
    /redis:\/\/[^\s"'`]+/gi,
  ],

  // External services
  serviceUrls: [
    /https?:\/\/[a-zA-Z0-9_\-]*(?:api|service|webhook)[a-zA-Z0-9_\-]*\.[a-zA-Z0-9_\-]+\.[a-zA-Z]{2,}(?:\/[^\s"'`]*)?/gi,
  ],

  // Private keys and certificates
  cryptoKeys: [
    /-----BEGIN(?: RSA)? PRIVATE KEY-----/g,
    /-----BEGIN CERTIFICATE-----/g,
    /-----BEGIN OPENSSH PRIVATE KEY-----/g,
  ],

  // Cloud provider identifiers
  cloudIdentifiers: [
    /gcp_[a-zA-Z0-9_\-]+/gi,
    /aws_[a-zA-Z0-9_\-]+/gi,
    /azure_[a-zA-Z0-9_\-]+/gi,
  ]
};

// Files to exclude from scanning
const EXCLUDED_PATTERNS = [
  'node_modules/',
  'package-lock.json',
  'yarn.lock',
  '.git/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  'node_modules/',
  'vendor/',
  '.env.example',
  '.env.sample',
  '.env.template',
];

// Critical file extensions to scan
const TARGET_EXTENSIONS = [
  '.js', '.ts', '.jsx', '.tsx',
  '.json', '.yaml', '.yml',
  '.env', '.config',
  '.md', '.txt',
  '.sh', '.bash',
  '.py', '.rb',
];

class SecurityScanner {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.verbosity = options.verbosity || 'normal';
    this.excludedDirs = options.excludedDirs || EXCLUDED_PATTERNS;
    this.maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB
    this.results = {
      scanTime: new Date().toISOString(),
      projectRoot: this.projectRoot,
      findings: [],
      summary: {}
    };
  }

  /**
   * Run comprehensive security scan
   */
  async scan() {
    console.log(`🔒 Starting security scan for ${this.projectRoot}`);

    try {
      const filesToScan = await this.findTargetFiles();
      console.log(`📁 Found ${filesToScan.length} files to scan`);

      for (const file of filesToScan) {
        await this.scanFile(file);
      }

      this.generateSummary();
      return this.results;
    } catch (error) {
      console.error('❌ Error during security scan:', error.message);
      throw error;
    }
  }

  /**
   * Find all target files for scanning
   */
  async findTargetFiles(targetPath = this.projectRoot) {
    const files = [];

    try {
      const entries = await readdir(targetPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(targetPath, entry.name);
        const relativePath = path.relative(this.projectRoot, fullPath);

        // Skip excluded directories
        if (this.shouldExclude(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.findTargetFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Check if file should be scanned
          if (this.shouldScanFile(fullPath)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
      if (this.verbosity === 'verbose') {
        console.warn(`⚠️  Skipping directory ${targetPath}: ${error.message}`);
      }
    }

    return files;
  }

  /**
   * Check if path should be excluded from scanning
   */
  shouldExclude(relativePath) {
    return this.excludedDirs.some(pattern =>
      relativePath.includes(pattern.replace(/\/$/, ''))
    );
  }

  /**
   * Check if file should be scanned
   */
  shouldScanFile(filePath) {
    const ext = path.extname(filePath);
    return TARGET_EXTENSIONS.includes(ext);
  }

  /**
   * Scan individual file for security issues
   */
  async scanFile(filePath) {
    try {
      const stats = await stat(filePath);

      // Skip large files
      if (stats.size > this.maxFileSize) {
        if (this.verbosity === 'verbose') {
          console.warn(`⚠️  Skipping large file: ${filePath}`);
        }
        return;
      }

      const content = await readFile(filePath, 'utf8');
      const relativePath = path.relative(this.projectRoot, filePath);

      // Scan for each security pattern
      for (const [category, patterns] of Object.entries(SECURITY_PATTERNS)) {
        for (const pattern of patterns) {
          const matches = content.matchAll(pattern);

          for (const match of matches) {
            this.addFinding({
              type: category,
              file: relativePath,
              line: this.findLineNumber(content, match.index),
              pattern: pattern.source,
              match: match[0] || match[1],
              severity: this.calculateSeverity(category, match[0])
            });
          }
        }
      }

    } catch (error) {
      if (this.verbosity === 'verbose') {
        console.warn(`⚠️  Error scanning file ${filePath}: ${error.message}`);
      }
    }
  }

  /**
   * Find line number for a match
   */
  findLineNumber(content, index) {
    const before = content.substring(0, index);
    return before.split('\n').length;
  }

  /**
   * Calculate severity level for finding
   */
  calculateSeverity(category, match) {
    const criticalCategories = ['cryptoKeys', 'databaseUrls'];
    const highCategories = ['apiKeys', 'credentials'];

    if (criticalCategories.includes(category)) {
      return 'critical';
    } else if (highCategories.includes(category)) {
      return 'high';
    } else {
      return 'medium';
    }
  }

  /**
   * Add security finding to results
   */
  addFinding(finding) {
    // Deduplicate findings
    const isDuplicate = this.results.findings.some(
      existing =>
        existing.file === finding.file &&
        existing.line === finding.line &&
        existing.pattern === finding.pattern
    );

    if (!isDuplicate) {
      this.results.findings.push(finding);
    }
  }

  /**
   * Generate summary statistics
   */
  generateSummary() {
    const summary = {
      totalFindings: this.results.findings.length,
      bySeverity: {},
      byCategory: {},
      byFile: {}
    };

    for (const finding of this.results.findings) {
      // Count by severity
      summary.bySeverity[finding.severity] =
        (summary.bySeverity[finding.severity] || 0) + 1;

      // Count by category
      summary.byCategory[finding.type] =
        (summary.byCategory[finding.type] || 0) + 1;

      // Count by file
      summary.byFile[finding.file] =
        (summary.byFile[finding.file] || 0) + 1;
    }

    this.results.summary = summary;
  }

  /**
   * Generate human-readable report
   */
  generateReport() {
    const lines = [];

    lines.push('🔒 OmniClaw Security Scan Report');
    lines.push(`📅 ${this.results.scanTime}`);
    lines.push(`📂 Project: ${this.results.projectRoot}`);
    lines.push('');

    // Summary section
    lines.push('📊 Summary:');
    lines.push(`   Total Findings: ${this.results.summary.totalFindings}`);
    lines.push('');

    // Severity breakdown
    lines.push('🚨 Findings by Severity:');
    for (const [severity, count] of Object.entries(this.results.summary.bySeverity)) {
      const emoji = this.getSeverityEmoji(severity);
      lines.push(`   ${emoji} ${severity.toUpperCase()}: ${count}`);
    }
    lines.push('');

    // Category breakdown
    lines.push('📁 Findings by Category:');
    for (const [category, count] of Object.entries(this.results.summary.byCategory)) {
      lines.push(`   • ${category}: ${count}`);
    }
    lines.push('');

    // Top affected files
    lines.push('📄 Most Affected Files:');
    const sortedFiles = Object.entries(this.results.summary.byFile)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    for (const [file, count] of sortedFiles) {
      lines.push(`   • ${file}: ${count} findings`);
    }
    lines.push('');

    // Detailed findings
    if (this.results.findings.length > 0) {
      lines.push('🔍 Detailed Findings:');
      lines.push('');

      for (const finding of this.results.findings) {
        const emoji = this.getSeverityEmoji(finding.severity);
        lines.push(`${emoji} ${finding.severity.toUpperCase()}: ${finding.file}:${finding.line}`);
        lines.push(`   Type: ${finding.type}`);
        lines.push(`   Pattern: ${finding.pattern.substring(0, 50)}...`);
        lines.push(`   Match: ${finding.match.substring(0, 50)}...`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Get emoji for severity level
   */
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢'
    };
    return emojis[severity] || '⚪';
  }

  /**
   * Export results to JSON file
   */
  async exportResults(outputPath) {
    const json = JSON.stringify(this.results, null, 2);
    await promisify(fs.writeFile)(outputPath, json);
    console.log(`📄 Results exported to ${outputPath}`);
  }
}

module.exports = SecurityScanner;

// CLI interface
if (require.main === module) {
  const scanner = new SecurityScanner({
    projectRoot: process.argv[2] || process.cwd(),
    verbosity: process.env.VERBOSE ? 'verbose' : 'normal'
  });

  scanner.scan()
    .then(results => {
      console.log('\n' + scanner.generateReport());

      // Export results if path provided
      if (process.argv[3]) {
        return scanner.exportResults(process.argv[3]);
      }
    })
    .catch(error => {
      console.error('Security scan failed:', error);
      process.exit(1);
    });
}