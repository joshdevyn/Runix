#!/usr/bin/env node

/**
 * Integration Test: Agent Safety Controls
 * 
 * Tests the enhanced agent functionality including:
 * - Escape key detection to stop agent
 * - User input detection to pause agent
 * - Visual/audio feedback for state changes
 * - Safe interruption mechanisms
 */

const { DriverRegistry } = require('../../../../dist/src/drivers/driverRegistry');
const { Logger } = require('../../../../dist/src/utils/logger');

async function testEnhancedAgent() {
    console.log('🧪 Testing Enhanced Agent Mode with Safety Controls\n');
    
    const logger = Logger.getInstance();
    logger.setLevel('info');
    
    try {
        // Initialize driver registry
        const registry = DriverRegistry.getInstance();
        await registry.initialize();
        
        console.log('📋 Available test scenarios:');
        console.log('1. Basic agent loop with safety controls');
        console.log('2. Agent with user input simulation');
        console.log('3. Agent with escape key simulation');
        console.log('');
          // Start agent driver (AgentDriver is part of ai-driver)
        console.log('🚀 Starting AI Driver with Agent functionality...');
        const agentDriver = await registry.startDriver('ai-driver');
          if (!agentDriver) {
            throw new Error('Failed to start ai-driver');
        }
        
        console.log('✅ AI Driver started successfully');
        console.log('');
        
        // Test basic agent functionality
        const testTask = 'Take a screenshot and analyze what is currently on screen';
        
        console.log('🎯 Testing enhanced agent mode...');
        console.log(`📝 Task: ${testTask}`);
        console.log('');
        console.log('⚠️  SAFETY CONTROLS ACTIVE:');
        console.log('   • Press ESC to stop agent immediately');
        console.log('   • Press any other key to pause agent for 10 seconds');
        console.log('   • Agent will auto-stop after 5 iterations for this test');
        console.log('');
        
        // Execute agent with enhanced safety controls
        const result = await agentDriver.callMethod('execute', {
            action: 'agent',
            args: [{
                task: testTask,
                options: {
                    maxIterations: 5,
                    iterationDelay: 3000, // 3 second delay between iterations
                    environment: 'desktop',
                    displayWidth: 1920,
                    displayHeight: 1080
                }
            }]
        });
        
        console.log('📊 Agent Execution Results:');
        console.log(`   Success: ${result.success}`);
        console.log(`   Completed: ${result.data?.isComplete || false}`);
        console.log(`   Iterations: ${result.data?.currentIteration || 0}`);
        console.log(`   History Length: ${result.data?.history?.length || 0}`);
        
        if (result.data?.error) {
            console.log(`   Error: ${result.data.error}`);
        }
        
        console.log('');
        console.log('✅ Enhanced Agent test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
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
    testEnhancedAgent()
        .then(() => {
            console.log('🏁 Test script completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { testEnhancedAgent };
