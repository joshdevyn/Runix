
import OpenAI from 'openai';
import { AIProvider, AIMessage, AICompletionOptions, AICompletionResponse, AIProviderConfig, AIToolCall } from './AIProvider.interface';

export class OpenAIProvider implements AIProvider {
  name = 'OpenAI';
  type = 'cloud' as const;
  
  private client?: OpenAI;
  private config?: AIProviderConfig;
  private initialized = false;

  async initialize(config: AIProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
    });

    // Test the connection
    try {
      await this.client.models.list();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize OpenAI provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async complete(messages: AIMessage[], options: AICompletionOptions = {}): Promise<AICompletionResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }    const openaiMessages = messages.map(msg => {
      if (msg.images && msg.images.length > 0) {
        // Vision format
        return {
          role: msg.role as any,
          content: [
            { type: 'text', text: msg.content },
            ...msg.images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${img}` }
            }))
          ]
        };
      }
      return { role: msg.role as any, content: msg.content };
    });

    const tools = options.tools?.map(tool => ({
      type: 'function' as const,
      function: tool.function
    }));

    try {      const response = await this.client.chat.completions.create({
        model: options.model || this.config?.model || 'gpt-4o',
        messages: openaiMessages as any,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        tools: tools,
        tool_choice: options.toolChoice,
        stream: false
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from OpenAI');
      }      const toolCalls: AIToolCall[] = choice.message.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      })) || [];

      return {
        content: choice.message.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined,
        toolCalls,
        finishReason: choice.finish_reason || undefined
      };
    } catch (error) {
      throw new Error(`OpenAI completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *streamComplete(messages: AIMessage[], options: AICompletionOptions = {}): AsyncIterable<string> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    const openaiMessages = messages.map(msg => ({ role: msg.role, content: msg.content }));

    try {      const stream = await this.client.chat.completions.create({
        model: options.model || this.config?.model || 'gpt-4o',
        messages: openaiMessages as any,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    } catch (error) {
      throw new Error(`OpenAI streaming failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  supportsVision(): boolean {
    const model = this.config?.model || 'gpt-4o';
    return model.includes('gpt-4') && (model.includes('vision') || model.includes('4o'));
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStreaming(): boolean {
    return true;
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    try {      const response = await this.client.models.list();
      return response.data
        .filter((model: any) => model.id.startsWith('gpt-'))
        .map((model: any) => model.id)
        .sort();
    } catch (error) {
      throw new Error(`Failed to get OpenAI models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  validateConfig(config: AIProviderConfig): boolean {
    return !!(config.apiKey && typeof config.apiKey === 'string');
  }
}
