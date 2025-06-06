import { DriverInstance } from '../drivers/driver.interface';
import { DriverRegistry } from '../drivers/driverRegistry';
import { Logger } from '../utils/logger';

export class AIOrchestrator {
  private aiDriver: DriverInstance | null = null;
  private visionDriver: DriverInstance | null = null;
  private systemDriver: DriverInstance | null = null;
  private webDriver: DriverInstance | null = null;
  
  private currentSession: {
    id: string;
    mode: 'agent' | 'ask' | 'chat';
    intent: string;
    featureFile?: string;
    executionPlan?: any[];
    currentStep: number;
  } | null = null;

  constructor(
    private driverRegistry: DriverRegistry,
    private log: Logger
  ) {}

  async initialize(): Promise<void> {
    this.log.info('Initializing AI Orchestrator');
    
    // Get required drivers
    this.aiDriver = await this.driverRegistry.getDriverInstance('ai-driver');
    this.systemDriver = await this.driverRegistry.getDriverInstance('system-driver');
    this.webDriver = await this.driverRegistry.getDriverInstance('web-driver');
    
    if (!this.aiDriver) {
      throw new Error('AI Driver is required for AI Orchestrator');
    }
    
    this.log.info('AI Orchestrator initialized successfully');
  }

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
    
    // Take screenshot
    const screenshotResult = await this.systemDriver!.execute('takeScreenshot', [`analysis-${Date.now()}.png`]);
    const screenshot = screenshotResult.data.base64;
    
    // Analyze with AI
    const analysisResult = await this.aiDriver!.execute('analyzeScreenAndPlan', [screenshot, sessionIntent]);
    
    if (this.currentSession) {
      this.currentSession.executionPlan = analysisResult.data.nextActions;
      this.currentSession.featureFile = analysisResult.data.featureFile.filepath;
    }
    
    return analysisResult.data;
  }

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
}
