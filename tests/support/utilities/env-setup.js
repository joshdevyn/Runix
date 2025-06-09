// Setup test environment variables
require('dotenv').config({ path: '.env.test' });

// Ensure OpenAI API key is available from main .env if not in test env
if (!process.env.OPENAI_API_KEY) {
  require('dotenv').config({ path: '.env' });
}

// Set NODE_ENV for testing if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
