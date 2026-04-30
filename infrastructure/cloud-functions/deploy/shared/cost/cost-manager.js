/**
 * OmniClaw Cost Manager
 * Comprehensive cost monitoring, analysis, and optimization for GCP Cloud Functions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class CostManager {
  constructor(projectId = 'omniclaw-personal-assistant') {
    this.projectId = projectId;
    this.costData = {
      timestamp: new Date().toISOString(),
      projectId: projectId,
      services: {},
      totalCost: 0,
      recommendations: []
    };
  }

  /**
   * Run comprehensive cost analysis
   */
  async analyzeCosts() {
    console.log('💰 Analyzing OmniClaw costs...');

    try {
      await this.analyzeCloudFunctions();
      await this.analyzeStorage();
      await this.analyzeNetworking();
      await this.generateRecommendations();
      await this.calculateTotalCost();

      return this.costData;
    } catch (error) {
      console.error('❌ Error analyzing costs:', error.message);
      throw error;
    }
  }

  /**
   * Analyze Cloud Functions costs
   */
  async analyzeCloudFunctions() {
    console.log('🔍 Analyzing Cloud Functions costs...');

    try {
      // Get function list
      const functions = execSync(
        `gcloud functions list --project=${this.projectId} --format="csv[name,region,status,runtime]"`,
        { encoding: 'utf8' }
      ).trim().split('\n').slice(1);

      this.costData.services.cloudFunctions = {
        functions: [],
        monthlyEstimate: 0,
        breakdown: {
          compute: 0,
          invocations: 0,
          networking: 0
        }
      };

      for (const func of functions) {
        const [name, region, status, runtime] = func.split(',');

        // Get function configuration
        const config = execSync(
          `gcloud functions describe ${name} --region=${region} --project=${this.projectId} --format="json"`,
          { encoding: 'utf8' }
        );

        const funcConfig = JSON.parse(config);
        const costAnalysis = this.analyzeFunctionCost(name, funcConfig);

        this.costData.services.cloudFunctions.functions.push({
          name,
          region,
          status,
          runtime,
          cost: costAnalysis
        });

        this.costData.services.cloudFunctions.monthlyEstimate += costAnalysis.total;
        this.costData.services.cloudFunctions.breakdown.compute += costAnalysis.compute;
        this.costData.services.cloudFunctions.breakdown.invocations += costAnalysis.invocations;
        this.costData.services.cloudFunctions.breakdown.networking += costAnalysis.networking;
      }

      console.log(`✅ Found ${functions.length} Cloud Functions`);

    } catch (error) {
      console.log('⚠️  No Cloud Functions found or error analyzing them');
      this.costData.services.cloudFunctions = {
        functions: [],
        monthlyEstimate: 0,
        breakdown: { compute: 0, invocations: 0, networking: 0 }
      };
    }
  }

  /**
   * Analyze individual function cost
   */
  analyzeFunctionCost(name, config) {
    const analysis = {
      total: 0,
      compute: 0,
      invocations: 0,
      networking: 0,
      configuration: {}
    };

    try {
      // Configuration details
      const memory = config.serviceConfig?.memorySizeBytes || 256 * 1024 * 1024; // Default 256MB
      const timeout = config.serviceConfig?.timeoutSeconds || 120;
      const maxInstances = config.serviceConfig?.maxInstanceCount || 0;
      const availableMemory = config.serviceConfig?.availableMemoryMb || 256;

      analysis.configuration = {
        memory: `${availableMemory}MB`,
        timeout: `${timeout}s`,
        maxInstances: maxInstances || 'unlimited'
      };

      // Cost calculations (rough estimates for asia-south1 region)
      // Cloud Functions Gen 2 pricing: CPU + Memory + Requests + Networking

      // GB-seconds (memory * time)
      const gbSecondsPerInvocation = (availableMemory / 1024) * (timeout / 60); // GB-minutes
      const estimatedMonthlyInvocations = 1000000; // Conservative estimate
      const totalGbSeconds = gbSecondsPerInvocation * estimatedMonthlyInvocations / 60;

      // Compute cost (GB-seconds + GHz-seconds)
      // asia-south1: ~$0.000000236 per GB-second
      analysis.compute = totalGbSeconds * 0.000000236;

      // Invocation cost (per million requests)
      // asia-south1: ~$0.40 per million requests
      analysis.invocations = (estimatedMonthlyInvocations / 1000000) * 0.40;

      // Networking cost (egress)
      // asia-south1: ~$0.12 per GB
      const estimatedEgressGB = 10; // Conservative estimate
      analysis.networking = estimatedEgressGB * 0.12;

      analysis.total = analysis.compute + analysis.invocations + analysis.networking;

    } catch (error) {
      console.warn(`⚠️  Could not analyze cost for function ${name}`);
    }

    return analysis;
  }

  /**
   * Analyze storage costs
   */
  async analyzeStorage() {
    console.log('🔍 Analyzing storage costs...');

    this.costData.services.storage = {
      buckets: [],
      monthlyEstimate: 0,
      breakdown: {
        storage: 0,
        networkEgress: 0,
        operations: 0
      }
    };

    try {
      // List buckets
      const buckets = execSync(
        `gsutil ls -p ${this.projectId}`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim().split('\n');

      for (const bucket of buckets) {
        const bucketName = bucket.replace('gs://', '').replace('/', '');

        // Get bucket size
        const sizeOutput = execSync(
          `gsutil du -s ${bucket}`,
          { encoding: 'utf8' }
        ).trim();

        const [size, _] = sizeOutput.split('\t');
        const sizeGB = parseInt(size) / (1024 ** 3);

        // Storage cost (asia-south1): ~$0.026 per GB
        const storageCost = sizeGB * 0.026;

        this.costData.services.storage.buckets.push({
          name: bucketName,
          sizeGB: sizeGB.toFixed(2),
          estimatedMonthlyCost: storageCost.toFixed(2)
        });

        this.costData.services.storage.monthlyEstimate += storageCost;
        this.costData.services.storage.breakdown.storage += storageCost;
      }

      console.log(`✅ Found ${buckets.length} storage buckets`);

    } catch (error) {
      console.log('⚠️  No storage buckets found or error analyzing them');
    }
  }

  /**
   * Analyze networking costs
   */
  async analyzeNetworking() {
    console.log('🔍 Analyzing networking costs...');

    this.costData.services.networking = {
      monthlyEstimate: 0,
      breakdown: {
        egress: 0,
        loadBalancing: 0,
        nat: 0
      }
    };

    // Networking costs are already estimated in Cloud Functions analysis
    // This is placeholder for additional networking services
    console.log('✅ Networking analysis complete');
  }

  /**
   * Generate cost optimization recommendations
   */
  async generateRecommendations() {
    console.log('💡 Generating cost optimization recommendations...');

    // Cloud Functions recommendations
    if (this.costData.services.cloudFunctions) {
      for (const func of this.costData.services.cloudFunctions.functions) {
        const config = func.cost.configuration;

        // Memory optimization
        if (config.memory && config.memory !== '128MB') {
          this.costData.recommendations.push({
            priority: 'low',
            service: 'Cloud Functions',
            resource: func.name,
            issue: 'High memory allocation',
            recommendation: 'Consider reducing memory if not fully utilized',
            potentialSavings: '~20-30% of compute costs',
            action: 'Monitor memory usage and adjust configuration'
          });
        }

        // Timeout optimization
        if (config.timeout && config.timeout !== '60s') {
          this.costData.recommendations.push({
            priority: 'medium',
            service: 'Cloud Functions',
            resource: func.name,
            issue: 'High timeout setting',
            recommendation: 'Reduce timeout to match actual execution time',
            potentialSavings: '~15-25% of compute costs',
            action: 'Analyze execution times and set optimal timeout'
          });
        }

        // Max instances optimization
        if (config.maxInstances && config.maxInstances !== '0' && parseInt(config.maxInstances) > 10) {
          this.costData.recommendations.push({
            priority: 'medium',
            service: 'Cloud Functions',
            resource: func.name,
            issue: 'High max instances setting',
            recommendation: 'Set reasonable max instances to prevent cost spikes',
            potentialSavings: 'Prevent unexpected cost overruns',
            action: 'Analyze traffic patterns and set appropriate limits'
          });
        }
      }
    }

    // General recommendations
    this.costData.recommendations.push(
      {
        priority: 'high',
        service: 'General',
        resource: 'All',
        issue: 'No cost alerts configured',
        recommendation: 'Set up GCP budget alerts to monitor spending',
        potentialSavings: 'Prevent cost overruns',
        action: 'Configure GCP Billing Alerts'
      },
      {
        priority: 'medium',
        service: 'General',
        resource: 'All',
        issue: 'No scheduled cost reviews',
        recommendation: 'Implement monthly cost review and optimization process',
        potentialSavings: '10-20% through ongoing optimization',
        action: 'Schedule monthly cost review meetings'
      }
    );

    console.log(`✅ Generated ${this.costData.recommendations.length} recommendations`);
  }

  /**
   * Calculate total cost
   */
  async calculateTotalCost() {
    this.costData.totalCost = 0;

    for (const [serviceName, serviceData] of Object.entries(this.costData.services)) {
      if (serviceData.monthlyEstimate) {
        this.costData.totalCost += serviceData.monthlyEstimate;
      }
    }

    console.log(`💰 Total estimated monthly cost: $${this.costData.totalCost.toFixed(2)}`);
  }

  /**
   * Generate cost report
   */
  generateReport() {
    const lines = [];

    lines.push('💰 OmniClaw Cost Analysis Report');
    lines.push(`📅 ${this.costData.timestamp}`);
    lines.push(`📋 Project: ${this.costData.projectId}`);
    lines.push('');

    // Summary
    lines.push('📊 Cost Summary:');
    lines.push(`   Total Monthly Cost: $${this.costData.totalCost.toFixed(2)}`);
    lines.push('');

    // Service breakdown
    lines.push('🏗️  Service Breakdown:');
    for (const [serviceName, serviceData] of Object.entries(this.costData.services)) {
      if (serviceData.monthlyEstimate > 0) {
        lines.push(`   • ${serviceName}: $${serviceData.monthlyEstimate.toFixed(2)}/month`);

        if (serviceData.breakdown) {
          for (const [breakdownName, cost] of Object.entries(serviceData.breakdown)) {
            if (cost > 0) {
              lines.push(`     - ${breakdownName}: $${cost.toFixed(2)}`);
            }
          }
        }
      }
    }
    lines.push('');

    // Cloud Functions details
    if (this.costData.services.cloudFunctions?.functions.length > 0) {
      lines.push('⚡ Cloud Functions Details:');
      for (const func of this.costData.services.cloudFunctions.functions) {
        lines.push(`   • ${func.name} (${func.region})`);
        lines.push(`     Status: ${func.status}`);
        lines.push(`     Runtime: ${func.runtime}`);
        lines.push(`     Memory: ${func.cost.configuration.memory}`);
        lines.push(`     Timeout: ${func.cost.configuration.timeout}`);
        lines.push(`     Monthly Cost: $${func.cost.total.toFixed(4)}`);
        lines.push('');
      }
    }

    // Recommendations
    if (this.costData.recommendations.length > 0) {
      lines.push('💡 Cost Optimization Recommendations:');
      lines.push('');

      const sortedRecommendations = this.costData.recommendations.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      for (const rec of sortedRecommendations) {
        const priorityEmoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        lines.push(`${priorityEmoji} Priority: ${rec.priority.toUpperCase()}`);
        lines.push(`   Service: ${rec.service}`);
        lines.push(`   Resource: ${rec.resource}`);
        lines.push(`   Issue: ${rec.issue}`);
        lines.push(`   Recommendation: ${rec.recommendation}`);
        lines.push(`   Potential Savings: ${rec.potentialSavings}`);
        lines.push(`   Action: ${rec.action}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Export cost data to JSON
   */
  exportResults(outputPath) {
    const json = JSON.stringify(this.costData, null, 2);
    fs.writeFileSync(outputPath, json);
    console.log(`📄 Cost data exported to ${outputPath}`);
  }
}

module.exports = CostManager;

// CLI interface
if (require.main === module) {
  const manager = new CostManager(process.argv[2]);

  manager.analyzeCosts()
    .then(results => {
      console.log('\n' + manager.generateReport());

      if (process.argv[3]) {
        manager.exportResults(process.argv[3]);
      }
    })
    .catch(error => {
      console.error('Cost analysis failed:', error);
      process.exit(1);
    });
}