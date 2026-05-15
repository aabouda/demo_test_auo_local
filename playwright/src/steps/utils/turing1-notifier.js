/**
 * turing1-notifier.js
 * Notifications vers TuringOne (fire-and-forget pour les DOM updates,
 * et bloquantes pour create/report où le résultat est nécessaire).
 * Auth : X-Turing-Token (env TURING1_SECURITY_TOKEN)
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';

const TURING1_API_URL        = process.env.TURING1_API_URL        || 'http://localhost:8000';
const TURING1_SECURITY_TOKEN = process.env.TURING1_SECURITY_TOKEN || '';
const EXECUTION_ID           = process.env.ARGS_FILE              || null;

/** Fire-and-forget — ne bloque jamais l'exécution. */
async function _notify(endpoint, body) {
  const url = `${TURING1_API_URL}/public${endpoint}`;
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Turing-Token': TURING1_SECURITY_TOKEN,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  }).catch((err) => {
    console.warn(`⚠️ [TuringOne notifier] ${endpoint} : ${err.message}`);
  });
}

/** Appel bloquant — retourne la réponse JSON ou null si erreur. */
async function _call(endpoint, body, timeoutMs = 15000) {
  const url = `${TURING1_API_URL}/public${endpoint}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turing-Token': TURING1_SECURITY_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(`⚠️ [TuringOne] ${endpoint} HTTP ${resp.status}: ${text}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.warn(`⚠️ [TuringOne] ${endpoint} : ${err.message}`);
    return null;
  }
}

/**
 * Crée une exécution dans TuringOne à partir d'un plan de test (campagne_id).
 * Retourne { execution_id, execution_type, detail_items: [{detail_execution_id, name}] }
 * ou null si TuringOne est indisponible.
 *
 * Variables d'env requises :
 *   CAMPAGNE_ID          — ID de la campagne (plan de test TuringOne)
 *   CAMPAGNE_TYPE        — "ui" (défaut) | "api"
 *   TURING1_SECURITY_TOKEN
 */
export async function createTuringExecution({ campagne_id, campagne_type = 'ui', executed_by = 'framework-playwright', environment_id = null } = {}) {
  if (!campagne_id) return null;
  console.log(`🚀 [TuringOne] Création exécution campagne=${campagne_id} type=${campagne_type} env=${environment_id}…`);
  const result = await _call('/executions/create', { campagne_id, campagne_type, executed_by, environment_id });
  if (result) {
    console.log(`✅ [TuringOne] Exécution créée : id=${result.execution_id} (${result.detail_items?.length || 0} scénarios)`);
  }
  return result;
}

/**
 * Rapporte le résultat d'un scénario après exécution.
 * Bloquant (await) pour garantir l'envoi avant que Cucumber passe au suivant.
 */
export async function reportTuringScenarioResult({
  execution_id,
  execution_type,
  detail_execution_id,
  status,
  duration,
  error,
  captured_logs,
}) {
  const endpoint = execution_type === 'ui'
    ? `/executions/${execution_id}/result-ui`
    : `/executions/${execution_id}/result`;

  await _call(endpoint, {
    detail_execution_id,
    status,
    duration:      duration || 0,
    error:         error || null,
    captured_logs: captured_logs || null,
  }, 10000);

  console.log(`📊 [TuringOne] Résultat rapporté : detail=${detail_execution_id} status=${status}`);
}

/**
 * Marque une exécution comme terminée (appelé en AfterAll).
 */
export async function completeTuringExecution({ execution_id, execution_type, status = 'completed', duration_total }) {
  await _call(`/executions/${execution_id}/complete`, {
    execution_type,
    status,
    duration_total: duration_total || null,
  }, 10000);
  console.log(`🏁 [TuringOne] Exécution ${execution_id} terminée → ${status}`);
}

/**
 * Sauvegarde les métadonnées TuringOne dans <reports_dir>/.turing_meta.json
 * pour que post-run.mjs puisse faire le ZIP + upload après que Cucumber
 * ait fini d'écrire tous les rapports HTML/JSON.
 */
export function saveTuringMeta({ reports_dir, execution_id, execution_type, duration_total }) {
  const metaPath = path.join(reports_dir, '.turing_meta.json');
  const meta = {
    execution_id,
    execution_type,
    duration_total,
    reports_dir,
    turing1_api_url:        TURING1_API_URL,
    turing1_security_token: TURING1_SECURITY_TOKEN,
    saved_at:               new Date().toISOString(),
  };
  try {
    fs.mkdirSync(reports_dir, { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    console.log(`💾 [TuringOne] Méta sauvegardée → ${metaPath}`);
  } catch (err) {
    console.warn(`⚠️ [TuringOne] Impossible de sauvegarder la méta : ${err.message}`);
  }
}

/**
 * Collecte récursivement tous les fichiers d'un dossier.
 * Retourne un tableau de chemins absolus.
 */
function _collectFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(_collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Attend que tous les fichiers d'un dossier soient stables (taille fixe).
 * Vérifie toutes les `intervalMs` ms pendant au maximum `maxWaitMs` ms.
 */
async function _waitForFilesStable(dir, intervalMs = 500, maxWaitMs = 15000) {
  const deadline = Date.now() + maxWaitMs;
  let prevSizes = {};

  while (Date.now() < deadline) {
    const files = _collectFiles(dir);
    const sizes = {};
    for (const f of files) {
      try { sizes[f] = fs.statSync(f).size; } catch { sizes[f] = -1; }
    }

    const stable = Object.keys(sizes).length > 0 &&
      Object.keys(sizes).every(f => sizes[f] === prevSizes[f]);

    if (stable) {
      console.log(`✅ [TuringOne] Fichiers stables (${Object.keys(sizes).length} fichiers)`);
      return sizes;
    }

    prevSizes = sizes;
    await new Promise(r => setTimeout(r, intervalMs));
  }

  console.warn(`⚠️ [TuringOne] Timeout attente stabilité fichiers (${maxWaitMs}ms)`);
  return prevSizes;
}

/**
 * Compresse un dossier en ZIP et l'uploade vers TuringOne → S3.
 * Appelé en AfterAll après completeTuringExecution.
 * Attend que tous les fichiers soient stables sur disque avant de zipper.
 */
export async function uploadTuringOutput({ execution_id, execution_type, reports_dir }) {
  if (!execution_id || !reports_dir || !fs.existsSync(reports_dir)) {
    console.warn(`⚠️ [TuringOne] uploadOutput : dossier introuvable → ${reports_dir}`);
    return null;
  }

  // ── Étape 1 : attendre que Playwright finisse d'écrire les vidéos ──────────
  console.log(`⏳ [TuringOne] Attente stabilité fichiers dans : ${reports_dir}`);
  const fileSizes = await _waitForFilesStable(reports_dir);
  const fileList  = Object.keys(fileSizes);
  console.log(`📋 [TuringOne] Fichiers à zipper (${fileList.length}) :`);
  for (const f of fileList) {
    console.log(`   ${f.replace(reports_dir, '')}  (${(fileSizes[f] / 1024).toFixed(1)} KB)`);
  }

  if (fileList.length === 0) {
    console.warn(`⚠️ [TuringOne] Aucun fichier trouvé dans ${reports_dir}, abandon upload`);
    return null;
  }

  // ── Étape 2 : créer le ZIP fichier par fichier (mode synchrone contrôlé) ───
  const zipPath = path.join(path.dirname(reports_dir), `execution_${execution_id}_output.zip`);
  const { default: archiver } = await import('archiver');

  await new Promise((resolve, reject) => {
    const output  = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    // 'finish' = toutes les données ont été écrites et flushées dans le fichier
    output.on('finish', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
      else console.warn(`⚠️ [ZIP] Warning: ${err.message}`);
    });

    archive.pipe(output);

    // Ajouter chaque fichier individuellement avec son chemin relatif
    for (const filePath of fileList) {
      const relativePath = path.relative(reports_dir, filePath);
      archive.file(filePath, { name: relativePath });
    }

    archive.finalize();
  });

  const zipSize = fs.statSync(zipPath).size;
  console.log(`📦 [TuringOne] ZIP créé : ${path.basename(zipPath)} (${(zipSize / 1024).toFixed(1)} KB)`);

  // ── Étape 3 : upload multipart vers TuringOne ─────────────────────────────
  const url = `${TURING1_API_URL}/public/executions/${execution_id}/upload-output`;
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('execution_type', execution_type);
  form.append('file', fs.createReadStream(zipPath), {
    filename:    path.basename(zipPath),
    contentType: 'application/zip',
    knownLength: zipSize,
  });

  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers: {
        ...form.getHeaders(),
        'X-Turing-Token': TURING1_SECURITY_TOKEN,
      },
      body:   form,
      signal: AbortSignal.timeout(180000), // 3 min pour les gros fichiers vidéo
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(`⚠️ [TuringOne] upload-output HTTP ${resp.status}: ${text}`);
      return null;
    }

    const result = await resp.json();
    console.log(`✅ [TuringOne] Output uploadé → ${result.output_path} (${(result.size_bytes / 1024).toFixed(1)} KB)`);

    // Nettoyer le ZIP temporaire
    fs.unlinkSync(zipPath);
    return result;
  } catch (err) {
    console.warn(`⚠️ [TuringOne] upload-output erreur : ${err.message}`);
    return null;
  }
}

/**
 * Notifie TuringOne qu'un sélecteur DOM a changé (self-healing).
 * endpoint : POST /public/steps/dom-update
 */
export function notifyDomUpdate({ step_id, step_text, old_dom, new_dom }) {
  const stepId = step_id ? parseInt(step_id, 10) : null;
  _notify('/steps/dom-update', {
    step_id:      stepId,
    step_text,
    old_dom:      old_dom || null,
    new_dom,
    execution_id: EXECUTION_ID,
  });
}

/**
 * Notifie TuringOne qu'un step a été enrichi par le LLM
 * (action, label, uri, dom inférés depuis le texte naturel).
 * endpoint : POST /public/steps/enrich
 */
export function notifyStepEnrich({ step_id, step_text, action, label, resolved_value, uri, dom, inferred_by }) {
  const stepId = step_id ? parseInt(step_id, 10) : null;
  _notify('/steps/enrich', {
    step_id,
    step_text,
    execution_id:   EXECUTION_ID,
    action,
    label,
    resolved_value,
    uri,
    dom,
    inferred_by:    inferred_by || 'turing1-llm',
  });
}