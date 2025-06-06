
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // Base64 encoded images for vision models
}

export interface AICompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: AITool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any; // JSON schema
  };
}

export interface AICompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: AIToolCall[];
  finishReason?: string;
}

export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  [key: string]: any; // Allow provider-specific configs
}

export interface AIProvider {
  name: string;
  type: 'cloud' | 'local';
  
  initialize(config: AIProviderConfig): Promise<void>;
  isInitialized(): boolean;
  
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResponse>;
  streamComplete(messages: AIMessage[], options?: AICompletionOptions): AsyncIterable<string>;
  
  supportsVision(): boolean;
  supportsTools(): boolean;
  supportsStreaming(): boolean;
  
  getAvailableModels(): Promise<string[]>;
  validateConfig(config: AIProviderConfig): boolean;
}
