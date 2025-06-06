// Example configuration for AIDriver with multiple providers
import { AIDriverConfig } from '../AIDriver';

export const exampleMultiProviderConfig: AIDriverConfig = {
  // Multi-provider configuration
  providers: [
    {
      name: 'openai-gpt4',
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4-vision-preview',
      temperature: 0.7,
      maxTokens: 4000
    },
    {
      name: 'anthropic-claude',
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-sonnet-20240229',
      temperature: 0.7,
      maxTokens: 4000
    },
    {
      name: 'local-ollama',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama2',
      timeout: 30000
    },
    {
      name: 'azure-openai',
      provider: 'azure-openai',
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseUrl: process.env.AZURE_OPENAI_ENDPOINT,
      model: 'gpt-4',
      timeout: 30000
    }
  ],
  
  // Set the active provider
  activeProvider: 'openai-gpt4',
  
  // Driver configuration
  outputDir: './ai-artifacts',
  visionDriver: 'vision-driver',
  systemDriver: 'system-driver',
  confirmActions: true,
  
  // Legacy support (if providers array is empty, this will be used)
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-vision-preview',
  temperature: 0.7,
  maxTokens: 4000
};

export const simpleOpenAIConfig: AIDriverConfig = {
  providers: [
    {
      name: 'openai',
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4-vision-preview'
    }
  ],
  activeProvider: 'openai',
  outputDir: './ai-artifacts'
};

export const localOnlyConfig: AIDriverConfig = {
  providers: [
    {
      name: 'ollama',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama2'
    }
  ],
  activeProvider: 'ollama',
  outputDir: './ai-artifacts'
};
