// c:\_Runix\drivers\ai-driver\src\modes\planMode.js
const { sendSuccessResponse, sendErrorResponse } = require('../utils/responseHelpers');
const { getSessionContext, updateSessionContext } = require('../config/config');
const { saveSessionArtifacts } = require('../utils/featureFile');

/**
 * Plan Mode - Strategic planning and architecture guidance
 */
async function handlePlanMode(ws, id, args, config, llmProvider) {
    const description = args.description || (Array.isArray(args) && args.length > 0 ? args[0] : null);
    const options = args.options || (Array.isArray(args) && args.length > 1 ? args[1] : {});

    if (!description) {
        return sendErrorResponse(ws, id, 'Description not provided for plan mode');
    }

    console.log(`📋 Plan Mode: Creating strategic plan for: ${description}`);
    config.currentMode = 'plan';
    
    // Initialize session context
    let sessionContext = getSessionContext();
    if (!sessionContext.sessionId) {
        sessionContext = updateSessionContext({ sessionId: `plan-${Date.now()}` });
    }
    
    sessionContext = updateSessionContext({ 
        currentTask: description,
        mode: 'plan',
        options: {
            scope: options.scope || 'project',
            format: options.format || 'markdown',
            templates: options.templates || false,
            outputDir: options.outputDir || './ai-artifacts'
        },
        startTime: new Date().toISOString()
    });

    try {
        // Generate strategic plan
        const planResult = await generateStrategicPlan(description, options, config, llmProvider);
        
        // Save plan artifacts
        await savePlanArtifacts(sessionContext, planResult);
        
        sendSuccessResponse(ws, id, 'Strategic plan generated successfully', {
            sessionId: sessionContext.sessionId,
            description: description,
            plan: planResult.plan,
            scope: options.scope,
            format: options.format,
            artifacts: planResult.artifacts,
            executionTime: Date.now() - new Date(sessionContext.startTime).getTime()
        });
        
    } catch (error) {
        console.error('📋 Plan mode execution failed:', error);
        sendErrorResponse(ws, id, `Plan mode failed: ${error.message}`);
    }
}

/**
 * Generate comprehensive strategic plan
 */
async function generateStrategicPlan(description, options, config, llmProvider) {
    const scope = options.scope || 'project';
    const format = options.format || 'markdown';
    const templates = options.templates || false;
    
    console.log(`🎯 Generating ${scope}-level plan in ${format} format`);
    
    const planPrompt = createPlanPrompt(description, scope, format, templates);
    
    // Generate main plan
    const planResponse = await llmProvider.generateResponse(planPrompt);
    
    // Generate supporting documents based on scope
    const supportingDocs = await generateSupportingDocuments(description, scope, planResponse, llmProvider);
    
    return {
        plan: planResponse,
        supportingDocuments: supportingDocs,
        artifacts: [
            {
                type: 'strategic_plan',
                scope: scope,
                format: format,
                content: planResponse,
                timestamp: new Date().toISOString()
            },
            ...supportingDocs.map(doc => ({
                type: doc.type,
                title: doc.title,
                content: doc.content,
                timestamp: new Date().toISOString()
            }))
        ]
    };
}

/**
 * Create planning prompt based on scope and requirements
 */
function createPlanPrompt(description, scope, format, templates) {
    const scopeGuidance = {
        feature: 'Focus on specific feature implementation, user stories, and acceptance criteria',
        project: 'Provide comprehensive project planning including phases, milestones, and deliverables',
        system: 'Create system-wide architecture and design considerations',
        architecture: 'Focus on technical architecture, patterns, and infrastructure decisions'
    };
    
    const formatInstructions = {
        markdown: 'Format the response as well-structured Markdown with headers, lists, and code blocks',
        json: 'Structure the response as a detailed JSON object with clear hierarchy',
        diagram: 'Include ASCII diagrams and flowcharts where appropriate'
    };
    
    return `
Create a comprehensive ${scope}-level plan for: ${description}

Scope Guidance: ${scopeGuidance[scope] || scopeGuidance.project}
Format: ${formatInstructions[format] || formatInstructions.markdown}

Please include the following sections:

1. **Executive Summary**
   - Overview of the plan
   - Key objectives and success criteria

2. **Analysis & Requirements**
   - Current state assessment
   - Requirements gathering
   - Constraints and assumptions

3. **Strategic Approach**
   - Methodology and approach
   - Key principles and decisions
   - Risk assessment

4. **Implementation Plan**
   - Phases and milestones
   - Timeline and dependencies
   - Resource requirements

5. **Technical Considerations**
   - Architecture and design patterns
   - Technology stack recommendations
   - Integration points

6. **Quality Assurance**
   - Testing strategy
   - Quality gates and criteria
   - Monitoring and validation

7. **Deployment & Operations**
   - Deployment strategy
   - Operational considerations
   - Maintenance and support

8. **Success Metrics**
   - Key performance indicators
   - Measurement criteria
   - Review and iteration process

${templates ? 'Include practical templates, checklists, and code examples where applicable.' : ''}

Provide actionable, specific guidance that can be immediately implemented.
`;
}

/**
 * Generate supporting documents based on scope
 */
async function generateSupportingDocuments(description, scope, mainPlan, llmProvider) {
    const documents = [];
    
    try {
        // Always generate: Risk Assessment
        const riskAssessment = await llmProvider.generateResponse(`
Based on this plan: ${description}

Main Plan Context:
${mainPlan.substring(0, 1000)}...

Create a detailed risk assessment including:
1. Technical risks and mitigation strategies
2. Project risks and contingencies  
3. Business risks and impact analysis
4. Timeline risks and buffer recommendations

Format as a structured risk register with severity and probability ratings.
`);
        
        documents.push({
            type: 'risk_assessment',
            title: 'Risk Assessment and Mitigation',
            content: riskAssessment
        });
        
        // Scope-specific documents
        switch (scope) {
            case 'project':
                // Generate project charter
                const charter = await llmProvider.generateResponse(`
Create a project charter for: ${description}

Include:
- Project scope and objectives
- Stakeholder identification
- Success criteria and deliverables
- Budget and resource estimates
- Communication plan
`);
                documents.push({
                    type: 'project_charter',
                    title: 'Project Charter',
                    content: charter
                });
                break;
                
            case 'architecture':
                // Generate architecture decision records
                const adr = await llmProvider.generateResponse(`
Create Architecture Decision Records (ADRs) for: ${description}

Include key architectural decisions with:
- Context and problem statement
- Decision and rationale
- Consequences and trade-offs
- Alternatives considered
`);
                documents.push({
                    type: 'architecture_decisions',
                    title: 'Architecture Decision Records',
                    content: adr
                });
                break;
                
            case 'feature':
                // Generate user stories and acceptance criteria
                const userStories = await llmProvider.generateResponse(`
Create detailed user stories and acceptance criteria for: ${description}

Include:
- User personas and scenarios
- Functional requirements as user stories
- Acceptance criteria and definition of done
- Edge cases and error conditions
`);
                documents.push({
                    type: 'user_stories',
                    title: 'User Stories and Acceptance Criteria',
                    content: userStories
                });
                break;
        }
        
        // Generate implementation checklist
        const checklist = await llmProvider.generateResponse(`
Create an implementation checklist for: ${description}

Based on the main plan, provide:
1. Pre-implementation setup tasks
2. Development phase checkpoints
3. Testing and validation steps
4. Deployment readiness checklist
5. Post-deployment verification

Format as actionable checklist items with clear completion criteria.
`);
        
        documents.push({
            type: 'implementation_checklist',
            title: 'Implementation Checklist',
            content: checklist
        });
        
    } catch (error) {
        console.warn('Failed to generate some supporting documents:', error);
    }
    
    return documents;
}

/**
 * Save plan artifacts to files
 */
async function savePlanArtifacts(sessionContext, planResult) {
    try {
        const outputDir = sessionContext.options?.outputDir || './ai-artifacts';
        
        await saveSessionArtifacts(sessionContext.sessionId, {
            plan: planResult.plan,
            supportingDocuments: planResult.supportingDocuments,
            session: sessionContext
        }, outputDir);
        
        console.log(`💾 Plan artifacts saved: ${sessionContext.sessionId}`);
    } catch (error) {
        console.warn('Failed to save plan artifacts:', error);
    }
}

module.exports = { handlePlanMode };
