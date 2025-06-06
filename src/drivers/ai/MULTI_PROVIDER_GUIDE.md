# AIDriver Multi-Provider Guide

The AIDriver now supports multiple AI providers through a modular architecture, allowing you to use different AI services simultaneously and switch between them as needed.

## Supported Providers

- **OpenAI** - GPT-4, GPT-4 Vision, GPT-3.5
- **Anthropic** - Claude 3 (Opus, Sonnet, Haiku)
- **Ollama** - Local models (Llama2, Mistral, CodeLlama, etc.)
- **Azure OpenAI** - Azure-hosted OpenAI models

## Configuration

### Multi-Provider Setup

```typescript
import { AIDriver, AIDriverConfig } from './AIDriver';

const config: AIDriverConfig = {
  providers: [
    {
      name: 'openai-main',
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4-vision-preview',
      temperature: 0.7,
      maxTokens: 4000
    },
    {
      name: 'claude',
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-sonnet-20240229'
    },
    {
      name: 'local-llama',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama2'
    }
  ],
  activeProvider: 'openai-main',
  outputDir: './ai-artifacts'
};

const aiDriver = new AIDriver(config);
await aiDriver.initialize();
```

### Simple Single-Provider Setup

```typescript
const config: AIDriverConfig = {
  providers: [
    {
      name: 'openai',
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4-vision-preview'
    }
  ],
  activeProvider: 'openai'
};
```

### Legacy Configuration (Still Supported)

```typescript
const config: AIDriverConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-vision-preview',
  temperature: 0.7,
  maxTokens: 4000
};
```

## Provider Management

### Get Available Providers

```typescript
const providers = aiDriver.getAvailableProviders();
console.log('Available providers:', providers);
// Output: ['openai-main', 'claude', 'local-llama']
```

### Get Active Provider

```typescript
const active = aiDriver.getActiveProvider();
console.log('Active provider:', active);
// Output: { name: 'openai-main', type: 'cloud', hasProvider: true }
```

### Switch Providers

```typescript
const result = await aiDriver.execute('switchProvider', ['claude']);
if (result.success) {
  console.log('Switched to Claude');
}
```

### Add Provider at Runtime

```typescript
const result = await aiDriver.execute('addProvider', [
  'new-provider',
  {
    name: 'new-provider',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'mistral'
  }
]);
```

## Provider-Specific Configuration

### OpenAI Configuration

```typescript
{
  name: 'openai-gpt4',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-vision-preview',
  temperature: 0.7,
  maxTokens: 4000,
  timeout: 30000,
  maxRetries: 3
}
```

### Anthropic Configuration

```typescript
{
  name: 'claude-sonnet',
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-sonnet-20240229',
  temperature: 0.7,
  maxTokens: 4000
}
```

### Ollama Configuration

```typescript
{
  name: 'local-llama',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama2',
  timeout: 60000  // Longer timeout for local models
}
```

### Azure OpenAI Configuration

```typescript
{
  name: 'azure-gpt4',
  provider: 'azure-openai',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseUrl: process.env.AZURE_OPENAI_ENDPOINT,
  model: 'gpt-4',
  deploymentName: 'gpt-4-deployment'  // Azure-specific
}
```

## Usage Examples

### Basic AI Operations

```typescript
// Ask questions
const askResult = await aiDriver.execute('ask', ['What can you see on the screen?']);

// Agent mode (autonomous task execution)
const agentResult = await aiDriver.execute('agent', ['Login to the application']);

// Planning
const planResult = await aiDriver.execute('plan', [{ 
  description: 'Fill out contact form',
  currentState: screenAnalysis 
}]);
```

### Provider-Aware Operations

```typescript
// Get current provider capabilities
const capabilities = aiDriver.getActiveProvider();
if (capabilities.hasProvider) {
  console.log(`Using ${capabilities.name} (${capabilities.type})`);
  
  // Perform AI-enhanced analysis
  const analysis = await aiDriver.execute('analyze', [screenshot]);
}
```

### Fallback Behavior

When no providers are configured or all providers fail, the AIDriver falls back to mock responses to maintain functionality:

```typescript
// This will work even without real AI providers
const result = await aiDriver.execute('ask', ['Help me understand this screen']);
// Returns mock response for testing/development
```

## Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/

# Ollama (if not using default localhost:11434)
OLLAMA_BASE_URL=http://your-ollama-server:11434
```

## Migration from Legacy Configuration

Old configuration:
```typescript
const config = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-vision-preview'
};
```

New equivalent:
```typescript
const config = {
  providers: [{
    name: 'openai',
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-vision-preview'
  }],
  activeProvider: 'openai'
};
```

The legacy configuration is still supported and will automatically be converted to the new format.

## Best Practices

1. **Provider Naming**: Use descriptive names like `openai-gpt4`, `claude-sonnet`, `local-llama`
2. **Fallback Strategy**: Configure multiple providers for redundancy
3. **Model Selection**: Choose appropriate models for your use case (vision models for screen analysis)
4. **Local Models**: Use Ollama for privacy-sensitive applications
5. **Cost Management**: Use less expensive models for simple tasks, premium models for complex reasoning

## Troubleshooting

### Provider Initialization Fails
- Check API keys and environment variables
- Verify network connectivity for cloud providers
- Ensure Ollama is running for local providers

### No Response from AI
- Check if providers are properly configured
- Review logs for specific error messages
- Verify model names and availability

### Performance Issues
- Adjust timeout values for slow providers
- Use appropriate models for your hardware (local) or budget (cloud)
- Consider provider-specific optimization settings
