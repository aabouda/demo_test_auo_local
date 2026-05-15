#!/usr/bin/env node
/**
 * Point d'entrée unique pour lancer les tests (UI, API, API E2E).
 * Utilise playwright-ia-simples comme framework principal.
 *
 * Usage:
 *   node run.js --test-type <ui|api|api_e2e> [--execution-id ID] [--project-id ID] [--tenant-id TENANT]
 *   node run.js --config-file execution.json
 *   TEST_TYPE=ui node run.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname);
const FRAMEWORK_EXECUTION_PATH = path.resolve(ROOT, '../../framwork_execution');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    testType: process.env.TEST_TYPE,
    executionId: process.env.EXECUTION_ID,
    projectId: process.env.PROJECT_ID,
    tenantId: process.env.TENANT_ID,
    configFile: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--test-type' || args[i] === '--type') {
      result.testType = args[i + 1];
      i++;
    } else if (args[i] === '--config-file' || args[i] === '--config') {
      result.configFile = args[i + 1];
      i++;
    } else if (args[i] === '--execution-id') {
      result.executionId = args[i + 1];
      i++;
    } else if (args[i] === '--project-id') {
      result.projectId = args[i + 1];
      i++;
    } else if (args[i] === '--tenant-id') {
      result.tenantId = args[i + 1];
      i++;
    }
  }

  if (result.configFile) {
    const configPath = path.isAbsolute(result.configFile)
      ? result.configFile
      : path.join(process.cwd(), result.configFile);
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      result.testType = result.testType || config.test_type || config.testType;
      result.executionId = result.executionId || config.execution_id || config.executionId;
      result.projectId = result.projectId || config.project_id || config.projectId;
      result.tenantId = result.tenantId || config.tenant_id || config.tenantId;
    }
  }

  return result;
}

function runUI() {
  console.log('🖥️  Lancement des tests UI (Cucumber + Playwright)...');
  const playwrightDir = path.join(ROOT, 'playwright');
  const env = { ...process.env, BROWSER: process.env.BROWSER || 'chromium' };
  if (process.env.ARGS_FILE) env.ARGS_FILE = process.env.ARGS_FILE;
  if (process.env.OLLAMA_URL) env.OLLAMA_URL = process.env.OLLAMA_URL;

  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['cucumber-js', '--config', 'cucumber.mjs'], {
      cwd: playwrightDir,
      env,
      stdio: 'inherit',
      shell: true
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
    child.on('error', reject);
  });
}

function runAPI(opts) {
  console.log('🔌 Lancement des tests API (pytest)...');
  const runExecutor = path.join(FRAMEWORK_EXECUTION_PATH, 'run_executor.py');
  if (!fs.existsSync(runExecutor)) {
    console.error('❌ run_executor.py introuvable. Chemin attendu:', runExecutor);
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    const args = [
      runExecutor,
      '--execution_id', String(opts.executionId),
      '--project_id', String(opts.projectId),
      '--tenant_id', opts.tenantId,
      '--test_type', opts.testType,
      '--framework_root', ROOT
    ];
    const child = spawn('python3', args, {
      cwd: FRAMEWORK_EXECUTION_PATH,
      stdio: 'inherit',
      env: { ...process.env, PYTHONPATH: FRAMEWORK_EXECUTION_PATH }
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  const opts = parseArgs();

  if (!opts.testType) {
    console.error('❌ Type de test requis. Utilisez --test-type ui|api|api_e2e ou --config-file <fichier> ou TEST_TYPE=...');
    process.exit(1);
  }

  const validTypes = ['ui', 'api', 'api_e2e'];
  if (!validTypes.includes(opts.testType)) {
    console.error('❌ test_type doit être: ui, api ou api_e2e');
    process.exit(1);
  }

  if (opts.testType === 'ui') {
    try {
      await runUI();
    } catch (e) {
      process.exit(e.message === 'Exit 0' ? 0 : 1);
    }
    return;
  }

  if (!opts.executionId || !opts.projectId || !opts.tenantId) {
    console.error('❌ Pour api/api_e2e, indiquez --execution-id, --project-id et --tenant-id (ou via --config-file).');
    process.exit(1);
  }

  try {
    await runAPI(opts);
  } catch (e) {
    process.exit(e.message === 'Exit 0' ? 0 : 1);
  }
}

main();
