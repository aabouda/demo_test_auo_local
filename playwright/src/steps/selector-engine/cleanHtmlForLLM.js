// selector-engine/cleanHtmlForLLM.js

/**
 * Nettoyage du HTML avant envoi au LLM.
 *
 * Objectif :
 *  - Réduire les tokens
 *  - Garder uniquement les éléments interactifs et visibles
 *  - Supprimer scripts/styles/metadata
 *  - Minimiser les hallucinations
 */

export function cleanHtmlForLLM(html, maxLength = 30000) {
    if (!html || typeof html !== "string") return "";
  
    try {
      // -----------------------------------------
      // 1️⃣ SUPPRESSION DES ÉLÉMENTS NON UTILES
      // -----------------------------------------
      let cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<meta[^>]*>/gi, "")
        .replace(/<link[^>]*>/gi, "")
        .replace(/<svg[\s\S]*?<\/svg>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/\s{2,}/g, " ");
  
      // -----------------------------------------
      // 2️⃣ ISOLATION DES ÉLÉMENTS INTERACTIFS
      // -----------------------------------------
      const importantTags = cleaned.match(
        /<(button|a|input|label|select|textarea|div|span|form)[^>]*>[\s\S]*?<\/\1>/gi
      );
  
      if (importantTags && importantTags.length > 0) {
        cleaned = importantTags.join("\n");
      }
  
      // -----------------------------------------
      // 3️⃣ NORMALISATION LIGHT
      // -----------------------------------------
      cleaned = cleaned
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
  
      // -----------------------------------------
      // 4️⃣ RÉDUCTION DE LA TAILLE FINALE
      // -----------------------------------------
      if (cleaned.length > maxLength) {
        cleaned = cleaned.slice(0, maxLength) + "\n<!-- truncated -->";
      }
  
      return cleaned;
    } catch (err) {
      console.warn("⚠️ Erreur dans cleanHtmlForLLM :", err.message);
      return html.slice(0, maxLength);
    }
  }
  