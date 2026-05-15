import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Racine du framework Playwright = playwright/
export const FRAMEWORK_ROOT = path.resolve(__dirname, '../../..');
// Racine partagée = playwright-ia-simples/ (test-data centralisé)
export const SHARED_ROOT = path.resolve(FRAMEWORK_ROOT, '..');

// ── Résolution du dossier de test ─────────────────────────────
// ARGS_FILE=demo01  → playwright-ia-simples/test-data/demo01/
// ARGS_FILE absent  → playwright-ia-simples/test-data/default/
// ARGS_FILE=/abs    → utilisé tel quel (rétrocompat /efs/)
export function getTestDataDir() {
  const argsFile = process.env.ARGS_FILE;
  if (!argsFile)                 return path.join(SHARED_ROOT, 'test-data', 'default');
  if (path.isAbsolute(argsFile)) return argsFile;
  return path.join(SHARED_ROOT, 'test-data', argsFile);
}

export function getReportsDir() {
  const argsFile = process.env.ARGS_FILE;
  const name = !argsFile                  ? 'default'
    : path.isAbsolute(argsFile)           ? path.basename(argsFile)
    : argsFile;
  return path.join(FRAMEWORK_ROOT, 'reports', name);
}

export function getActionsPath() {
  const dir = getTestDataDir();
  const resolved = path.join(dir, 'actionsStep.json');
  if (!fs.existsSync(resolved)) {
    console.error(`❌ actionsStep.json introuvable : ${resolved}`);
    return null;
  }
  return resolved;
}

export function getUrlPath() {
  const dir = getTestDataDir();
  const resolved = path.join(dir, 'url.txt');
  if (!fs.existsSync(resolved)) {
    console.warn(`⚠️ url.txt introuvable : ${resolved}`);
    return null;
  }
  return resolved;
}

export function readUrlFromFile() {
  const urlPath = getUrlPath();
  if (!urlPath) return null;
  try {
    const url = fs.readFileSync(urlPath, 'utf-8').trim();
    if (url && url !== 'XXXXXXXXXXXXXXXXXXXXXXXXXX') return url;
  } catch (e) {
    console.error(`❌ Erreur lecture url.txt : ${e.message}`);
  }
  return null;
}