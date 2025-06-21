// Quick test to debug filesystem access
const fs = require('fs');
const path = require('path');

console.log('Current working directory:', process.cwd());
console.log('Script directory:', __dirname);

// Test basic file write
try {
    const testFile = path.join(__dirname, 'test-write.log');
    console.log('Testing write to:', testFile);
    fs.writeFileSync(testFile, 'Test write at ' + new Date().toISOString() + '\n');
    console.log('✓ Basic write successful');
    
    // Test append
    fs.appendFileSync(testFile, 'Test append at ' + new Date().toISOString() + '\n');
    console.log('✓ Append successful');
    
    // Read back
    const content = fs.readFileSync(testFile, 'utf8');
    console.log('File content:', content);
    
    // Clean up
    fs.unlinkSync(testFile);
    console.log('✓ Cleanup successful');
    
} catch (error) {
    console.error('❌ Filesystem test failed:', error);
}

// Test log directory
const logsDir = path.join(__dirname, 'logs');
console.log('\nTesting logs directory:', logsDir);
try {
    if (!fs.existsSync(logsDir)) {
        console.log('Logs directory does not exist, creating...');
        fs.mkdirSync(logsDir, { recursive: true });
    }
    console.log('✓ Logs directory exists');
    
    // Test write to logs directory
    const logFile = path.join(logsDir, 'debug-test.log');
    fs.writeFileSync(logFile, 'Debug test at ' + new Date().toISOString() + '\n');
    console.log('✓ Write to logs directory successful');
    
    // Clean up
    fs.unlinkSync(logFile);
    console.log('✓ Cleanup successful');
    
} catch (error) {
    console.error('❌ Logs directory test failed:', error);
}

// Test reports directory
const reportsDir = path.join(__dirname, 'reports');
console.log('\nTesting reports directory:', reportsDir);
try {
    if (!fs.existsSync(reportsDir)) {
        console.log('Reports directory does not exist, creating...');
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    console.log('✓ Reports directory exists');
    
    // Test write to reports directory
    const reportFile = path.join(reportsDir, 'debug-test.json');
    fs.writeFileSync(reportFile, JSON.stringify({ test: true, timestamp: new Date().toISOString() }, null, 2));
    console.log('✓ Write to reports directory successful');
    
    // Clean up
    fs.unlinkSync(reportFile);
    console.log('✓ Cleanup successful');
    
} catch (error) {
    console.error('❌ Reports directory test failed:', error);
}
