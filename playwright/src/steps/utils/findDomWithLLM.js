// playwright-ia-simples/playwright/src/steps/utils/findDomWithLLM.js

export async function findDomWithLLM(
  html,
  label,
  action = "click",
  model,
  apiKey
) {
  try {
    console.log(`🤖 Recherche LLM du DOM pour [${action}] - label: "${label}"`);

    if (!apiKey) {
      throw new Error(
        "❌ Aucune clé API Groq fournie. Définis GROQ_API_KEY dans les variables d'environnement."
      );
    }

    // 🧹 Tronquer le HTML si trop long (évite dépassement de token)
    const truncatedHtml =
      html.length > 30000
        ? html.slice(0, 30000) + "\n<!-- ...truncated... -->"
        : html;

    // 🧠 Construit le prompt envoyé au LLM
    const prompt = `
Voici le code HTML de la page web :

${truncatedHtml}

Ta mission :
Trouve le sélecteur CSS Playwright le plus fiable pour effectuer cette action :
Action : "${action}"
Label : "${label}"

⚠️ Règles :
- Réponds uniquement avec **un seul sélecteur CSS** utilisable par Playwright.
- Pas d'explications, pas de texte additionnel.
- Si plusieurs éléments correspondent, choisis celui le plus visible ou principal.
`;

    // 🔥 Appel LLM (Groq API compatible OpenAI)
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Tu es un expert en Playwright et en analyse de DOM. 
Ta tâche est d'identifier le sélecteur CSS le plus précis à partir d'un extrait HTML.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.0,
        max_tokens: 150,
      }),
    });

    // 🧩 Debug du prompt envoyé
    console.log("📤 Prompt envoyé au LLM :", prompt.slice(0, 2000), "\n...");

    // 🧩 Lecture unique de la réponse
    const rawText = await response.text();
    console.log("📥 Réponse brute du LLM :", rawText);

    if (!response.ok) {
      throw new Error(`Erreur API Groq (${response.status}): ${rawText}`);
    }

    // 🧩 Parsing JSON si possible
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.warn("⚠️ Réponse non-JSON, utilisation brute.");
      data = { raw: rawText };
    }

    const llm_output =
      data?.choices?.[0]?.message?.content?.trim() || rawText.trim();
    const selector = llm_output.split("\n")[0].trim();

    console.log("✅ Sélecteur détecté :", selector);
    return { selector, llm_output };
  } catch (error) {
    console.error("❌ Erreur pendant la recherche LLM du DOM :", error.message);
    return {
      selector: "",
      llm_output: { error: error.message },
    };
  }
}
