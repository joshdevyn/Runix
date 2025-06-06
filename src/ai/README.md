# Runix AI System

The Runix AI System enables autonomous task completion, user action learning, and intelligent assistance through natural language interaction.

## Overview

The AI system operates in three primary modes:

### 🤖 Agent Mode
Completes tasks fully autonomously using vision and system drivers.
- **Autonomous execution**: AI plans and executes complex multi-step tasks
- **Optional confirmation**: User can approve actions before execution
- **Stuck detection**: Requests user help when AI cannot proceed
- **Artifact generation**: Creates `.feature` files for task reproduction

### 📝 Editor Mode  
Observes user actions and converts them into reproducible automation scripts.
- **Action recording**: Captures user interactions with the system
- **Pattern recognition**: Identifies reusable automation patterns
- **Script generation**: Converts observations into Gherkin steps
- **Learning system**: Improves automation suggestions over time

### 💬 Ask Mode
Provides intelligent assistance through natural language queries.
- **Question answering**: Uses drivers to find and provide information
- **Helpful actions**: Performs tasks like clicking elements or typing text
- **Context awareness**: Understands current screen state for better assistance
- **Action logging**: Records all assistance as reproducible steps

## Quick Start

### Prerequisites

```bash
# Install required dependencies
npm install openai tesseract.js playwright

# Set up OpenAI API key (optional, will use mock responses without it)
export OPENAI_API_KEY="your-api-key-here"
```

### Basic Usage

#### Agent Mode - Autonomous Task Completion

```bash
# Complete a task autonomously
npx runix ai agent "Login to the website and navigate to settings"

# With confirmation prompts
npx runix ai agent "Fill out the contact form" --confirm

# Generate feature file only (dry run)
npx runix ai agent "Download the report" --dry-run
```

#### Editor Mode - Learn from Your Actions

```bash
# Start learning session
npx runix ai editor "login-workflow"

# Perform your actions in the application
# Press Ctrl+Alt+S to stop recording

# The AI will generate a feature file from your actions
```

#### Ask Mode - Get Help

```bash
# Ask for help with current screen
npx runix ai ask "What can I click on this page?"

# Request an action
npx runix ai ask "Click the submit button for me"

# Get information
npx runix ai ask "What does this error message mean?"
```

## Configuration

### AI Driver Configuration

Create `ai-config.json`:

```json
{
  "openaiApiKey": "your-api-key",
  "model": "gpt-4-vision-preview",
  "temperature": 0.7,
  "maxTokens": 2000,
  "confirmActions": true,
  "outputDir": "./ai-artifacts",
  "visionDriver": "VisionDriver",
  "systemDriver": "SystemDriver", 
  "webDriver": "WebDriver"
}
```

### Environment Variables

```bash
# OpenAI Configuration
export OPENAI_API_KEY="your-api-key"
export OPENAI_MODEL="gpt-4-vision-preview"

# AI Behavior
export RUNIX_AI_CONFIRM_ACTIONS="true"
export RUNIX_AI_OUTPUT_DIR="./ai-artifacts"

# Driver Configuration
export RUNIX_AI_VISION_DRIVER="VisionDriver"
export RUNIX_AI_SYSTEM_DRIVER="SystemDriver"
export RUNIX_AI_WEB_DRIVER="WebDriver"
```

## Architecture

