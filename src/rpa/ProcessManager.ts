/**
 * Business Process Management for RPA
 * Manages long-running business processes with state persistence
 */

export interface BusinessProcess {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed';
  steps: ProcessStep[];
  triggers: ProcessTrigger[];
  schedule?: ScheduleConfig;
  sla?: SLAConfig;
  metadata: Record<string, any>;
  createdAt: Date;
  lastExecuted?: Date;
}

export interface ProcessStep {
  id: string;
  name: string;
  type: 'human-task' | 'automation' | 'decision' | 'integration';
  automation?: {
    driverType: string;
    featureFile?: string;
    actions: any[];
  };
  humanTask?: {
    assignee: string;
    formFields: any[];
    timeout: number;
  };
  conditions?: {
    if: string;
    then: string;
    else?: string;
  };
  retryPolicy?: {
    maxAttempts: number;
    backoffStrategy: 'linear' | 'exponential';
    delay: number;
  };
}

export interface ProcessTrigger {
  type: 'schedule' | 'file-watcher' | 'email' | 'webhook' | 'manual';
  config: Record<string, any>;
  enabled: boolean;
}

export interface ScheduleConfig {
  type: 'once' | 'recurring';
  startTime?: Date;
  cronExpression?: string;
  timezone?: string;
  endDate?: Date;
}

export interface SLAConfig {
  maxDuration: number; // in milliseconds
  warningThreshold: number; // percentage of maxDuration
  escalationRules: EscalationRule[];
}

export interface EscalationRule {
  condition: string;
  action: 'notify' | 'reassign' | 'pause' | 'abort';
  target: string;
}

export class ProcessManager {
  private processes: Map<string, BusinessProcess> = new Map();
  private activeExecutions: Map<string, ProcessExecution> = new Map();

  /**
   * Define a new business process
   */
  async defineProcess(process: BusinessProcess): Promise<void> {
    // Validate process definition
    this.validateProcess(process);
    
    // Store process definition
    this.processes.set(process.id, process);
    
    // Set up triggers
    await this.setupTriggers(process);
  }

  /**
   * Execute a business process
   */
  async executeProcess(processId: string, context: Record<string, any> = {}): Promise<string> {
    const process = this.processes.get(processId);
    if (!process) {
      throw new Error(`Process ${processId} not found`);
    }

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const execution: ProcessExecution = {
      id: executionId,
      processId,
      status: 'running',
      currentStep: 0,
      context,
      startTime: new Date(),
      stepResults: [],
      errors: []
    };

    this.activeExecutions.set(executionId, execution);

    // Start execution
    this.runProcessExecution(execution);

    return executionId;
  }

  /**
   * Get process execution status
   */
  getExecutionStatus(executionId: string): ProcessExecution | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Pause a running process
   */
  async pauseExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      execution.status = 'paused';
      execution.pausedAt = new Date();
    }
  }

  /**
   * Resume a paused process
   */
  async resumeExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (execution && execution.status === 'paused') {
      execution.status = 'running';
      execution.pausedAt = undefined;
      this.runProcessExecution(execution);
    }
  }

  /**
   * Cancel a running process
   */
  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      execution.status = 'cancelled';
      execution.endTime = new Date();
    }
  }

  private async runProcessExecution(execution: ProcessExecution): Promise<void> {
    const process = this.processes.get(execution.processId)!;
    
    while (execution.currentStep < process.steps.length && execution.status === 'running') {
      const step = process.steps[execution.currentStep];
      
      try {
        const result = await this.executeStep(step, execution);
        execution.stepResults.push(result);
        execution.currentStep++;      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        execution.errors.push({
          step: execution.currentStep,
          error: errorMessage,
          timestamp: new Date()
        });

        // Initialize retryAttempts if not set
        if (execution.retryAttempts === undefined) {
          execution.retryAttempts = 0;
        }

        // Handle retry logic
        if (step.retryPolicy && execution.retryAttempts < step.retryPolicy.maxAttempts) {
          execution.retryAttempts++;
          await this.delay(step.retryPolicy.delay);
          continue;
        }

        execution.status = 'failed';
        execution.endTime = new Date();
        break;
      }
    }

    if (execution.status === 'running') {
      execution.status = 'completed';
      execution.endTime = new Date();
    }
  }

  private async executeStep(step: ProcessStep, execution: ProcessExecution): Promise<any> {
    switch (step.type) {
      case 'automation':
        return await this.executeAutomationStep(step, execution);
      case 'human-task':
        return await this.executeHumanTask(step, execution);
      case 'decision':
        return await this.executeDecisionStep(step, execution);
      case 'integration':
        return await this.executeIntegrationStep(step, execution);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }
  private async executeAutomationStep(step: ProcessStep, execution: ProcessExecution): Promise<any> {
    // NOTE: Full AIOrchestrator integration would require proper initialization with DriverRegistry and Logger
    // For enterprise deployment, consider implementing a service pattern where ProcessManager 
    // receives an initialized orchestrator instance via dependency injection
    
    // Use orchestration methods without full initialization for simple automation
    if (step.automation?.featureFile) {
      // For feature files, we would need a proper orchestrator instance
      // For now, return a placeholder
      return { status: 'feature_file_loaded', file: step.automation.featureFile };
    } else if (step.automation?.actions) {
      // Execute individual actions - simplified approach
      const results = [];
      for (const action of step.automation.actions) {
        // Simple action execution without full orchestrator
        results.push({ action: action.action, status: 'executed', args: action.args });
      }
      return results;
    }
    
    return { status: 'no_automation_defined' };
  }

  private async executeHumanTask(step: ProcessStep, execution: ProcessExecution): Promise<any> {
    // Create human task and wait for completion
    // This would integrate with a task management system
    return new Promise((resolve) => {
      // Placeholder for human task integration
      setTimeout(() => resolve({ completed: true }), 1000);
    });
  }

  private async executeDecisionStep(step: ProcessStep, execution: ProcessExecution): Promise<any> {
    // Evaluate conditions and determine next step
    if (step.conditions) {
      const condition = this.evaluateCondition(step.conditions.if, execution.context);
      return { nextStep: condition ? step.conditions.then : step.conditions.else };
    }
    return { nextStep: null };
  }

  private async executeIntegrationStep(step: ProcessStep, execution: ProcessExecution): Promise<any> {
    // Integration with external systems (APIs, databases, etc.)
    return { integration: 'completed' };
  }

  private validateProcess(process: BusinessProcess): void {
    if (!process.id || !process.name || !process.steps || process.steps.length === 0) {
      throw new Error('Invalid process definition');
    }
  }

  private async setupTriggers(process: BusinessProcess): Promise<void> {
    for (const trigger of process.triggers) {
      if (trigger.enabled) {
        await this.setupTrigger(process.id, trigger);
      }
    }
  }

  private async setupTrigger(processId: string, trigger: ProcessTrigger): Promise<void> {
    switch (trigger.type) {
      case 'schedule':
        // Set up cron-based scheduling
        break;
      case 'file-watcher':
        // Set up file system monitoring
        break;
      case 'email':
        // Set up email monitoring
        break;
      case 'webhook':
        // Set up webhook endpoint
        break;
    }
  }

  private evaluateCondition(condition: string, context: Record<string, any>): boolean {
    // Simple condition evaluation - would be enhanced with proper expression engine
    return true;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export interface ProcessExecution {
  id: string;
  processId: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  context: Record<string, any>;
  startTime: Date;
  endTime?: Date;
  pausedAt?: Date;
  stepResults: any[];
  errors: Array<{
    step: number;
    error: string;
    timestamp: Date;
  }>;
  retryAttempts?: number;
}
