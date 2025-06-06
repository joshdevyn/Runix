
import { AIProvider, AIMessage, AICompletionOptions, AICompletionResponse, AIProviderConfig } from './AIProvider.interface';

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaProvider implements AIProvider {
  name = 'Ollama';
  type = 'local' as const;
    private config?: AIProviderConfig;
  private initialized = false;
  private baseUrl: string = 'http://localhost:11434';

  async initialize(config: AIProviderConfig): Promise<void> {
    this.config = config;
    this.baseUrl = config.baseUrl || 'http://localhost:11434';

    // Test the connection
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Ollama provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async complete(messages: AIMessage[], options: AICompletionOptions = {}): Promise<AICompletionResponse> {
    if (!this.initialized) {
      throw new Error('Ollama provider not initialized');
    }

    const model = options.model || this.config?.model || 'llama3.2';
    
    // Convert system message to Ollama format
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const conversationMessages = messages.filter(m => m.role !== 'system');

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: conversationMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
            // Note: Ollama vision support varies by model
            images: msg.images
          })),
          system: systemMessage,
          stream: false,
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as OllamaResponse;
      
      return {
        content: data.message.content,
        usage: data.prompt_eval_count && data.eval_count ? {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
          totalTokens: data.prompt_eval_count + data.eval_count
        } : undefined,
        finishReason: data.done ? 'stop' : undefined
      };
    } catch (error) {
      throw new Error(`Ollama completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *streamComplete(messages: AIMessage[], options: AICompletionOptions = {}): AsyncIterable<string> {
    if (!this.initialized) {
      throw new Error('Ollama provider not initialized');
    }

    const model = options.model || this.config?.model || 'llama3.2';
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const conversationMessages = messages.filter(m => m.role !== 'system');

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: conversationMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          system: systemMessage,
          stream: true,
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data: OllamaResponse = JSON.parse(line);
              if (data.message?.content) {
                yield data.message.content;
              }
            } catch (parseError) {
              // Skip malformed JSON lines
              continue;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      throw new Error(`Ollama streaming failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  supportsVision(): boolean {
    const model = this.config?.model || 'llama3.2';
    // Vision support depends on the specific model
    return model.includes('vision') || model.includes('llava') || model.includes('bakllava');
  }

  supportsTools(): boolean {
    // Most Ollama models don't support structured tool calling yet
    return false;
  }

  supportsStreaming(): boolean {
    return true;
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.initialized) {
      throw new Error('Ollama provider not initialized');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { models: OllamaModel[] };
      return data.models.map(model => model.name);
    } catch (error) {
      throw new Error(`Failed to get Ollama models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  validateConfig(config: AIProviderConfig): boolean {
    // Ollama doesn't require an API key, just a valid base URL
    return true;
  }
}
