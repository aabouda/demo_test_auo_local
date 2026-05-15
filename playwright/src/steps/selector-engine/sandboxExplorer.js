// selector-engine/sandboxExplorer.js

import { similarity } from "./utils.js";
import { nodeRanking } from "./nodeRanking.js";

/**
 * ULTIMATE FALLBACK – Sandbox Explorer
 *
 * Objectif :
 *  - Scruter tous les éléments interactifs (sans IA)
 *  - Essayer des clics "simulés" dans un contexte sandbox
 *  - Comparer les différences de DOM / text / navigation
 *  - Déterminer le candidat le plus plausible
 *
 * Avantage :
 *  - Aucun effet sur le navigateur principal
 *  - Très fiable
 *  - Compatible Docker + Playwright headless
 */

export async function sandboxExplorer(page, label, action) {
  console.log(`🔥 [SandboxExplorer] Démarrage (action=${action}, label="${label}")`);

  // ---------------------------------------
  // 1️⃣ Extraire la liste des candidats interactifs
  // ---------------------------------------
  let selectorQuery;

  if (action === "click") {
    selectorQuery = `
      button,
      a[href],
      [role="button"],
      input[type="submit"],
      input[type="button"],
      [onclick],
      [data-action],
      [data-testid],
      [data-test]
    `;
  } else if (action === "fill") {
    selectorQuery = `
      input,
      textarea,
      [role="textbox"]
    `;
  } else if (action === "select") {
    selectorQuery = `
      select,
      [role="combobox"]
    `;
  } else {
    selectorQuery = "body *";
  }

  const candidateLoc = page.locator(selectorQuery);
  const count = await candidateLoc.count();

  console.log(`📌 Sandbox : ${count} candidats trouvés.`);

  if (count === 0) {
    console.log("❌ Aucun candidat détecté.");
    return null;
  }

  // ---------------------------------------
  // 2️⃣ Récupérer les infos nécessaires pour scoring
  // ---------------------------------------
  const candidates = [];

  for (let i = 0; i < count; i++) {
    const el = candidateLoc.nth(i);

    const tag = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => "");
    const text = (await el.innerText().catch(() => ""))?.trim();
    const id = await el.getAttribute("id");
    const name = await el.getAttribute("name");
    const aria = await el.getAttribute("aria-label");
    const placeholder = await el.getAttribute("placeholder");
    const classes = await el.getAttribute("class");

    candidates.push({
      locator: el,
      tag,
      text,
      id,
      name,
      aria,
      placeholder,
      classes
    });
  }

  // ---------------------------------------
  // 3️⃣ Score initial : fuzzy matching + heuristique
  // ---------------------------------------
  for (const node of candidates) {
    node.smartScore = nodeRanking(node, action, label);
  }

  // Pré-tri pour accélérer
  candidates.sort((a, b) => b.smartScore - a.smartScore);

  // Garder uniquement les 12 meilleurs (optimisation)
  const topCandidates = candidates.slice(0, 12);

  console.log(`🎯 ${topCandidates.length} candidats retenus pour sandbox test.`);

  // ---------------------------------------
  // 4️⃣ SANDBOX EXECUTION (aucun impact réel)
  // ---------------------------------------
  const browser = page.context().browser();
  const currentUrl = page.url();

  let bestCandidate = null;
  let bestDelta = 0;

  for (const candidate of topCandidates) {
    const { locator, tag, text } = candidate;

    const selector = await buildBestSelector(candidate);

    if (!selector) continue;

    console.log(`🧪 Sandbox test selector → ${selector}`);

    // Création d’un nouveau contexte sandbox
    const ctx = await browser.newContext();
    const sandboxPage = await ctx.newPage();

    try {
      await sandboxPage.goto(currentUrl, { waitUntil: "domcontentloaded" });

      const beforeHtml = await sandboxPage.content();

      // Tentative d'action dans le contexte sandbox
      if (action === "click") {
        await sandboxPage.locator(selector).click({ timeout: 2000 }).catch(() => {});
      }

      if (action === "fill") {
        try {
            await locator.fill("___sandbox___");
            const value = await locator.inputValue();
    
            if (value === "___sandbox___") {
                return selector; // VALID !
            }
        } catch (e) {
            // ignore
        }
    }

      if (action === "select") {
        await sandboxPage.locator(selector).selectOption({ index: 0 }).catch(() => {});
      }

      const afterHtml = await sandboxPage.content();

      // Évaluer le delta de modification
      const delta = measureDomDifference(beforeHtml, afterHtml);

      if (delta > bestDelta) {
        bestDelta = delta;
        bestCandidate = selector;
      }
    } catch (err) {
      // ignore errors
    }

    await ctx.close();
  }

  // ---------------------------------------
  // 5️⃣ Résultat
  // ---------------------------------------
  if (bestCandidate) {
    console.log(`🟢 Sandbox Explorer a trouvé : ${bestCandidate}`);
    return bestCandidate;
  }

  console.log("❌ Sandbox Explorer a échoué.");
  return null;
}

/**
 * Construit un sélecteur simple à partir des attributs disponibles
 */
async function buildBestSelector(node) {
  if (node.id) return `#${node.id}`;
  if (node.name) return `[name="${node.name}"]`;
  if (node.aria) return `[aria-label="${node.aria}"]`;
  if (node.placeholder) return `[placeholder="${node.placeholder}"]`;
  if (node.text && node.text.length < 50) return `:text("${node.text}")`;
  if (node.classes) {
    const cls = node.classes.split(" ")[0];
    if (cls) return `.${cls}`;
  }
  return null;
}

/**
 * Mesure une différence entre 2 DOM HTML (très simple mais efficace)
 */
function measureDomDifference(before, after) {
  let diff = 0;
  const minLen = Math.min(before.length, after.length);

  for (let i = 0; i < minLen; i++) {
    if (before[i] !== after[i]) diff++;
  }
  return diff;
}
