
import OpenAI from 'openai';
import { AIProvider, AIMessage, AICompletionOptions, AICompletionResponse, AIProviderConfig, AIToolCall } from './AIProvider.interface';

export interface AzureOpenAIConfig extends AIProviderConfig {
  endpoint: string; // Azure OpenAI endpoint
  deploymentName: string; // Azure deployment name
  apiVersion?: string; // API version
}

export class AzureOpenAIProvider implements AIProvider {
  name = 'Azure OpenAI';
  type = 'cloud' as const;
  
  private client?: OpenAI;
  private config?: AzureOpenAIConfig;
  private initialized = false;

  async initialize(config: AIProviderConfig): Promise<void> {
    const azureConfig = config as AzureOpenAIConfig;
    
    if (!azureConfig.apiKey || !azureConfig.endpoint || !azureConfig.deploymentName) {
      throw new Error('Azure OpenAI requires apiKey, endpoint, and deploymentName');
    }

    this.config = azureConfig;
    this.client = new OpenAI({
      apiKey: azureConfig.apiKey,
      baseURL: `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentName}`,
      defaultQuery: { 'api-version': azureConfig.apiVersion || '2024-06-01' },
      defaultHeaders: {
        'api-key': azureConfig.apiKey,
      },
      timeout: azureConfig.timeout || 60000,
      maxRetries: azureConfig.maxRetries || 3,
    });

    // Test the connection
    try {
      // Azure OpenAI doesn't have models.list, so we test with a simple completion
      await this.complete([{ role: 'user', content: 'Hello' }], { maxTokens: 1 });
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Azure OpenAI provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async complete(messages: AIMessage[], options: AICompletionOptions = {}): Promise<AICompletionResponse> {
    if (!this.client) {
      throw new Error('Azure OpenAI provider not initialized');
    }

    const openaiMessages = messages.map(msg => {
      if (msg.images && msg.images.length > 0) {
        // Vision format
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content },
            ...msg.images.map(img => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${img}` }
            }))
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });

    const tools = options.tools?.map(tool => ({
      type: 'function' as const,
      function: tool.function
    }));

    try {      const response = await this.client.chat.completions.create({
        model: this.config?.deploymentName || 'gpt-4', // Use deployment name as model
        messages: openaiMessages as any,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        tools: tools,
        tool_choice: options.toolChoice,
        stream: false
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from Azure OpenAI');
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
      throw new Error(`Azure OpenAI completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *streamComplete(messages: AIMessage[], options: AICompletionOptions = {}): AsyncIterable<string> {
    if (!this.client) {
      throw new Error('Azure OpenAI provider not initialized');
    }

    const openaiMessages = messages.map(msg => ({ role: msg.role, content: msg.content }));

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config?.deploymentName || 'gpt-4',
        messages: openaiMessages,
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
      throw new Error(`Azure OpenAI streaming failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  supportsVision(): boolean {
    const deploymentName = this.config?.deploymentName || '';
    return deploymentName.includes('gpt-4') && (deploymentName.includes('vision') || deploymentName.includes('4o'));
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStreaming(): boolean {
    return true;
  }

  async getAvailableModels(): Promise<string[]> {
    // Azure OpenAI uses deployment names instead of model names
    // Return the configured deployment name
    return this.config?.deploymentName ? [this.config.deploymentName] : [];
  }

  validateConfig(config: AIProviderConfig): boolean {
    const azureConfig = config as AzureOpenAIConfig;
    return !!(azureConfig.apiKey && azureConfig.endpoint && azureConfig.deploymentName);
  }
}
