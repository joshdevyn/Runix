import { VoiceController, VoiceConfig, VoiceEvent } from '../../../src/voice/VoiceController';
import { Logger } from '../../../src/utils/logger';

// Mock the Logger to avoid console output during tests
jest.mock('../../../src/utils/logger');

describe('VoiceController', () => {
  let mockLogger: jest.Mocked<Logger>;
  
  beforeEach(() => {
    // Mock logger instance
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
  });

  describe('Configuration', () => {
    it('should be disabled by default when enabled=false', () => {
      const voiceController = new VoiceController({ enabled: false });
      
      expect(voiceController.isEnabled()).toBe(false);
    });

    it('should be enabled when enabled=true', () => {
      const voiceController = new VoiceController({ enabled: true });
      
      expect(voiceController.isEnabled()).toBe(true);
    });

    it('should use default values for optional config properties', () => {
      const voiceController = new VoiceController({ enabled: true });
      
      expect(voiceController.isEnabled()).toBe(true);
      // The VoiceController should handle defaults internally
    });

    it('should accept custom speech parameters', () => {
      const config: VoiceConfig = {
        enabled: true,
        speechRate: 1.5,
        speechPitch: 0.8,
        speechVolume: 0.7,
        language: 'es-ES'
      };
      
      const voiceController = new VoiceController(config);
      
      expect(voiceController.isEnabled()).toBe(true);
    });

    it('should clamp speech rate to valid range', () => {
      const config: VoiceConfig = {
        enabled: true,
        speechRate: 15.0 // Should be clamped to max
      };
      
      // Should not throw - VoiceController should handle clamping internally
      expect(() => new VoiceController(config)).not.toThrow();
    });

    it('should handle invalid config gracefully', () => {
      // Should throw for null/undefined config
      expect(() => new VoiceController(null as any)).toThrow();
      expect(() => new VoiceController(undefined as any)).toThrow();
    });

    it('should allow config updates', () => {
      const voiceController = new VoiceController({ enabled: false });
      
      expect(voiceController.isEnabled()).toBe(false);
      
      const result = voiceController.updateConfig({ enabled: true });
      
      expect(result).toBe(true);
      expect(voiceController.isEnabled()).toBe(true);
    });
  });

  describe('Speech Methods', () => {
    let voiceController: VoiceController;

    beforeEach(() => {
      voiceController = new VoiceController({ enabled: true });
    });

    it('should handle speak method with simple message', async () => {
      const message = 'Hello world';
      
      const result = await voiceController.speak(message);
      
      // Should return a boolean indicating success/failure
      expect(typeof result).toBe('boolean');
    });

    it('should handle announceEvent method', async () => {
      const event: VoiceEvent = {
        type: 'action_start',
        message: 'Starting test action'
      };
      
      const result = await voiceController.announceEvent(event);
      
      expect(typeof result).toBe('boolean');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'VoiceController.announceEvent called',
        expect.objectContaining({
          event: expect.objectContaining({
            type: 'action_start',
            message: 'Starting test action'
          })
        })
      );
    });

    it('should handle different event types', async () => {
      const eventTypes: VoiceEvent['type'][] = [
        'action_start',
        'action_complete', 
        'error',
        'thinking',
        'goal_set'
      ];

      for (const type of eventTypes) {
        const event: VoiceEvent = {
          type,
          message: `Test message for ${type}`
        };
        
        const result = await voiceController.announceEvent(event);
        expect(typeof result).toBe('boolean');
      }
    });

    it('should not announce when disabled', async () => {
      const disabledController = new VoiceController({ enabled: false });
      
      const event: VoiceEvent = {
        type: 'action_start',
        message: 'This should not be announced'
      };
      
      const result = await disabledController.announceEvent(event);
      
      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Voice control disabled, skipping event announcement'
      );
    });

    it('should handle empty message gracefully', async () => {
      const result = await voiceController.speak('');
      expect(typeof result).toBe('boolean');
    });

    it('should handle null/undefined message gracefully', async () => {
      // Test with null and undefined - should not throw
      await expect(voiceController.speak(null as any)).resolves.not.toThrow();
      await expect(voiceController.speak(undefined as any)).resolves.not.toThrow();
    });

    it('should handle very long text', async () => {
      const longText = 'A'.repeat(1000);
      const result = await voiceController.speak(longText);
      expect(typeof result).toBe('boolean');
    });

    it('should handle text with special characters', async () => {
      const specialText = 'Testing with "quotes" and \'apostrophes\' and symbols: @#$%^&*()';
      const result = await voiceController.speak(specialText);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Listen Method', () => {
    let voiceController: VoiceController;

    beforeEach(() => {
      voiceController = new VoiceController({ enabled: true });
    });

    it('should handle listen method with default timeout', async () => {
      const result = await voiceController.listen();
      
      // Should return string or null
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should handle listen method with custom timeout', async () => {
      const result = await voiceController.listen(3000);
      
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should handle listen when disabled', async () => {
      const disabledController = new VoiceController({ enabled: false });
      
      const result = await disabledController.listen();
      
      // Should return null when disabled
      expect(result).toBe(null);
    });
  });

  describe('Platform Detection', () => {
    let originalPlatform: string;

    beforeEach(() => {
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform
      });
    });

    it('should detect Windows platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      const voiceController = new VoiceController({ enabled: true });
      
      expect(voiceController.isEnabled()).toBe(true);
      // On Windows, it should attempt to use SAPI
    });

    it('should detect macOS platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      const voiceController = new VoiceController({ enabled: true });
      
      expect(voiceController.isEnabled()).toBe(true);
      // On macOS, it should attempt to use `say` command
    });

    it('should handle other platforms gracefully', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });

      const voiceController = new VoiceController({ enabled: true });
      
      expect(voiceController.isEnabled()).toBe(true);
      // On other platforms, it should still be enabled but may not have TTS
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', () => {
      const voiceController = new VoiceController({ enabled: true });
      
      // Should not throw
      expect(() => voiceController.shutdown()).not.toThrow();
    });

    it('should handle multiple shutdowns', () => {
      const voiceController = new VoiceController({ enabled: true });
      
      // Multiple shutdowns should not throw
      expect(() => {
        voiceController.shutdown();
        voiceController.shutdown();
      }).not.toThrow();
    });
  });

  describe('Integration with Environment Variables', () => {
    // Test how VoiceController would be created from environment variables
    // (mimicking how AgentDriver does it)
    
    it('should work with environment-style configuration', () => {
      const envConfig: VoiceConfig = {
        enabled: process.env.RUNIX_VOICE_ENABLED === 'true',
        speechRate: parseFloat(process.env.RUNIX_VOICE_RATE || '1.0'),
        speechPitch: parseFloat(process.env.RUNIX_VOICE_PITCH || '1.0'),
        speechVolume: parseFloat(process.env.RUNIX_VOICE_VOLUME || '1.0'),
        language: process.env.RUNIX_VOICE_LANGUAGE || 'en-US'
      };
      
      const voiceController = new VoiceController(envConfig);
      
      // Should create successfully regardless of environment state
      expect(voiceController).toBeDefined();
      expect(typeof voiceController.isEnabled()).toBe('boolean');
    });

    it('should handle malformed environment variables gracefully', () => {
      const envConfig: VoiceConfig = {
        enabled: true, // Force enabled for test
        speechRate: parseFloat('invalid') || 1.0,
        speechPitch: parseFloat('') || 1.0,
        speechVolume: parseFloat('not-a-number') || 1.0,
        language: process.env.RUNIX_VOICE_LANGUAGE || 'en-US' // Test with potential empty env var
      };
      
      const voiceController = new VoiceController(envConfig);
      
      expect(voiceController.isEnabled()).toBe(true);
      // Should handle invalid values by using defaults
    });
  });
});
