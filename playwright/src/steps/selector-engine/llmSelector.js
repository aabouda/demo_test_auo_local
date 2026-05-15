/**
 * llmSelector.js
 * Sélecteur LLM via TuringOne (pas de clé Groq/OpenAI dans le framework).
 * Endpoint : POST /public/llm/selector
 * Auth     : X-Turing-Token
 */

import { cleanHtmlForLLM } from "./cleanHtmlForLLM.js";
import { exists, isUnique } from "./utils.js";
import { callTuring1Selector } from "../utils/turing1-llm.js";

/**
 * Demande au LLM TuringOne de trouver un sélecteur CSS unique
 * pour (label, action) dans la page courante.
 * Retourne le sélecteur validé ou null si introuvable.
 */
export async function llmSelector(page, label, action) {
  try {
    console.log(`🧠 [LLM → TuringOne] Recherche sélecteur pour "${label}" (action: ${action})`);

    // 1. Extraire et nettoyer le HTML
    const rawHtml = await page.content();
    const html = cleanHtmlForLLM(rawHtml);
    console.log(`📏 HTML réduit : ${html.length} chars`);

    // 2. Appel TuringOne (stratégie 1 par défaut)
    const selector = await callTuring1Selector(label, action, html, 1);

    if (!selector) {
      console.log("❌ TuringOne n'a pas retourné de sélecteur.");
      return null;
    }

    console.log(`📌 Sélecteur TuringOne : ${selector}`);

    // 3. Validation : le sélecteur existe-t-il dans la page ?
    if (!(await exists(page, selector))) {
      console.log(`❌ Sélecteur invalide (absent de la page) : ${selector}`);
      // Tentative stratégie 2 (HTML complet, plus de contexte)
      const selector2 = await callTuring1Selector(label, action, html, 2);
      if (!selector2 || !(await exists(page, selector2))) {
        console.log("❌ TuringOne stratégie 2 aussi invalide.");
        return null;
      }
      console.log(`📌 Sélecteur TuringOne S2 : ${selector2}`);
      return selector2;
    }

    // 4. Si ambigu, ajouter contexte texte
    const count = await page.locator(selector).count();
    if (count > 1) {
      const withText = `${selector}:text("${label}")`;
      if (await exists(page, withText) && await isUnique(page, withText)) {
        console.log(`🎯 Sélecteur ajusté (unique) : ${withText}`);
        return withText;
      }
      console.warn(`⚠️ Sélecteur ambigu (${count} matches) — utilisé tel quel`);
    }

    console.log(`🟢 Sélecteur validé : ${selector}`);
    return selector;

  } catch (err) {
    console.error(`💥 Erreur llmSelector : ${err.message}`);
    return null;
  }
}