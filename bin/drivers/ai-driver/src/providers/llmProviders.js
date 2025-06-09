/**
 * LLM Providers Module
 * Contains different LLM provider implementations and factory functions
 */

const https = require('https');
const http = require('http');
const { getConfig } = require('../config/config');

let llmProviderInstance;

class LLMProvider {
  constructor(config) {
    this.config = config;
  }

  async generateResponse(messages, options = {}) {
    throw new Error('generateResponse must be implemented by provider');
  }

  formatMessages(messages) {
    throw new Error('formatMessages must be implemented by provider');
  }
}

class OpenAIProvider extends LLMProvider {
  constructor(config) {
    super(config);
    // Handle both old and new config structures
    const apiKey = config.llmProvider?.apiKey || config.openaiApiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    // Store the API key for use in requests
    this.apiKey = apiKey;
  }

  async generateResponse(messages, options = {}) {
    const formattedMessages = this.formatMessages(messages);
    
    let model = this.config.openaiModel || this.config.defaultModel;
    if (options.mode === 'agent' && this.config.enableComputerUse) {
      model = this.config.agentModel;
    } else if (options.mode === 'vision') {
      model = this.config.visionModel;
    }
    
    const tools = [];
    if (this.config.enableComputerUse && (options.mode === 'agent' || options.functions)) {
      tools.push({
        type: 'computer_20241022',
        computer: {
          display_width_px: parseInt(this.config.computerUseResolution.split('x')[0]) || 1280,
          display_height_px: parseInt(this.config.computerUseResolution.split('x')[1]) || 720,
          display_number: 0
        }
      });
    }
    
    if (options.functions && Array.isArray(options.functions)) {
      tools.push(...options.functions.map(func => ({
        type: 'function',
        function: func
      })));
    }

    const requestBody = {
      model: model,
      messages: formattedMessages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature
    };
    
    if (tools.length > 0) {
      requestBody.tools = tools;
    }    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  formatMessages(messages) {
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }
    
    if (!Array.isArray(messages)) {
      return [{ role: 'user', content: String(messages) }];
    }
      return messages.map(msg => {
      if (typeof msg === 'string') {
        return { role: 'user', content: msg };
      }
      
      return {
        role: msg.role || 'user',
        content: msg.content || String(msg)
      };
    });
  }
}

class AnthropicProvider extends LLMProvider {
  constructor(config) {
    super(config);
    // Handle both old and new config structures
    const apiKey = config.llmProvider?.apiKey || config.anthropicApiKey;
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }
    // Store the API key for use in requests
    this.apiKey = apiKey;
  }

  async generateResponse(messages, options = {}) {
    const formattedMessages = this.formatMessages(messages);
    
    let model = this.config.anthropicModel || 'claude-3-sonnet-20240229';
    if (options.mode === 'agent') {
      // Ensure this is the desired agent model for Anthropic, or use a specific agent model from config
      model = 'claude-3-sonnet-20240229'; 
    }
    
    const requestBody = {
      model: model,
      messages: formattedMessages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature
    };
    
    // Note: Anthropic's tool usage is different from OpenAI's.
    // The original code had a tool structure that looked OpenAI-specific.
    // Anthropic's native tool use (beta) requires a `tools` parameter at the top level of the request,
    // and the model needs to support it. For "computer use" this might involve a custom tool definition.
    // For simplicity and based on the original structure, I'm keeping it, but this might need review
    // against Anthropic's actual tool API if advanced tool use is intended.
    if (this.config.enableComputerUse && options.mode === 'agent') {
      // This tool structure is likely not directly compatible with Anthropic.
      // Anthropic tools typically have 'name', 'description', 'input_schema'.
      // This might be a placeholder or an attempt to use a generic concept.
      requestBody.tools = [{
        type: 'computer_20241022', // This is an OpenAI tool type
        name: 'computer', // More Anthropic-like
        // Anthropic tool parameters would go into an input_schema.
        // The display_width_px etc. are not standard Anthropic tool parameters.
        // This section may need significant revision for actual Anthropic tool use.
        display_width_px: parseInt(this.config.computerUseResolution.split('x')[0]) || 1280,
        display_height_px: parseInt(this.config.computerUseResolution.split('x')[1]) || 720,
        display_number: 0
      }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01' // Check for newer recommended versions
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  formatMessages(messages) {
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }
    
    if (!Array.isArray(messages)) {
      return [{ role: 'user', content: String(messages) }];
    }
    
    return messages.map(msg => ({
      role: (msg.role === 'assistant') ? 'assistant' : 'user',
      content: msg.content || String(msg) 
    }));
  }
}

class LocalLLMProvider extends LLMProvider {
  constructor(config) {
    super(config);
    if (!config.localEndpoint) {
        throw new Error('Local LLM endpoint not configured');
    }
  }

  async generateResponse(messages, options = {}) {
    const formattedMessages = this.formatMessages(messages);
    
    const requestBody = {
      model: this.config.localModel,
      messages: formattedMessages,
      stream: false, // Explicitly set stream to false for non-streaming
      options: { // Common structure for Ollama options
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens 
      }
    };

    const response = await fetch(`${this.config.localEndpoint}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local LLM error: ${response.status} ${errorText}`);
    }
    
    const responseData = await response.json();
    // Adapt Ollama's response to a more common structure if needed by callers.
    // OpenAI: { choices: [{ message: { role, content } }] }
    // Anthropic: { content: [{ type: 'text', text }] }
    // Ollama (non-streaming): { message: { role, content } }
    if (responseData.message && typeof responseData.message.content === 'string') {
        return {
            choices: [{ message: { role: responseData.message.role, content: responseData.message.content } }],
            model: responseData.model,
            usage: { 
                prompt_tokens: responseData.prompt_eval_count,
                completion_tokens: responseData.eval_count,
                total_tokens: (responseData.prompt_eval_count || 0) + (responseData.eval_count || 0)
            }
        };
    }
    // Fallback or throw error if response structure is unexpected
    console.warn('LocalLLMProvider received an unexpected response structure:', responseData);
    return responseData; 
  }

  formatMessages(messages) {
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }
    
    if (!Array.isArray(messages)) {
      return [{ role: 'user', content: String(messages) }];
    }
    
    return messages.map(msg => ({
      role: msg.role || 'user',
      content: msg.content || String(msg)
    }));
  }
}

function createLLMProvider(config) {
  // Handle both old and new config structures
  const providerType = config.llmProvider?.type || config.llmProvider || 'openai';
  console.log(`Creating LLM provider: ${providerType}`);
  
  try {
    switch (providerType) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'local':
        return new LocalLLMProvider(config);
      default:
        console.error(`Unsupported LLM provider: ${providerType}.`);
        // Fallback strategy: attempt OpenAI if key exists, otherwise error.
        const openaiKey = config.llmProvider?.apiKey || config.openaiApiKey;
        if (openaiKey) {
            console.warn(`Unsupported LLM provider '${providerType}', attempting to fall back to OpenAI.`);
            return new OpenAIProvider(config);
        } else {
            throw new Error(`Unsupported LLM provider: ${providerType}, and no fallback configured (e.g., OpenAI API key not found).`);
        }
    }
  } catch (error) {
    console.error('Error creating LLM provider:', error.message);
    throw error; // Re-throw to allow caller to handle
  }
}

function initializeLLMProvider(currentConfig) {
  console.log('Initializing LLM provider from llmProviders.js module...');
  try {
    llmProviderInstance = createLLMProvider(currentConfig);
    if (llmProviderInstance) {
      console.log(`LLM provider initialized: ${llmProviderInstance.constructor?.name}`);
    } else {
      // This path should ideally not be reached if createLLMProvider throws on failure.
      console.error('LLM provider initialization returned null/undefined from createLLMProvider. This indicates an issue in createLLMProvider.');
      throw new Error('Failed to create LLM provider instance.');
    }
  } catch (error) {
    console.error('Failed to initialize LLM provider:', error.message);
    llmProviderInstance = null; // Ensure state is clean on failure
    // Depending on application requirements, you might want to re-throw the error
    // if the application cannot function without an LLM provider.
    // throw error; 
  }
}

function getLLMProvider() {
  if (!llmProviderInstance) {
    console.error('Attempted to get LLM provider but it is not initialized. Call initializeLLMProvider first or check for initialization errors.');
    // throw new Error('LLM provider not initialized.'); // Option: be strict
  }
  return llmProviderInstance;
}

module.exports = {
  LLMProvider, // Export base class if it's useful externally
  OpenAIProvider, // Export specific providers if needed for type checking or direct instantiation elsewhere
  AnthropicProvider,
  LocalLLMProvider,
  initializeLLMProvider,
  getLLMProvider
  // createLLMProvider is an internal helper, so not typically exported.
};
