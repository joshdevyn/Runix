// c:\_Runix\drivers\ai-driver\src\modes\executeMode.js
const { sendSuccessResponse, sendErrorResponse } = require('../utils/responseHelpers');
const { generateComprehensiveFeatureFile, saveSessionArtifacts } = require('../utils/featureFile');
const { getSessionContext, updateSessionContext } = require('../config/config');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Execute Mode - Generate and execute command sequences based on natural language
 */
async function handleExecuteMode(ws, id, args, config, llmProvider) {
    const description = args.description || (Array.isArray(args) && args.length > 0 ? args[0] : null);
    const options = args.options || (Array.isArray(args) && args.length > 1 ? args[1] : {});

    if (!description) {
        return sendErrorResponse(ws, id, 'Task description not provided for execute mode');
    }

    console.log(`⚡ Execute Mode: Generating commands for: ${description}`);
    config.currentMode = 'execute';
    
    // Initialize or update session context
    let sessionContext = getSessionContext();
    if (!sessionContext.sessionId) {
        sessionContext = updateSessionContext({ sessionId: `execute-${Date.now()}` });
    }
    
    sessionContext = updateSessionContext({ 
        currentTask: description,
        mode: 'execute',
        options: {
            review: options.review !== false, // Default to true for safety
            batch: options.batch || false,
            saveScript: options.saveScript || false,
            dryRun: options.dryRun || false,
            shell: options.shell || (process.platform === 'win32' ? 'cmd' : 'bash')
        },
        executionHistory: [],
        startTime: new Date().toISOString()
    });

    try {
        if (!llmProvider) {
            throw new Error('LLM provider not initialized. Cannot proceed in execute mode.');
        }

        // Generate commands using AI
        const commandResult = await generateCommands(description, options, config, llmProvider);
        
        if (options.dryRun) {
            console.log('🔍 Dry run mode - showing generated commands without execution');
            return sendSuccessResponse(ws, id, 'Execute mode completed (dry run)', {
                sessionId: sessionContext.sessionId,
                description: description,
                commands: commandResult.commands,
                script: commandResult.script,
                mode: 'execute',
                dryRun: true
            });
        }

        // Save script if requested
        let scriptPath = null;
        if (options.saveScript && commandResult.script) {
            scriptPath = await saveCommandScript(commandResult.script, sessionContext.sessionId, options);
            console.log(`📄 Commands saved to script: ${scriptPath}`);
        }

        // Execute commands
        const executionResults = await executeCommands(
            commandResult.commands, 
            options, 
            sessionContext, 
            ws, 
            id
        );

        // Update session with results
        sessionContext = updateSessionContext({
            executionResults: executionResults,
            completedAt: new Date().toISOString()
        });

        // Save session artifacts
        await saveExecuteSession(sessionContext, commandResult, executionResults, config);

        sendSuccessResponse(ws, id, 'Execute mode completed successfully', {
            sessionId: sessionContext.sessionId,
            description: description,
            commands: commandResult.commands,
            executionResults: executionResults,
            scriptPath: scriptPath,
            mode: 'execute',
            success: executionResults.every(r => r.success)
        });

    } catch (error) {
        console.error('[EXECUTE-MODE] Execute mode failed:', error);
        
        sessionContext = updateSessionContext({
            error: error.message,
            failedAt: new Date().toISOString()
        });

        await saveSessionArtifacts(sessionContext.sessionId, {
            description,
            error: error.message,
            mode: 'execute'
        }, config).catch(e => console.error('Failed to save error artifacts:', e));

        sendErrorResponse(ws, id, `Execute mode failed: ${error.message}`, { 
            stack: error.stack,
            sessionId: sessionContext.sessionId 
        });
    }
}

/**
 * Generate commands using AI based on the description
 */
async function generateCommands(description, options, config, llmProvider) {
    const prompt = createExecuteModePrompt(description, options, config);
    
    console.log('[EXECUTE-MODE] Generating commands from AI...');
    const response = await llmProvider.generateResponse(prompt, {
        mode: 'execute',
        functions: getExecuteModeFunctions()
    });

    const aiResponse = response.choices && response.choices[0] && response.choices[0].message 
        ? response.choices[0].message.content
        : (response.content && Array.isArray(response.content) && response.content[0] 
            ? response.content[0].text 
            : 'No response content found.');

    // Parse commands from AI response
    const commands = parseCommandsFromResponse(aiResponse, options);
    const script = generateScriptFromCommands(commands, options);

    return {
        commands,
        script,
        aiResponse
    };
}

/**
 * Create prompt for execute mode
 */
function createExecuteModePrompt(description, options, config) {
    const platform = process.platform;
    const shell = options.shell || (platform === 'win32' ? 'cmd' : 'bash');
    
    return `You are an expert system administrator and developer assistant. Generate the appropriate command sequence to accomplish the following task:

Task: ${description}

System Information:
- Platform: ${platform}
- Shell: ${shell}
- Current directory: ${process.cwd()}
- Options: ${JSON.stringify(options, null, 2)}

Requirements:
1. Generate a sequence of shell commands that will accomplish the task
2. Each command should be on a separate line
3. Use appropriate commands for the ${platform} platform
4. Include safety checks where appropriate
5. Add comments (using # or REM) to explain complex steps
6. Consider dependencies and prerequisites
7. Handle potential errors gracefully

Format your response as:
COMMANDS:
[command 1]
[command 2]
[command N]

EXPLANATION:
[Brief explanation of what the commands do and any important notes]

Be precise, safe, and efficient. If the task requires confirmation or has potential risks, mention them in the explanation.`;
}

/**
 * Parse commands from AI response
 */
function parseCommandsFromResponse(aiResponse, options) {
    const commands = [];
    let inCommandsSection = false;
    
    const lines = aiResponse.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed === 'COMMANDS:') {
            inCommandsSection = true;
            continue;
        }
        
        if (trimmed === 'EXPLANATION:') {
            inCommandsSection = false;
            break;
        }
        
        if (inCommandsSection && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('REM')) {
            commands.push({
                command: trimmed,
                description: extractCommandDescription(trimmed),
                requiresConfirmation: checkIfRequiresConfirmation(trimmed)
            });
        }
    }
    
    return commands;
}

/**
 * Generate script from commands
 */
function generateScriptFromCommands(commands, options) {
    const platform = process.platform;
    const isWindows = platform === 'win32';
    const scriptHeader = isWindows 
        ? '@echo off\nREM Generated by Runix AI Execute Mode\nREM Task execution script\n\n'
        : '#!/bin/bash\n# Generated by Runix AI Execute Mode\n# Task execution script\n\n';
    
    const scriptCommands = commands.map(cmd => {
        const comment = isWindows 
            ? `REM ${cmd.description || cmd.command}`
            : `# ${cmd.description || cmd.command}`;
        return `${comment}\n${cmd.command}`;
    }).join('\n\n');
    
    return scriptHeader + scriptCommands;
}

/**
 * Execute commands with appropriate handling
 */
async function executeCommands(commands, options, sessionContext, ws, id) {
    const results = [];
    
    for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        console.log(`[EXECUTE-MODE] Executing command ${i + 1}/${commands.length}: ${cmd.command}`);
        
        // Request confirmation if needed
        if (options.review && cmd.requiresConfirmation) {
            // For now, we'll proceed automatically in non-interactive mode
            // In a real implementation, this could pause for user input
            console.log(`⚠️ Command requires confirmation: ${cmd.command}`);
        }
        
        try {
            const result = await executeCommand(cmd.command, options);
            results.push({
                command: cmd.command,
                success: true,
                output: result.stdout,
                error: result.stderr,
                exitCode: result.exitCode,
                duration: result.duration
            });
            
            console.log(`✅ Command ${i + 1} completed successfully`);
            
        } catch (error) {
            const errorResult = {
                command: cmd.command,
                success: false,
                output: error.stdout || '',
                error: error.message,
                exitCode: error.exitCode || 1,
                duration: 0
            };
            
            results.push(errorResult);
            console.error(`❌ Command ${i + 1} failed:`, error.message);
            
            if (!options.batch) {
                console.log('🛑 Stopping execution due to command failure (use --batch to continue on errors)');
                break;
            }
        }
    }
    
    return results;
}

/**
 * Execute a single command
 */
function executeCommand(command, options) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        exec(command, { 
            cwd: process.cwd(),
            timeout: options.timeout || 60000,
            shell: options.shell
        }, (error, stdout, stderr) => {
            const duration = Date.now() - startTime;
            
            if (error) {
                reject({
                    ...error,
                    stdout,
                    stderr,
                    duration
                });
            } else {
                resolve({
                    stdout,
                    stderr,
                    exitCode: 0,
                    duration
                });
            }
        });
    });
}

/**
 * Save command script to file
 */
async function saveCommandScript(script, sessionId, options) {
    const platform = process.platform;
    const extension = platform === 'win32' ? '.bat' : '.sh';
    const scriptDir = path.join(process.cwd(), 'ai-artifacts', 'scripts');
    
    await fs.mkdir(scriptDir, { recursive: true });
    
    const scriptPath = path.join(scriptDir, `execute-${sessionId}${extension}`);
    await fs.writeFile(scriptPath, script, 'utf8');
    
    // Make executable on Unix-like systems
    if (platform !== 'win32') {
        await fs.chmod(scriptPath, '755');
    }
    
    return scriptPath;
}

/**
 * Save execute session artifacts
 */
async function saveExecuteSession(sessionContext, commandResult, executionResults, config) {
    const sessionData = {
        sessionId: sessionContext.sessionId,
        task: sessionContext.currentTask,
        mode: 'execute',
        commands: commandResult.commands,
        executionResults: executionResults,
        script: commandResult.script,
        startTime: sessionContext.startTime,
        completedAt: sessionContext.completedAt,
        success: executionResults.every(r => r.success)
    };
    
    await saveSessionArtifacts(sessionContext.sessionId, sessionData, config);
}

/**
 * Helper functions
 */
function extractCommandDescription(command) {
    // Simple extraction - could be enhanced
    return `Execute: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`;
}

function checkIfRequiresConfirmation(command) {
    const dangerousCommands = ['rm', 'del', 'format', 'fdisk', 'mkfs', 'sudo rm', 'DROP', 'DELETE FROM'];
    return dangerousCommands.some(dangerous => command.toLowerCase().includes(dangerous.toLowerCase()));
}

function getExecuteModeFunctions() {
    return [
        {
            name: 'generate_commands',
            description: 'Generate shell commands to accomplish a task',
            parameters: {
                type: 'object',
                properties: {
                    commands: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of shell commands to execute'
                    },
                    explanation: {
                        type: 'string',
                        description: 'Explanation of what the commands accomplish'
                    }
                }
            }
        }
    ];
}

module.exports = { handleExecuteMode };
