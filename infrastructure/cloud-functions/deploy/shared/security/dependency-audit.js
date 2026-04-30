/**
 * Dependency Security Auditor
 * Analyzes dependencies for known vulnerabilities and security issues
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DependencyAuditor {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.packageJsonPath = path.join(projectRoot, 'package.json');
    this.results = {
      scanTime: new Date().toISOString(),
      vulnerabilities: [],
      dependencies: [],
      recommendations: []
    };
  }

  /**
   * Run comprehensive dependency audit
   */
  async audit() {
    console.log('🔍 Starting dependency security audit...');

    try {
      await this.analyzeDependencies();
      await this.runNpmAudit();
      await this.checkOutdatedPackages();
      this.generateRecommendations();

      return this.results;
    } catch (error) {
      console.error('❌ Error during dependency audit:', error.message);
      throw error;
    }
  }

  /**
   * Analyze project dependencies
   */
  async analyzeDependencies() {
    console.log('📦 Analyzing dependencies...');

    try {
      const packageJson = JSON.parse(
        fs.readFileSync(this.packageJsonPath, 'utf8')
      );

      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };

      for (const [name, version] of Object.entries(allDeps)) {
        this.results.dependencies.push({
          name,
          version,
          type: packageJson.dependencies[name] ? 'production' : 'development'
        });
      }

      console.log(`✅ Found ${this.results.dependencies.length} dependencies`);

    } catch (error) {
      console.error('❌ Error reading package.json:', error.message);
      throw error;
    }
  }

  /**
   * Run npm audit for vulnerability scanning
   */
  async runNpmAudit() {
    console.log('🔍 Running npm audit...');

    try {
      const auditOutput = execSync(
        'npm audit --json',
        { cwd: this.projectRoot, encoding: 'utf8' }
      );

      const auditData = JSON.parse(auditOutput);

      if (auditData.vulnerabilities) {
        this.processVulnerabilities(auditData.vulnerabilities);
      }

      console.log(`✅ Found ${this.results.vulnerabilities.length} vulnerabilities`);

    } catch (error) {
      // npm audit exits with non-zero code if vulnerabilities are found
      try {
        const auditData = JSON.parse(error.stdout);
        if (auditData.vulnerabilities) {
          this.processVulnerabilities(auditData.vulnerabilities);
        }
      } catch (parseError) {
        console.warn('⚠️  Could not parse npm audit output');
      }
    }
  }

  /**
   * Process vulnerabilities from npm audit
   */
  processVulnerabilities(vulnerabilities) {
    for (const [packageName, vulnData] of Object.entries(vulnerabilities)) {
      this.results.vulnerabilities.push({
        package: packageName,
        severity: vulnData.severity,
        vulnerableVersions: vulnData.vulnerableVersions,
        patchedVersions: vulnData.patchedVersions,
        recommendation: vulnData.recommendation,
        via: vulnData.via || [],
        effects: vulnData.effects || []
      });
    }
  }

  /**
   * Check for outdated packages
   */
  async checkOutdatedPackages() {
    console.log('📋 Checking for outdated packages...');

    try {
      const outdatedOutput = execSync(
        'npm outdated --json',
        { cwd: this.projectRoot, encoding: 'utf8' }
      );

      const outdated = JSON.parse(outdatedOutput);

      for (const [name, info] of Object.entries(outdated)) {
        const dep = this.results.dependencies.find(d => d.name === name);
        if (dep) {
          dep.outdated = true;
          dep.current = info.current;
          dep.latest = info.latest;
        }
      }

      console.log(`✅ Found ${Object.keys(outdated).length} outdated packages`);

    } catch (error) {
      // npm outdated exits with non-zero code if outdated packages exist
      if (error.stdout) {
        try {
          const outdated = JSON.parse(error.stdout);
          for (const [name, info] of Object.entries(outdated)) {
            const dep = this.results.dependencies.find(d => d.name === name);
            if (dep) {
              dep.outdated = true;
              dep.current = info.current;
              dep.latest = info.latest;
            }
          }
        } catch (parseError) {
          // Ignore parse errors for outdated check
        }
      }
    }
  }

  /**
   * Generate security recommendations
   */
  generateRecommendations() {
    console.log('💡 Generating security recommendations...');

    // High/critical vulnerabilities
    const criticalVulns = this.results.vulnerabilities.filter(
      v => v.severity === 'critical' || v.severity === 'high'
    );

    if (criticalVulns.length > 0) {
      this.results.recommendations.push({
        priority: 'urgent',
        issue: 'Critical/high severity vulnerabilities found',
        action: 'Run `npm audit fix` to automatically fix vulnerable dependencies',
        affected: criticalVulns.map(v => v.package)
      });
    }

    // Outdated packages
    const outdatedDeps = this.results.dependencies.filter(d => d.outdated);
    if (outdatedDeps.length > 0) {
      this.results.recommendations.push({
        priority: 'moderate',
        issue: 'Outdated dependencies detected',
        action: 'Update packages using `npm update` or manually update specific packages',
        affected: outdatedDeps.map(d => `${d.name}@${d.version} → ${d.latest}`)
      });
    }

    // Dependency count
    if (this.results.dependencies.length > 100) {
      this.results.recommendations.push({
        priority: 'low',
        issue: 'High number of dependencies',
        action: 'Consider reducing dependencies to minimize attack surface',
        affected: [`${this.results.dependencies.length} total dependencies`]
      });
    }

    console.log(`✅ Generated ${this.results.recommendations.length} recommendations`);
  }

  /**
   * Generate report
   */
  generateReport() {
    const lines = [];

    lines.push('🔍 Dependency Security Audit Report');
    lines.push(`📅 ${this.results.scanTime}`);
    lines.push('');

    // Summary
    lines.push('📊 Summary:');
    lines.push(`   Total Dependencies: ${this.results.dependencies.length}`);
    lines.push(`   Vulnerabilities: ${this.results.vulnerabilities.length}`);
    lines.push(`   Outdated Packages: ${this.results.dependencies.filter(d => d.outdated).length}`);
    lines.push('');

    // Vulnerabilities by severity
    const severityCount = {};
    for (const vuln of this.results.vulnerabilities) {
      severityCount[vuln.severity] = (severityCount[vuln.severity] || 0) + 1;
    }

    lines.push('🚨 Vulnerabilities by Severity:');
    for (const [severity, count] of Object.entries(severityCount)) {
      lines.push(`   ${severity.toUpperCase()}: ${count}`);
    }
    lines.push('');

    // Recommendations
    if (this.results.recommendations.length > 0) {
      lines.push('💡 Recommendations:');
      lines.push('');

      for (const rec of this.results.recommendations) {
        lines.push(`   Priority: ${rec.priority.toUpperCase()}`);
        lines.push(`   Issue: ${rec.issue}`);
        lines.push(`   Action: ${rec.action}`);
        lines.push(`   Affected: ${rec.affected.length} items`);
        lines.push('');
      }
    }

    // Top vulnerable packages
    if (this.results.vulnerabilities.length > 0) {
      lines.push('📦 Vulnerable Packages:');
      lines.push('');

      const sortedVulns = this.results.vulnerabilities.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });

      for (const vuln of sortedVulns.slice(0, 10)) {
        lines.push(`   • ${vuln.package} (${vuln.severity.toUpperCase()})`);
        lines.push(`     Current: ${vuln.vulnerableVersions}`);
        lines.push(`     Fixed: ${vuln.patchedVersions || 'Not available'}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Export results to JSON
   */
  exportResults(outputPath) {
    const json = JSON.stringify(this.results, null, 2);
    fs.writeFileSync(outputPath, json);
    console.log(`📄 Results exported to ${outputPath}`);
  }
}

module.exports = DependencyAuditor;

// CLI interface
if (require.main === module) {
  const auditor = new DependencyAuditor(process.argv[2] || process.cwd());

  auditor.audit()
    .then(results => {
      console.log('\n' + auditor.generateReport());

      if (process.argv[3]) {
        auditor.exportResults(process.argv[3]);
      }
    })
    .catch(error => {
      console.error('Dependency audit failed:', error);
      process.exit(1);
    });
}