// c:\_Runix\drivers\ai-driver\src\modes\analyzeMode.js
const { sendSuccessResponse, sendErrorResponse } = require('../utils/responseHelpers');
const { getSessionContext, updateSessionContext } = require('../config/config');
const { saveSessionArtifacts } = require('../utils/featureFile');
const fs = require('fs').promises;
const path = require('path');

/**
 * Analyze Mode - Data & file analysis with AI insights
 */
async function handleAnalyzeMode(ws, id, args, config, llmProvider) {
    const target = args.target || (Array.isArray(args) && args.length > 0 ? args[0] : null);
    const options = args.options || (Array.isArray(args) && args.length > 1 ? args[1] : {});

    if (!target) {
        return sendErrorResponse(ws, id, 'Target not provided for analyze mode');
    }

    console.log(`🔍 Analyze Mode: Analyzing target: ${target}`);
    config.currentMode = 'analyze';
    
    // Initialize session context
    let sessionContext = getSessionContext();
    if (!sessionContext.sessionId) {
        sessionContext = updateSessionContext({ sessionId: `analyze-${Date.now()}` });
    }
    
    sessionContext = updateSessionContext({ 
        currentTarget: target,
        mode: 'analyze',
        options: {
            type: options.type || 'auto',
            output: options.output || 'text',
            depth: options.depth || 'standard',
            outputDir: options.outputDir || './ai-artifacts'
        },
        startTime: new Date().toISOString()
    });

    try {
        // Perform analysis
        const analysisResult = await performAnalysis(target, options, config, llmProvider);
        
        // Save analysis artifacts
        await saveAnalysisArtifacts(sessionContext, analysisResult);
        
        sendSuccessResponse(ws, id, 'Analysis completed successfully', {
            sessionId: sessionContext.sessionId,
            target: target,
            analysis: analysisResult.analysis,
            insights: analysisResult.insights,
            recommendations: analysisResult.recommendations,
            type: analysisResult.detectedType,
            artifacts: analysisResult.artifacts,
            executionTime: Date.now() - new Date(sessionContext.startTime).getTime()
        });
        
    } catch (error) {
        console.error('🔍 Analyze mode execution failed:', error);
        sendErrorResponse(ws, id, `Analyze mode failed: ${error.message}`);
    }
}

/**
 * Perform comprehensive analysis of the target
 */
async function performAnalysis(target, options, config, llmProvider) {
    const type = options.type || 'auto';
    const depth = options.depth || 'standard';
    
    console.log(`🎯 Performing ${depth} analysis of type: ${type}`);
    
    // Detect target type if auto
    const detectedType = type === 'auto' ? await detectTargetType(target) : type;
    console.log(`📊 Detected/specified type: ${detectedType}`);
    
    // Get target content
    const targetContent = await getTargetContent(target, detectedType);
    
    // Perform analysis based on type
    const analysis = await performTypedAnalysis(target, targetContent, detectedType, depth, llmProvider);
    
    // Generate insights and recommendations
    const insights = await generateInsights(analysis, detectedType, llmProvider);
    const recommendations = await generateRecommendations(analysis, insights, detectedType, llmProvider);
    
    return {
        analysis,
        insights,
        recommendations,
        detectedType,
        targetContent: targetContent.summary,
        artifacts: [
            {
                type: 'analysis_report',
                target: target,
                analysisType: detectedType,
                depth: depth,
                content: analysis,
                timestamp: new Date().toISOString()
            },
            {
                type: 'insights',
                content: insights,
                timestamp: new Date().toISOString()
            },
            {
                type: 'recommendations',
                content: recommendations,
                timestamp: new Date().toISOString()
            }
        ]
    };
}

/**
 * Detect the type of target being analyzed
 */
async function detectTargetType(target) {
    // File-based detection
    if (target.includes('/') || target.includes('\\') || target.includes('.')) {
        const extension = path.extname(target).toLowerCase();
        
        const typeMap = {
            '.log': 'logs',
            '.txt': 'logs',
            '.js': 'code',
            '.ts': 'code', 
            '.py': 'code',
            '.java': 'code',
            '.json': 'data',
            '.csv': 'data',
            '.xml': 'data',
            '.md': 'documentation',
            '.html': 'web',
            '.css': 'web',
            '.sql': 'database'
        };
        
        if (typeMap[extension]) {
            return typeMap[extension];
        }
        
        // Check if it's a directory
        try {
            const stats = await fs.stat(target);
            if (stats.isDirectory()) {
                return 'project';
            }
        } catch {
            // File might not exist, continue with other detection
        }
    }
    
    // Content-based detection
    const lowerTarget = target.toLowerCase();
    
    if (lowerTarget.includes('error') || lowerTarget.includes('log') || lowerTarget.includes('debug')) {
        return 'logs';
    }
    
    if (lowerTarget.includes('performance') || lowerTarget.includes('metric') || lowerTarget.includes('benchmark')) {
        return 'performance';
    }
    
    if (lowerTarget.includes('test') || lowerTarget.includes('spec')) {
        return 'testing';
    }
    
    if (lowerTarget.includes('api') || lowerTarget.includes('endpoint')) {
        return 'api';
    }
    
    // Default to general analysis
    return 'general';
}

/**
 * Get content from the target
 */
async function getTargetContent(target, type) {
    try {
        // If target is a file path
        if (target.includes('/') || target.includes('\\')) {
            const stats = await fs.stat(target);
            
            if (stats.isFile()) {
                const content = await fs.readFile(target, 'utf8');
                return {
                    type: 'file',
                    content: content,
                    summary: `File: ${target} (${content.length} characters)`
                };
            } else if (stats.isDirectory()) {
                const files = await fs.readdir(target);
                return {
                    type: 'directory',
                    content: files.join('\n'),
                    summary: `Directory: ${target} (${files.length} items)`
                };
            }
        }
        
        // If target is direct content/text
        return {
            type: 'text',
            content: target,
            summary: `Text content (${target.length} characters)`
        };
        
    } catch (error) {
        console.warn(`Could not read target as file: ${error.message}`);
        return {
            type: 'text',
            content: target,
            summary: `Text content (${target.length} characters)`
        };
    }
}

/**
 * Perform analysis based on detected type
 */
async function performTypedAnalysis(target, targetContent, type, depth, llmProvider) {
    const prompts = {
        logs: createLogAnalysisPrompt(targetContent.content, depth),
        code: createCodeAnalysisPrompt(targetContent.content, depth),
        data: createDataAnalysisPrompt(targetContent.content, depth),
        performance: createPerformanceAnalysisPrompt(targetContent.content, depth),
        project: createProjectAnalysisPrompt(targetContent.content, depth),
        general: createGeneralAnalysisPrompt(targetContent.content, depth)
    };
    
    const prompt = prompts[type] || prompts.general;
    
    console.log(`🔬 Running ${type} analysis with ${depth} depth`);
    const analysis = await llmProvider.generateResponse(prompt);
    
    return analysis;
}

/**
 * Create log analysis prompt
 */
function createLogAnalysisPrompt(content, depth) {
    const depthInstructions = {
        quick: 'Provide a brief summary of key issues and patterns',
        standard: 'Analyze errors, warnings, patterns, and performance indicators', 
        deep: 'Perform comprehensive log analysis including timeline reconstruction, correlation analysis, and predictive insights'
    };
    
    return `
Analyze these log files/content:

${content.substring(0, 5000)}${content.length > 5000 ? '\n... (truncated)' : ''}

Analysis Depth: ${depthInstructions[depth]}

Please provide:
1. **Error Analysis**
   - Critical errors and their frequency
   - Error patterns and root causes
   - Impact assessment

2. **Performance Indicators**
   - Response times and bottlenecks
   - Resource utilization patterns
   - Performance trends

3. **Security Analysis**
   - Failed authentication attempts
   - Suspicious activities
   - Access patterns

4. **Operational Insights**
   - System health indicators
   - Capacity planning data
   - Maintenance recommendations

5. **Timeline Analysis**
   - Chronological sequence of events
   - Correlation between different events
   - Peak usage periods

Format the analysis clearly with actionable insights.
`;
}

/**
 * Create code analysis prompt
 */
function createCodeAnalysisPrompt(content, depth) {
    return `
Analyze this code for quality, security, and best practices:

${content.substring(0, 4000)}${content.length > 4000 ? '\n... (truncated)' : ''}

Please provide:
1. **Code Quality Assessment**
   - Code structure and organization
   - Readability and maintainability
   - Design patterns usage

2. **Security Analysis**
   - Potential vulnerabilities
   - Security best practices compliance
   - Input validation and sanitization

3. **Performance Analysis**
   - Algorithmic complexity
   - Resource usage patterns
   - Optimization opportunities

4. **Best Practices Compliance**
   - Coding standards adherence
   - Error handling patterns
   - Documentation quality

5. **Recommendations**
   - Refactoring suggestions
   - Architecture improvements
   - Testing strategies

Focus on actionable improvements and specific examples.
`;
}

/**
 * Create data analysis prompt
 */
function createDataAnalysisPrompt(content, depth) {
    return `
Analyze this data structure and content:

${content.substring(0, 3000)}${content.length > 3000 ? '\n... (truncated)' : ''}

Please provide:
1. **Data Structure Analysis**
   - Schema and format assessment
   - Data integrity and consistency
   - Relationships and dependencies

2. **Content Analysis**
   - Data quality assessment
   - Missing or incomplete data
   - Outliers and anomalies

3. **Patterns and Trends**
   - Statistical insights
   - Correlation analysis
   - Predictive indicators

4. **Data Governance**
   - Compliance considerations
   - Privacy and security implications
   - Data lifecycle management

5. **Optimization Recommendations**
   - Storage optimization
   - Query performance improvements
   - Data processing enhancements
`;
}

/**
 * Create performance analysis prompt
 */
function createPerformanceAnalysisPrompt(content, depth) {
    return `
Analyze this performance data:

${content.substring(0, 4000)}${content.length > 4000 ? '\n... (truncated)' : ''}

Please provide:
1. **Performance Metrics Analysis**
   - Key performance indicators
   - Baseline and threshold analysis
   - Performance trends over time

2. **Bottleneck Identification**
   - System bottlenecks and constraints
   - Resource utilization patterns
   - Critical path analysis

3. **Scalability Assessment**
   - Current capacity limits
   - Scaling opportunities
   - Load distribution analysis

4. **Optimization Opportunities**
   - Quick wins and improvements
   - Long-term optimization strategies
   - Cost-benefit analysis

5. **Monitoring Recommendations**
   - Key metrics to track
   - Alert thresholds
   - Performance testing strategies
`;
}

/**
 * Create project analysis prompt
 */
function createProjectAnalysisPrompt(content, depth) {
    return `
Analyze this project structure and content:

Project Contents:
${content.substring(0, 2000)}${content.length > 2000 ? '\n... (truncated)' : ''}

Please provide:
1. **Project Structure Assessment**
   - Architecture and organization
   - Technology stack analysis
   - Dependencies and integrations

2. **Code Quality Overview**
   - Overall code health
   - Technical debt assessment
   - Testing coverage and quality

3. **Security and Compliance**
   - Security posture assessment
   - Compliance requirements
   - Risk factors

4. **Development Process**
   - Development workflow analysis
   - CI/CD pipeline assessment
   - Documentation quality

5. **Strategic Recommendations**
   - Modernization opportunities
   - Technology upgrade paths
   - Process improvements
`;
}

/**
 * Create general analysis prompt
 */
function createGeneralAnalysisPrompt(content, depth) {
    return `
Perform a comprehensive analysis of this content:

${content.substring(0, 4000)}${content.length > 4000 ? '\n... (truncated)' : ''}

Please provide:
1. **Content Overview**
   - Structure and organization
   - Key themes and topics
   - Quality assessment

2. **Pattern Analysis**
   - Recurring patterns and themes
   - Relationships and dependencies
   - Anomalies and outliers

3. **Insights and Findings**
   - Key discoveries
   - Hidden patterns
   - Significant observations

4. **Risk Assessment**
   - Potential issues and risks
   - Mitigation strategies
   - Impact analysis

5. **Recommendations**
   - Actionable improvements
   - Strategic suggestions
   - Next steps and priorities

Provide specific, actionable insights with supporting evidence.
`;
}

/**
 * Generate insights from analysis
 */
async function generateInsights(analysis, type, llmProvider) {
    const prompt = `
Based on this ${type} analysis:

${analysis}

Generate key insights including:
1. Most significant findings
2. Hidden patterns or correlations
3. Unexpected discoveries
4. Critical success factors
5. Warning indicators

Format as clear, prioritized insights with impact assessment.
`;
    
    return await llmProvider.generateResponse(prompt);
}

/**
 * Generate recommendations from analysis and insights
 */
async function generateRecommendations(analysis, insights, type, llmProvider) {
    const prompt = `
Based on this analysis and insights:

Analysis: ${analysis.substring(0, 1000)}...
Insights: ${insights}

Generate specific, actionable recommendations including:
1. **Immediate Actions** (next 1-2 weeks)
2. **Short-term Improvements** (1-3 months)
3. **Long-term Strategic Changes** (3+ months)
4. **Risk Mitigation** (ongoing)
5. **Success Metrics** (how to measure progress)

Each recommendation should include:
- Specific action steps
- Expected outcomes
- Resource requirements
- Timeline estimates
- Success criteria

Prioritize recommendations by impact and feasibility.
`;
    
    return await llmProvider.generateResponse(prompt);
}

/**
 * Save analysis artifacts
 */
async function saveAnalysisArtifacts(sessionContext, analysisResult) {
    try {
        const outputDir = sessionContext.options?.outputDir || './ai-artifacts';
        
        await saveSessionArtifacts(sessionContext.sessionId, {
            analysis: analysisResult.analysis,
            insights: analysisResult.insights,
            recommendations: analysisResult.recommendations,
            session: sessionContext
        }, outputDir);
        
        console.log(`💾 Analysis artifacts saved: ${sessionContext.sessionId}`);
    } catch (error) {
        console.warn('Failed to save analysis artifacts:', error);
    }
}

module.exports = { handleAnalyzeMode };
