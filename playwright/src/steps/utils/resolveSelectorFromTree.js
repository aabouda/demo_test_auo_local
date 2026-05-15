// playwright-ia-simples/playwright/src/steps/utils/resolveSelectorFromTree.js

import fetch from "node-fetch";

/**
 * Vérifie si un sélecteur est unique dans la page
 */
async function isUniqueSelector(page, selector) {
  try {
    const count = await page.locator(selector).count();
    console.log(count);
    console.log("==================================================");
    return count === 1;
  } catch {
    return false;
  }
}

/**
 * Reconstruit un sélecteur en combinant les parents (max 3 niveaux)
 */
function buildSelectorFromTree(node) {
  const chain = [];
  let current = node;
  let depth = 0;

  while (current && depth < 3) {
    if (current.identifier) {
      chain.unshift(current.identifier);
    } else if (current.css_selector) {
      chain.unshift(current.css_selector);
    }
    current = current.parent || null; 
    depth++;
  }

  return chain.join(" > ");
}


/**
 * Placeholder pour l’appel IA
 */
async function askIAForSelector(results, label, action) {
  // Ici tu mets ton appel à Ollama / GPT avec results et label
   const prompt = `
    You are a Playwright test automation assistant.

    Your task:
    - From the provided JSON node hierarchy, find the element that matches the label "${label}" and the action "${action}".
    - Build the selector by combining the current node AND its parent nodes (up to 3 levels) provided in the JSON.
    - The selector MUST be directly usable in Playwright ('page.locator("selector")').

    Selection rules (strict order):
    0. If the action is "click":
      - Prioritize <button> elements.
      - If no <button> is available, prefer <span> elements.
      - Only if neither exists, fallback to other clickable elements (like <a> or <div>).
    1. Prefer use identifier attribute.
    2. Use only attributes that are explicitly present in the JSON ("attributes" field).
      ❌ Do not invent attributes.
    3. Build the selector from parent → child nodes (up to 3 levels max).
      Example: "div.parent-class > div.child-class > button.target-class"
    4. Prefer testing attributes ([data-testid], [data-test], [data-qa], [data-cy]) only if they exist in the JSON.
    5. Prefer semantic attributes (name, type, placeholder, alt, title, aria-label, role) only if they exist in the JSON.
    6. If none of the above exist, use visible text with Playwright's getByText("...").
    7. Only if no other option exists, use a short class—but never long class chains.

    Forbidden:
    - Do not use :nth-child
    - Do not use selectors starting with #root or generic layout containers
    - Do not invent any attribute values (e.g. [data-testid="..."]) if not present in JSON

    ⚠️ Output format (MUST follow strictly):
    Respond ONLY with valid JSON. Do not explain.
    Format: { "selector": "your-css-selector-here", "score": 0.xx }

    JSON Node Hierarchy:
    ${JSON.stringify(results, null, 2)}
  `;

    let selector = await askOllama(prompt);
    //selector = await safeSelector(selector);
    console.log("Sélecteur IA proposé :", selector);
    return (selector)
}



function safeSelector(selector) {
  if (!selector) return null;
  return selector
    .split(/\s+/)
    .map(part => {
      if (part.startsWith(".")) {
        return part
          .split(".")
          .filter(Boolean)
          .filter(c => !/\[.*\]/.test(c))
          .map(c => "." + c.replace(/[^a-zA-Z0-9_-]/g, ""))
          .join("");
      }
      if (part.startsWith("#")) {
        return "#" + part.slice(1).replace(/[^a-zA-Z0-9_-]/g, "");
      }
      return part;
    })
    .join(" ")
    .trim() || null;
}


async function askOllama(prompt) {
    console.log("🔍 Prompt envoyé à Ollama:\n", prompt);
    try {
      let url_ollama = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
      const response = await fetch(url_ollama, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "mistral",
          prompt: prompt,
          stream: false
        }),
      });
      console.log("🔍 fin execution\n");

      const data = await response.json();
      const raw = data.response.trim();

      console.log("✅ Réponse Ollama reçue :", raw);

      // 🔹 On passe la réponse à la fonction extractJsonSelector
      const parsed = extractJsonSelector(raw);
      if (parsed && parsed.selector) {
        console.log("🎯 Selector extrait :", parsed.selector, "(score:", parsed.score, ")");
        return parsed.selector;
      } else {
        console.warn("⚠️ Aucun selector valide trouvé dans la réponse.");
        return null;
      }
    } catch (err) {
      console.log("🔍 err:\n", err);
      throw err;
    } 
}


  /**
   * Extrait un objet JSON { selector, score } d'une réponse Ollama
   * @param {string} responseText - La réponse brute renvoyée par Ollama
   * @returns {{ selector: string, score: number } | null}
   */
  export function extractJsonSelector(responseText) {
    try {
      if (!responseText || typeof responseText !== "string") {
        return null;
      }

      // Supprimer les balises markdown ```json ... ```
      let cleaned = responseText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      // Trouver le premier bloc JSON avec accolades équilibrées
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) {
        console.error("❌ Aucun JSON trouvé dans la réponse :", responseText);
        return null;
      }

      const jsonStr = cleaned.substring(start, end + 1);

      // Essayer de parser
      const obj = JSON.parse(jsonStr);

      // Validation minimale
      if (!obj.selector) {
        console.error("❌ Pas de selector dans la réponse JSON :", obj);
        return null;
      }
      // Normaliser le score
      obj.score = typeof obj.score === "number" ? obj.score : 0.5;

      return obj;
    } catch (err) {
      console.error("❌ Erreur lors de l'extraction du JSON :", err, responseText);
      return null;
    }
  }

/**
 * Nettoie un sélecteur CSS pour Playwright
 * - échappe les caractères spéciaux [ ] : ! /
 * - supprime les classes vides ou invalides
 */
function sanitizeSelector(selector) {
  return selector
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("!", "\\!")
    .replaceAll(":", "\\:")
    .replaceAll(">", " ");
}

/**
 * Résout le locator Playwright directement
 */

function addParents(nodes, parent = null) {
  for (const node of nodes) {
    node.parent = parent;   // 🔥 ajoute la référence vers le parent
    if (node.children && node.children.length > 0) {
      addParents(node.children, node);
    }
  }
}

async function resolveSelectorFromTree(results, label, page, action = "click") {
  if (!results || results.length === 0) {
    return { selector: null, locator: null };
  }
  addParents(results);
  let selector;
  let locator;

  // === Cas A : un seul résultat ===
  if (results.length === 1) {
    let node = results[0];

    // ✅ Si le node a des enfants, descendre jusqu'à la feuille la plus basse
    while (node.children && node.children.length > 0) {
      node = node.children[0];
    }

    // ✅ Maintenant node = la "feuille" (ex: input.button)
    const treeSelector = await sanitizeSelector(buildSelectorFromTree(node));

    if (await isUniqueSelector(page, treeSelector)) {
      selector = treeSelector;
    } else if (node.identifier && await isUniqueSelector(page, node.identifier)) {
      selector = node.identifier;
    } else {
      // 🔥 fallback IA si toujours pas unique
      selector = await askIAForSelector(results, label, action);
    }

    console.log("🎯 Selector final :", selector);
  }else {
    // === Cas B : plusieurs résultats ===
    selector = await askIAForSelector(results, label, action);
    console.log("1 - " + selector);
    selector = await sanitizeSelector(selector);
    console.log("2 - " + selector);
  }
  console.log(selector);
  // --- Étape finale : construit le locator ---
  if (await isUniqueSelector(page, selector)) {
      console.log("✅ unique");
      locator = page.locator(selector); // unique → pas besoin de filter
    } else {
      console.log("⚠️ not unique");
      
      // Vérifie combien d’éléments avec has-text
      const withHasText = page.locator(`${selector}:has-text("${label}")`);
      const count = await withHasText.count();

      if (count === 1) {
        console.log("🎯 unique avec has-text");
        locator = withHasText.first();
        selector = `${selector}:has-text("${label}")`; // on garde ce selector
      } else {
        console.log("🔒 multiple, on force text() égal");
        locator = page.locator(`${selector}:text("${label}")`).first();
        selector = `${selector}:text("${label}")`; // mise à jour aussi
      }
    }
  return { selector, locator };
}

export { resolveSelectorFromTree };
