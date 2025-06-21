import { Logger } from '../utils/logger';

export interface VoiceConfig {
  enabled: boolean;
  speechRate?: number;
  speechPitch?: number;
  speechVolume?: number;
  language?: string;
}

export interface VoiceEvent {
  type: 'action_start' | 'action_complete' | 'error' | 'thinking' | 'goal_set';
  message: string;
  data?: any;
}

/**
 * VoiceController - Text-to-Speech and Speech-to-Text for agent interactions
 * 
 * Follows NASA coding standards:
 * - Single responsibility: Voice I/O only
 * - Simple interface: speak() and listen()
 * - Error handling: All methods check return values
 * - Configurable: Environment variable controlled
 */
export class VoiceController {
  private config: VoiceConfig;
  private logger: Logger;
  private speechSynthesis?: any; // Use 'any' to avoid browser API conflicts in Node.js
  private recognition?: any; // SpeechRecognition interface varies by platform
  constructor(config: VoiceConfig) {
    this.config = this.validateConfig(config);
    this.logger = Logger.getInstance({ 
      context: { class: 'VoiceController' }
    });
    this.initializeSpeech();
  }

  /**
   * Validate configuration parameters
   * NASA Rule: Check all input parameters
   */
  private validateConfig(config: VoiceConfig): VoiceConfig {
    if (!config) {
      throw new Error('VoiceConfig is required');
    }

    return {
      enabled: config.enabled ?? false,
      speechRate: this.clampValue(config.speechRate ?? 1.0, 0.1, 10.0),
      speechPitch: this.clampValue(config.speechPitch ?? 1.0, 0.1, 2.0),
      speechVolume: this.clampValue(config.speechVolume ?? 1.0, 0.0, 1.0),
      language: config.language ?? 'en-US'
    };
  }

  /**
   * Clamp numeric values to valid ranges
   * NASA Rule: Validate all inputs
   */
  private clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
  /**
   * Initialize speech synthesis if available
   * NASA Rule: Check return values and handle errors
   */
  private initializeSpeech(): boolean {
    if (!this.config.enabled) {
      this.logger.debug('Voice control disabled by configuration');
      return false;
    }

    this.logger.debug('Initializing voice control', { 
      platform: process.platform,
      enabled: this.config.enabled 
    });    try {
      // Check if we're in a browser environment
      const globalObj = globalThis as any;
      if (globalObj && 
          globalObj.window && 
          globalObj.window.speechSynthesis) {
        this.speechSynthesis = globalObj.window.speechSynthesis;
        this.logger.info('Browser speech synthesis initialized');
        return true;
      }

      // For Node.js, we'll use platform-specific TTS
      this.logger.info(`Node.js environment detected, using platform-specific TTS for ${process.platform}`);
      return true; // We handle this in fallbackSpeak
    } catch (error) {
      this.logger.error('Failed to initialize speech synthesis', { error });
      return false;
    }
  }

  /**
   * Speak a message using text-to-speech
   * NASA Rule: Keep functions simple and focused
   */
  public async speak(message: string): Promise<boolean> {
    if (!this.isEnabled() || !message || message.trim().length === 0) {
      return false;
    }

    try {
      const success = await this.performSpeech(message);
      if (success) {
        this.logger.debug(`Spoke: "${message}"`);
      }
      return success;
    } catch (error) {
      this.logger.error('Speech failed', { error });
      return false;
    }
  }
  /**
   * Perform the actual speech synthesis
   * NASA Rule: Separate complex operations into focused functions
   */  private async performSpeech(message: string): Promise<boolean> {
    // In browser environment, use speechSynthesis
    if (this.speechSynthesis) {
      return new Promise((resolve) => {
        try {
          // Check if SpeechSynthesisUtterance is available
          const SpeechSynthesisUtterance = (globalThis as any).SpeechSynthesisUtterance;
          if (!SpeechSynthesisUtterance) {
            this.logger.warn('SpeechSynthesisUtterance not available');
            resolve(false);
            return;
          }
          
          const utterance = new SpeechSynthesisUtterance(message);
          
          utterance.rate = this.config.speechRate!;
          utterance.pitch = this.config.speechPitch!;
          utterance.volume = this.config.speechVolume!;
          utterance.lang = this.config.language!;

          utterance.onend = () => resolve(true);
          utterance.onerror = (error: any) => {
            this.logger.error('Speech synthesis error', { error });
            resolve(false);
          };

          this.speechSynthesis!.speak(utterance);
        } catch (error) {
          this.logger.error('Error creating speech utterance', { error });
          resolve(false);
        }
      });
    }

    // In Node.js environment, use platform-specific TTS
    return this.fallbackSpeak(message);
  }
  /**
   * Fallback speech method for non-browser environments
   * NASA Rule: Provide error recovery mechanisms
   */
  private async fallbackSpeak(message: string): Promise<boolean> {
    try {
      // For Windows, use PowerShell with SAPI
      if (process.platform === 'win32') {
        return await this.windowsSpeak(message);
      }
      
      // For macOS, use say command
      if (process.platform === 'darwin') {
        return await this.macSpeak(message);
      }
      
      // For Linux, try espeak if available
      if (process.platform === 'linux') {
        return await this.linuxSpeak(message);
      }
      
      // Fallback: log the message
      this.logger.info(`[VOICE] ${message}`);
      return true;
    } catch (error) {
      this.logger.error('Fallback speech failed', { error });
      this.logger.info(`[VOICE] ${message}`);
      return false;
    }
  }

  /**
   * Windows speech using PowerShell and SAPI
   * NASA Rule: Platform-specific implementations
   */  private async windowsSpeak(message: string): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      
      // Clean and escape message for PowerShell - more robust escaping
      const cleanMessage = message
        .replace(/[\r\n]+/g, ' ')  // Replace line breaks with spaces
        .replace(/\s+/g, ' ')      // Normalize whitespace
        .trim();
      
      // Use base64 encoding to avoid PowerShell escaping issues
      const messageBuffer = Buffer.from(cleanMessage, 'utf-8');
      const base64Message = messageBuffer.toString('base64');
      
      // Use PowerShell with SAPI Speech.SpeechSynthesizer and base64 decoding
      const psCommand = `
        $voice = New-Object -ComObject SAPI.SpVoice;
        $voice.Rate = ${Math.round((this.config.speechRate! - 1) * 10)};
        $voice.Volume = ${Math.round(this.config.speechVolume! * 100)};
        $decodedText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Message}'));
        $voice.Speak($decodedText);
      `;
        this.logger.debug('Windows speech command', { 
        originalLength: message.length,
        cleanedLength: cleanMessage.length,
        base64Length: base64Message.length,
        rate: Math.round((this.config.speechRate! - 1) * 10),
        volume: Math.round(this.config.speechVolume! * 100),
        originalMessage: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        cleanedMessage: cleanMessage.substring(0, 100) + (cleanMessage.length > 100 ? '...' : '')
      });
      
      return new Promise((resolve) => {
        const process = spawn('powershell', ['-Command', psCommand], {
          stdio: 'pipe',
          windowsHide: true
        });
        
        process.on('close', (code) => {
          this.logger.debug('Windows speech process completed', { exitCode: code });
          resolve(code === 0);
        });
        
        process.on('error', (error) => {
          this.logger.debug('Windows speech error', { error });
          resolve(false);
        });
          // Add timeout to prevent hanging
        setTimeout(() => {
          process.kill();          this.logger.debug('Windows speech process timed out');
          resolve(false);
        }, 30000); // 30 second timeout
      });
    } catch (error) {
      this.logger.error('Windows speech failed', { error });
      return false;
    }
  }

  /**
   * macOS speech using say command
   * NASA Rule: Platform-specific implementations
   */
  private async macSpeak(message: string): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      
      const args = [
        '-r', Math.round(this.config.speechRate! * 200).toString(),
        '-v', 'Alex', // Default voice
        message
      ];
      
      return new Promise((resolve) => {
        const process = spawn('say', args, { stdio: 'pipe' });
        
        process.on('close', (code) => {
          resolve(code === 0);
        });
        
        process.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Linux speech using espeak
   * NASA Rule: Platform-specific implementations
   */
  private async linuxSpeak(message: string): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      
      const args = [
        '-s', Math.round(this.config.speechRate! * 150).toString(),
        '-v', 'en',
        message
      ];
      
      return new Promise((resolve) => {
        const process = spawn('espeak', args, { stdio: 'pipe' });
        
        process.on('close', (code) => {
          resolve(code === 0);
        });
        
        process.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Listen for speech input (placeholder for future implementation)
   * NASA Rule: Keep interface consistent and extensible
   */
  public async listen(timeout: number = 5000): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    // TODO: Implement speech recognition
    // This would integrate with Web Speech API or a Node.js speech recognition library
    this.logger.debug('Speech recognition not yet implemented');
    return null;
  }
  /**
   * Announce an agent event with appropriate messaging
   * NASA Rule: Single function for each specific task
   */
  public async announceEvent(event: VoiceEvent): Promise<boolean> {
    const logger = Logger.getInstance();
    logger.debug('VoiceController.announceEvent called', { 
      event, 
      enabled: this.isEnabled() 
    });
    
    if (!this.isEnabled()) {
      logger.debug('Voice control disabled, skipping event announcement');
      return false;
    }

    const message = this.formatEventMessage(event);
    logger.debug('Formatted voice message', { message });
    
    const success = await this.speak(message);
    logger.debug('Voice announcement result', { success, message });
    
    return success;
  }
  /**
   * Format event messages for speech
   * NASA Rule: Separate formatting logic from business logic
   */
  private formatEventMessage(event: VoiceEvent): string {
    // Don't add prefixes - let the calling code control the exact message
    return event.message;
  }

  /**
   * Check if voice control is enabled
   * NASA Rule: Provide simple status checking
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Update configuration
   * NASA Rule: Allow runtime configuration changes
   */
  public updateConfig(newConfig: Partial<VoiceConfig>): boolean {
    try {
      this.config = this.validateConfig({ ...this.config, ...newConfig });
      
      if (this.config.enabled && !this.speechSynthesis) {
        this.initializeSpeech();
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to update voice config', { error });
      return false;
    }
  }

  /**
   * Clean shutdown
   * NASA Rule: Provide proper cleanup methods
   */
  public shutdown(): void {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
    }
    this.logger.debug('VoiceController shutdown complete');
  }
}

/**
 * Factory function to create VoiceController from environment variables
 * NASA Rule: Provide simple factory methods
 */
export function createVoiceControllerFromEnv(): VoiceController {
  const enabled = process.env.RUNIX_VOICE_ENABLED === 'true';
  
  // Use logger to ensure debug output goes to log file
  const logger = Logger.getInstance({ context: { class: 'VoiceController', method: 'createFromEnv' } });
  
  logger.info('Voice Control Environment Check', {
    RUNIX_VOICE_ENABLED: process.env.RUNIX_VOICE_ENABLED,
    enabled,
    allVoiceEnvVars: {
      RUNIX_VOICE_ENABLED: process.env.RUNIX_VOICE_ENABLED,
      RUNIX_VOICE_RATE: process.env.RUNIX_VOICE_RATE,
      RUNIX_VOICE_PITCH: process.env.RUNIX_VOICE_PITCH,
      RUNIX_VOICE_VOLUME: process.env.RUNIX_VOICE_VOLUME,
      RUNIX_VOICE_LANGUAGE: process.env.RUNIX_VOICE_LANGUAGE
    }
  });

  const config: VoiceConfig = {
    enabled,
    speechRate: parseFloat(process.env.RUNIX_VOICE_RATE || '1.0'),
    speechPitch: parseFloat(process.env.RUNIX_VOICE_PITCH || '1.0'),
    speechVolume: parseFloat(process.env.RUNIX_VOICE_VOLUME || '1.0'),
    language: process.env.RUNIX_VOICE_LANGUAGE || 'en-US'
  };

  console.log('Final Voice Config:', config);
  return new VoiceController(config);
}
