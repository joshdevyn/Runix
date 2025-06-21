// c:\_Runix\drivers\ai-driver\src\modes\observeMode.js
const { sendSuccessResponse, sendErrorResponse } = require('../utils/responseHelpers');
const { generateComprehensiveFeatureFile, saveSessionArtifacts } = require('../utils/featureFile');
const { getSessionContext, updateSessionContext } = require('../config/config');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Observe Mode - Monitor system, tests, or processes and provide intelligent insights
 */
async function handleObserveMode(ws, id, args, config, llmProvider) {
    const options = args.options || (Array.isArray(args) && args.length > 0 ? args[0] : {});

    console.log(`👁️ Observe Mode: Starting intelligent monitoring...`);
    config.currentMode = 'observe';
    
    // Initialize or update session context
    let sessionContext = getSessionContext();
    if (!sessionContext.sessionId) {
        sessionContext = updateSessionContext({ sessionId: `observe-${Date.now()}` });
    }
    
    sessionContext = updateSessionContext({ 
        mode: 'observe',
        options: {
            continuous: options.continuous || false,
            alertOn: options.alertOn || null,
            interval: options.interval || 30, // seconds
            targets: options.targets || ['system', 'files', 'processes'],
            outputFormat: options.outputFormat || 'text'
        },
        observations: [],
        startTime: new Date().toISOString(),
        isRunning: true
    });

    try {
        if (!llmProvider) {
            throw new Error('LLM provider not initialized. Cannot proceed in observe mode.');
        }

        if (options.continuous) {
            await startContinuousObservation(sessionContext, config, llmProvider, ws, id);
        } else {
            await performSingleObservation(sessionContext, config, llmProvider, ws, id);
        }

    } catch (error) {
        console.error('[OBSERVE-MODE] Observe mode failed:', error);
        
        sessionContext = updateSessionContext({
            error: error.message,
            failedAt: new Date().toISOString(),
            isRunning: false
        });

        await saveSessionArtifacts(sessionContext.sessionId, {
            error: error.message,
            mode: 'observe'
        }, config).catch(e => console.error('Failed to save error artifacts:', e));

        sendErrorResponse(ws, id, `Observe mode failed: ${error.message}`, { 
            stack: error.stack,
            sessionId: sessionContext.sessionId 
        });
    }
}

/**
 * Perform a single observation cycle
 */
async function performSingleObservation(sessionContext, config, llmProvider, ws, id) {
    console.log('[OBSERVE-MODE] Performing single observation...');
    
    const observation = await collectSystemObservations(sessionContext.options);
    const analysis = await analyzeObservations([observation], sessionContext.options, llmProvider);
    
    sessionContext = updateSessionContext({
        observations: [observation],
        analysis: analysis,
        completedAt: new Date().toISOString(),
        isRunning: false
    });

    await saveObserveSession(sessionContext, config);

    sendSuccessResponse(ws, id, 'Observation completed', {
        sessionId: sessionContext.sessionId,
        observation: observation,
        analysis: analysis,
        mode: 'observe',
        continuous: false
    });
}

/**
 * Start continuous observation mode
 */
async function startContinuousObservation(sessionContext, config, llmProvider, ws, id) {
    console.log('[OBSERVE-MODE] Starting continuous observation...');
    
    const intervalMs = sessionContext.options.interval * 1000;
    let observationCount = 0;
    
    // Send initial response
    sendSuccessResponse(ws, id, 'Continuous observation started', {
        sessionId: sessionContext.sessionId,
        interval: sessionContext.options.interval,
        mode: 'observe',
        continuous: true,
        message: 'Monitoring started. Use Ctrl+C or send stop signal to end.'
    });

    const observationInterval = setInterval(async () => {
        try {
            if (!sessionContext.isRunning) {
                clearInterval(observationInterval);
                return;
            }

            observationCount++;
            console.log(`[OBSERVE-MODE] Observation cycle ${observationCount}...`);
            
            const observation = await collectSystemObservations(sessionContext.options);
            observation.cycleNumber = observationCount;
            
            const currentObservations = sessionContext.observations || [];
            currentObservations.push(observation);
            
            sessionContext = updateSessionContext({
                observations: currentObservations,
                lastObservationAt: new Date().toISOString()
            });

            // Analyze trends if we have multiple observations
            if (currentObservations.length >= 3) {
                const analysis = await analyzeObservations(
                    currentObservations.slice(-5), // Last 5 observations
                    sessionContext.options, 
                    llmProvider
                );
                
                // Check for alerts
                if (sessionContext.options.alertOn && analysis.alerts && analysis.alerts.length > 0) {
                    console.log('🚨 Alert conditions detected:', analysis.alerts);
                    // In a real implementation, this could send notifications
                }
                
                sessionContext = updateSessionContext({ lastAnalysis: analysis });
                
                // Periodically save observations
                if (observationCount % 10 === 0) {
                    await saveObserveSession(sessionContext, config);
                }
            }

        } catch (error) {
            console.error('[OBSERVE-MODE] Error during observation cycle:', error);
            // Continue observing despite errors
        }
    }, intervalMs);

    // Store the interval ID for cleanup
    sessionContext.observationInterval = observationInterval;
    
    // Set up cleanup on process signals
    process.on('SIGINT', () => stopObservation(sessionContext, config));
    process.on('SIGTERM', () => stopObservation(sessionContext, config));
}

/**
 * Stop continuous observation
 */
async function stopObservation(sessionContext, config) {
    console.log('[OBSERVE-MODE] Stopping observation...');
    
    if (sessionContext.observationInterval) {
        clearInterval(sessionContext.observationInterval);
    }
    
    sessionContext = updateSessionContext({
        isRunning: false,
        completedAt: new Date().toISOString()
    });
    
    await saveObserveSession(sessionContext, config);
    console.log('📊 Observation session saved');
}

/**
 * Collect system observations
 */
async function collectSystemObservations(options) {
    const observation = {
        timestamp: new Date().toISOString(),
        system: {},
        files: {},
        processes: {},
        network: {},
        logs: {}
    };

    try {
        // System metrics
        if (options.targets.includes('system')) {
            observation.system = await collectSystemMetrics();
        }

        // File system observations
        if (options.targets.includes('files')) {
            observation.files = await collectFileSystemMetrics();
        }

        // Process observations
        if (options.targets.includes('processes')) {
            observation.processes = await collectProcessMetrics();
        }

        // Network observations (if available)
        if (options.targets.includes('network')) {
            observation.network = await collectNetworkMetrics();
        }

        // Log observations
        if (options.targets.includes('logs')) {
            observation.logs = await collectLogMetrics();
        }

    } catch (error) {
        console.error('[OBSERVE-MODE] Error collecting observations:', error);
        observation.error = error.message;
    }

    return observation;
}

/**
 * Collect system metrics
 */
async function collectSystemMetrics() {
    const metrics = {
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: {}
    };

    try {
        if (process.platform === 'win32') {
            const { stdout } = await execAsync('wmic cpu get loadpercentage /value');
            const cpuMatch = stdout.match(/LoadPercentage=(\d+)/);
            if (cpuMatch) {
                metrics.cpu.usage = parseInt(cpuMatch[1]);
            }
        } else {
            const { stdout } = await execAsync('top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | awk -F\'%\' \'{print $1}\'');
            metrics.cpu.usage = parseFloat(stdout.trim());
        }
    } catch (error) {
        metrics.cpu.error = error.message;
    }

    return metrics;
}

/**
 * Collect file system metrics
 */
async function collectFileSystemMetrics() {
    const metrics = {
        currentDirectory: process.cwd(),
        files: {}
    };

    try {
        const files = await fs.readdir(process.cwd());
        metrics.files.count = files.length;
        
        // Check for common important files
        const importantFiles = ['package.json', 'README.md', '.env', 'Dockerfile', 'docker-compose.yml'];
        metrics.files.important = importantFiles.filter(file => files.includes(file));
        
        // Get directory size if possible
        if (process.platform !== 'win32') {
            try {
                const { stdout } = await execAsync('du -sh .');
                metrics.directorySize = stdout.split('\t')[0];
            } catch (e) {
                // Size not available
            }
        }
        
    } catch (error) {
        metrics.error = error.message;
    }

    return metrics;
}

/**
 * Collect process metrics
 */
async function collectProcessMetrics() {
    const metrics = {
        pid: process.pid,
        ppid: process.ppid,
        title: process.title
    };

    try {
        if (process.platform === 'win32') {
            const { stdout } = await execAsync('tasklist /fo csv | findstr node.exe');
            metrics.nodeProcesses = stdout.split('\n').filter(line => line.trim()).length;
        } else {
            const { stdout } = await execAsync('ps aux | grep node | grep -v grep | wc -l');
            metrics.nodeProcesses = parseInt(stdout.trim());
        }
    } catch (error) {
        metrics.error = error.message;
    }

    return metrics;
}

/**
 * Collect network metrics
 */
async function collectNetworkMetrics() {
    const metrics = {};

    try {
        // Check for listening ports
        if (process.platform === 'win32') {
            const { stdout } = await execAsync('netstat -an | findstr LISTENING');
            metrics.listeningPorts = stdout.split('\n').length - 1;
        } else {
            const { stdout } = await execAsync('netstat -tln | grep LISTEN | wc -l');
            metrics.listeningPorts = parseInt(stdout.trim());
        }
    } catch (error) {
        metrics.error = error.message;
    }

    return metrics;
}

/**
 * Collect log metrics
 */
async function collectLogMetrics() {
    const metrics = {
        files: []
    };

    try {
        // Look for common log files
        const logPatterns = ['*.log', 'logs/*.log', 'log/*.log'];
        
        for (const pattern of logPatterns) {
            try {
                const command = process.platform === 'win32' 
                    ? `dir /b ${pattern} 2>nul`
                    : `ls ${pattern} 2>/dev/null || true`;
                
                const { stdout } = await execAsync(command);
                if (stdout.trim()) {
                    const files = stdout.trim().split('\n');
                    metrics.files.push(...files);
                }
            } catch (e) {
                // Pattern not found, continue
            }
        }
        
        metrics.logFileCount = metrics.files.length;
        
    } catch (error) {
        metrics.error = error.message;
    }

    return metrics;
}

/**
 * Analyze observations using AI
 */
async function analyzeObservations(observations, options, llmProvider) {
    const prompt = createObservationAnalysisPrompt(observations, options);
    
    console.log('[OBSERVE-MODE] Analyzing observations with AI...');
    const response = await llmProvider.generateResponse(prompt, {
        mode: 'observe',
        functions: getObserveModeFunctions()
    });

    const analysis = parseAnalysisResponse(response, options);
    return analysis;
}

/**
 * Create analysis prompt
 */
function createObservationAnalysisPrompt(observations, options) {
    return `You are an expert system administrator and DevOps engineer. Analyze the following system observations and provide insights.

Observations (${observations.length} data points):
${JSON.stringify(observations, null, 2)}

Analysis Requirements:
1. Identify trends and patterns in the data
2. Highlight any anomalies or concerning metrics
3. Provide actionable insights and recommendations
4. Check for conditions specified in alert criteria: ${options.alertOn || 'none'}
5. Rate the overall system health (1-10 scale)

Response Format:
SUMMARY: [Brief overall assessment]
TRENDS: [Key trends observed]
ALERTS: [Any alert conditions met]
RECOMMENDATIONS: [Actionable suggestions]
HEALTH_SCORE: [1-10 rating]

Be concise but thorough. Focus on actionable insights that help maintain system reliability and performance.`;
}

/**
 * Parse AI analysis response
 */
function parseAnalysisResponse(response, options) {
    const content = response.choices && response.choices[0] && response.choices[0].message 
        ? response.choices[0].message.content
        : (response.content && Array.isArray(response.content) && response.content[0] 
            ? response.content[0].text 
            : 'No analysis available.');

    const analysis = {
        timestamp: new Date().toISOString(),
        summary: '',
        trends: [],
        alerts: [],
        recommendations: [],
        healthScore: 0,
        rawResponse: content
    };

    // Parse structured response
    const lines = content.split('\n');
    let currentSection = null;
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('SUMMARY:')) {
            currentSection = 'summary';
            analysis.summary = trimmed.replace('SUMMARY:', '').trim();
        } else if (trimmed.startsWith('TRENDS:')) {
            currentSection = 'trends';
            analysis.trends.push(trimmed.replace('TRENDS:', '').trim());
        } else if (trimmed.startsWith('ALERTS:')) {
            currentSection = 'alerts';
            const alertText = trimmed.replace('ALERTS:', '').trim();
            if (alertText && alertText !== 'none' && alertText !== 'None') {
                analysis.alerts.push(alertText);
            }
        } else if (trimmed.startsWith('RECOMMENDATIONS:')) {
            currentSection = 'recommendations';
            analysis.recommendations.push(trimmed.replace('RECOMMENDATIONS:', '').trim());
        } else if (trimmed.startsWith('HEALTH_SCORE:')) {
            const scoreMatch = trimmed.match(/(\d+)/);
            if (scoreMatch) {
                analysis.healthScore = parseInt(scoreMatch[1]);
            }
        } else if (trimmed && currentSection) {
            // Continue adding to current section
            if (currentSection === 'trends') {
                analysis.trends.push(trimmed);
            } else if (currentSection === 'alerts') {
                if (trimmed !== 'none' && trimmed !== 'None') {
                    analysis.alerts.push(trimmed);
                }
            } else if (currentSection === 'recommendations') {
                analysis.recommendations.push(trimmed);
            }
        }
    }

    return analysis;
}

/**
 * Save observe session artifacts
 */
async function saveObserveSession(sessionContext, config) {
    const sessionData = {
        sessionId: sessionContext.sessionId,
        mode: 'observe',
        options: sessionContext.options,
        observations: sessionContext.observations,
        analysis: sessionContext.lastAnalysis,
        startTime: sessionContext.startTime,
        completedAt: sessionContext.completedAt,
        duration: sessionContext.completedAt 
            ? new Date(sessionContext.completedAt) - new Date(sessionContext.startTime)
            : null
    };
    
    await saveSessionArtifacts(sessionContext.sessionId, sessionData, config);
}

/**
 * Get observe mode functions for AI
 */
function getObserveModeFunctions() {
    return [
        {
            name: 'analyze_system_observations',
            description: 'Analyze system observations and provide insights',
            parameters: {
                type: 'object',
                properties: {
                    summary: {
                        type: 'string',
                        description: 'Brief overall assessment'
                    },
                    trends: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Key trends observed'
                    },
                    alerts: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Alert conditions that were met'
                    },
                    recommendations: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Actionable recommendations'
                    },
                    healthScore: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 10,
                        description: 'Overall system health score'
                    }
                }
            }
        }
    ];
}

module.exports = { handleObserveMode, stopObservation };
