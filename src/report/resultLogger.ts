import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface StepResult {
  success: boolean;
  step: string;
  data?: any;
  error?: Error;
  timestamp?: Date;
  duration?: number;
}

export interface TestReport {
  timestamp: Date;
  results: StepResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  };
}

export class ResultLogger {
  private results: StepResult[] = [];
  private startTime: Date = new Date();
  private logger = Logger.getInstance();

  public addResult(result: StepResult): void {
    const timestampedResult = {
      ...result,
      timestamp: new Date()
    };
    
    this.results.push(timestampedResult);
    
    this.logger.info(
      `Step ${result.success ? 'PASSED' : 'FAILED'}: ${result.step}`,
      { 
        class: 'ResultLogger',
        method: 'addResult'
      },
      {
        success: result.success,
        error: result.error?.message,
        data: result.data
      }
    );
  }

  public writeReport(filePath: string = 'runix-report.json'): void {
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();
    
    const report: TestReport = {
      timestamp: this.startTime,
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        duration
      }
    };

    try {
      const reportDir = path.dirname(filePath);
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      // Write JSON report
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
      
      // Generate HTML report
      const htmlPath = filePath.replace('.json', '.html');
      this.generateHtmlReport(report, htmlPath);
      
      // Generate console-friendly report
      this.generateConsoleReport(report);
      
      this.logger.info(
        `Test report written to ${filePath}`,
        { 
          class: 'ResultLogger',
          method: 'writeReport'
        },
        {
          reportPath: filePath,
          htmlPath,
          summary: report.summary
        }
      );
    } catch (error) {
      this.logger.error(
        `Failed to write test report`,
        { 
          class: 'ResultLogger',
          method: 'writeReport'
        },
        {
          filePath,
          error: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  private generateHtmlReport(report: TestReport, htmlPath: string): void {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Runix Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: flex; gap: 20px; margin-bottom: 20px; }
        .summary-card { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; min-width: 120px; }
        .passed { background-color: #d4edda; border-color: #c3e6cb; }
        .failed { background-color: #f8d7da; border-color: #f5c6cb; }
        .step { padding: 10px; margin: 5px 0; border-radius: 3px; }
        .step.success { background-color: #d4edda; }
        .step.failure { background-color: #f8d7da; }
        .step-details { font-size: 0.9em; color: #666; margin-top: 5px; }
        .error { color: #721c24; font-family: monospace; }
        .duration { color: #6c757d; font-size: 0.8em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Runix Test Report</h1>
        <p>Generated: ${report.timestamp.toISOString()}</p>
        <p>Duration: ${report.summary.duration}ms</p>
    </div>
    
    <div class="summary">
        <div class="summary-card">
            <h3>${report.summary.total}</h3>
            <p>Total Steps</p>
        </div>
        <div class="summary-card passed">
            <h3>${report.summary.passed}</h3>
            <p>Passed</p>
        </div>
        <div class="summary-card failed">
            <h3>${report.summary.failed}</h3>
            <p>Failed</p>
        </div>
        <div class="summary-card">
            <h3>${Math.round((report.summary.passed / report.summary.total) * 100)}%</h3>
            <p>Success Rate</p>
        </div>
    </div>
    
    <h2>Step Results</h2>
    ${report.results.map((result, index) => `
        <div class="step ${result.success ? 'success' : 'failure'}">
            <strong>Step ${index + 1}: ${result.step}</strong>
            <div class="step-details">
                <span class="duration">${result.duration || 0}ms</span>
                ${result.success ? '✅ PASSED' : '❌ FAILED'}
                ${result.data ? `<br>Data: ${JSON.stringify(result.data)}` : ''}
                ${result.error ? `<br><span class="error">Error: ${result.error.message}</span>` : ''}
            </div>
        </div>
    `).join('')}
</body>
</html>`;
    
    fs.writeFileSync(htmlPath, html);
  }

  private generateConsoleReport(report: TestReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 RUNIX TEST EXECUTION REPORT');
    console.log('='.repeat(80));
    console.log(`📅 Executed: ${report.timestamp.toISOString()}`);
    console.log(`⏱️  Duration: ${report.summary.duration}ms`);
    console.log(`📊 Results: ${report.summary.passed}/${report.summary.total} passed (${Math.round((report.summary.passed / report.summary.total) * 100)}%)`);
    
    if (report.summary.failed > 0) {
      console.log(`❌ Failed: ${report.summary.failed}`);
    }
    
    console.log('\n📋 STEP-BY-STEP RESULTS:');
    console.log('-'.repeat(80));
    
    report.results.forEach((result, index) => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      const duration = result.duration ? `(${result.duration}ms)` : '';
      console.log(`${String(index + 1).padStart(2)}. ${status} ${duration.padEnd(8)} ${result.step}`);
      
      if (result.data && Object.keys(result.data).length > 0) {
        console.log(`    📄 Data: ${JSON.stringify(result.data)}`);
      }
      
      if (result.error) {
        console.log(`    🚨 Error: ${result.error.message}`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    
    if (report.summary.failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Great job!');
    } else {
      console.log(`⚠️  ${report.summary.failed} test(s) failed. Check the details above.`);
    }
    
    console.log('='.repeat(80) + '\n');
  }

  public printSummary(): void {
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;

    this.logger.info(
      `Test Summary: ${passed}/${total} passed, ${failed} failed`,
      { 
        class: 'ResultLogger',
        method: 'printSummary'
      },
      {
        total,
        passed,
        failed,
        successRate: total > 0 ? Math.round((passed / total) * 100) : 0
      }
    );
  }

  public getResults(): StepResult[] {
    return [...this.results];
  }

  public clear(): void {
    this.results = [];
    this.startTime = new Date();
    
    this.logger.debug(
      'Test results cleared',
      { 
        class: 'ResultLogger',
        method: 'clear'
      }
    );
  }
}
