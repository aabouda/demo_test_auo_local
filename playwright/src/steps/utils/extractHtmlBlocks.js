import * as cheerio from "cheerio";

// === helpers ===
function norm(s) {
  if (!s) return "";
  const nf = s.normalize("NFKD");
  const no = nf.replace(/[\p{M}]/gu, "");
  return no.trim().replace(/\s+/g, " ").toLowerCase();
}
function attr($, el, name) {
  const v = $(el).attr(name);
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
function buildCssSelector($, el) {
  const did = attr($, el, "id");
  if (did) return `#${did}`;
  const dt = attr($, el, "data-testid");
  if (dt) return `[data-testid="${dt}"]`;
  const nm = attr($, el, "name");
  if (nm) return `${el.name}[name="${nm}"]`;
  const al = attr($, el, "aria-label");
  if (al) return `${el.name}[aria-label="${al}"]`;
  const ph = attr($, el, "placeholder");
  if (ph) return `${el.name}[placeholder="${ph}"]`;

  const cls = attr($, el, "class");
  if (cls) {
    const classes = String(cls).trim().split(/\s+/).filter(Boolean);
    if (classes.length)
      return `${el.name}.${classes.slice(0, 3).join(".")}`;
  }
  return el.name;
}
function getTypeForAction(action) {
  if (action === "fill") return "text-input";
  if (action === "select") return "dropdown";
  if (action === "check" || action === "uncheck") return "checkbox-radio";
  if (action === "click" || action === "hover") return "clickable";
  return "generic";
}
function isHidden($, el) {
  if (!el) return false;
  if ($(el).attr("hidden") != null) return true;
  if ((attr($, el, "type") || "").toLowerCase() === "hidden") return true;
  if ((attr($, el, "aria-hidden") || "").toLowerCase() === "true") return true;
  const cls = attr($, el, "class") || "";
  if (/\b(hidden|sr-only|invisible)\b/.test(cls)) return true;
  return false;
}

// === Construire un objet complet pour un nœud ===
function buildNodeInfo($, el, action, label) {
  const attributes = {};
  for (const k of [
    "id",
    "data-testid",
    "name",
    "aria-label",
    "placeholder",
    "class",
    "type",
    "role",
  ]) {
    attributes[k] = attr($, el, k);
  }

  // texte visible
  const textRaw = $(el).text().trim().replace(/\s+/g, " ");
  const text = textRaw || null;

  let identifier = null;
  let strategy = null;
  let reasons = [];
  let confidence = 70; // baseline

  if (attributes["id"]) {
    identifier = `#${attributes["id"]}`;
    strategy = "id";
    reasons.push("has id");
    confidence += 20;
  } else if (attributes["data-testid"]) {
    identifier = `[data-testid="${attributes["data-testid"]}"]`;
    strategy = "data-testid";
    reasons.push("has data-testid");
    confidence += 15;
  } else {
    identifier = buildCssSelector($, el);
    strategy = "css-path";
    reasons.push("fallback css-path");
  }

  return {
    identifier,
    strategy,
    confidence,
    css_selector: buildCssSelector($, el),
    tag: el.name,
    text,
    attributes,
    type: getTypeForAction(action),
    reasons,
    labelle: label,
    children: [],
  };
}

// === Construire l'arbre jusqu'à 3 parents max ===
function buildHierarchy($, el, action, label, depth = 3) {
  let current = el;
  let parentNode = null;

  for (let d = 0; d < depth && current && current.type === "tag"; d++) {
    if (isHidden($, current)) break; // ⛔ stop si hidden

    const nodeInfo = buildNodeInfo($, current, action, label);
    if (parentNode) {
      nodeInfo.children.push(parentNode);
    }
    parentNode = nodeInfo;
    current = current.parent;
  }

  return parentNode; // racine avec ses enfants imbriqués
}

// === API principale ===
export function findIdentifierTree(html, label, action = "click") {
  const $ = cheerio.load(html, { xmlMode: false, decodeEntities: true });
  const normLabel = norm(label);
  const results = [];

  $("input, button, a, *").each((_, el) => {
    if (isHidden($, el)) return;

    const node = $(el);

    // Normaliser label attendu
    const target = normLabel;

    // Récupérer texte ou attributs utiles
    const text = norm(node.text());
    const value = norm(node.attr("value") || "");
    const alt = norm(node.attr("alt") || "");
    const title = norm(node.attr("title") || "");
    const aria = norm(node.attr("aria-label") || "");

    // Comparer avec toutes les sources possibles
    if ([text, value, alt, title, aria].includes(target)) {
      const tree = buildHierarchy($, el, action, label, 3);
      if (tree) results.push(tree);
    }
  });

  return results;
}
