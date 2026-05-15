// llmAgent.js
import fetch from 'node-fetch';

export async function callLLMAgent(label, action, htmlBlocks) {
  const prompt = `
    Vous êtes un assistant spécialisé en automatisation de tests avec Playwright.

    Contexte :
    - Action demandée : "${action}" (ex: click, fill, select, etc.)
    - Label ciblé : "${label}"
    
    Voici les blocs HTML candidats :
    ${htmlBlocks.join('\n\n')}
    
    Objectif :
    Retournez UNIQUEMENT un **sélecteur valide** utilisable dans Playwright, par exemple :
    - a[href="/contact"]
    - button:has-text("${label}")
    - a:has-text("${label}")
    - span:has-text("${label}")
    - .my-button-class
    - #my-button-id
    - ("...", { hasText: "${label}" })
    
    Contraintes :
    - Ne retournez pas de texte explicatif.
    - Ne formatez pas la réponse en Markdown.
    - Ne mettez pas de commentaire ou de guillemets décoratifs.
    - Ne mettez pas des explications.
    
    N'utilisez PAS : :contains(...), contains(text(), ...), XPath, ou page.locator(...) dans la réponse.
    Répondez uniquement avec le sélecteur Playwright locator utilisable tel quel.
    Réponder sous format Array
    
  `;

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral',
      prompt,
      stream: false
    })
  });

  const data = await response.json();
  console.log("Reponse : " + data.response.trim())

  return data.response.trim();
}
