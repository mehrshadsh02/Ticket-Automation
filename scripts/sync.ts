import { loadConfig } from '../config/env.js';
import { runSync } from '../services/SyncRunner.js';
runSync(loadConfig()).catch(() => process.exitCode = 1);
