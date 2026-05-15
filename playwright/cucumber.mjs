import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const FRAMEWORK_ROOT = __dirname;                        // playwright/
const SHARED_ROOT    = path.resolve(__dirname, '..');    // playwright-ia-simples/

const argsFile = process.env.ARGS_FILE;
console.log('✅ ARGS_FILE:', argsFile || '(non défini → default)');

function resolveTestDataDir() {
  if (!argsFile)                 return path.join(SHARED_ROOT, 'test-data', 'default');
  if (path.isAbsolute(argsFile)) return argsFile;
  return path.join(SHARED_ROOT, 'test-data', argsFile);
}

function resolveReportsDir() {
  const name = !argsFile                ? 'default'
    : path.isAbsolute(argsFile)         ? path.basename(argsFile)
    : argsFile;
  return path.join(FRAMEWORK_ROOT, 'reports', name);
}

const testDataDir = resolveTestDataDir();
const reportsDir  = resolveReportsDir();
const featurePath = path.join(testDataDir, 'scenario.feature');

console.log('📂 Test data :', testDataDir);
console.log('📂 Reports   :', reportsDir);
console.log('📂 Feature   :', featurePath);

// Création automatique des dossiers de sortie
const screenshotsDir = path.join(reportsDir, 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

// steps.json requis par le hook AfterStep — auto-généré si absent
const stepsJsonPath = path.join(screenshotsDir, 'steps.json');
if (!fs.existsSync(stepsJsonPath)) {
  const actionsPath = path.join(testDataDir, 'actionsStep.json');
  let stepsInit = [];
  if (fs.existsSync(actionsPath)) {
    try {
      const actions = JSON.parse(fs.readFileSync(actionsPath, 'utf-8'));
      stepsInit = actions.map(a => ({ text: a.step, status: null, color: null }));
    } catch { /* tableau vide */ }
  }
  fs.writeFileSync(stepsJsonPath, JSON.stringify(stepsInit, null, 2), 'utf-8');
  console.log('📝 steps.json créé :', stepsJsonPath);
}

if (!fs.existsSync(featurePath)) {
  console.error('❌ scenario.feature introuvable :', featurePath);
}

const baseConfig = {
  import: [
    './src/steps/**/*.js',
    './src/support/config.mjs',
    './src/support/world.mjs',
    './src/support/reporter.mjs',
  ],
  paths: [featurePath],
  format: [
    `json:${reportsDir}/cucumber_report.json`,
    `html:${reportsDir}/cucumber-report.html`,
    'progress-bar',
    `./src/support/reporter.mjs:${reportsDir}/allure-log.txt`,
  ],
  retry: 0,
};

// Les profils sont des exports nommés en ESM
export default      baseConfig;   // profil "default"
export const test_runner   = baseConfig;
export const debug_runner  = { ...baseConfig, retry: 0 };