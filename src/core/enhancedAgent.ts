import { Computer, ComputerAction, ComputerActionResult } from './computer.interface';
import { DriverInstance } from '../drivers/driver.interface';
import { Logger } from '../utils/logger';

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'computer_call' | 'computer_call_output' | 'function_call' | 'function_call_output';
  content?: string | Array<{type: string, text?: string, image_url?: string}>;
  action?: ComputerAction;
  call_id?: string;
  output?: any;
  name?: string;
  arguments?: string;
}

export interface AgentTool {
  type: 'computer-preview' | 'function';
  name?: string;
  description?: string;
  parameters?: any;
  display_width?: number;
  display_height?: number;
  environment?: string;
}

export interface AgentConfig {
  model?: string;
  computer: Computer;
  tools?: AgentTool[];
  acknowledgeCallback?: (message: string) => Promise<boolean>;
  enableDebug?: boolean;
  showImages?: boolean;
  printSteps?: boolean;
}

export interface AgentResponse {
  output: AgentMessage[];
  reasoning?: string;
  confidence?: number;
}

/**
 * Enhanced Agent inspired by OpenAI CUA architecture
 * Provides intelligent multi-turn conversation with computer actions
 */
export class EnhancedAgent {
  private model: string;
  private computer: Computer;
  private tools: AgentTool[];
  private acknowledgeCallback: (message: string) => Promise<boolean>;
  private enableDebug: boolean;
  private showImages: boolean;
  private printSteps: boolean;
  private aiDriver: DriverInstance | null = null;

  constructor(
    config: AgentConfig,
    private log: Logger,
    private driverRegistry: any
  ) {
    this.model = config.model || 'gpt-4-vision-preview';
    this.computer = config.computer;
    this.tools = config.tools || [];
    this.acknowledgeCallback = config.acknowledgeCallback || (() => Promise.resolve(true));
    this.enableDebug = config.enableDebug || false;
    this.showImages = config.showImages || false;
    this.printSteps = config.printSteps || true;

    // Add computer tool automatically
    const dimensions = this.computer.getDimensions();
    this.tools.unshift({
      type: 'computer-preview',
      display_width: dimensions.width,
      display_height: dimensions.height,
      environment: this.computer.getEnvironment()
    });
  }

  async initialize(): Promise<void> {
    this.log.info('Initializing Enhanced Agent');
    
    try {
      // Initialize the computer
      await this.computer.initialize();
      
      // Get AI driver for intelligent responses
      this.aiDriver = await this.driverRegistry.getDriverInstance('ai-driver');
      
      this.log.info('Enhanced Agent initialized successfully');
    } catch (error) {
      this.log.error('Failed to initialize Enhanced Agent', { error });
      throw error;
    }
  }

  /**
   * Run a full conversation turn - keeps executing until complete
   */
  async runFullTurn(
    inputMessages: AgentMessage[],
    options?: {
      printSteps?: boolean;
      debug?: boolean;
      showImages?: boolean;
      maxIterations?: number;
    }
  ): Promise<AgentMessage[]> {
    const config = {
      printSteps: options?.printSteps ?? this.printSteps,
      debug: options?.debug ?? this.enableDebug,
      showImages: options?.showImages ?? this.showImages,
      maxIterations: options?.maxIterations ?? 10
    };

    this.debugPrint('Starting full turn execution', { inputMessages: inputMessages.length });
    
    let newMessages: AgentMessage[] = [];
    let iterations = 0;

    // Keep looping until we get a final assistant response
    while (iterations < config.maxIterations) {
      const lastMessage = newMessages.length > 0 ? newMessages[newMessages.length - 1] : null;
      
      if (lastMessage?.role === 'assistant' && !lastMessage.action) {
        this.debugPrint('Received final assistant response, ending turn');
        break;
      }

      iterations++;
      this.debugPrint(`Turn iteration ${iterations}`, { 
        totalMessages: inputMessages.length + newMessages.length 
      });

      try {
        // Get AI response
        const response = await this.createResponse(inputMessages.concat(newMessages));
        
        if (!response.output || response.output.length === 0) {
          this.log.warn('No output from AI model');
          break;
        }

        // Process each message in the response
        for (const message of response.output) {
          newMessages.push(message);
          
          // Handle the message and get any resulting messages
          const resultMessages = await this.handleMessage(message, config);
          newMessages.push(...resultMessages);
        }

      } catch (error) {
        this.log.error('Error during turn execution', { error, iterations });
        
        // Add error message to conversation
        newMessages.push({
          role: 'system',
          content: `Error occurred: ${error instanceof Error ? error.message : String(error)}`
        });
        break;
      }
    }

    if (iterations >= config.maxIterations) {
      this.log.warn('Maximum iterations reached, ending turn');
      newMessages.push({
        role: 'system',
        content: 'Maximum conversation iterations reached. Ending turn.'
      });
    }

    this.debugPrint('Full turn completed', { 
      totalNewMessages: newMessages.length,
      iterations 
    });

    return newMessages;
  }

  /**
   * Handle a single message and return any resulting messages
   */
  private async handleMessage(
    message: AgentMessage,
    config: { printSteps: boolean; debug: boolean; showImages: boolean }
  ): Promise<AgentMessage[]> {
    const resultMessages: AgentMessage[] = [];

    if (message.role === 'assistant' && message.content) {
      if (config.printSteps) {
        const textContent = this.extractTextContent(message.content);
        console.log(textContent);
      }
    }

    // Handle function calls
    if (message.role === 'assistant' && (message as any).function_call) {
      const functionCall = (message as any).function_call;
      
      if (config.printSteps) {
        console.log(`${functionCall.name}(${functionCall.arguments})`);
      }

      try {
        let result = 'success'; // Default result
        
        // If the function exists on the computer, call it
        if (this.computer[functionCall.name as keyof Computer]) {
          const args = JSON.parse(functionCall.arguments || '{}');
          const method = this.computer[functionCall.name as keyof Computer] as any;
          await method.call(this.computer, ...Object.values(args));
        }

        resultMessages.push({
          role: 'function_call_output',
          call_id: (message as any).call_id,
          output: result
        });

      } catch (error) {
        resultMessages.push({
          role: 'function_call_output',
          call_id: (message as any).call_id,
          output: `Error: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }

    // Handle computer actions
    if (message.action) {
      if (config.printSteps) {
        console.log(`${message.action.type}(${JSON.stringify(message.action)})`);
      }

      try {
        // Execute the computer action
        const actionResult = await this.computer.executeAction(message.action);
        
        // Handle safety checks
        if (!actionResult.success && actionResult.error?.details?.safetyChecks) {
          const safetyChecks = actionResult.error.details.safetyChecks;
          
          for (const check of safetyChecks) {
            if (check.requiresAcknowledgment) {
              const acknowledged = await this.acknowledgeCallback(check.message);
              if (!acknowledged) {
                throw new Error(`Safety check failed: ${check.message}`);
              }
            }
          }
        }

        // Show screenshot if enabled
        if (config.showImages && actionResult.screenshot) {
          this.showImage(actionResult.screenshot);
        }

        // Create response message
        const responseMessage: AgentMessage = {
          role: 'computer_call_output',
          call_id: message.call_id,
          output: {
            type: 'input_image',
            image_url: actionResult.screenshot ? 
              `data:image/png;base64,${actionResult.screenshot}` : undefined,
            current_url: actionResult.currentUrl,
            success: actionResult.success,
            data: actionResult.data
          }
        };

        resultMessages.push(responseMessage);

      } catch (error) {
        this.log.error('Computer action failed', { action: message.action, error });
        
        resultMessages.push({
          role: 'computer_call_output',
          call_id: message.call_id,
          output: {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }

    return resultMessages;
  }

  /**
   * Create AI response using available drivers
   */
  private async createResponse(messages: AgentMessage[]): Promise<AgentResponse> {
    if (!this.aiDriver) {
      throw new Error('AI driver not available for response generation');
    }

    try {
      // Format messages for AI driver
      const formattedMessages = this.formatMessagesForAI(messages);
        const result = await this.aiDriver.executeStep('generateResponse', [
        formattedMessages,
        this.tools,
        this.model
      ]);

      if (!result.success) {
        throw new Error(result.error?.message || 'AI response generation failed');
      }

      // Parse AI response into our format
      return this.parseAIResponse(result.data);

    } catch (error) {
      this.log.error('Failed to create AI response', { error });
      throw error;
    }
  }

  /**
   * Format messages for AI driver consumption
   */
  private formatMessagesForAI(messages: AgentMessage[]): any[] {
    return messages.map(msg => {
      if (msg.role === 'computer_call_output') {
        return {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Computer action completed'
            },
            ...(msg.output?.image_url ? [{
              type: 'image_url',
              image_url: msg.output.image_url
            }] : [])
          ]
        };
      }
      
      return {
        role: msg.role === 'computer_call' ? 'assistant' : msg.role,
        content: msg.content || ''
      };
    });
  }

  /**
   * Parse AI response into our message format
   */
  private parseAIResponse(responseData: any): AgentResponse {
    // This would parse the actual AI response format
    // For now, return a simple structure
    return {
      output: responseData.messages || [{
        role: 'assistant',
        content: responseData.content || 'I understand your request.'
      }]
    };
  }

  private extractTextContent(content: string | Array<{type: string, text?: string}>): string {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content
        .filter(item => item.type === 'text' && item.text)
        .map(item => item.text)
        .join(' ');
    }
    
    return '';
  }

  private showImage(base64Image: string): void {
    // This would display the image - for now just log
    this.log.info('Screenshot captured', { 
      imageSize: base64Image.length,
      preview: base64Image.substring(0, 50) + '...'
    });
  }

  private debugPrint(message: string, data?: any): void {
    if (this.enableDebug) {
      this.log.debug(message, data);
    }
  }

  async dispose(): Promise<void> {
    this.log.info('Disposing Enhanced Agent');
    await this.computer.dispose();
  }
}
