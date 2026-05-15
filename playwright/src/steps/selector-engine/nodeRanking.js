// selector-engine/nodeRanking.js

import { similarity } from "./utils.js";

/**
 * nodeRanking(node, action, label)
 *
 * Ce scoring détermine quel élément est le meilleur candidat
 * pour une action donnée (click, fill, select, ...).
 *
 * Règles implémentées :
 * 1. Match exact case-insensitive
 * 2. Match normalisé (login == log in == Log-In == LOGIN)
 * 3. Similarité fuzzy
 * 4. Tous les mots doivent apparaître
 * 5. Priorité aux "vrais boutons"
 * 6. Pénalités pour les faux-amis ("Forgot login info?")
 * 7. BONUS pour attributs cohérents (id, name, aria-label, placeholder)
 * 8. Anti-faux-positifs pour spans/div décoratifs
 */

export function nodeRanking(node, action, label) {
  let score = 0;

  const lbl = label.trim().toLowerCase();
  const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const text = (node.text || "").trim().toLowerCase();
  const aria = (node.aria || "").trim().toLowerCase();
  const placeholder = (node.placeholder || "").trim().toLowerCase();
  const nameAttr = (node.name || "").trim().toLowerCase();
  const idAttr = (node.id || "").trim().toLowerCase();
  const valueAttr = (node.value || "").trim().toLowerCase();

  const textNorm = normalize(text);
  const valueNorm = normalize(valueAttr);
  const lblNorm = normalize(lbl);

  const tokens = lbl.split(/\s+/).filter(Boolean);

  // === 1) MATCH EXACT =======================================================
  if (text === lbl || valueAttr === lbl) score += 1500;

  // === 2) MATCH NORMALISÉ ===================================================
  if (textNorm === lblNorm) score += 1200;
  if (valueNorm === lblNorm) score += 1200;

  // === 3) MATCH PAR MOTS ====================================================
  const containsAll = tokens.every(w =>
    text.includes(w) ||
    valueAttr.includes(w) ||
    aria.includes(w) ||
    placeholder.includes(w)
  );

  if (containsAll) score += 600;

  // === 4) FUZZY MATCHING ====================================================
  score += similarity(lbl, text) * 25;
  score += similarity(lbl, valueAttr) * 30;
  score += similarity(lbl, aria) * 20;
  score += similarity(lbl, placeholder) * 15;
  score += similarity(lbl, nameAttr) * 10;
  score += similarity(lbl, idAttr) * 8;

  if (similarity(lbl, text) > 0.85) score += 200;
  if (similarity(lbl, valueAttr) > 0.85) score += 250;

  // === 5) PRIORITÉ AU TYPE D’ÉLÉMENT (ACTION = CLICK) ========================
  if (action === "click") {
    if (node.tag === "button") score += 2000;

    if (node.tag === "input" && node.type === "submit") score += 1800;
    if (node.tag === "input" && node.type === "button") score += 1700;

    if (node.tag === "a" && valueNorm === lblNorm) score += 800;

    if (node.role === "button") score += 700;
    if (node.onclick) score += 500;

    // BONUS si l’attribut "value" correspond bien
    if (valueAttr === lbl) score += 1200;
  }

  // === 6) SHORT TEXT BONUS ===================================================
  if (text.length > 0 && text.length <= 20) score += 150;

  // === 7) BONUS POUR ATTRIBUTS UTILES =======================================
  if (idAttr) score += 150;
  if (nameAttr) score += 120;
  if (aria) score += 180;
  if (placeholder) score += 140;

  // === 8) PÉNALITÉS ANTI-FAUX-POSITIFS =======================================
  // Texte très long
  if (text.split(" ").length >= 3) score -= 300;

  // Liens non pertinents
  if (node.tag === "a" && !containsAll) score -= 500;

  // Eléments décoratifs
  if (["div","span"].includes(node.tag) && !node.onclick && !node.role) {
    score -= 700;
  }

  // Pas de correspondance
  if (!textNorm.includes(lblNorm) && !valueNorm.includes(lblNorm)) {
    score -= 450;
  }

  return score;
}
