import { setupAIDriverTest, cleanupAIDriverTest, TestSetup } from './aiDriver.testSetup';

describe('AIDriver - Editor Mode', () => {
  let testSetup: TestSetup;

  beforeEach(async () => {
    testSetup = setupAIDriverTest();
    await testSetup.aiDriver.initialize({});
  });

  afterEach(() => {
    cleanupAIDriverTest();
  });

  describe('Editor Mode Execution', () => {
    test('starts editor mode session successfully', async () => {
      const { aiDriver } = testSetup;
      
      const result = await aiDriver.execute('editor', ['Test Session']);

      expect(result.success).toBe(true);
      expect(result.data.sessionId).toBeDefined();
      expect(result.data.sessionId).toMatch(/^editor-\d+$/);
      expect(result.data.message).toContain('Editor mode started');
      expect(result.data.observationId).toBeDefined();
    });

    test('handles observation startup failure', async () => {
      const { aiDriver } = testSetup;
      
      // Mock the observe method to fail
      const observeSpy = jest.spyOn(aiDriver as any, 'observeUserActions');
      observeSpy.mockResolvedValue({
        success: false,
        error: { message: 'Failed to start observation' }
      });

      const result = await aiDriver.execute('editor', ['Failed Session']);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to start user observation');
    });

    test('creates unique session IDs', async () => {
      const { aiDriver } = testSetup;
      
      const result1 = await aiDriver.execute('editor', ['Session 1']);
      const result2 = await aiDriver.execute('editor', ['Session 2']);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data.sessionId).not.toEqual(result2.data.sessionId);
    });

    test('passes session name correctly', async () => {
      const { aiDriver, mockLogger } = testSetup;
      
      const sessionName = 'Custom Session Name';
      await aiDriver.execute('editor', [sessionName]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Starting editor mode session: ${sessionName}`),
        expect.any(Object)
      );
    });
  });

  describe('User Action Observation', () => {
    test('configures observation with default parameters', async () => {
      const { aiDriver } = testSetup;
      
      const observeSpy = jest.spyOn(aiDriver as any, 'observeUserActions');
      observeSpy.mockResolvedValue({
        success: true,
        data: { observationId: 'obs-123' }
      });

      await aiDriver.execute('editor', ['Test Session']);

      expect(observeSpy).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^editor-\d+$/),
        duration: 300000, // 5 minutes
        captureInterval: 2000, // 2 seconds
        detectChanges: true
      });
    });

    test('returns observation ID in result', async () => {
      const { aiDriver } = testSetup;
      
      const observeSpy = jest.spyOn(aiDriver as any, 'observeUserActions');
      const mockObservationId = 'obs-test-123';
      observeSpy.mockResolvedValue({
        success: true,
        data: { observationId: mockObservationId }
      });

      const result = await aiDriver.execute('editor', ['Test Session']);

      expect(result.success).toBe(true);
      expect(result.data.observationId).toBe(mockObservationId);
    });
  });
});
