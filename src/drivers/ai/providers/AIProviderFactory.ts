
import { AIProvider, AIProviderConfig } from './AIProvider.interface';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OllamaProvider } from './OllamaProvider';
import { AzureOpenAIProvider } from './AzureOpenAIProvider';

export type AIProviderType = 'openai' | 'anthropic' | 'ollama' | 'azure-openai' | 'google-ai';

export interface AIProviderFactoryConfig extends AIProviderConfig {
  provider: AIProviderType;
}

export class AIProviderFactory {
  private static providers: Map<AIProviderType, any> = new Map();

  static {
    this.providers.set('openai', OpenAIProvider);
    this.providers.set('anthropic', AnthropicProvider);
    this.providers.set('ollama', OllamaProvider);
    this.providers.set('azure-openai', AzureOpenAIProvider);
  }

  static async createProvider(config: AIProviderFactoryConfig): Promise<AIProvider> {
    const ProviderClass = this.providers.get(config.provider);
    if (!ProviderClass) {
      throw new Error(`Unsupported AI provider: ${config.provider}`);
    }

    const provider = new ProviderClass();
    
    // Validate config before initialization
    if (!provider.validateConfig(config)) {
      throw new Error(`Invalid configuration for ${config.provider} provider`);
    }

    await provider.initialize(config);
    return provider;
  }

  static getSupportedProviders(): AIProviderType[] {
    return Array.from(this.providers.keys());
  }

  static isProviderSupported(provider: string): provider is AIProviderType {
    return this.providers.has(provider as AIProviderType);
  }

  static registerProvider(name: AIProviderType, providerClass: new () => AIProvider): void {
    this.providers.set(name, providerClass);
  }
}

export class AIProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private activeProvider?: AIProvider;

  async addProvider(name: string, config: AIProviderFactoryConfig): Promise<void> {
    const provider = await AIProviderFactory.createProvider(config);
    this.providers.set(name, provider);
    
    // Set as active provider if it's the first one
    if (!this.activeProvider) {
      this.activeProvider = provider;
    }
  }

  setActiveProvider(name: string): void {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider '${name}' not found`);
    }
    this.activeProvider = provider;
  }

  getActiveProvider(): AIProvider {
    if (!this.activeProvider) {
      throw new Error('No active AI provider configured');
    }
    return this.activeProvider;
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): Map<string, AIProvider> {
    return new Map(this.providers);
  }

  async removeProvider(name: string): Promise<void> {
    const provider = this.providers.get(name);
    if (provider && provider === this.activeProvider) {
      // If removing the active provider, set the next available one as active
      this.providers.delete(name);
      const remaining = Array.from(this.providers.values());
      this.activeProvider = remaining.length > 0 ? remaining[0] : undefined;
    } else {
      this.providers.delete(name);
    }
  }

  hasProviders(): boolean {
    return this.providers.size > 0;
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }
}
