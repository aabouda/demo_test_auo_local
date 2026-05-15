/**
 * post-run.mjs
 * ─────────────
 * Script exécuté APRÈS cucumber-js, quand tous les rapports HTML/JSON
 * sont complètement écrits sur disque.
 *
 * Lit <reports_dir>/.turing_meta.json, crée le ZIP et l'uploade vers TuringOne.
 *
 * Usage :
 *   node post-run.mjs <reports_dir>
 *   node post-run.mjs reports/demo01
 *
 * Appelé automatiquement depuis package.json via le script "test:full".
 */

import path from 'path';
import fs   from 'fs';
import { fileURLToPath } from 'url';
import { uploadTuringOutput } from './src/steps/utils/turing1-notifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Le dossier reports est passé en argument ou lu depuis ARGS_FILE
const argsFile   = process.argv[2] || process.env.ARGS_FILE || 'default';
// reports restent dans playwright/reports/ (pas dans le test-data partagé)
const reportsDir = path.isAbsolute(argsFile)
  ? argsFile
  : path.join(__dirname, 'reports', argsFile);

const metaPath = path.join(reportsDir, '.turing_meta.json');

if (!fs.existsSync(metaPath)) {
  console.log(`ℹ️  [post-run] Pas de méta TuringOne trouvée (${metaPath}), rien à uploader.`);
  process.exit(0);
}

let meta;
try {
  meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
} catch (err) {
  console.error(`❌ [post-run] Impossible de lire ${metaPath} : ${err.message}`);
  process.exit(1);
}

console.log(`\n📤 [post-run] Upload artefacts exécution=${meta.execution_id} type=${meta.execution_type}`);
console.log(`   Dossier : ${reportsDir}`);

// Injecter les variables d'env lues depuis la méta (si pas déjà définies)
process.env.TURING1_API_URL        = process.env.TURING1_API_URL        || meta.turing1_api_url;
process.env.TURING1_SECURITY_TOKEN = process.env.TURING1_SECURITY_TOKEN || meta.turing1_security_token;

const result = await uploadTuringOutput({
  execution_id:   meta.execution_id,
  execution_type: meta.execution_type,
  reports_dir:    reportsDir,
});

if (result) {
  console.log(`\n✅ [post-run] Upload terminé → ${result.output_path}`);
  // Supprimer la méta après upload réussi
  fs.unlinkSync(metaPath);
} else {
  console.warn(`\n⚠️  [post-run] Upload échoué ou TuringOne indisponible.`);
}
