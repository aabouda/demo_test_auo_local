// selector-engine/utils.js

/**
 * -- SIMILARITY FUNCTION --
 * Fuzzy matching basé sur une variante légère de Damerau-Levenshtein + Jaro-Winkler style boost.
 * Ultra rapide, parfait pour Docker + headless.
 */

export function similarity(a, b) {
    if (!a || !b) return 0;
  
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
  
    if (a === b) return 1;
  
    const lenA = a.length;
    const lenB = b.length;
  
    const maxLen = Math.max(lenA, lenB);
    if (maxLen === 0) return 0;
  
    let matches = 0;
    let transpositions = 0;
    let i = 0;
  
    for (; i < Math.min(lenA, lenB); i++) {
      if (a[i] === b[i]) matches++;
      else if (i + 1 < lenA && a[i + 1] === b[i] && a[i] === b[i + 1]) {
        matches++;
        transpositions++;
        i++;
      }
    }
  
    const raw = (matches / maxLen) - (transpositions * 0.1);
  
    // Apply Jaro-Winkler-like prefix boost
    let prefix = 0;
    for (let j = 0; j < Math.min(4, lenA, lenB); j++) {
      if (a[j] === b[j]) prefix += 0.05;
      else break;
    }
  
    return Math.min(1, Math.max(0, raw + prefix));
  }
  
  /**
   * Vérifie si un sélecteur existe dans la page.
   */
  export async function exists(page, selector) {
    if (!selector) return false;
  
    try {
      const count = await page.locator(selector).count();
      return count > 0;
    } catch {
      return false;
    }
  }
  
  /**
   * Vérifie si un sélecteur est unique dans la page.
   */
  export async function isUnique(page, selector) {
    if (!selector) return false;
  
    try {
      const count = await page.locator(selector).count();
      return count === 1;
    } catch {
      return false;
    }
  }
  
  /**
   * Petite fonction utilitaire pour attendre un timeout.
   */
  export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Normalisation de texte (pour fuzzy matching).
   */
  export function normalize(text) {
    if (!text) return "";
    return text
      .replace(/\s+/g, " ")
      .replace(/[^\wÀ-ÿ '-]/g, "")
      .trim()
      .toLowerCase();
  }
  
  /**
   * Logger simple avec timestamp
   */
  export function log(...args) {
    const t = new Date().toISOString().slice(11, 23);
    console.log(`[${t}]`, ...args);
  }
  