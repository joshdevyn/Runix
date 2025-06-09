/**
 * Configuration Management Module
 * Handles loading and managing configuration for the AI driver
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Default configuration
 */
const defaultConfig = {  // Server configuration
  port: process.env.RUNIX_DRIVER_PORT || process.env.AI_DRIVER_PORT || 8084,
  host: '127.0.0.1',
    // LLM Provider configuration
  llmProvider: {
    type: process.env.LLM_PROVIDER || 'openai',
    apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || 'test-key-placeholder',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    baseURL: process.env.LLM_BASE_URL || null,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 4000,
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7
  },
  
  // Known drivers configuration
  knownDrivers: [
    {
      id: 'ui-driver',
      name: 'UI Driver',
      port: 8080,
      description: 'Windows UI automation driver'
    },
    {
      id: 'file-driver', 
      name: 'File Driver',
      port: 8081,
      description: 'File system operations driver'
    },
    {
      id: 'browser-driver',
      name: 'Browser Driver', 
      port: 8082,
      description: 'Web browser automation driver'
    }
  ],
  
  // Session configuration
  session: {
    defaultTimeout: 300000, // 5 minutes
    maxExecutionSteps: 50,
    screenshotOnError: true,
    saveFeatureFiles: true
  },
  
  // Feature file configuration
  features: {
    directory: './features',
    autoSave: true,
    includeTimestamp: true,
    includeMetadata: true
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsole: true,
    enableFile: false,
    logFile: './logs/ai-driver.log'
  },
  
  // Mode-specific configuration
  modes: {
    agent: {
      maxSteps: 25,
      screenshotInterval: 5000,
      verificationSteps: true
    },
    ask: {
      includeScreenshot: true,
      contextWindow: 10
    },
    editor: {
      autoGenerateFeatures: true,
      observationTimeout: 30000
    }
  }
};

/**
 * Current configuration instance
 */
let currentConfig = null;

/**
 * Session context
 */
let sessionContext = {
  sessionId: null,
  mode: null,
  goal: null,
  startTime: null,
  executionHistory: [],
  observations: [],
  currentStep: 0,
  status: 'idle',
  lastScreenshot: null,
  lastAnalysis: null,
  context: {}
};

/**
 * Loads configuration from file or environment
 * @param {string} configPath - Optional path to config file
 * @returns {Promise<Object>} Loaded configuration
 */
async function loadConfig(configPath = null) {
  console.log('Loading configuration...');
  
  let config = { ...defaultConfig };
  
  // Try to load from file if path provided
  if (configPath) {
    try {
      const configFile = await fs.readFile(configPath, 'utf8');
      const fileConfig = JSON.parse(configFile);
      config = mergeConfig(config, fileConfig);
      console.log(`Configuration loaded from file: ${configPath}`);
    } catch (error) {
      console.warn(`Could not load config file ${configPath}:`, error.message);
      console.log('Using default configuration with environment overrides');
    }
  }
  
  // Apply environment variable overrides
  config = applyEnvironmentOverrides(config);
  
  // Validate configuration
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }
  
  currentConfig = config;
  console.log('Configuration loaded successfully');
  console.log(`AI Driver will listen on ${config.host}:${config.port}`);
  console.log(`LLM Provider: ${config.llmProvider.type} (${config.llmProvider.model})`);
  
  return config;
}

/**
 * Gets the current configuration
 * @returns {Object} Current configuration
 */
function getConfig() {
  if (!currentConfig) {
    console.warn('Configuration not loaded, using defaults');
    return defaultConfig;
  }
  return currentConfig;
}

/**
 * Updates configuration
 * @param {Object} updates - Configuration updates
 * @returns {Object} Updated configuration
 */
function updateConfig(updates) {
  if (!currentConfig) {
    currentConfig = { ...defaultConfig };
  }
  
  currentConfig = mergeConfig(currentConfig, updates);
  console.log('Configuration updated');
  return currentConfig;
}

/**
 * Gets session context
 * @returns {Object} Current session context
 */
function getSessionContext() {
  return sessionContext;
}

/**
 * Updates session context
 * @param {Object} updates - Context updates
 * @returns {Object} Updated session context
 */
function updateSessionContext(updates) {
  sessionContext = { ...sessionContext, ...updates };
  return sessionContext;
}

/**
 * Resets session context
 */
function resetSessionContext() {
  sessionContext = {
    sessionId: null,
    mode: null,
    goal: null,
    startTime: null,
    executionHistory: [],
    observations: [],
    currentStep: 0,
    status: 'idle',
    lastScreenshot: null,
    lastAnalysis: null,
    context: {}
  };
  console.log('Session context reset');
}

/**
 * Merges two configuration objects
 * @param {Object} base - Base configuration
 * @param {Object} override - Override configuration
 * @returns {Object} Merged configuration
 */
function mergeConfig(base, override) {
  const merged = { ...base };
  
  for (const key in override) {
    if (override[key] !== null && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      merged[key] = mergeConfig(merged[key] || {}, override[key]);
    } else {
      merged[key] = override[key];
    }
  }
  
  return merged;
}

/**
 * Applies environment variable overrides to configuration
 * @param {Object} config - Base configuration
 * @returns {Object} Configuration with environment overrides
 */
function applyEnvironmentOverrides(config) {
  const overrides = { ...config };
  
  // Port override
  if (process.env.AI_DRIVER_PORT) {
    overrides.port = parseInt(process.env.AI_DRIVER_PORT);
  }
  
  // Host override
  if (process.env.AI_DRIVER_HOST) {
    overrides.host = process.env.AI_DRIVER_HOST;
  }
  
  // LLM provider overrides
  if (process.env.LLM_PROVIDER) {
    overrides.llmProvider.type = process.env.LLM_PROVIDER;
  }
  
  if (process.env.OPENAI_API_KEY) {
    overrides.llmProvider.apiKey = process.env.OPENAI_API_KEY;
  } else if (process.env.ANTHROPIC_API_KEY) {
    overrides.llmProvider.apiKey = process.env.ANTHROPIC_API_KEY;
  }
  
  if (process.env.LLM_MODEL) {
    overrides.llmProvider.model = process.env.LLM_MODEL;
  }
  
  if (process.env.LLM_BASE_URL) {
    overrides.llmProvider.baseURL = process.env.LLM_BASE_URL;
  }
  
  if (process.env.LLM_MAX_TOKENS) {
    overrides.llmProvider.maxTokens = parseInt(process.env.LLM_MAX_TOKENS);
  }
  
  if (process.env.LLM_TEMPERATURE) {
    overrides.llmProvider.temperature = parseFloat(process.env.LLM_TEMPERATURE);
  }
  
  // Logging overrides
  if (process.env.LOG_LEVEL) {
    overrides.logging.level = process.env.LOG_LEVEL;
  }
  
  return overrides;
}

/**
 * Validates configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
function validateConfig(config) {
  const errors = [];
  
  // Validate port
  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }
  
  // Validate LLM provider
  if (!config.llmProvider.type) {
    errors.push('LLM provider type is required');
  }
  
  const validProviders = ['openai', 'anthropic', 'local'];
  if (!validProviders.includes(config.llmProvider.type)) {
    errors.push(`LLM provider type must be one of: ${validProviders.join(', ')}`);
  }
  
  if (config.llmProvider.type !== 'local' && !config.llmProvider.apiKey) {
    errors.push('API key is required for cloud LLM providers');
  }
  
  // Validate known drivers
  if (!Array.isArray(config.knownDrivers)) {
    errors.push('knownDrivers must be an array');
  } else {
    for (const driver of config.knownDrivers) {
      if (!driver.id || !driver.name || !driver.port) {
        errors.push(`Driver missing required fields: ${JSON.stringify(driver)}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Gets driver configuration by ID
 * @param {string} driverId - Driver ID
 * @returns {Object|null} Driver configuration
 */
function getDriverConfig(driverId) {
  const config = getConfig();
  return config.knownDrivers.find(d => d.id === driverId || d.name === driverId) || null;
}

/**
 * Adds or updates a driver configuration
 * @param {Object} driverConfig - Driver configuration
 * @returns {Object} Updated configuration
 */
function addDriverConfig(driverConfig) {
  const config = getConfig();
  const existingIndex = config.knownDrivers.findIndex(d => d.id === driverConfig.id);
  
  if (existingIndex >= 0) {
    config.knownDrivers[existingIndex] = driverConfig;
  } else {
    config.knownDrivers.push(driverConfig);
  }
  
  console.log(`Driver configuration ${existingIndex >= 0 ? 'updated' : 'added'}: ${driverConfig.id}`);
  return config;
}

/**
 * Saves current configuration to file
 * @param {string} configPath - Path to save configuration
 * @returns {Promise<void>}
 */
async function saveConfig(configPath) {
  const config = getConfig();
  
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Save configuration
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`Configuration saved to: ${configPath}`);
  } catch (error) {
    console.error('Error saving configuration:', error);
    throw error;
  }
}

/**
 * Initializes configuration
 * @param {string} configPath - Optional path to config file
 * @returns {Promise<Object>} Initialized configuration
 */
async function initializeConfig(configPath = null) {
  try {
    const config = await loadConfig(configPath);
    
    // Initialize session context
    resetSessionContext();
    
    // Ensure directories exist
    await ensureDirectories(config);
    
    return config;
  } catch (error) {
    console.error('Error initializing configuration:', error);
    throw error;
  }
}

/**
 * Ensures required directories exist
 * @param {Object} config - Configuration object
 * @returns {Promise<void>}
 */
async function ensureDirectories(config) {
  const directories = [
    config.features.directory,
    path.dirname(config.logging.logFile),
    './temp',
    './scripts'
  ];
  
  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's okay
      if (error.code !== 'EEXIST') {
        console.warn(`Could not create directory ${dir}:`, error.message);
      }
    }
  }
}

module.exports = {
  defaultConfig,
  loadConfig,
  getConfig,
  updateConfig,
  getSessionContext,
  updateSessionContext,
  resetSessionContext,
  validateConfig,
  getDriverConfig,
  addDriverConfig,
  saveConfig,
  initializeConfig,
  mergeConfig,
  applyEnvironmentOverrides
};
