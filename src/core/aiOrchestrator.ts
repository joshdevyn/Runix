import { DriverInstance } from '../drivers/driver.interface';
import { DriverRegistry } from '../drivers/driverRegistry';
import { Logger } from '../utils/logger';

export interface DriverCapabilityProfile {
  driverId: string;
  capabilities: string[];
  performance: {
    avgResponseTime: number;
    successRate: number;
    lastUpdated: number;
  };
  contextAwareness: {
    canAnalyzeUI: boolean;
    canProcessFiles: boolean;
    canInteractWithWeb: boolean;
    canProcessImages: boolean;
  };
}

export interface WorkflowContext {
  currentState: any;
  availableDrivers: DriverCapabilityProfile[];
  previousSteps: any[];
  userPreferences: any;
  errorHistory: any[];
}

export interface IntelligentPlan {
  steps: any[];
  reasoning: string;
  confidence: number;
  alternativeApproaches: any[];
  expectedOutcome: string;
}

export interface WorkerNode {
  id: string;
  endpoint: string;
  capabilities: string[];
  status: 'idle' | 'busy' | 'offline' | 'draining';
  load: number;
  lastHeartbeat: number;
  maxConcurrentJobs: number;
  currentJobs: string[];
}

export interface JobQueue {
  id: string;
  priority: number;
  workflowSteps: any[];
  assignedWorker?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
  dependencies: string[];
}

export interface ClusterConfiguration {
  masterNode: string;
  workerNodes: WorkerNode[];
  loadBalancingStrategy: 'round-robin' | 'least-loaded' | 'capability-based';
  jobTimeout: number;
  heartbeatInterval: number;
  maxRetries: number;
  enableAutoScaling: boolean;
}

export interface ExecutionMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageExecutionTime: number;
  peakConcurrency: number;
  workerUtilization: Map<string, number>;
  errorRate: number;
  throughput: number;
}

export class AIOrchestrator {
  private aiDriver: DriverInstance | null = null;
  private visionDriver: DriverInstance | null = null;
  private systemDriver: DriverInstance | null = null;
  private webDriver: DriverInstance | null = null;
  
  private driverProfiles: Map<string, DriverCapabilityProfile> = new Map();
  private workflowHistory: any[] = [];
  private learningDatabase: Map<string, any> = new Map();
  
  // Distributed execution and enterprise scaling
  private clusterConfig: ClusterConfiguration | null = null;
  private workerNodes: Map<string, WorkerNode> = new Map();
  private jobQueue: JobQueue[] = [];
  private activeJobs: Map<string, JobQueue> = new Map();
  private executionMetrics: ExecutionMetrics = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    averageExecutionTime: 0,
    peakConcurrency: 0,
    workerUtilization: new Map(),
    errorRate: 0,
    throughput: 0
  };  private heartbeatTimer: NodeJS.Timeout | null = null;
  private metricsCollectionTimer: NodeJS.Timeout | null = null;
  
  private currentSession: {
    id: string;
    mode: 'agent' | 'ask' | 'chat';
    intent: string;
    featureFile?: string;
    executionPlan?: any[];
    currentStep: number;
    context?: WorkflowContext;
    intelligentPlan?: IntelligentPlan;
  } | null = null;

  // CUA-inspired agent execution patterns
  private cuaConfig = {
    maxTurnIterations: 10,
    enableSafetyChecks: true,
    enableScreenshotOnActions: true,
    enableUrlSafetyChecks: true
  };

  private blockedDomains = [
    'malware-site.com',
    'phishing-example.com', 
    'suspicious-domain.net'
  ];

  constructor(
    private driverRegistry: DriverRegistry,
    private log: Logger
  ) {}

  async initialize(): Promise<void> {
    this.log.info('Initializing AI Orchestrator with advanced capabilities');
    
    // Get required drivers
    this.aiDriver = await this.driverRegistry.getDriverInstance('ai-driver');
    this.systemDriver = await this.driverRegistry.getDriverInstance('system-driver');
    this.webDriver = await this.driverRegistry.getDriverInstance('web-driver');
    this.visionDriver = await this.driverRegistry.getDriverInstance('vision-driver');
    
    if (!this.aiDriver) {
      throw new Error('AI Driver is required for AI Orchestrator');
    }
    
    // Initialize driver capability profiles
    await this.initializeDriverProfiles();
    
    // Load learning patterns from previous sessions
    await this.loadLearningPatterns();
    
    this.log.info('AI Orchestrator initialized successfully with enhanced intelligence');
  }
  /**
   * Initialize driver capability profiles for intelligent routing
   */
  private async initializeDriverProfiles(): Promise<void> {
    const driverIds = this.driverRegistry.listDriverIds();
    
    for (const driverId of driverIds) {
      try {
        const driverInstance = await this.driverRegistry.getDriverInstance(driverId);
        const capabilities = await driverInstance.getCapabilities();
        
        const profile: DriverCapabilityProfile = {
          driverId,
          capabilities: capabilities.supportedActions || [],
          performance: {
            avgResponseTime: 1000, // Default, will be updated with actual metrics
            successRate: 0.95, // Default, will be updated with actual metrics
            lastUpdated: Date.now()
          },
          contextAwareness: {
            canAnalyzeUI: driverId.includes('vision') || driverId.includes('ai'),
            canProcessFiles: driverId.includes('system') || driverId.includes('ai'),
            canInteractWithWeb: driverId.includes('web') || driverId.includes('system'),
            canProcessImages: driverId.includes('vision') || driverId.includes('ai')
          }
        };
        
        this.driverProfiles.set(driverId, profile);
        this.log.debug(`Initialized profile for driver: ${driverId}`, { 
          capabilities: profile.capabilities.length 
        });
      } catch (error) {
        this.log.warn(`Failed to initialize profile for driver: ${driverId}`, { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  }

  /**
   * Load learning patterns from previous successful workflows
   */
  private async loadLearningPatterns(): Promise<void> {
    try {
      // This would typically load from a persistent store
      // For now, initialize with some basic patterns
      this.learningDatabase.set('file_operations', {
        commonSequence: ['takeScreenshot', 'createFile', 'readFile'],
        successRate: 0.92,
        avgSteps: 3
      });
      
      this.learningDatabase.set('web_automation', {
        commonSequence: ['open', 'takeScreenshot', 'click', 'enterText'],
        successRate: 0.88,
        avgSteps: 4
      });
      
      this.learningDatabase.set('image_analysis', {
        commonSequence: ['takeScreenshot', 'analyzeScene', 'extractText'],
        successRate: 0.85,
        avgSteps: 3
      });
      
      this.log.debug('Loaded learning patterns', { 
        patterns: this.learningDatabase.size 
      });
    } catch (error) {
      this.log.warn('Failed to load learning patterns', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Update driver performance metrics based on execution results
   */
  async updateDriverPerformance(driverId: string, responseTime: number, success: boolean): Promise<void> {
    const profile = this.driverProfiles.get(driverId);
    if (!profile) return;
    
    // Update moving average for response time
    profile.performance.avgResponseTime = 
      (profile.performance.avgResponseTime * 0.8) + (responseTime * 0.2);
    
    // Update success rate with exponential smoothing
    const currentSuccess = success ? 1 : 0;
    profile.performance.successRate = 
      (profile.performance.successRate * 0.9) + (currentSuccess * 0.1);
    
    profile.performance.lastUpdated = Date.now();
    
    this.driverProfiles.set(driverId, profile);
  }
  /**
   * Learn from workflow execution for future optimization - Delegated to AI driver
   */
  async learnFromExecution(workflow: any[], results: any[]): Promise<void> {
    if (!workflow || workflow.length === 0) return;
    
    try {
      // Delegate learning to AI driver
      await this.aiDriver!.execute('learn', [workflow, results]);
    } catch (error) {
      this.log.warn('Learning delegation failed', { error });
    }
  }
  // Simplified categorization - complex logic moved to AI driver

  async startSession(intent: string, mode: 'agent' | 'ask' | 'chat' = 'chat'): Promise<string> {
    const sessionId = `ai-session-${Date.now()}`;
    
    this.currentSession = {
      id: sessionId,
      mode: mode,
      intent: intent,
      currentStep: 0
    };
    
    // Set AI mode
    await this.aiDriver!.execute('setMode', [mode]);
    
    // Start session in AI driver
    await this.aiDriver!.execute('startSession', [sessionId, intent]);
    
    this.log.info(`Started AI session: ${sessionId}`, { mode, intent });
    
    return sessionId;
  }
  async analyzeAndPlan(intent?: string): Promise<any> {
    if (!this.currentSession && !intent) {
      throw new Error('No active session and no intent provided');
    }
    
    const sessionIntent = intent || this.currentSession!.intent;
    
    // Build comprehensive context
    const context = await this.buildWorkflowContext(sessionIntent);
    
    // Generate intelligent plan using AI and historical data
    const intelligentPlan = await this.generateIntelligentPlan(sessionIntent, context);
    
    if (this.currentSession) {
      this.currentSession.executionPlan = intelligentPlan.steps;
      this.currentSession.context = context;
      this.currentSession.intelligentPlan = intelligentPlan;
    }
    
    return {
      plan: intelligentPlan,
      context: context,
      nextActions: intelligentPlan.steps,
      reasoning: intelligentPlan.reasoning,
      confidence: intelligentPlan.confidence
    };
  }
  /**
   * Build comprehensive workflow context for intelligent planning
   */
  private async buildWorkflowContext(intent: string): Promise<WorkflowContext> {
    // Delegate context building to AI driver for complex analysis
    try {
      const contextResult = await this.aiDriver!.execute('buildContext', [intent, {
        driverProfiles: Array.from(this.driverProfiles.values()),
        workflowHistory: this.workflowHistory.slice(-10)
      }]);
      
      if (contextResult.success && contextResult.data) {
        return contextResult.data;
      }
    } catch (error) {
      this.log.warn('AI context building failed, using simple context', { error });
    }
    
    // Simple fallback context
    return {
      currentState: { intent },
      availableDrivers: Array.from(this.driverProfiles.values()),
      previousSteps: [],
      userPreferences: {},
      errorHistory: []
    };
  }
  /**
   * Generate intelligent execution plan using AI driver
   */
  private async generateIntelligentPlan(intent: string, context: WorkflowContext): Promise<IntelligentPlan> {
    try {
      // Delegate intelligent planning to AI driver
      const planResult = await this.aiDriver!.execute('plan', [intent, context]);
      
      if (planResult.success && planResult.data) {
        return {
          steps: planResult.data.steps || [],
          reasoning: planResult.data.reasoning || `AI-generated plan for: ${intent}`,
          confidence: planResult.data.confidence || 0.8,
          alternativeApproaches: planResult.data.alternatives || [],
          expectedOutcome: planResult.data.expectedOutcome || `Completion of: ${intent}`
        };
      }
      
      // Fallback to simple plan
      return this.generateFallbackPlan(intent, context.availableDrivers);
    } catch (error) {
      this.log.warn('AI planning failed, using fallback', { error });
      return this.generateFallbackPlan(intent, context.availableDrivers);
    }
  }
  /** Intent categorization moved to AI driver
   * Generate fallback plan when AI is unavailable
   */
  private generateFallbackPlan(intent: string, drivers: DriverCapabilityProfile[]): IntelligentPlan {
    const primaryDriver = drivers[0] || this.driverProfiles.get('system-driver');
    
    const baseSteps = [
      {
        id: 'step-1',
        description: `Analyze intent: ${intent}`,
        action: 'analyzeIntent',
        driver: 'ai-driver',
        args: [intent]
      },
      {
        id: 'step-2', 
        description: `Execute primary action using ${primaryDriver?.driverId}`,
        action: 'execute',
        driver: primaryDriver?.driverId || 'system-driver',
        args: [intent]
      }
    ];
    
    return {
      steps: baseSteps,
      reasoning: `Fallback plan using available drivers`,
      confidence: 0.6,
      alternativeApproaches: [],
      expectedOutcome: `Completion of: ${intent}`
    };
  }
  // Simplified orchestrator - complex AI logic moved to AI driver

  async executeNextStep(): Promise<any> {
    if (!this.currentSession || !this.currentSession.executionPlan) {
      throw new Error('No active session or execution plan');
    }
    
    const nextAction = this.currentSession.executionPlan[this.currentSession.currentStep];
    
    if (!nextAction) {
      return { completed: true, message: 'All steps completed' };
    }
    
    let result;
    
    if (this.currentSession.mode === 'agent') {
      // Execute automatically
      result = await this.executeAction(nextAction);
      this.currentSession.currentStep++;
    } else if (this.currentSession.mode === 'ask') {
      // Return action for user confirmation
      result = {
        needsConfirmation: true,
        action: nextAction,
        prompt: `Should I ${nextAction.description}?`,
        step: this.currentSession.currentStep
      };
    } else {
      // Chat mode: explain what would happen
      result = {
        explanation: `I would ${nextAction.description}`,
        action: nextAction,
        step: this.currentSession.currentStep,
        wouldExecute: false
      };
    }
    
    return result;
  }

  async confirmAndExecute(stepIndex: number, confirmed: boolean): Promise<any> {
    if (!this.currentSession || !this.currentSession.executionPlan) {
      throw new Error('No active session or execution plan');
    }
    
    if (!confirmed) {
      return { skipped: true, step: stepIndex };
    }
    
    const action = this.currentSession.executionPlan[stepIndex];
    const result = await this.executeAction(action);
    
    this.currentSession.currentStep = stepIndex + 1;
    
    return result;
  }

  private async executeAction(action: any): Promise<any> {
    this.log.info(`Executing action: ${action.action}`, action);
    
    switch (action.action) {
      case 'clickAt':
      case 'doubleClickAt':
      case 'rightClickAt':
      case 'typeText':
      case 'pressKey':
      case 'moveMouse':
      case 'drag':
      case 'scroll':
        return await this.systemDriver!.execute(action.action, action.args);
        
      case 'open':
      case 'click':
      case 'enterText':
        return await this.webDriver!.execute(action.action, action.args);
        
      default:
        throw new Error(`Unknown action: ${action.action}`);
    }
  }

  async loadFeatureFile(filepath: string): Promise<void> {
    const result = await this.aiDriver!.execute('loadFeatureFile', [filepath]);
    
    if (this.currentSession) {
      this.currentSession.featureFile = filepath;
    }
    
    this.log.info(`Loaded feature file: ${filepath}`);
  }

  async generateFeatureFile(): Promise<string | null> {
    return this.currentSession?.featureFile || null;
  }

  getCurrentSession(): any {
    return this.currentSession;
  }

  async continueSession(sessionId: string, featureFile?: string): Promise<void> {
    if (featureFile) {
      await this.loadFeatureFile(featureFile);
    }
    
    this.currentSession = {
      id: sessionId,
      mode: 'chat', // Default, will be updated
      intent: 'Continue previous session',
      featureFile: featureFile,
      currentStep: 0
    };
    
    await this.aiDriver!.execute('continueSession', [sessionId, featureFile]);
    
    this.log.info(`Continued session: ${sessionId}`);
  }

  /**
   * Initialize distributed execution cluster
   */
  async initializeCluster(config: ClusterConfiguration): Promise<void> {
    this.clusterConfig = config;
    
    // Initialize worker nodes
    for (const workerNode of config.workerNodes) {
      this.workerNodes.set(workerNode.id, {
        ...workerNode,
        status: 'offline',
        load: 0,
        lastHeartbeat: 0,
        currentJobs: []
      });
    }
    
    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();
    
    // Start metrics collection
    this.startMetricsCollection();
    
    this.log.info('Distributed execution cluster initialized', {
      masterNode: config.masterNode,
      workerCount: config.workerNodes.length,
      loadBalancing: config.loadBalancingStrategy
    });
  }

  /**
   * Submit a workflow for distributed execution
   */
  async submitDistributedWorkflow(workflow: any[], priority: number = 5): Promise<string> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const job: JobQueue = {
      id: jobId,
      priority,
      workflowSteps: workflow,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: this.clusterConfig?.maxRetries || 3,
      dependencies: this.extractDependencies(workflow)
    };
    
    // Insert job in priority order
    this.insertJobByPriority(job);
    this.executionMetrics.totalJobs++;
    
    // Try immediate assignment if workers available
    await this.processJobQueue();
    
    this.log.info(`Submitted distributed workflow job: ${jobId}`, {
      steps: workflow.length,
      priority,
      queuePosition: this.jobQueue.findIndex(j => j.id === jobId)
    });
    
    return jobId;
  }

  /**
   * Process pending jobs in the queue
   */
  private async processJobQueue(): Promise<void> {
    if (!this.clusterConfig) return;
    
    const availableWorkers = Array.from(this.workerNodes.values())
      .filter(worker => worker.status === 'idle' && worker.currentJobs.length < worker.maxConcurrentJobs);
    
    if (availableWorkers.length === 0) return;
    
    // Process jobs based on priority and dependencies
    for (let i = 0; i < this.jobQueue.length && availableWorkers.length > 0; i++) {
      const job = this.jobQueue[i];
      
      if (job.status !== 'pending') continue;
      
      // Check if dependencies are resolved
      if (!this.areDependenciesResolved(job)) continue;
      
      // Select optimal worker for this job
      const worker = this.selectOptimalWorker(job, availableWorkers);
      if (!worker) continue;
      
      // Assign job to worker
      await this.assignJobToWorker(job, worker);
      
      // Remove from available workers
      const workerIndex = availableWorkers.findIndex(w => w.id === worker.id);
      if (workerIndex > -1) availableWorkers.splice(workerIndex, 1);
    }
  }

  /**
   * Select optimal worker for a job based on load balancing strategy
   */
  private selectOptimalWorker(job: JobQueue, availableWorkers: WorkerNode[]): WorkerNode | null {
    if (availableWorkers.length === 0) return null;
    
    switch (this.clusterConfig!.loadBalancingStrategy) {
      case 'round-robin':
        return availableWorkers[this.executionMetrics.totalJobs % availableWorkers.length];
        
      case 'least-loaded':
        return availableWorkers.reduce((least, current) => 
          current.load < least.load ? current : least
        );
        
      case 'capability-based':
        // Find workers with matching capabilities for job requirements
        const requiredCapabilities = this.extractRequiredCapabilities(job.workflowSteps);
        const capableWorkers = availableWorkers.filter(worker =>
          requiredCapabilities.every(cap => worker.capabilities.includes(cap))
        );
        
        if (capableWorkers.length === 0) return null;
        
        // Among capable workers, select least loaded
        return capableWorkers.reduce((least, current) => 
          current.load < least.load ? current : least
        );
        
      default:
        return availableWorkers[0];
    }
  }

  /**
   * Assign a job to a specific worker
   */
  private async assignJobToWorker(job: JobQueue, worker: WorkerNode): Promise<void> {
    job.assignedWorker = worker.id;
    job.status = 'running';
    job.startedAt = Date.now();
    
    worker.currentJobs.push(job.id);
    worker.status = 'busy';
    worker.load = worker.currentJobs.length / worker.maxConcurrentJobs;
    
    this.activeJobs.set(job.id, job);
    
    // Remove from pending queue
    const queueIndex = this.jobQueue.findIndex(j => j.id === job.id);
    if (queueIndex > -1) this.jobQueue.splice(queueIndex, 1);
    
    try {
      // Send job to worker via WebSocket/HTTP
      await this.sendJobToWorker(job, worker);
      
      this.log.info(`Job assigned to worker`, {
        jobId: job.id,
        workerId: worker.id,
        workerLoad: worker.load
      });
    } catch (error) {
      // Handle assignment failure
      await this.handleJobAssignmentFailure(job, worker, error);
    }
  }

  /**
   * Send job execution request to worker node
   */
  private async sendJobToWorker(job: JobQueue, worker: WorkerNode): Promise<void> {
    // This would integrate with actual worker communication
    // For now, simulate the process
    
    const payload = {
      jobId: job.id,
      workflowSteps: job.workflowSteps,
      timeout: this.clusterConfig!.jobTimeout,
      retryCount: job.retryCount
    };
    
    // In a real implementation, this would send via WebSocket or HTTP
    // await this.workerCommunicator.send(worker.endpoint, payload);
    
    // Simulate async execution
    setTimeout(async () => {
      // Simulate random success/failure
      const success = Math.random() > 0.1; // 90% success rate
      await this.handleJobCompletion(job.id, success, { 
        results: `Simulated execution of ${job.workflowSteps.length} steps`,
        executionTime: Math.random() * 5000 + 1000
      });
    }, Math.random() * 3000 + 1000); // 1-4 seconds execution time
  }

  /**
   * Handle job completion from worker
   */
  async handleJobCompletion(jobId: string, success: boolean, results: any): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;
    
    job.completedAt = Date.now();
    job.status = success ? 'completed' : 'failed';
    
    const worker = this.workerNodes.get(job.assignedWorker!);
    if (worker) {
      const jobIndex = worker.currentJobs.indexOf(jobId);
      if (jobIndex > -1) worker.currentJobs.splice(jobIndex, 1);
      
      worker.load = worker.currentJobs.length / worker.maxConcurrentJobs;
      if (worker.currentJobs.length === 0) worker.status = 'idle';
    }
    
    if (success) {
      this.executionMetrics.completedJobs++;
      
      // Learn from successful execution
      await this.learnFromExecution(job.workflowSteps, [{ success: true, duration: results.executionTime }]);
      
      this.log.info(`Job completed successfully`, {
        jobId,
        executionTime: results.executionTime,
        workerId: job.assignedWorker
      });
    } else {
      this.executionMetrics.failedJobs++;
      
      // Handle retry logic
      if (job.retryCount < job.maxRetries) {
        await this.retryJob(job);
      } else {
        this.log.error(`Job failed after max retries`, {
          jobId,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries
        });
      }
    }
    
    this.activeJobs.delete(jobId);
    this.updateExecutionMetrics();
    
    // Process next jobs in queue
    await this.processJobQueue();
  }

  /**
   * Retry a failed job
   */
  private async retryJob(job: JobQueue): Promise<void> {
    job.retryCount++;
    job.status = 'pending';
    job.assignedWorker = undefined;
    
    // Add back to queue with higher priority for retry
    job.priority += 1;
    this.insertJobByPriority(job);
    
    this.log.info(`Retrying job`, {
      jobId: job.id,
      retryCount: job.retryCount,
      newPriority: job.priority
    });
    
    // Process queue immediately for retry
    await this.processJobQueue();
  }

  /**
   * Helper methods for distributed execution
   */
  private startHeartbeatMonitoring(): void {
    if (!this.clusterConfig) return;
    
    this.heartbeatTimer = setInterval(async () => {
      for (const [workerId, worker] of this.workerNodes) {
        const now = Date.now();
        if (now - worker.lastHeartbeat > this.clusterConfig!.heartbeatInterval * 2) {
          // Worker is considered offline
          if (worker.status !== 'offline') {
            worker.status = 'offline';
            await this.handleWorkerOffline(worker);
          }
        }
      }
    }, this.clusterConfig.heartbeatInterval);
  }

  private startMetricsCollection(): void {
    this.metricsCollectionTimer = setInterval(() => {
      this.updateExecutionMetrics();
    }, 10000); // Update metrics every 10 seconds
  }

  private extractDependencies(workflow: any[]): string[] {
    // Extract step dependencies from workflow
    return workflow
      .filter(step => step.dependencies && Array.isArray(step.dependencies))
      .flatMap(step => step.dependencies);
  }

  private insertJobByPriority(job: JobQueue): void {
    // Insert job in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.jobQueue.length; i++) {
      if (job.priority > this.jobQueue[i].priority) {
        this.jobQueue.splice(i, 0, job);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.jobQueue.push(job);
    }
  }

  private areDependenciesResolved(job: JobQueue): boolean {
    if (!job.dependencies || job.dependencies.length === 0) return true;
    
    // Check if all dependency jobs are completed
    return job.dependencies.every(depId => {
      const completedJob = this.activeJobs.get(depId);
      return completedJob?.status === 'completed';
    });
  }

  private extractRequiredCapabilities(workflowSteps: any[]): string[] {
    const capabilities: string[] = [];
    
    for (const step of workflowSteps) {
      if (step.action?.includes('file') || step.action?.includes('command')) {
        capabilities.push('file-operations');
      }
      if (step.action?.includes('web') || step.action?.includes('browser')) {
        capabilities.push('web-automation');
      }
      if (step.action?.includes('vision') || step.action?.includes('image')) {
        capabilities.push('image-processing');
      }
      if (step.action?.includes('ai') || step.action?.includes('analyze')) {
        capabilities.push('ai-processing');
      }
    }
    
    return [...new Set(capabilities)]; // Remove duplicates
  }

  private async handleJobAssignmentFailure(job: JobQueue, worker: WorkerNode, error: any): Promise<void> {
    this.log.error(`Job assignment failed`, {
      jobId: job.id,
      workerId: worker.id,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Reset job status
    job.status = 'pending';
    job.assignedWorker = undefined;
    
    // Reset worker status
    const jobIndex = worker.currentJobs.indexOf(job.id);
    if (jobIndex > -1) worker.currentJobs.splice(jobIndex, 1);
    
    worker.load = worker.currentJobs.length / worker.maxConcurrentJobs;
    if (worker.currentJobs.length === 0) worker.status = 'idle';
    
    // Put job back in queue
    this.insertJobByPriority(job);
  }

  private updateExecutionMetrics(): void {
    const now = Date.now();
    const completedJobs = this.executionMetrics.completedJobs;
    const failedJobs = this.executionMetrics.failedJobs;
    const totalJobs = this.executionMetrics.totalJobs;
    
    // Update error rate
    this.executionMetrics.errorRate = totalJobs > 0 ? failedJobs / totalJobs : 0;
    
    // Update peak concurrency
    const currentConcurrency = this.activeJobs.size;
    if (currentConcurrency > this.executionMetrics.peakConcurrency) {
      this.executionMetrics.peakConcurrency = currentConcurrency;
    }
    
    // Update worker utilization
    for (const [workerId, worker] of this.workerNodes) {
      this.executionMetrics.workerUtilization.set(workerId, worker.load);
    }
    
    // Update throughput (jobs per minute)
    const timeWindow = 60000; // 1 minute
    const recentJobs = completedJobs; // Simplified - would track time-based in real implementation
    this.executionMetrics.throughput = recentJobs;
  }

  private async handleWorkerOffline(worker: WorkerNode): Promise<void> {
    this.log.warn(`Worker went offline: ${worker.id}`);
    
    // Reassign active jobs from offline worker
    const orphanedJobs = Array.from(this.activeJobs.values())
      .filter(job => job.assignedWorker === worker.id);
    
    for (const job of orphanedJobs) {
      job.status = 'pending';
      job.assignedWorker = undefined;
      this.insertJobByPriority(job);
      this.activeJobs.delete(job.id);
    }
    
    // Clear worker's job list
    worker.currentJobs = [];
    worker.load = 0;
    
    if (orphanedJobs.length > 0) {
      this.log.info(`Reassigned ${orphanedJobs.length} jobs from offline worker`);
      await this.processJobQueue();
    }
  }

  /**
   * Enterprise scaling and monitoring capabilities
   */
  async getClusterStatus(): Promise<any> {
    if (!this.clusterConfig) {
      return { error: 'Cluster not initialized' };
    }
    
    const workerStatuses = Array.from(this.workerNodes.values()).map(worker => ({
      id: worker.id,
      status: worker.status,
      load: worker.load,
      currentJobs: worker.currentJobs.length,
      maxJobs: worker.maxConcurrentJobs,
      lastHeartbeat: worker.lastHeartbeat,
      uptime: worker.lastHeartbeat > 0 ? Date.now() - worker.lastHeartbeat : 0
    }));
    
    return {
      cluster: {
        masterNode: this.clusterConfig.masterNode,
        totalWorkers: this.workerNodes.size,
        activeWorkers: workerStatuses.filter(w => w.status !== 'offline').length,
        loadBalancing: this.clusterConfig.loadBalancingStrategy
      },
      queue: {
        pending: this.jobQueue.length,
        active: this.activeJobs.size,
        totalProcessed: this.executionMetrics.totalJobs
      },
      metrics: {
        ...this.executionMetrics,
        workerUtilization: Object.fromEntries(this.executionMetrics.workerUtilization)
      },
      workers: workerStatuses
    };
  }

  async scaleCluster(targetWorkerCount: number): Promise<void> {
    if (!this.clusterConfig) {
      throw new Error('Cluster not initialized');
    }
    
    const currentWorkerCount = this.workerNodes.size;
    
    if (targetWorkerCount > currentWorkerCount) {
      // Scale up - add new workers
      await this.scaleUp(targetWorkerCount - currentWorkerCount);
    } else if (targetWorkerCount < currentWorkerCount) {
      // Scale down - remove workers gracefully
      await this.scaleDown(currentWorkerCount - targetWorkerCount);
    }
    
    this.log.info(`Cluster scaled`, {
      previousCount: currentWorkerCount,
      newCount: targetWorkerCount,
      direction: targetWorkerCount > currentWorkerCount ? 'up' : 'down'
    });
  }

  private async scaleUp(additionalWorkers: number): Promise<void> {
    for (let i = 0; i < additionalWorkers; i++) {
      const workerId = `worker-${Date.now()}-${i}`;
      const workerPort = 9100 + this.workerNodes.size + i; // Dynamic port assignment
      
      const newWorker: WorkerNode = {
        id: workerId,
        endpoint: `ws://localhost:${workerPort}`,
        capabilities: ['file-operations', 'web-automation', 'ai-processing'], // Default capabilities
        status: 'idle',
        load: 0,
        lastHeartbeat: Date.now(),
        maxConcurrentJobs: 3,
        currentJobs: []
      };
      
      this.workerNodes.set(workerId, newWorker);
      
      // In a real implementation, this would spawn actual worker processes
      this.log.debug(`Scaled up: Added worker ${workerId}`);
    }
  }

  private async scaleDown(workersToRemove: number): Promise<void> {
    // Find idle workers to remove first
    const idleWorkers = Array.from(this.workerNodes.values())
      .filter(worker => worker.status === 'idle')
      .slice(0, workersToRemove);
    
    // If not enough idle workers, wait for busy ones to finish
    if (idleWorkers.length < workersToRemove) {
      const busyWorkers = Array.from(this.workerNodes.values())
        .filter(worker => worker.status === 'busy')
        .slice(0, workersToRemove - idleWorkers.length);
      
      // Mark busy workers for removal after completion
      for (const worker of busyWorkers) {
        worker.status = 'draining'; // Custom status for graceful shutdown
      }
    }
    
    // Remove idle workers immediately
    for (const worker of idleWorkers) {
      this.workerNodes.delete(worker.id);
      this.log.debug(`Scaled down: Removed idle worker ${worker.id}`);
    }
  }

  /**
   * Auto-scaling based on queue size and worker utilization
   */
  async performAutoScaling(): Promise<void> {
    if (!this.clusterConfig?.enableAutoScaling) return;
    
    const queueSize = this.jobQueue.length;
    const activeWorkers = Array.from(this.workerNodes.values()).filter(w => w.status !== 'offline');
    const averageLoad = activeWorkers.reduce((sum, w) => sum + w.load, 0) / activeWorkers.length;
    
    let targetWorkerCount = activeWorkers.length;
    
    // Scale up conditions
    if (queueSize > 10 && averageLoad > 0.8) {
      targetWorkerCount = Math.min(activeWorkers.length + 2, 10); // Max 10 workers
    }
    // Scale down conditions
    else if (queueSize === 0 && averageLoad < 0.3 && activeWorkers.length > 2) {
      targetWorkerCount = Math.max(activeWorkers.length - 1, 2); // Min 2 workers
    }
    
    if (targetWorkerCount !== activeWorkers.length) {
      await this.scaleCluster(targetWorkerCount);
      
      this.log.info('Auto-scaling performed', {
        queueSize,
        averageLoad,
        previousWorkers: activeWorkers.length,
        newWorkers: targetWorkerCount
      });
    }
  }

  /**
   * Performance monitoring and optimization
   */
  async optimizePerformance(): Promise<void> {
    // Analyze driver performance patterns
    const performanceReport = await this.generatePerformanceReport();
    
    // Optimize driver selection based on historical performance
    await this.optimizeDriverProfiles();
    
    // Suggest workflow optimizations
    const optimizations = await this.suggestWorkflowOptimizations();
    
    this.log.info('Performance optimization completed', {
      driverProfilesUpdated: this.driverProfiles.size,
      optimizationsGenerated: optimizations.length,
      averageSuccessRate: performanceReport.averageSuccessRate
    });
  }

  private async generatePerformanceReport(): Promise<any> {
    const driverPerformance = Array.from(this.driverProfiles.entries()).map(([id, profile]) => ({
      driverId: id,
      successRate: profile.performance.successRate,
      avgResponseTime: profile.performance.avgResponseTime,
      lastUpdated: profile.performance.lastUpdated
    }));
    
    const averageSuccessRate = driverPerformance.reduce((sum, p) => sum + p.successRate, 0) / driverPerformance.length;
    const averageResponseTime = driverPerformance.reduce((sum, p) => sum + p.avgResponseTime, 0) / driverPerformance.length;
    
    return {
      timestamp: Date.now(),
      driverPerformance,
      averageSuccessRate,
      averageResponseTime,
      totalWorkflows: this.workflowHistory.length,
      errorPatterns: this.learningDatabase.get('error_patterns')?.length || 0
    };
  }

  private async optimizeDriverProfiles(): Promise<void> {
    // Update driver profiles based on recent performance
    for (const [driverId, profile] of this.driverProfiles) {      const recentWorkflows = this.workflowHistory
        .filter(w => w.workflow.some((step: any) => step.driver === driverId))
        .slice(-20); // Last 20 workflows
      if (recentWorkflows.length > 0) {
        const recentSuccessRate = recentWorkflows.reduce((sum, w) => sum + w.successRate, 0) / recentWorkflows.length;
        
        // Blend historical and recent performance
        profile.performance.successRate = (profile.performance.successRate * 0.7) + (recentSuccessRate * 0.3);
        profile.performance.lastUpdated = Date.now();
      }
    }
  }

  private async suggestWorkflowOptimizations(): Promise<string[]> {
    const optimizations: string[] = [];
    
    // Analyze common failure patterns
    const errorPatterns = this.learningDatabase.get('error_patterns') || [];
    const frequentErrors = errorPatterns.reduce((acc: any, error: any) => {
      acc[error.errorType] = (acc[error.errorType] || 0) + 1;
      return acc;
    }, {});
    
    for (const [errorType, count] of Object.entries(frequentErrors)) {
      if ((count as number) > 3) {
        optimizations.push(`Consider alternative approach for ${errorType} errors (${count} occurrences)`);
      }
    }
    
    // Suggest parallel execution opportunities
    const sequentialPatterns = this.learningDatabase.get('sequential_patterns') || [];
    if (sequentialPatterns.length > 0) {
      optimizations.push('Consider parallel execution for independent file and web operations');
    }
    
    // Driver utilization recommendations
    const underutilizedDrivers = Array.from(this.driverProfiles.values())
      .filter(profile => profile.performance.successRate > 0.95 && profile.performance.avgResponseTime < 1000);
    
    if (underutilizedDrivers.length > 0) {
      optimizations.push(`Increase usage of high-performing drivers: ${underutilizedDrivers.map(d => d.driverId).join(', ')}`);
    }
    
    return optimizations;
  }

  /**
   * Advanced workflow coordination for parallel execution
   */
  async executeParallelWorkflow(workflows: any[][]): Promise<any> {
    if (!workflows || workflows.length === 0) {
      throw new Error('No workflows provided for parallel execution');
    }
    
    const parallelJobs = workflows.map(async (workflow, index) => {
      const jobId = await this.submitDistributedWorkflow(workflow, 5 + index); // Slightly different priorities
      return { jobId, workflowIndex: index };
    });
    
    const submittedJobs = await Promise.all(parallelJobs);
    
    this.log.info('Parallel workflows submitted', {
      totalWorkflows: workflows.length,
      jobIds: submittedJobs.map(j => j.jobId)
    });
    
    // Monitor parallel execution
    return this.monitorParallelExecution(submittedJobs);
  }

  private async monitorParallelExecution(jobs: any[]): Promise<any> {
    const results: any[] = [];
    const completedJobs = new Set<string>();
    
    return new Promise((resolve) => {
      const checkCompletion = setInterval(() => {
        for (const job of jobs) {
          if (!completedJobs.has(job.jobId)) {
            const activeJob = this.activeJobs.get(job.jobId);
            if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'failed') {
              completedJobs.add(job.jobId);
              results.push({
                workflowIndex: job.workflowIndex,
                jobId: job.jobId,
                status: activeJob?.status || 'completed',
                completedAt: activeJob?.completedAt || Date.now()
              });
            }
          }
        }
        
        if (completedJobs.size === jobs.length) {
          clearInterval(checkCompletion);
          resolve({
            results,
            totalExecutionTime: Math.max(...results.map(r => r.completedAt)) - Math.min(...results.map(r => r.completedAt || Date.now())),
            successCount: results.filter(r => r.status === 'completed').length,
            failureCount: results.filter(r => r.status === 'failed').length
          });
        }
      }, 500); // Check every 500ms
    });
  }

  /**
   * Shutdown cluster gracefully
   */
  async shutdownCluster(): Promise<void> {
    this.log.info('Initiating cluster shutdown');
    
    // Stop accepting new jobs
    this.jobQueue = [];
    
    // Wait for active jobs to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeJobs.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.log.debug(`Waiting for ${this.activeJobs.size} active jobs to complete`);
    }
    
    // Force stop remaining jobs
    if (this.activeJobs.size > 0) {
      this.log.warn(`Force stopping ${this.activeJobs.size} remaining jobs`);
      this.activeJobs.clear();
    }
    
    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.metricsCollectionTimer) {
      clearInterval(this.metricsCollectionTimer);
      this.metricsCollectionTimer = null;
    }
    
    // Clear worker nodes
    this.workerNodes.clear();
    this.clusterConfig = null;
    
    this.log.info('Cluster shutdown completed');
  }
  /**
   * Run a complete agent turn using CUA-inspired loop pattern
   * Delegates to AI driver for actual agent execution
   */
  async runAgentTurn(
    initialIntent: string,
    context?: any,
    options?: {
      maxIterations?: number;
      enableDebug?: boolean;
      enableScreenshots?: boolean;
    }
  ): Promise<{
    success: boolean;
    messages: any[];
    finalState?: any;
    screenshots?: string[];
    iterations: number;
  }> {
    const maxIterations = options?.maxIterations || this.cuaConfig.maxTurnIterations;
    const enableDebug = options?.enableDebug || false;
    const enableScreenshots = options?.enableScreenshots || this.cuaConfig.enableScreenshotOnActions;

    this.log.info('Starting CUA-inspired agent turn (delegating to AI driver)', { 
      intent: initialIntent,
      maxIterations 
    });

    try {
      // Delegate the entire agent conversation to the AI driver
      const agentResult = await this.aiDriver!.execute('agentConversation', [
        [{ role: 'user', content: initialIntent }],
        {
          maxIterations,
          enableSafetyChecks: this.cuaConfig.enableSafetyChecks,
          takeScreenshots: enableScreenshots,
          showDebug: enableDebug
        }
      ]);

      if (agentResult.success) {
        return {
          success: agentResult.data.completed || false,
          messages: agentResult.data.messages || [],
          finalState: context,
          screenshots: agentResult.data.screenshots || [],
          iterations: agentResult.data.iterations || 0
        };
      } else {
        this.log.error('Agent conversation failed', { error: agentResult.error });
        return {
          success: false,
          messages: [{ role: 'error', content: agentResult.error?.message || 'Agent conversation failed' }],
          finalState: context,
          screenshots: [],
          iterations: 0
        };
      }
    } catch (error) {
      this.log.error('Error during agent turn', { error });
      return {
        success: false,
        messages: [{ role: 'error', content: error instanceof Error ? error.message : String(error) }],
        finalState: context,
        screenshots: [],
        iterations: 0
      };
    }
  }

  /**
   * Execute an action with CUA-inspired safety checks
   */
  private async executeActionWithSafety(
    action: any,
    captureScreenshot: boolean = true
  ): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    screenshot?: string;
    safetyChecks?: any[];
  }> {
    try {
      // Perform safety checks first
      if (this.cuaConfig.enableSafetyChecks) {
        const safetyChecks = await this.performActionSafetyChecks(action);
        const criticalIssues = safetyChecks.filter(check => check.severity === 'critical');
        
        if (criticalIssues.length > 0) {
          return {
            success: false,
            error: `Safety check failed: ${criticalIssues[0].message}`,
            safetyChecks
          };
        }
      }      // Execute the action using our existing driver system
      const result = await this.executeAction(action);
        // Capture screenshot after action if enabled
      let screenshot: string | null | undefined;
      if (captureScreenshot && result.success) {
        try {
          screenshot = await this.takeScreenshot();
        } catch (screenshotError) {
          this.log.warn('Failed to capture post-action screenshot', { screenshotError });
        }
      }      return {
        success: result.success,
        data: result.data,
        error: result.error?.message || undefined,
        screenshot: screenshot || undefined
      };

    } catch (error) {
      this.log.error('Action execution failed', { action, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Perform CUA-inspired safety checks on actions
   */
  private async performActionSafetyChecks(action: any): Promise<Array<{
    id: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
  }>> {
    const checks: Array<{id: string; message: string; severity: 'info' | 'warning' | 'critical'}> = [];

    // URL safety checks for web actions
    if (action.action === 'open' && action.url) {
      const url = action.url.toLowerCase();
      
      for (const blockedDomain of this.blockedDomains) {
        if (url.includes(blockedDomain)) {
          checks.push({
            id: 'blocked-domain',
            message: `Attempting to navigate to blocked domain: ${blockedDomain}`,
            severity: 'critical'
          });
        }
      }

      // Check for suspicious localhost access
      if (url.includes('localhost') && (url.includes('admin') || url.includes('config'))) {
        checks.push({
          id: 'localhost-admin',
          message: 'Attempting to access localhost admin/config interface',
          severity: 'warning'
        });
      }
    }

    // File system safety checks
    if (['deleteFile', 'removeDirectory', 'executeCommand'].includes(action.action)) {
      checks.push({
        id: 'destructive-action',
        message: `Attempting potentially destructive action: ${action.action}`,
        severity: 'warning'
      });
    }

    // Command execution safety
    if (action.action === 'executeCommand' && action.command) {
      const dangerousPatterns = ['rm -rf', 'del /s', 'format', 'shutdown', 'reboot'];
      const command = action.command.toLowerCase();
      
      for (const pattern of dangerousPatterns) {
        if (command.includes(pattern)) {
          checks.push({
            id: 'dangerous-command',
            message: `Command contains dangerous pattern: ${pattern}`,
            severity: 'critical'
          });
        }
      }
    }

    return checks;
  }
  /**
   * Enhanced screenshot capture with error handling
   */
  private async takeScreenshot(): Promise<string | null> {
    try {
      if (this.visionDriver) {
        const result = await this.visionDriver.executeStep('takeScreenshot', []);
        return result.success ? result.data?.screenshot : null;
      } else if (this.systemDriver) {
        const result = await this.systemDriver.executeStep('takeScreenshot', []);
        return result.success ? result.data?.screenshot : null;
      }
      return null;
    } catch (error) {
      this.log.error('Screenshot capture failed', { error });
      return null;
    }
  }

  /**
   * Detect if agent is stuck in a repeating pattern
   */
  private isRepeatingPattern(messages: any[]): boolean {
    if (messages.length < 6) return false;

    // Check last 6 messages for patterns
    const recentMessages = messages.slice(-6);
    const assistantMessages = recentMessages
      .filter(msg => msg.role === 'assistant')
      .map(msg => msg.content);

    if (assistantMessages.length < 3) return false;

    // Simple pattern detection - check if same response repeated
    const lastResponse = assistantMessages[assistantMessages.length - 1];
    const secondLastResponse = assistantMessages[assistantMessages.length - 2];
    
    return lastResponse === secondLastResponse;
  }

  /**
   * Update current state based on action results
   */
  private updateStateFromAction(currentState: any, action: any, result: any): any {
    const newState = { ...currentState };
    
    // Update based on action type
    switch (action.action) {
      case 'open':
        newState.currentUrl = action.url;
        newState.pageLoaded = result.success;
        break;
        
      case 'click':
        newState.lastClickPosition = { x: action.x, y: action.y };
        newState.lastClickSuccess = result.success;
        break;
        
      case 'enterText':
        newState.lastTextEntered = action.text;
        newState.lastTextSuccess = result.success;
        break;
        
      case 'takeScreenshot':
        newState.lastScreenshot = result.data?.screenshot;
        newState.lastScreenshotTime = Date.now();
        break;
    }
    
    // Add action to history
    if (!newState.actionHistory) newState.actionHistory = [];
    newState.actionHistory.push({
      action,
      result: { success: result.success, timestamp: Date.now() },
      index: newState.actionHistory.length
    });
    
    // Keep only last 10 actions in history
    if (newState.actionHistory.length > 10) {
      newState.actionHistory = newState.actionHistory.slice(-10);
    }
    
    return newState;
  }

  // ...rest of existing methods...
}
