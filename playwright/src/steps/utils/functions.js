import { faker } from '@faker-js/faker';
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { config } from '../../support/config.mjs';
import fs from 'fs';
import { findElementSmart } from './findElementSmart.js';
import { updateStepDom } from './db.js';
import { fileURLToPath } from 'url';
import { findIdentifier } from "./smart_selector.js";

import { findIdentifierTree } from "./extractHtmlBlocks.js";

import { resolveSelectorFromTree } from "./resolveSelectorFromTree.js";
import { getActionsPath, readUrlFromFile } from './paths.js';
import { findDomWithLLM } from './findDomWithLLM.js';
import { callTuring1StepInfer } from './turing1-llm.js';
import { notifyStepEnrich } from './turing1-notifier.js';

import { resolveElement } from "../selector-engine/smartElementEngine.js";




// Pick a random element of a selector
export async function selectRandomElement(selector) {
  let index = faker.number.int((await selector.getByRole('option').count()) - 1);
  await selector.selectOption({ index: index });
}

// await and return a locator from the locators list in parameter
// the first valid (visible and enabled) locator is returned
// if there are multiple ones, the first in the list order is returned
export async function getFirstMatchingLocator(page, locators, disabled) {
  // group all locators to wait for them
  let merged = locators[0];
  for (let i = 1; i < locators.length; i++) {
    merged = merged.or(locators[i]);
  }
  merged = merged.and(page.locator(':visible')).and(page.locator(':enabled'));

  // wait for locator elements to be ready (does not work due to a bug)
  // await merged.first().waitFor();

  let ret = null;
  await expect
    .poll(
      async () => {
        // at least one element is now visible, find the first one in the list and return it
        for (let i = 0; i < locators.length; i++) {
          const element = locators[i];
          if ((await element.first().isVisible()) && (disabled ? await element.first().isDisabled() : await element.first().isEnabled())) {
            try {
              if (!disabled) {
                // make sure element is actually the good one (not covered by another one etc)
                await element
                  .first()
                  .hover({ trial: true, timeout: process.env.PWDEBUG ? 3000 : 1500 });
              }
            } catch {
              continue;
            }
            ret = element;
            return element;
          }
        }
        await page.locator("body").focus();
      },
      { timeout: process.env.PWDEBUG ? 0 : 30000 },
    )
    .not.toBeFalsy();
  if (process.env.PWDEBUG) console.log(`Found element: ${ret}`);
  return ret;
}

// await and return a locator from the locators list in parameter
// the first valid (visible and enabled) locator is returned
// if there are multiple ones, the first in the list order is returned
export async function getFirstMatchingLocatorNoHover(page, locators) {
  // group all locators to wait for them
  let merged = locators[0];
  for (let i = 1; i < locators.length; i++) {
    merged = merged.or(locators[i]);
  }
  merged = merged.and(page.locator(':visible')).and(page.locator(':enabled'));

  // wait for locator elements to be ready (does not work due to a bug)
  // await merged.first().waitFor();

  let ret = null;
  await expect
    .poll(
      async () => {
        // at least one element is now visible, find the first one in the list and return it
        for (let i = 0; i < locators.length; i++) {
          const element = locators[i];
          if ((await element.first().isVisible()) && (await element.first().isEnabled())) {
            ret = element;
            return element;
          }
        }
      },
      { timeout: process.env.PWDEBUG ? 0 : 30000 },
    )
    .not.toBeFalsy();
  if (process.env.PWDEBUG) console.log(`Found element: ${ret}`);
  return ret;
}

// return a locator to the row that contains this text
export function getRowLocatorFromText(page, text) {
  return page
    .locator('li') // select row (may need more precise locator)
    .filter({ has: page.getByRole('cell', { name: text }) }) // containing this text
    .first();
}

// Return true if the item was found and clicked or return false if the element was not found
export async function clickIfAvailable(page, loc) {
  const element = page.locator(loc).first();
  // Check if the element exists
  if (await element.count() > 0) {
    await element.click();
    // Return true if the item was found and clicked
    return true;
  } else {
    // Return false if the element was not found
    return false;
  }
}

// Empty the checkout cart using an API calls
export async function emptyCheckoutCartByApi(page, baseURL) {
  const contextCookies = await page.context().cookies();
  const formKey = await contextCookies.find(el => el.name === "form_key").value;
  let shop = 'shop';
  if (baseURL.includes('fr-fr')) {
    shop = 'shop-emea';
  }

  let url = baseURL + `/${shop}/checkout/cart/updatePost`;
  if (formKey) {
    const response = await page.request.post(url, {
      params: {
        update_cart_action: 'empty_cart',
        form_key: formKey
      }
    });

    // Check the status of the response
    if (response.ok()) {
      console.log('Cart emptied successfully');
    } else {
      console.log('There is a problem to empty the checkout cart:', response.status());
    }
  } else {
    console.log('Unable to retrieve form_key');
  }
}

function normalizeStep(step) {
  return step
    .replace(/^(Given|When|Then|And)\s+/i, "") // supprime le mot clé au début
    .trim();
}

function possibleGherkinVariants(step) {
  const keywords = ["Given", "When", "Then", "And"];
  return [step, ...keywords.map(k => `${k} ${step}`)];
}

export async function getActionByStepName(stepName) {
  const actionsPath = getActionsPath();
  const data = JSON.parse(readFileSync(actionsPath, "utf-8"));

  const normalizedStepName = normalizeStep(stepName);
  const variants = possibleGherkinVariants(normalizedStepName);

  let foundStep = data.find(item =>
    variants.includes(normalizeStep(item.step))
  );

  // ── Step trouvé mais incomplet (action manquante) ─────────────
  if (foundStep && !foundStep.action) {
    console.log(`🤖 Step "${stepName}" trouvé mais incomplet → appel TuringOne LLM`);
    const inferred = await callTuring1StepInfer(stepName);
    if (inferred && inferred.action) {
      foundStep = {
        ...foundStep,
        action:         inferred.action         || foundStep.action,
        label:          inferred.label          || foundStep.label,
        resolved_value: inferred.value          || foundStep.resolved_value,
        uri:            inferred.uri            || foundStep.uri,
      };
      // Sauvegarde dans le JSON local
      _saveEnrichedStep(actionsPath, data, stepName, foundStep);
      // Notification TuringOne DB (fire-and-forget)
      notifyStepEnrich({
        step_id:        foundStep.id,
        step_text:      stepName,
        action:         foundStep.action,
        label:          foundStep.label,
        resolved_value: foundStep.resolved_value,
        uri:            foundStep.uri,
        dom:            foundStep.dom,
        inferred_by:    'turing1-llm',
      });
      console.log(`✅ Step enrichi par TuringOne : action="${foundStep.action}" label="${foundStep.label}"`);
    }
    return foundStep;
  }

  // ── Step trouvé et complet ─────────────────────────────────────
  if (foundStep) {
    return foundStep;
  }

  // ── Step introuvable → inférence complète via TuringOne ───────
  console.log(`⚠️ Step "${stepName}" introuvable → appel TuringOne LLM pour inférence complète`);
  const inferred = await callTuring1StepInfer(stepName);
  if (inferred && inferred.action) {
    const newStep = {
      step:           stepName,
      action:         inferred.action,
      label:          inferred.label          || stepName,
      resolved_value: inferred.value          || null,
      uri:            inferred.uri            || null,
      dom:            null,
    };
    // Sauvegarde dans le JSON local pour les prochaines exécutions
    _saveNewStep(actionsPath, data, newStep);
    // Notification TuringOne DB (fire-and-forget)
    notifyStepEnrich({
      step_text:      stepName,
      action:         newStep.action,
      label:          newStep.label,
      resolved_value: newStep.resolved_value,
      uri:            newStep.uri,
      inferred_by:    'turing1-llm',
    });
    console.log(`✅ Nouveau step inféré par TuringOne : action="${newStep.action}" label="${newStep.label}"`);
    return newStep;
  }

  console.log(`❌ Step "${stepName}" introuvable et LLM n'a rien retourné. Variants: ${variants.join(', ')}`);
  return null;
}

/** Sauvegarde un step existant enrichi dans le JSON local */
function _saveEnrichedStep(actionsPath, data, stepName, enriched) {
  try {
    const updated = data.map(item =>
      normalizeStep(item.step) === normalizeStep(stepName) ? { ...item, ...enriched } : item
    );
    writeFileSync(actionsPath, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`⚠️ Impossible de sauvegarder le step enrichi : ${e.message}`);
  }
}

/** Ajoute un nouveau step inféré dans le JSON local */
function _saveNewStep(actionsPath, data, newStep) {
  try {
    data.push(newStep);
    writeFileSync(actionsPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`⚠️ Impossible de sauvegarder le nouveau step : ${e.message}`);
  }
}



export async function getExecutionId() {
  try {
    const actionsPath = getActionsPath();
    const filePath = actionsPath;
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    if ('id_execution' in data) {
      return data.id_execution;
    } else {
      console.log('🛑 Le champ "id_execution" est introuvable dans le fichier JSON.');
      return null;
    }
  } catch (error) {
    console.error('Erreur lors de la lecture du fichier output.json :', error);
    return null;
  }
}

export function updateStepDomInJson(stepText, newDom) {
  const actionsPath = getActionsPath();
  const fullPath = actionsPath;

  const jsonData = JSON.parse(readFileSync(fullPath, 'utf-8'));

  // 🔹 Fonction pour enlever les préfixes
  const stripPrefix = (txt) => txt.replace(/^(Given|When|Then|And)\s+/i, "").trim();

  const normalizedStep = stripPrefix(stepText);

  const stepIndex = jsonData.findIndex(
    s => stripPrefix(s.step) === normalizedStep
  );

  if (stepIndex >= 0) {
    jsonData[stepIndex].dom = newDom;
    writeFileSync(fullPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`✅ DOM sauvegardé pour le step "${stepText}" dans le fichier : ${fullPath}`);
  } else {
    console.warn(`⚠️ Step "${stepText}" non trouvé dans le fichier JSON (normalisé : "${normalizedStep}")`);
  }
}


async function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function trimQuotes(str) {
  if (typeof str !== "string") {
    return str; // on retourne la valeur telle quelle si ce n’est pas une string
  }
  return str.replace(/^'(.*)'$/, "$1");
}

function escapeSelectorForPlaywright(selector) {
  // Liste des pseudo-classes qu'on NE veut PAS échapper
  const safePseudos = [
    "hover", "focus", "active", "visited",
    "nth-child", "nth-of-type", "first-child", "last-child"
  ];

  return selector.split('.').map((part, i) => {
    if (i === 0) return part; // "button" au début

    // S’il contient un pseudo qu’on garde tel quel
    if (safePseudos.some(pseudo => part.startsWith(pseudo))) {
      return part;
    }

    // Sinon on échappe les caractères spéciaux, y compris :
    return part.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }).join('.');
}


async function robustClick(page, label, action, options = { retries: 3, timeout: 10000 }) {

  try {
    console.log("🤖 Fallback IA activé...");
    const html2 = await page.content();
    const results = findIdentifierTree(html2, label, action);
    if (!results || results.length === 0) {
      console.log("✅ html2 :", html2);
      console.log("✅ label :", label);
      console.log("✅ action :", action);
      throw new Error(`❌ Aucun résultat trouvé pour label "${label}"`);
    }
    console.log(JSON.stringify(results, null, 2));
    const { selector, locator } = await resolveSelectorFromTree(results, label, page);
    console.log("✅ Selector choisi :", selector);
    await locator.click({ timeout: 3000 });
    return selector; // succès IA
  } catch (err) {
    throw new Error(
      `❌ Impossible de trouver l'élément après fallback IA. Dernière erreur: ${err.message}`
    );
  }
}

async function robustSelect(page, label, action, value, options = { retries: 3, timeout: 10000 }) {

  try {
    console.log("🤖 Fallback IA activé...");
    const html2 = await page.content();
    const results = findIdentifierTree(html2, label, action);
    if (!results || results.length === 0) {
      console.log("✅ html2 :", html2);
      console.log("✅ label :", label);
      console.log("✅ action :", action);
      throw new Error(`❌ Aucun résultat trouvé pour label "${label}"`);
    }
    console.log(JSON.stringify(results, null, 2));
    const { selector, locator } = await resolveSelectorFromTree(results, label, page);
    console.log("✅ Selector choisi :", selector);
    await locator.selectOption(value, { timeout: 3000 });
    return selector; // succès IA
  } catch (err) {
    throw new Error(
      `❌ Impossible de trouver l'élément après fallback IA. Dernière erreur: ${err.message}`
    );
  }
}


// ===============================================
// NOUVEAU setAction() avec moteur N1→N4
// ===============================================

async function executeWithFallback({
  page,
  action,
  label,
  stepText,
  resolved_value,
  selector,
  step
}) {
  try {
    // 1️⃣ Premier essai avec le sélecteur original
    await runAction(page, action, selector, resolved_value, label);
    return selector;

  } catch (err) {

    console.warn(`\n⚠️ Premier essai Playwright échoué pour action "${action}":`);
    console.warn("➡️ Message :", err.message);
    console.warn("➡️ Activation fallback N2 → N3 → N4…");

    // 2️⃣ Relancer MOTEUR COMPLET sans dom existant
    const selector2 = await resolveElement({
      page,
      stepText,
      action,
      label,
      dom: ""  // IMPORTANT : reset DOM
    });

    if (!selector2) {
      console.error("🚨 Aucun sélecteur valide trouvé après fallback.");
      throw err;
    }

    console.log(`🎯 Nouveau sélecteur obtenu via fallback : ${selector2}`);

    // 3️⃣ Deuxième essai
    await runAction(page, action, selector2, resolved_value, label);

    return selector2;
  }
}

// ---------------------------------------------------------
// Exécute une action Playwright UNIQUE (sans fallback)
// ---------------------------------------------------------
async function runAction(page, action, selector, value, label) {

  let loc = page.locator(selector);
  const count = await loc.count();

  // Si plusieurs éléments, essayer chacun un par un jusqu'à ce qu'un fonctionne
  if (count > 1) {
    console.log(`⚠️ Sélecteur ambigu (${count} éléments), essai de chaque élément un par un...`);

    for (let i = 0; i < count; i++) {
      const el = loc.nth(i);
      console.log(`🔄 Essai de l'élément #${i}/${count - 1}...`);

      try {
        // Vérifier si l'élément est visible
        const isVisible = await el.isVisible({ timeout: 1000 }).catch(() => false);
        if (!isVisible) {
          console.log(`  ⏭️  Élément #${i} non visible, passage au suivant`);
          continue;
        }

        // Essayer de scroller vers l'élément
        try {
          await el.scrollIntoViewIfNeeded({ timeout: 2000 });
          await page.waitForTimeout(300); // Attendre que le scroll se stabilise
        } catch (e) {
          console.log(`  ⚠️  Scroll échoué pour l'élément #${i}, tentative quand même`);
        }

        // Vérifier si l'élément est maintenant dans le viewport
        const boundingBox = await el.boundingBox().catch(() => null);
        if (boundingBox) {
          const viewportSize = page.viewportSize();
          const isInViewport = boundingBox.y >= 0 &&
            boundingBox.y < viewportSize.height &&
            boundingBox.x >= 0 &&
            boundingBox.x < viewportSize.width;

          if (!isInViewport) {
            console.log(`  ⏭️  Élément #${i} toujours hors viewport après scroll, passage au suivant`);
            continue;
          }
        }

        // Essayer l'action avec cet élément
        console.log(`  ✅ Tentative d'action "${action}" avec l'élément #${i}...`);

        if (action === "click") {
          try {
            await el.click({ timeout: 5000, strict: false, force: false });
            console.log(`  ✅✅ Succès avec l'élément #${i} !`);
            return; // Succès, on sort de la fonction
          } catch (e) {
            console.log(`  ❌ Élément #${i} échoué: ${e.message}`);
            // Essayer avec force si le click normal échoue
            try {
              await el.click({ timeout: 3000, strict: false, force: true });
              console.log(`  ✅✅ Succès avec l'élément #${i} (force: true) !`);
              return; // Succès, on sort de la fonction
            } catch (e2) {
              console.log(`  ❌ Élément #${i} échoué même avec force: ${e2.message}`);
              continue; // Essayer l'élément suivant
            }
          }
        } else if (action === "fill") {
          try {
            await el.fill(value || "test", { timeout: 3000, strict: false });
            console.log(`  ✅✅ Succès avec l'élément #${i} !`);
            return;
          } catch (e) {
            console.log(`  ❌ Élément #${i} échoué: ${e.message}`);
            continue;
          }
        } else if (action === "select") {
          try {
            await el.selectOption(value, { timeout: 3000, strict: false });
            console.log(`  ✅✅ Succès avec l'élément #${i} !`);
            return;
          } catch (e) {
            console.log(`  ❌ Élément #${i} échoué: ${e.message}`);
            continue;
          }
        } else {
          // Pour les autres actions, utiliser le premier élément visible
          loc = el;
          console.log(`  ✅ Utilisation de l'élément #${i} pour l'action "${action}"`);
          break;
        }
      } catch (e) {
        console.log(`  ❌ Erreur avec l'élément #${i}: ${e.message}`);
        continue; // Essayer l'élément suivant
      }
    }

    // Si on arrive ici, aucun élément n'a fonctionné pour les actions click/fill/select
    if (action === "click" || action === "fill" || action === "select") {
      console.error(`❌ Aucun des ${count} éléments n'a fonctionné pour l'action "${action}"`);
      throw new Error(`Aucun des ${count} éléments trouvés n'a pu être utilisé pour l'action "${action}"`);
    }
  }

  switch (action) {

    case "click":
      // Essayer de scroller vers l'élément avant de cliquer
      try {
        await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
        // Attendre un peu pour que le scroll se stabilise
        await page.waitForTimeout(200);
      } catch (e) {
        console.warn("⚠️ Scroll échoué, tentative de click avec force");
      }

      // Essayer d'abord sans force
      try {
        await loc.click({ timeout: 5000, strict: false, force: false });
      } catch (e) {
        // Si échec, essayer avec force
        console.warn("⚠️ Click normal échoué, tentative avec force: true");
        await loc.click({ timeout: 5000, strict: false, force: true });
      }
      break;

    case "type":
    case "fill":
      await loc.fill(value || "", { timeout: 3000, strict: false });
      break;

    case "select":
      await loc.selectOption(value, { timeout: 3000, strict: false });
      break;

    case "hover":
      await loc.hover({ timeout: 3000, strict: false });
      break;

    case "check":
      await loc.check({ timeout: 3000, strict: false });
      break;

    case "uncheck":
      await loc.uncheck({ timeout: 3000, strict: false });
      break;

    case "assert_visible":
    case "verify visibility":
    case "assert":
      await expect(loc).toBeVisible({ timeout: 10000 });
      break;

    case "assert_text":
    case "verify content":
      await expect(page.locator("body")).toContainText(value || label, { timeout: 15000 });
      break;

    case "assert_url":
      await expect(page).toHaveURL(new RegExp(value || label), { timeout: 10000 });
      break;

    case "verify existence":
      await expect(loc).toBeAttached({ timeout: 5000 });
      break;

    case "assert_absent":
    case "verify absence":
      await expect(loc).not.toBeVisible({ timeout: 5000 });
      break;

    case "wait":
      await page.waitForTimeout(value || 1000);
      break;

    case "screenshot":
      await page.screenshot({
        path: `screenshot_${Date.now()}.png`,
        fullPage: false
      });
      break;

    default:
      console.warn(`⚠️ Action inconnue : ${action}`);
  }
}



// ---------------------------------------------------------
// 🚀 SET ACTION — version finale avec Self-Healing complet
// ---------------------------------------------------------
export async function setAction(bddData, step, thiz, page, execution_id) {

  // Détection automatique de l'action si bddData est null ou action est undefined
  let action = bddData?.action;
  let label = bddData?.label?.trim().replace(/^"(.*)"$/, "$1") || "";
  const resolved_value = bddData?.resolved_value || "";
  let dom = bddData?.dom || "";
  let uri = bddData?.uri || "";

  // Si action est undefined, essayer de la détecter depuis le texte du step
  if (!action && step) {
    const stepLower = step.toLowerCase().trim();

    // Détection de l'action "open" ou "navigate"
    if (stepLower.includes("open") || stepLower.includes("navigate") || stepLower.includes("go to")) {
      action = "open";
      console.log(`🔍 Action détectée automatiquement: "open" depuis le step: "${step}"`);

      // Essayer d'extraire l'URL depuis le step si elle n'est pas dans bddData
      if (!uri) {
        // Chercher une URL dans le step (http://, https://, ou juste un domaine)
        const urlMatch = step.match(/(https?:\/\/[^\s]+|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s]*)/);
        if (urlMatch) {
          uri = urlMatch[1];
          console.log(`🔍 URL extraite depuis le step: "${uri}"`);
        } else {
          // Si pas d'URL trouvée, essayer de lire depuis url.txt
          const urlFromFile = readUrlFromFile();
          if (urlFromFile) {
            uri = urlFromFile;
            console.log(`✅ URL lue depuis url.txt: "${uri}"`);
          } else {
            // Fallback sur config.baseURL seulement si ce n'est pas un placeholder
            const baseURL = config?.baseURL;
            if (baseURL && baseURL !== 'XXXXXXXXXXXXXXXXXXXXXXXXXX') {
              uri = baseURL;
              console.log(`⚠️ Utilisation de config.baseURL: "${uri}"`);
            } else {
              uri = label || "about:blank";
              console.log(`⚠️ Aucune URL valide trouvée, utilisation par défaut: "${uri}"`);
            }
          }
        }
      }
    }
  }

  console.log(`\n🧪 [setAction] Step="${step}" | Action="${action}" | Label="${label}" | URI="${uri}"`);

  // 1️⃣ Navigation → pas de DOM à trouver, on navigue et on passe à l'étape suivante
  if (action === "navigate" || action === "open") {
    if (!uri) {
      console.error("❌ URI manquante pour l'action 'open' ou 'navigate'");
      throw new Error(`URI is required for action: ${action}. Please provide a URI in the step or in bddData.uri`);
    }
    console.log("🌐 Navigation vers :", uri);
    await thiz.openUrl(uri);
    // Après openUrl, this.page est créé, on le récupère
    page = thiz.page;
    // Pour "open" et "navigate", on a terminé - pas besoin de chercher un sélecteur DOM
    console.log("✅ Navigation terminée, passage à l'étape suivante");
    return;
  }

  // Vérifier que page existe avant de continuer
  if (!page) {
    console.error("❌ Page n'est pas disponible. Action:", action);
    throw new Error(`Page is not available for action: ${action || 'undefined'}. Make sure to open a URL first.`);
  }

  // 2️⃣ Résolution du DOM via moteur N1 → N2 → N3
  let selector;
  try {
    selector = await resolveElement({
      page,
      stepText: step,
      action,
      label,
      dom
    });

    if (!selector) {
      throw new Error(`Aucun sélecteur trouvé pour "${label}"`);
    }
  } catch (error) {
    console.error(`🚨 Erreur fatale lors de la résolution du sélecteur pour "${label}": ${error.message}`);
    throw error; // Arrêter le processus
  }

  console.log(`🎯 Sélecteur final identifié : ${selector}`);

  // 3️⃣ Exécution + fallback universel
  const finalSelector = await executeWithFallback({
    page,
    action,
    label,
    stepText: step,
    resolved_value,
    selector,
    step
  });

  // 4️⃣ Mise à jour du JSON (self-learning)
  if (finalSelector) {
    updateStepDomInJson(step, finalSelector);
  }
}



/**
 * 🧹 Nettoie le HTML avant envoi au LLM :
 * - Supprime les balises inutiles (script, style, meta, svg…)
 * - Garde uniquement les éléments interactifs ou visibles
 * - Tronque si trop long
 */
export function cleanHtmlForLLM(html, maxLength = 30000) {
  try {
    // ⚙️ Supprimer les balises non utiles
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<meta[\s\S]*?>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s{2,}/g, " ");

    // ⚙️ Ne garder que les balises utiles pour les interactions
    // (boutons, liens, inputs, labels, div visibles)
    cleaned = cleaned.match(/<(button|a|input|label|select|textarea|div)[^>]*>[\s\S]*?<\/\1>/gi)?.join("\n") || cleaned;

    // ⚙️ Tronquer si trop long
    if (cleaned.length > maxLength) {
      cleaned = cleaned.slice(0, maxLength) + "\n<!-- ...truncated... -->";
    }

    return cleaned.trim();
  } catch (err) {
    console.warn("⚠️ Erreur pendant le nettoyage du HTML :", err.message);
    return html.slice(0, maxLength);
  }
}


export async function clickFirstVisible(loc) {
  const count = await loc.count();
  for (let i = 0; i < count; i++) {
    const el = loc.nth(i);
    if (await el.isVisible()) {
      await el.click();
      return;
    }
  }
  throw new Error("Aucun élément visible trouvé à cliquer.");
}

export async function importValueFromJson(filePath, searchPath, searchValue, importPath) {
  try {
    filePath = "./" + filePath;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Le fichier JSON n'existe pas : ${filePath}`);
    }

    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const searchPathParts = searchPath.split('.');
    const importPathParts = importPath.split('.');

    const getValueByPath = (obj, pathParts) => {
      return pathParts.reduce((current, key) => current && current[key], obj);
    };

    let importedValue = null;

    const traverse = (obj) => {
      if (Array.isArray(obj)) {
        obj.forEach(item => traverse(item));
      } else if (typeof obj === 'object' && obj !== null) {
        const currentValue = getValueByPath(obj, searchPathParts);
        if (currentValue === searchValue) {
          importedValue = getValueByPath(obj, importPathParts);
        }
        Object.values(obj).forEach(traverse);
      }
    };

    traverse(jsonData);

    if (importedValue === null) {
      console.warn(`❌ Aucune correspondance trouvée pour ${searchPath} = ${searchValue}`);
    } else {
      console.log(`✅ Valeur importée : ${importedValue}`);
    }

    return importedValue;

  } catch (error) {
    console.error(`🚨 Erreur dans importValueFromJson: ${error.message}`);
    return null;
  }
}