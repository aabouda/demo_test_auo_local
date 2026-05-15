// selector-engine/smartSelector.js
import { similarity } from "./utils.js";
import { nodeRanking } from "./nodeRanking.js";

export async function smartSelector(page, label, action) {
  console.log(`\n🔍 [SmartSelector] Recherche pour "${label}" action="${action}"`);

  label = label.trim().toLowerCase();

  // =========================================================
  // 1️⃣ CAPTURE LARGEST POSSIBLE DE TOUS LES ÉLÉMENTS CLIQUABLES
  // =========================================================
  let candidatesLocator = page.locator(`
    button,
    a[href],
    input[type="submit"],
    input[type="button"],
    input[type="image"],
    input,
    [role="button"],
    [onclick],
    [data-action],
    [data-testid],
    [data-test],
    img,
    span,
    div
  `);

  const count = await candidatesLocator.count();

  if (count === 0) {
    console.log("❌ Aucun candidat trouvé.");
    return null;
  }

  console.log(`📊 ${count} candidats détectés.`);

  // =========================================================
  // 2️⃣ EXTRACTION DES INFORMATIONS DES CANDIDATS
  // =========================================================
  const nodes = [];

  for (let i = 0; i < count; i++) {
    const loc = candidatesLocator.nth(i);

    const tag = await loc.evaluate(el => el.tagName.toLowerCase()).catch(() => "");
    const text = (await loc.innerText().catch(() => "")).trim();
    const id = await loc.getAttribute("id");
    const name = await loc.getAttribute("name");
    const placeholder = await loc.getAttribute("placeholder");
    const aria = await loc.getAttribute("aria-label");
    const value = await loc.getAttribute("value");
    const classes = await loc.getAttribute("class");
    const onclick = await loc.getAttribute("onclick");
    const role = await loc.getAttribute("role");

    nodes.push({
      locator: loc,
      tag,
      text,
      id,
      name,
      placeholder,
      aria,
      value,
      classes,
      onclick,
      role
    });
  }

  // =========================================================
  // 3️⃣ CALCUL DU SCORE VIA nodeRanking (ULTRA COMPLET)
  // =========================================================
  for (const n of nodes) {
    n.score = nodeRanking(n, action, label);
  }

  // Sort by score descending
  nodes.sort((a, b) => b.score - a.score);

  const best = nodes[0];
  const second = nodes[1];
  const third = nodes[2];

  if (!best) return null;

  console.log(`🏆 BEST: <${best.tag}> text="${best.text}" score=${best.score}`);

  // =========================================================
  // 4️⃣ CALCUL DU NIVEAU DE CONFIANCE
  // =========================================================
  let topScores = [best.score];
  if (second) topScores.push(second.score);
  if (third) topScores.push(third.score);

  const sumTop3 = topScores.reduce((a, b) => a + b, 0);
  const confidence = best.score / sumTop3;

  console.log(`📈 Confiance = ${confidence.toFixed(3)}`);

  // =========================================================
  // 5️⃣ LOGIQUE OPTIMISÉE : Score absolu élevé = acceptation directe
  // =========================================================
  // Si le score absolu est très élevé (> 1000), on accepte directement
  // même si la confiance relative est moyenne (évite les appels LLM inutiles)
  const HIGH_SCORE_THRESHOLD = 1000;
  const scoreGap = second ? (best.score - second.score) : best.score;
  const hasHighScoreWithGap = best.score > HIGH_SCORE_THRESHOLD && scoreGap > best.score * 0.10;
  
  if (hasHighScoreWithGap) {
    console.log(`✅ Score absolu très élevé (${best.score}) avec écart significatif → acceptation directe (skip LLM)`);
    // On continue directement pour construire le sélecteur, on saute les vérifications de confiance
  } else {
    // Logique de confiance normale
    if (confidence < 0.40) {
      console.log("🟠 Faible confiance → demande Niveau 3 (LLM)");
      return { type: "NEED_TREE_ANALYSIS" };
    }
    
    // Seuil abaissé de 0.70 à 0.55 pour accepter plus de résultats directement
    if (confidence < 0.55) {
      console.log("🟡 Confiance moyenne-basse → demande Niveau 3 (LLM)");
      return { type: "NEED_TREE_ANALYSIS" };
    }

    // Si le best et second sont trop proches → ambigu
    if (second && Math.abs(best.score - second.score) < best.score * 0.12) {
      console.log("⚠️ Scores trop proches → ambigu → LLM");
      return { type: "NEED_TREE_ANALYSIS" };
    }
  }

  // =========================================================
  // 6️⃣ CONSTRUCTION D'UN SÉLECTEUR FIABLE
  // =========================================================
  let selector = null;

  if (best.id) selector = `#${best.id}`;
  else if (best.name) selector = `[name="${best.name}"]`;
  else if (best.aria) selector = `[aria-label="${best.aria}"]`;
  else if (best.placeholder) selector = `[placeholder="${best.placeholder}"]`;
  else if (best.value) selector = `[value="${best.value}"]`;
  else if (best.text && best.text.length < 50) selector = `:text("${best.text}")`;
  else if (best.classes) selector = "." + best.classes.split(" ").filter(c => c.length > 1)[0];

  if (!selector) {
    console.log("⚠️ Impossible de créer un sélecteur fiable → LLM");
    return { type: "NEED_TREE_ANALYSIS" };
  }

  // =========================================================
  // 7️⃣ VÉRIFIER SI LE SÉLECTEUR EST UNIQUE
  // =========================================================
  const matchCount = await page.locator(selector).count();

  if (matchCount === 1) {
    console.log(`✔ Sélecteur UNIQUE trouvé : ${selector}`);
    return selector;
  }

  console.log(`⚠️ Sélecteur ambigu (${matchCount} éléments) → LLM requis`);
  return { type: "NEED_TREE_ANALYSIS" };
}
