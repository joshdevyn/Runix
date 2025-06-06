
import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIMessage, AICompletionOptions, AICompletionResponse, AIProviderConfig } from './AIProvider.interface';

export class AnthropicProvider implements AIProvider {
  name = 'Anthropic';
  type = 'cloud' as const;
  
  private client?: Anthropic;
  private config?: AIProviderConfig;
  private initialized = false;

  async initialize(config: AIProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
    });

    // Test the connection by making a simple request
    try {
      await this.complete([{ role: 'user', content: 'Hello' }], { maxTokens: 1 });
      this.initialized = true;
    } catch (error) {
      // If it's just a token limit error, we're still connected
      if (error instanceof Error && error.message.includes('max_tokens')) {
        this.initialized = true;
      } else {
        throw new Error(`Failed to initialize Anthropic provider: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async complete(messages: AIMessage[], options: AICompletionOptions = {}): Promise<AICompletionResponse> {
    if (!this.client) {
      throw new Error('Anthropic provider not initialized');
    }

    // Convert messages format for Anthropic
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(msg => {
        if (msg.images && msg.images.length > 0) {
          // Vision format for Claude
          return {
            role: msg.role as 'user' | 'assistant',
            content: [
              { type: 'text', text: msg.content },
              ...msg.images.map(img => ({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: img
                }
              }))
            ]
          };
        }
        return { role: msg.role as 'user' | 'assistant', content: msg.content };
      });

    try {      const response = await this.client.messages.create({
        model: options.model || this.config?.model || 'claude-3-5-sonnet-20241022',
        system: systemMessage || undefined,
        messages: conversationMessages as any,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature,
        // Note: Anthropic doesn't support tools in the same way as OpenAI yet
      });const content = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => (block as any).text)
        .join('');

      return {
        content,
        usage: response.usage ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        } : undefined,
        finishReason: response.stop_reason || undefined
      };
    } catch (error) {
      throw new Error(`Anthropic completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *streamComplete(messages: AIMessage[], options: AICompletionOptions = {}): AsyncIterable<string> {
    if (!this.client) {
      throw new Error('Anthropic provider not initialized');
    }

    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }));

    try {
      const stream = await this.client.messages.create({
        model: options.model || this.config?.model || 'claude-3-5-sonnet-20241022',
        system: systemMessage || undefined,
        messages: conversationMessages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature,
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield chunk.delta.text;
        }
      }
    } catch (error) {
      throw new Error(`Anthropic streaming failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  supportsVision(): boolean {
    const model = this.config?.model || 'claude-3-5-sonnet-20241022';
    return model.includes('claude-3');
  }

  supportsTools(): boolean {
    // Anthropic has limited tool support compared to OpenAI
    return false;
  }

  supportsStreaming(): boolean {
    return true;
  }

  async getAvailableModels(): Promise<string[]> {
    // Anthropic doesn't have a models endpoint, return known models
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }

  validateConfig(config: AIProviderConfig): boolean {
    return !!(config.apiKey && typeof config.apiKey === 'string');
  }
}
