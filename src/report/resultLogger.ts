import * as fs from 'fs';

export interface StepResult {
  step: string;
  success: boolean;
  error?: Error;
  data?: any;  // Added this property to match usage in engine.ts
}

export class ResultLogger {
  private results: StepResult[] = [];
  private defaultReportPath = 'runix-report.json';

  addResult(result: StepResult) {
    this.results.push(result);
  }

  // Update to accept an optional parameter
  writeReport(reportPath?: string) {
    const path = reportPath || this.defaultReportPath;
    fs.writeFileSync(path, JSON.stringify(this.results, null, 2));
  }

  printSummary() {
    console.log('--- Runix Step Summary ---');
    console.log('STEP | STATUS | ERROR');
    for (const r of this.results) {
      const status = r.success ? 'PASS' : 'FAIL';
      console.log(`${r.step} | ${status} | ${r.error ? r.error.message : ''}`);
    }
  }
}
