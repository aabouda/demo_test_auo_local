/**
 * smartElementEngine.js
 *
 * Moteur de sélection à 2 niveaux :
 *
 *  N1 — Cache JSON (dom stocké dans actionsStep.json)
 *       → Valide que l'élément existe ET est compatible avec l'action
 *       → Si OK : retourne le sélecteur directement
 *
 *  N2 — TuringOne LLM (si N1 absent, introuvable ou incompatible)
 *       → Envoie label + action + HTML nettoyé à TuringOne
 *       → Sauvegarde le résultat dans actionsStep.json pour les prochains runs
 *
 * Pas de heuristique N2 intermédiaire : si le cache est faux ou absent,
 * on fait confiance au LLM pour trouver le bon élément.
 */

import { llmSelector } from "./llmSelector.js";
import { exists } from "./utils.js";
import { updateStepDomInJson } from "../utils/functions.js";

export async function resolveElement({ page, label, action, dom, stepText }) {
  console.log(`\n🔎 [ResolveElement] label="${label}" action="${action}"`);

  // ══════════════════════════════════════════════════════
  // N1 — Sélecteur JSON en cache
  // ══════════════════════════════════════════════════════
  const cached = dom?.trim() || null;

  if (cached) {
    console.log(`➡️  N1 : test du sélecteur JSON : ${cached}`);

    const n1Result = await _validateSelector(page, cached, action);

    if (n1Result === 'ok') {
      console.log(`✔ N1 : sélecteur valide et compatible.`);
      return cached;
    }

    if (n1Result === 'wrong_type') {
      console.log(`⚠️ N1 : sélecteur existe mais mauvais type d'élément → appel LLM`);
    } else {
      console.log(`❌ N1 : sélecteur introuvable ou invalide → appel LLM`);
    }
  } else {
    console.log(`➡️  N1 : aucun sélecteur en cache → appel LLM`);
  }

  // ══════════════════════════════════════════════════════
  // N2 — TuringOne LLM
  // ══════════════════════════════════════════════════════
  console.log(`🤖 N2 : appel TuringOne LLM pour label="${label}"...`);

  const llmResult = await llmSelector(page, label, action);

  if (llmResult) {
    const llmCheck = await _validateSelector(page, llmResult, action);
    if (llmCheck !== 'not_found') {
      console.log(`💾 Sauvegarde sélecteur LLM : ${llmResult}`);
      updateStepDomInJson(stepText, llmResult);
      console.log(`🎯 N2 LLM → sélecteur : ${llmResult}`);
      return llmResult;
    }
    console.log(`⚠️ N2 LLM retourné mais invalide : ${llmResult} → N3`);
  } else {
    console.log(`⚠️ N2 LLM sans résultat (TuringOne indisponible ?) → N3`);
  }

  // ══════════════════════════════════════════════════════
  // N3 — Smart Playwright locators (fallback local, 0 token)
  // Utilise les APIs sémantiques de Playwright :
  //   getByLabel, getByRole, getByPlaceholder, getByText
  // ══════════════════════════════════════════════════════
  console.log(`🔬 N3 : recherche sémantique Playwright pour label="${label}"...`);

  const smartResult = await _smartPlaywrightSearch(page, label, action);

  if (smartResult) {
    console.log(`💾 Sauvegarde sélecteur N3 : ${smartResult}`);
    updateStepDomInJson(stepText, smartResult);
    console.log(`🎯 N3 Smart → sélecteur : ${smartResult}`);
    return smartResult;
  }

  throw new Error(
    `Impossible de trouver un sélecteur pour "${label}" après N1 (cache), N2 (LLM), N3 (smart search).`
  );
}

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

/**
 * Vérifie qu'un sélecteur :
 *  - existe dans la page
 *  - est unique (ou accepté ambigu)
 *  - correspond au bon type d'élément pour l'action
 *
 * Retourne : 'ok' | 'wrong_type' | 'not_found'
 */
async function _validateSelector(page, selector, action) {
  try {
    if (!(await exists(page, selector))) return 'not_found';

    const count = await page.locator(selector).count();
    if (count === 0) return 'not_found';

    const tagName = await page.locator(selector).first()
      .evaluate(el => el.tagName.toLowerCase())
      .catch(() => 'unknown');

    if (!_isValidForAction(tagName, action)) return 'wrong_type';

    return 'ok';
  } catch {
    return 'not_found';
  }
}

/**
 * Vérifie que le tag HTML est compatible avec l'action demandée.
 */
function _isValidForAction(tagName, action) {
  const a = (action || '').toLowerCase();

  if (a === 'click') {
    return ['button', 'a', 'input', 'label', 'div', 'span', 'li', 'option', 'select'].includes(tagName);
  }
  if (a === 'type' || a === 'fill') {
    return ['input', 'textarea', 'select'].includes(tagName);
  }
  if (a === 'select') {
    return ['select'].includes(tagName);
  }
  if (a === 'check' || a === 'uncheck') {
    return ['input'].includes(tagName);
  }

  // assert_visible, assert, verify* → accepte tout
  return true;
}

/**
 * N3 — Recherche sémantique locale sans LLM.
 * Utilise les APIs haute-sémantique de Playwright dans cet ordre :
 *
 *  Pour type/fill :
 *    1. getByLabel()          — cherche le <label for="x"> associé à l'input
 *    2. getByRole('textbox')  — input via ARIA role
 *    3. getByPlaceholder()    — attribut placeholder
 *    4. [name*="label"]       — attribut name contient le label (insensible casse)
 *    5. [id*="label"]         — attribut id contient le label
 *    6. input proche d'un texte "label" — context DOM scan
 *
 *  Pour click :
 *    1. getByRole('button')   — bouton ARIA
 *    2. getByRole('link')     — lien ARIA
 *    3. getByText()           — texte exact visible
 *    4. button/a contenant le texte
 *
 *  Pour assert_visible :
 *    1. getByText()           — texte visible quelconque
 *    2. [aria-label]          — aria-label
 *
 * Si le locator trouvé est unique et visible, on résout son sélecteur CSS
 * et on le retourne pour sauvegarde dans le JSON.
 */
async function _smartPlaywrightSearch(page, label, action) {
  const a = (action || '').toLowerCase();
  const clean = label.replace(/^["']|["']$/g, '').trim();

  const strategies = [];

  if (a === 'type' || a === 'fill') {
    strategies.push(
      () => page.getByLabel(clean, { exact: true }),
      () => page.getByLabel(clean, { exact: false }),
      () => page.getByRole('textbox', { name: clean, exact: false }),
      () => page.getByPlaceholder(clean, { exact: false }),
      () => page.locator(`input[name="${clean}"]`),
      () => page.locator(`input[name*="${clean.toLowerCase()}"]`),
      () => page.locator(`input[id*="${clean.toLowerCase()}"]`),
      () => page.locator(`textarea[placeholder*="${clean.toLowerCase()}"]`),
    );
  } else if (a === 'click') {
    strategies.push(
      () => page.getByRole('button', { name: clean, exact: false }),
      () => page.getByRole('link',   { name: clean, exact: false }),
      () => page.getByText(clean,    { exact: true }),
      () => page.getByText(clean,    { exact: false }),
      () => page.locator(`button:has-text("${clean}")`),
      () => page.locator(`a:has-text("${clean}")`),
      () => page.locator(`[aria-label*="${clean}"]`),
    );
  } else {
    // assert_visible, etc.
    strategies.push(
      () => page.getByText(clean, { exact: true }),
      () => page.getByText(clean, { exact: false }),
      () => page.locator(`[aria-label*="${clean}"]`),
    );
  }

  for (const makeLocator of strategies) {
    try {
      const loc = makeLocator();
      const count = await loc.count().catch(() => 0);
      if (count === 0) continue;

      // Prendre le premier élément visible
      const visible = await loc.first().isVisible().catch(() => false);
      if (!visible) continue;

      const tagName = await loc.first().evaluate(el => el.tagName.toLowerCase()).catch(() => '');
      if (!_isValidForAction(tagName, action)) continue;

      // Résoudre un sélecteur CSS stable depuis l'élément
      const cssSelector = await loc.first().evaluate(el => {
        if (el.id) return `#${el.id}`;
        if (el.name) return `[name="${el.name}"]`;
        if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
        if (el.placeholder) return `[placeholder="${el.placeholder}"]`;
        // Construire un sélecteur avec parents
        const parts = [];
        let node = el;
        while (node && node !== document.body && parts.length < 3) {
          let part = node.tagName.toLowerCase();
          if (node.id) { part = `#${node.id}`; parts.unshift(part); break; }
          if (node.className) {
            const cls = node.className.toString().trim().split(/\s+/)[0];
            if (cls) part += `.${cls}`;
          }
          parts.unshift(part);
          node = node.parentElement;
        }
        return parts.join(' > ');
      }).catch(() => null);

      if (cssSelector) {
        // Vérifier que le sélecteur résolu est bien unique
        const finalCount = await page.locator(cssSelector).count().catch(() => 0);
        if (finalCount === 1) {
          console.log(`✅ N3 Smart → "${cssSelector}" (via ${tagName})`);
          return cssSelector;
        }
      }

      // Retourner quand même le premier locator si on ne peut pas résoudre mieux
      if (count === 1) {
        console.log(`✅ N3 Smart → unique locator trouvé (${tagName}), sélecteur non résolu, on l'utilise tel quel`);
        // Retourner un sélecteur basé sur l'index pour éviter l'ambiguïté
        return null; // laisser le moteur passer à la stratégie suivante
      }
    } catch (e) {
      // Stratégie échouée, on continue
    }
  }

  console.log(`❌ N3 Smart : aucune stratégie n'a trouvé "${label}"`);
  return null;
}