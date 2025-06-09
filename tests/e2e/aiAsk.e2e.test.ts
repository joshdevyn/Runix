import { exec } from 'child_process';
import * as util from 'util';
import * as path from 'path';

const promisifiedExec = util.promisify(exec);

// Assuming the test execution CWD is the project root c:/_Runix
const projectRoot = path.resolve(__dirname, '..', '..'); // Resolve to c:/_Runix from c:/_Runix/tests/e2e

// Determine the correct runix executable based on the platform
let runixExecutablePath: string;
if (process.platform === 'win32') {
  runixExecutablePath = path.join(projectRoot, 'bin', 'runix.bat');
} else if (process.platform === 'darwin') {
  runixExecutablePath = path.join(projectRoot, 'bin', 'runix-macos');
} else {
  runixExecutablePath = path.join(projectRoot, 'bin', 'runix-linux');
}

describe('E2E: runix ai ask', () => {
  // Increased timeout for E2E tests that might start external processes
  jest.setTimeout(60000); // 60 seconds

  it('should execute "ai ask" command and receive a non-empty response without stderr output', async () => {
    const question = "What is a simple, commonly known fact?"; // A generic question
    // Construct the command carefully, especially with paths and quotes
    const command = `"${runixExecutablePath}" ai ask "${question}"`;

    let execResult;
    try {
      execResult = await promisifiedExec(command, { cwd: projectRoot });
    } catch (e: any) {
      // If exec throws, it's usually due to a non-zero exit code.
      // We want to log this and fail the test.
      console.error(`Command execution failed for: ${command}`);
      console.error('Error details:', e);
      console.error('STDOUT from failed command:', e.stdout);
      console.error('STDERR from failed command:', e.stderr);
      // Re-throw to ensure the test fails clearly
      throw new Error(`Command "${command}" failed with exit code ${e.code}:\nSTDERR: ${e.stderr}\nSTDOUT: ${e.stdout}`);
    }

    const { stdout, stderr } = execResult;

    console.log(`Command executed: ${command}`);
    console.log('STDOUT:', stdout);
    console.log('STDERR:', stderr);

    // Assertions:
    // 1. No errors printed to stderr. An empty string is expected.
    expect(stderr).toBe('');

    // 2. Some output is printed to stdout.
    expect(stdout).toBeTruthy();

    // 3. (Optional) More specific checks can be added here if the AI's response format is known
    //    or if the ai-driver service returns predictable output for certain test questions.
    //    For example: expect(stdout).toContain("The capital of France is Paris.");
    //    For now, a non-empty stdout and empty stderr are the primary indicators of success.
  });
});
