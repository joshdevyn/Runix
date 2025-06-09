const {
  createPlanningPrompt,
  buildComprehensiveFeatureContent,
  generateFallbackPlan,
  extractIntent
} = require('../../../../drivers/ai-driver/index.js'); // Updated path for new location

describe('AI Driver Unit Tests', () => {
  describe('extractIntent', () => {
    test('should extract "login" intent', () => {
      expect(extractIntent('please log me in')).toBe('login');
      expect(extractIntent('I want to sign in')).toBe('login');
    });

    test('should extract "upload file" intent', () => {
      expect(extractIntent('upload a new file')).toBe('upload file');
    });

    test('should extract "submit form" intent', () => {
      expect(extractIntent('submit the completed form')).toBe('submit form');
    });

    test('should extract "search" intent', () => {
      expect(extractIntent('search for documents')).toBe('search');
    });

    test('should extract "navigate" intent', () => {
      expect(extractIntent('navigate to the homepage')).toBe('navigate');
      expect(extractIntent('go to settings page')).toBe('navigate');
    });

    test('should return original text for unknown intents', () => {
      expect(extractIntent('what is the weather today?')).toBe('what is the weather today?');
    });
  });

  describe('createPlanningPrompt', () => {
    test('should create a valid planning prompt structure', () => {
      const taskInfo = {
        description: 'Test the login feature',
        currentState: { screen: 'login_page' },
        context: { user: 'testuser' }
      };
      const prompt = createPlanningPrompt(taskInfo);
      expect(prompt).toHaveLength(2);
      expect(prompt[0].role).toBe('system');
      expect(prompt[1].role).toBe('user');
      expect(prompt[0].content).toContain('You are an AI assistant that creates detailed automation plans.');
      expect(prompt[1].content).toContain('Plan steps for task: Test the login feature');
      expect(prompt[1].content).toContain(`Current state: {
  "screen": "login_page"
}`);
      expect(prompt[1].content).toContain(`Additional context: {
  "user": "testuser"
}`);
    });

    test('should handle undefined task description and context', () => {
      const taskInfo = {
        description: undefined,
        currentState: {},
        context: undefined
      };
      const prompt = createPlanningPrompt(taskInfo);
      expect(prompt[1].content).toContain('Plan steps for task: Unspecified task');
      expect(prompt[1].content).toContain('Additional context: {}');
    });
  });

  describe('buildComprehensiveFeatureContent', () => {
    const baseTask = {
      description: 'Test Feature',
      mode: 'ai',
      steps: [
        { description: 'User is on the homepage' },
        { description: 'User clicks login button' },
        { description: 'User sees dashboard' }
      ]
    };

    test('should build basic feature content', () => {
      const content = buildComprehensiveFeatureContent(baseTask, {});
      expect(content).toContain('Feature: Test Feature');
      expect(content).toContain('Scenario: Execute ai mode task - Test Feature');
      expect(content).toContain('Given I user is on the homepage');
      expect(content).toContain('When I user clicks login button');
      expect(content).toContain('Then I user sees dashboard');
      expect(content).not.toContain('# Artifacts generated during execution:');
      expect(content).not.toContain('# Execution Summary:');
    });

    test('should include artifacts if specified and available', () => {
      const taskWithArtifacts = {
        ...baseTask,
        artifacts: ['screenshot1.png', 'log.txt']
      };
      const content = buildComprehensiveFeatureContent(taskWithArtifacts, { includeScreenshots: true });
      expect(content).toContain('# Artifacts generated during execution:');
      expect(content).toContain('# - screenshot1.png');
      expect(content).toContain('# - log.txt');
    });

    test('should include execution summary if task has status and steps', () => {
      const taskWithStatus = {
        ...baseTask,
        status: 'completed',
        steps: baseTask.steps.map(s => ({ ...s, status: 'completed' }))
      };
      const content = buildComprehensiveFeatureContent(taskWithStatus, {});
      expect(content).toContain('# Execution Summary:');
      expect(content).toContain('# Status: completed');
      expect(content).toContain('# Completed Steps: 3/3');
    });

    test('should handle tasks without predefined steps', () => {
        const taskWithoutSteps = {
            description: 'Ad-hoc Task',
            mode: 'manual'
        };
        const content = buildComprehensiveFeatureContent(taskWithoutSteps, {});
        expect(content).toContain('Feature: Ad-hoc Task');
        expect(content).toContain('Scenario: Execute task without defined steps');
        expect(content).toContain('Given I have a task to complete');
    });
  });

  describe('generateFallbackPlan', () => {
    test('should generate a basic fallback plan', () => {
      const taskInfo = { description: 'Do something simple' };
      const plan = generateFallbackPlan(taskInfo);
      expect(plan.success).toBe(true);
      expect(plan.data.plan).toBe('Fallback plan for: Do something simple');
      expect(plan.data.steps).toHaveLength(2); // Screenshot and Analyze
      expect(plan.data.steps[0].action).toBe('takeScreenshot');
      expect(plan.data.steps[1].action).toBe('analyzeScene');
      expect(plan.data.fallback).toBe(true);
      expect(plan.data.confidence).toBe(0.6);
    });

    test('should include login steps if "login" is in description', () => {
      const taskInfo = { description: 'Help me login', username: 'testuser' };
      const plan = generateFallbackPlan(taskInfo);
      expect(plan.data.steps.length).toBeGreaterThan(2);
      const loginSteps = plan.data.steps.filter(s => s.description.toLowerCase().includes('username') || s.description.toLowerCase().includes('password'));
      expect(loginSteps.length).toBeGreaterThan(0);
      expect(plan.data.steps.some(s => s.action === 'findElement' && s.args[0] === 'username field')).toBe(true);
      expect(plan.data.steps.some(s => s.action === 'enterText' && s.args[0] === 'testuser')).toBe(true);
    });

    test('should include form steps if "form" is in description', () => {
        const taskInfo = { description: 'Fill out the contact form' };
        const plan = generateFallbackPlan(taskInfo);
        expect(plan.data.steps.length).toBeGreaterThan(2);
        expect(plan.data.steps.some(s => s.action === 'detectUI' && s.args[0] === 'form')).toBe(true);
    });
  });
});
