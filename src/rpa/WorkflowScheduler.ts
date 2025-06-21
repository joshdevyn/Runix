/**
 * Enterprise Workflow Scheduler for RPA
 * Handles scheduled executions, triggers, and monitoring
 */

import { CronJob } from 'cron';
import chokidar, { FSWatcher } from 'chokidar';
import * as nodemailer from 'nodemailer';

export interface ScheduledWorkflow {
  id: string;
  name: string;
  processId: string;
  trigger: WorkflowTrigger;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  failureCount: number;
  averageExecutionTime: number;
  config: WorkflowConfig;
}

export interface WorkflowTrigger {
  type: 'cron' | 'interval' | 'file-change' | 'email' | 'data-change' | 'api-webhook';
  config: TriggerConfig;
}

export interface TriggerConfig {
  // Cron triggers
  cronExpression?: string;
  timezone?: string;
  
  // Interval triggers
  intervalMs?: number;
  
  // File triggers
  watchPath?: string;
  filePattern?: string;
  events?: ('add' | 'change' | 'unlink')[];
  
  // Email triggers
  emailConfig?: {
    host: string;
    port: number;
    user: string;
    password: string;
    subject?: string;
    from?: string;
  };
  
  // Data triggers
  dataSource?: {
    type: 'database' | 'api' | 'file';
    connection: Record<string, any>;
    query?: string;
    checkInterval?: number;
  };
  
  // Webhook triggers
  webhook?: {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT';
    headers?: Record<string, string>;
    authentication?: {
      type: 'basic' | 'bearer' | 'api-key';
      credentials: Record<string, string>;
    };
  };
}

export interface WorkflowConfig {
  maxConcurrentRuns: number;
  timeout: number;
  retryOnFailure: boolean;
  maxRetries: number;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notificationChannels: string[];
  priority: 'low' | 'normal' | 'high' | 'critical';
  runAs?: string; // User context for execution
  environment?: Record<string, string>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  triggeredBy: string;
  context: Record<string, any>;
  logs: ExecutionLog[];
  metrics: ExecutionMetrics;
}

export interface ExecutionLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

export interface ExecutionMetrics {
  stepCount: number;
  stepsCompleted: number;
  stepsFailed: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    network: number;
  };
  driverMetrics: Record<string, any>;
}

export class WorkflowScheduler {
  private scheduledWorkflows: Map<string, ScheduledWorkflow> = new Map();
  private activeJobs: Map<string, CronJob> = new Map();
  private fileWatchers: Map<string, FSWatcher> = new Map();
  private executionHistory: Map<string, WorkflowExecution[]> = new Map();
  private runningExecutions: Map<string, WorkflowExecution> = new Map();

  /**
   * Schedule a new workflow
   */
  async scheduleWorkflow(workflow: ScheduledWorkflow): Promise<void> {
    this.scheduledWorkflows.set(workflow.id, workflow);
    
    if (workflow.enabled) {
      await this.activateWorkflow(workflow.id);
    }
    
    this.updateNextRunTime(workflow);
  }

  /**
   * Activate a scheduled workflow
   */
  async activateWorkflow(workflowId: string): Promise<void> {
    const workflow = this.scheduledWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    await this.setupTrigger(workflow);
  }

  /**
   * Deactivate a scheduled workflow
   */
  async deactivateWorkflow(workflowId: string): Promise<void> {
    const workflow = this.scheduledWorkflows.get(workflowId);
    if (!workflow) return;

    workflow.enabled = false;

    // Stop cron job if exists
    const cronJob = this.activeJobs.get(workflowId);
    if (cronJob) {
      cronJob.stop();
      this.activeJobs.delete(workflowId);
    }

    // Stop file watcher if exists
    const watcher = this.fileWatchers.get(workflowId);
    if (watcher) {
      await watcher.close();
      this.fileWatchers.delete(workflowId);
    }
  }

  /**
   * Execute a workflow manually
   */
  async executeWorkflow(workflowId: string, context: Record<string, any> = {}): Promise<string> {
    const workflow = this.scheduledWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Check concurrency limits
    const runningCount = this.getRunningExecutionCount(workflowId);
    if (runningCount >= workflow.config.maxConcurrentRuns) {
      throw new Error(`Maximum concurrent runs (${workflow.config.maxConcurrentRuns}) exceeded for workflow ${workflowId}`);
    }

    const executionId = `exec-${workflowId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'manual',
      context,
      logs: [],
      metrics: {
        stepCount: 0,
        stepsCompleted: 0,
        stepsFailed: 0,
        resourceUsage: { cpu: 0, memory: 0, network: 0 },
        driverMetrics: {}
      }
    };

    this.runningExecutions.set(executionId, execution);
    
    // Execute workflow
    this.runWorkflowExecution(execution);

    return executionId;
  }

  /**
   * Get workflow execution status
   */
  getExecutionStatus(executionId: string): WorkflowExecution | undefined {
    return this.runningExecutions.get(executionId);
  }

  /**
   * Get workflow execution history
   */
  getExecutionHistory(workflowId: string, limit: number = 50): WorkflowExecution[] {
    const history = this.executionHistory.get(workflowId) || [];
    return history.slice(-limit);
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(workflowId: string): WorkflowStats {
    const workflow = this.scheduledWorkflows.get(workflowId);
    const history = this.executionHistory.get(workflowId) || [];
    
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const recentExecutions = history.slice(-100); // Last 100 executions
    const successfulRuns = recentExecutions.filter(e => e.status === 'completed').length;
    const failedRuns = recentExecutions.filter(e => e.status === 'failed').length;
    const avgDuration = recentExecutions
      .filter(e => e.duration)
      .reduce((sum, e) => sum + e.duration!, 0) / recentExecutions.length || 0;

    return {
      workflowId,
      totalRuns: workflow.runCount,
      successRate: workflow.runCount > 0 ? (workflow.runCount - workflow.failureCount) / workflow.runCount : 0,
      averageExecutionTime: avgDuration,
      lastRun: workflow.lastRun,
      nextRun: workflow.nextRun,
      recentSuccessRate: recentExecutions.length > 0 ? successfulRuns / recentExecutions.length : 0,
      recentFailureRate: recentExecutions.length > 0 ? failedRuns / recentExecutions.length : 0,
      status: workflow.enabled ? 'active' : 'inactive'
    };
  }

  /**
   * Pause a running execution
   */
  async pauseExecution(executionId: string): Promise<void> {
    const execution = this.runningExecutions.get(executionId);
    if (execution && execution.status === 'running') {
      // This would integrate with ProcessManager to pause execution
      this.addExecutionLog(execution, 'info', 'Execution paused by user');
    }
  }

  /**
   * Cancel a running execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.runningExecutions.get(executionId);
    if (execution && ['queued', 'running'].includes(execution.status)) {
      execution.status = 'cancelled';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      
      this.addExecutionLog(execution, 'info', 'Execution cancelled by user');
      this.completeExecution(execution);
    }
  }

  private async setupTrigger(workflow: ScheduledWorkflow): Promise<void> {
    switch (workflow.trigger.type) {
      case 'cron':
        await this.setupCronTrigger(workflow);
        break;
      case 'interval':
        await this.setupIntervalTrigger(workflow);
        break;
      case 'file-change':
        await this.setupFileWatcher(workflow);
        break;
      case 'email':
        await this.setupEmailTrigger(workflow);
        break;
      case 'data-change':
        await this.setupDataTrigger(workflow);
        break;
      case 'api-webhook':
        await this.setupWebhookTrigger(workflow);
        break;
    }
  }

  private async setupCronTrigger(workflow: ScheduledWorkflow): Promise<void> {
    const config = workflow.trigger.config;
    if (!config.cronExpression) {
      throw new Error('Cron expression required for cron trigger');
    }

    const cronJob = new CronJob(
      config.cronExpression,
      () => this.triggerWorkflow(workflow.id, 'cron'),
      null,
      false,
      config.timezone || 'UTC'
    );

    this.activeJobs.set(workflow.id, cronJob);
    cronJob.start();
  }

  private async setupIntervalTrigger(workflow: ScheduledWorkflow): Promise<void> {
    const config = workflow.trigger.config;
    if (!config.intervalMs) {
      throw new Error('Interval required for interval trigger');
    }

    const intervalId = setInterval(
      () => this.triggerWorkflow(workflow.id, 'interval'),
      config.intervalMs
    );

    // Store interval ID for cleanup
    (this.activeJobs as any).set(workflow.id, { stop: () => clearInterval(intervalId) });
  }

  private async setupFileWatcher(workflow: ScheduledWorkflow): Promise<void> {
    const config = workflow.trigger.config;
    if (!config.watchPath) {
      throw new Error('Watch path required for file trigger');
    }

    const watcher = chokidar.watch(config.watchPath, {
      ignored: config.filePattern ? new RegExp(`^(?!.*${config.filePattern})`): undefined,
      persistent: true
    });

    const events = config.events || ['add', 'change'];
      for (const event of events) {
      watcher.on(event, (path: string) => {
        this.triggerWorkflow(workflow.id, 'file-change', { filePath: path, event });
      });
    }

    this.fileWatchers.set(workflow.id, watcher);
  }

  private async setupEmailTrigger(workflow: ScheduledWorkflow): Promise<void> {
    // Implementation would depend on email monitoring solution
    // Could use IMAP client to monitor inbox
  }

  private async setupDataTrigger(workflow: ScheduledWorkflow): Promise<void> {
    // Implementation would monitor data sources for changes
    // Could use database triggers, API polling, or file monitoring
  }

  private async setupWebhookTrigger(workflow: ScheduledWorkflow): Promise<void> {
    // Implementation would set up HTTP endpoints to receive webhooks
    // Could integrate with Express.js or other web framework
  }

  private async triggerWorkflow(workflowId: string, source: string, context: Record<string, any> = {}): Promise<void> {
    try {
      await this.executeWorkflow(workflowId, { ...context, triggeredBy: source });
      
      const workflow = this.scheduledWorkflows.get(workflowId)!;
      workflow.lastRun = new Date();
      workflow.runCount++;
      this.updateNextRunTime(workflow);
      
    } catch (error) {
      console.error(`Failed to trigger workflow ${workflowId}:`, error);
      
      const workflow = this.scheduledWorkflows.get(workflowId)!;
      workflow.failureCount++;
    }
  }

  private async runWorkflowExecution(execution: WorkflowExecution): Promise<void> {
    execution.status = 'running';
    this.addExecutionLog(execution, 'info', 'Workflow execution started');

    try {
      // This would integrate with ProcessManager to execute the actual workflow
      const processManager = new (await import('./ProcessManager')).ProcessManager();
      const processExecutionId = await processManager.executeProcess(
        this.scheduledWorkflows.get(execution.workflowId)!.processId,
        execution.context
      );

      // Monitor process execution
      await this.monitorProcessExecution(execution, processExecutionId, processManager);    } catch (error) {
      execution.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addExecutionLog(execution, 'error', `Workflow execution failed: ${errorMessage}`);
    }

    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
    
    this.completeExecution(execution);
  }

  private async monitorProcessExecution(
    execution: WorkflowExecution,
    processExecutionId: string,
    processManager: any
  ): Promise<void> {
    // Poll process status until completion
    const checkStatus = setInterval(async () => {
      const processStatus = processManager.getExecutionStatus(processExecutionId);
      
      if (processStatus) {
        if (processStatus.status === 'completed') {
          execution.status = 'completed';
          this.addExecutionLog(execution, 'info', 'Workflow execution completed successfully');
          clearInterval(checkStatus);
        } else if (processStatus.status === 'failed') {
          execution.status = 'failed';
          this.addExecutionLog(execution, 'error', 'Workflow execution failed');
          clearInterval(checkStatus);
        }
      }
    }, 1000);

    // Set timeout
    const workflow = this.scheduledWorkflows.get(execution.workflowId)!;
    setTimeout(() => {
      if (execution.status === 'running') {
        execution.status = 'timeout';
        this.addExecutionLog(execution, 'error', 'Workflow execution timed out');
        clearInterval(checkStatus);
      }
    }, workflow.config.timeout);
  }

  private completeExecution(execution: WorkflowExecution): void {
    // Move to history
    if (!this.executionHistory.has(execution.workflowId)) {
      this.executionHistory.set(execution.workflowId, []);
    }
    this.executionHistory.get(execution.workflowId)!.push(execution);

    // Remove from running
    this.runningExecutions.delete(execution.id);

    // Send notifications if configured
    this.sendNotifications(execution);

    // Update workflow statistics
    this.updateWorkflowStats(execution);
  }

  private addExecutionLog(execution: WorkflowExecution, level: string, message: string, data?: any): void {
    execution.logs.push({
      timestamp: new Date(),
      level: level as any,
      message,
      data
    });
  }

  private getRunningExecutionCount(workflowId: string): number {
    return Array.from(this.runningExecutions.values())
      .filter(e => e.workflowId === workflowId && e.status === 'running').length;
  }

  private updateNextRunTime(workflow: ScheduledWorkflow): void {
    if (workflow.trigger.type === 'cron' && workflow.trigger.config.cronExpression) {
      try {
        const cronJob = new CronJob(workflow.trigger.config.cronExpression, () => {}, null, false);
        workflow.nextRun = cronJob.nextDate().toJSDate();
      } catch (error) {
        console.error(`Failed to calculate next run time for workflow ${workflow.id}:`, error);
      }
    }
  }

  private async sendNotifications(execution: WorkflowExecution): Promise<void> {
    const workflow = this.scheduledWorkflows.get(execution.workflowId)!;
    const shouldNotify = (execution.status === 'completed' && workflow.config.notifyOnSuccess) ||
                        (execution.status === 'failed' && workflow.config.notifyOnFailure);

    if (shouldNotify) {
      // Implementation would send notifications via configured channels
      // (email, Slack, Teams, etc.)
    }
  }

  private updateWorkflowStats(execution: WorkflowExecution): void {
    const workflow = this.scheduledWorkflows.get(execution.workflowId)!;
    
    if (execution.duration) {
      // Update average execution time
      const totalTime = workflow.averageExecutionTime * workflow.runCount + execution.duration;
      workflow.averageExecutionTime = totalTime / (workflow.runCount + 1);
    }
  }
}

export interface WorkflowStats {
  workflowId: string;
  totalRuns: number;
  successRate: number;
  averageExecutionTime: number;
  lastRun?: Date;
  nextRun?: Date;
  recentSuccessRate: number;
  recentFailureRate: number;
  status: 'active' | 'inactive';
}
