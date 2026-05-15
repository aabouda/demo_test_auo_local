// findElementSmart.js
import stringSimilarity from 'string-similarity';
import { callLLMAgent } from './llmAgent.js';
import { logDecision } from './analyzer.js';

export async function findElementSmart(label, action, page) {
  // 1. Recherche heuristique locale
  const elements = await page.$$('body *');
  const candidates = [];

  for (const el of elements) {
    try {
      const text = await el.innerText();
      const score = stringSimilarity.compareTwoStrings(label.toLowerCase(), text.toLowerCase());
      if (score > 0.5) {
        candidates.push({ element: el, score, text });
      }
    } catch (_) { /* éléments non interactifs */ }
  }

  // 2. Un seul élément avec un score parfait → clique direct
  const perfectMatches = candidates.filter(c => c.score === 1);
  if (perfectMatches.length === 1) {
    const el = perfectMatches[0].element;
    const isVisible = await el.isVisible();
    const selector = await el.evaluate(el => {
      let path = '';
      while (el && el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
          selector += '#' + el.id;
          path = selector + (path ? ' > ' + path : '');
          break;
        } else {
          let sib = el, nth = 1;
          while ((sib = sib.previousElementSibling)) {
            if (sib.nodeName.toLowerCase() === selector) nth++;
          }
          selector += `:nth-of-type(${nth})`;
        }
        path = selector + (path ? ' > ' + path : '');
        el = el.parentNode;
      }
      return path;
    });

    if (isVisible) {
      await logDecision({ label, action, method: 'heuristic', selector, score: 1 });
      return selector;
    }
  }

  // 3. Sinon → fallback IA
  let htmlBlocks = await Promise.all(
    candidates.map(c => c.element.evaluate(el => el.outerHTML))
  );

  if (!htmlBlocks || htmlBlocks.length === 0) {
    console.warn("⚠️ Aucun bloc HTML ciblé — fallback vers le HTML complet de la page");
    const fullHtml = await page.content();
    htmlBlocks = [fullHtml];
  }

  const rawSelector = await callLLMAgent(label, action, htmlBlocks);
  let parsedSelectors;

    try {
      // Parse si c'est un JSON stringifié, sinon utilise brut
      parsedSelectors = typeof rawSelector === 'string' ? JSON.parse(rawSelector) : rawSelector;
    } catch (e) {
      console.warn("⚠️ Erreur de parsing JSON, fallback vers split(',')");
      parsedSelectors = rawSelector.split(',');
    }

    const selectorList = sanitizeSelectorList(parsedSelectors);

    const fallbackTags = ['a', 'span', 'div', 'label'];

    for (const sel of selectorList) {
      try {
        const loc = page.locator(sel);
        const count = await loc.count();
        console.log(`🔎 ${sel} → ${count} élément(s)`);

        for (let i = 0; i < count; i++) {
          const el = loc.nth(i);
          const visible = await el.isVisible();
          console.log(`  ↪️  Élément #${i} visible ? ${visible}`);

          if (visible) {
            console.log(`✅ Élément visible trouvé avec : ${sel}`);
            return sel;
          } else {
            console.log(`🔁 Fallback : Élément non visible pour : ${sel}`);
          }
        }
        // 🧠 Fallback automatique si pas d'élément visible avec ce sélecteur

        

        return ':text("'+label+'")';

      } catch (e) {
        console.warn(`⚠️ Sélecteur ignoré : "${sel}" → ${e.message}`);
      }
    }

    throw new Error(`❌ Aucun sélecteur valide et visible trouvé pour "${label}"`);
}

export function sanitizeSelectorList(rawList) {
  return (Array.isArray(rawList) ? rawList : [rawList])
    .map(line => line.trim().replace(/^["']|["']$/g, '')) // supprime guillemets en début/fin
    .filter(line =>
      line &&
      /^[.#a-zA-Z]/.test(line) &&
      !line.includes(':contains') &&
      !line.includes('contains(') &&
      !line.includes('[contains') &&
      !line.includes('..') &&
      !line.includes('+') &&
      !line.includes('[class=') &&
      !line.toLowerCase().includes('locator(') &&
      !line.toLowerCase().includes('page.locator')
    )
    .map(line => line.replace(/,+$/, ''));
}



