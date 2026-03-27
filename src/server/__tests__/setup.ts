import path from 'path';
import os from 'os';
import fs from 'fs';

// Use a temp directory for tests so we don't destroy user data
const testDataDir = path.join(os.tmpdir(), 'kanbaii-test-' + process.pid);
process.env.KANBAII_DATA_DIR = testDataDir;

// Ensure it exists
fs.mkdirSync(testDataDir, { recursive: true });
