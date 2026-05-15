/**
 * turing1-llm.js
 * Client LLM qui route tous les appels IA via TuringOne.
 * Le framework ne détient jamais les clés GROQ/OpenAI.
 * Auth : X-Turing-Token (env TURING1_SECURITY_TOKEN)
 */

import fetch from 'node-fetch';

const TURING1_API_URL      = process.env.TURING1_API_URL      || 'http://localhost:8000';
const TURING1_SECURITY_TOKEN = process.env.TURING1_SECURITY_TOKEN || '';

async function _post(endpoint, body) {
  // /llm/* → proxy LLM (pas de préfixe /public)
  // /public/* → API publiques framework (dom-update, enrich, etc.)
  const url = `${TURING1_API_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turing-Token': TURING1_SECURITY_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`⚠️ TuringOne ${endpoint} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`⚠️ TuringOne ${endpoint} indisponible : ${err.message}`);
    return null;
  }
}

/**
 * Demande au LLM TuringOne de trouver un sélecteur CSS/XPath
 * à partir du HTML de la page et du label/action.
 */
export async function callTuring1Selector(label, action, html, strategy = 1) {
  const data = await _post('/llm/selector', { label, action, html, strategy });
  return data?.selector || null;
}

/**
 * Demande au LLM TuringOne d'inférer les champs manquants d'un step BDD
 * à partir du texte naturel du step.
 * Retourne : { action, label, value, uri } ou {}
 */
export async function callTuring1StepInfer(stepText, actionHint = null) {
  const data = await _post('/llm/step-infer', {
    step_text: stepText,
    action_hint: actionHint,
  });
  return data || {};
}