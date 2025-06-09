#!/usr/bin/env node

/**
 * Integration Test: AgentDriver Direct Testing
 * 
 * Direct testing of the Enhanced AgentDriver with Safety Controls
 */

const { AgentDriver } = require('../../../../dist/src/drivers/ai/AgentDriver');
const { Logger } = require('../../../../dist/src/utils/logger');

async function testAgentDriverDirectly() {
    console.log('🧪 Testing Enhanced AgentDriver Directly\n');
    
    const logger = Logger.getInstance();
    logger.setLevel('info');
    
    try {
        console.log('🚀 Creating AgentDriver instance...');
        const agentDriver = new AgentDriver({
            maxIterations: 3,
            iterationDelay: 2000,
            outputDir: './temp/agent-test'
        });
        
        console.log('⚙️  Initializing AgentDriver...');
        await agentDriver.initialize();
        
        console.log('✅ AgentDriver initialized successfully');
        console.log('');
        
        // Test the capabilities
        console.log('📋 AgentDriver Capabilities:');
        const capabilities = agentDriver.getCapabilities();
        console.log(`   Name: ${capabilities.name}`);
        console.log(`   Version: ${capabilities.version}`);
        console.log(`   Supported Actions: ${capabilities.supportedActions.join(', ')}`);
        console.log('');
        
        // Test enhanced agent mode
        const testTask = 'Take a screenshot and analyze what is currently visible on the screen';
        
        console.log('🎯 Testing enhanced agent mode with safety controls...');
        console.log(`📝 Task: ${testTask}`);
        console.log('');
        
        const result = await agentDriver.execute('agent', [{
            task: testTask,
            options: {
                maxIterations: 3,
                iterationDelay: 2000,
                environment: 'desktop',
                displayWidth: 1920,
                displayHeight: 1080
            }
        }]);
        
        console.log('📊 Agent Execution Results:');
        console.log(`   Success: ${result.success}`);
        console.log(`   Data Available: ${!!result.data}`);
        
        if (result.data) {
            console.log(`   Task Complete: ${result.data.isComplete || false}`);
            console.log(`   Current Iteration: ${result.data.currentIteration || 0}`);
            console.log(`   Max Iterations: ${result.data.maxIterations || 0}`);
            console.log(`   History Items: ${result.data.history?.length || 0}`);
            
            if (result.data.error) {
                console.log(`   Error: ${result.data.error}`);
            }
        }
        
        if (result.error) {
            console.log(`   Execution Error: ${result.error.message}`);
        }
        
        console.log('');
        console.log('🧹 Cleaning up AgentDriver...');
        await agentDriver.shutdown();
        
        console.log('✅ Enhanced AgentDriver test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        
        // Additional error details
        if (error.code) {
            console.error('Error Code:', error.code);
        }
        if (error.details) {
            console.error('Error Details:', error.details);
        }
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted by user (Ctrl+C)');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Test terminated by system');
    process.exit(0);
});

// Run the test
if (require.main === module) {
    testAgentDriverDirectly()
        .then(() => {
            console.log('🏁 Direct AgentDriver test completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Fatal error in direct test:', error);
            process.exit(1);
        });
}

module.exports = { testAgentDriverDirectly };
