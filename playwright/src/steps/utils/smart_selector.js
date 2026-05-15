// smartSelectorActionAware.js
import * as cheerio from "cheerio";

/* --------------------- ACTION profiles --------------------- */
const ACTION_TAGS = {
  fill:   new Set(["input","textarea"]),
  select: new Set(["select"]),
  click:  new Set(["button","a","input","summary","label","div","span"]),
  hover:  new Set(["button","a","input","div","span","label"]),
  check:  new Set(["input"]),
  uncheck:new Set(["input"]),
  drag:   new Set(["div","span","img","a","li","tr","td","th"]),
  "verify visibility":   new Set(["*"]),
  "verify content":      new Set(["*"]),
  "verify existence":    new Set(["*"]),
  "verify absence":      new Set(["*"]),
  "verify enabled":      new Set(["input","textarea","select","button"]),
  "verify disabled":     new Set(["input","textarea","select","button"]),
  "verify selected":     new Set(["option","input"]),
  "verify not selected": new Set(["option","input"]),
  "extract value":       new Set(["input","textarea","select","div","span","p","td"])
};

// CSS préfiltre ultra-ciblé par action
const ACTION_PREFILTER = {
  fill: [
    'input[type="text" i]','input[type="email" i]','input[type="password" i]','input[type="search" i]',
    'input[type="number" i]','input[type="tel" i]','input[type="url" i]',
    'input[type="date" i]','input[type="datetime-local" i]','input[type="time" i]','input[type="month" i]','input[type="week" i]',
    "input:not([type])","textarea",
    // customs tap-to-type
    '[role="combobox"] input','[aria-haspopup="listbox"] input'
  ],
  select: [
    "select",
    // customs
    '[role="combobox"]','[aria-haspopup="listbox"]','[role="listbox"]','[data-select]'
  ],
  check: [
    'input[type="checkbox" i]','input[type="radio" i]','[role="checkbox"]','[role="radio"]'
  ],
  uncheck: [
    'input[type="checkbox" i]','[role="checkbox"]'
  ],
  click: [
    "button","a[href]","[role='button']",
    'input[type="button" i]','input[type="submit" i]','input[type="reset" i]','input[type="image" i]',
    // tap targets
    "[data-testid]","[data-action]","[data-role='button']",
    // last resort clickable
    "[onclick]","[tabindex]"
  ],
  hover: [
    "button","a[href]","[role='button']","[data-hover]",
    "[onclick]","[tabindex]","div","span","label"
  ],
  drag: [
    "[draggable='true']","[data-draggable]","[role='option']","[role='row']","[role='listitem']",
    "img","a","li","tr","td","th","div","span"
  ],
  "verify visibility": ["*"],
  "verify content":    ["*"],
  "verify existence":  ["*"],
  "verify absence":    ["*"],
  "verify enabled":    ["input","textarea","select","button","[role='button']","[role='textbox']","[role='combobox']"],
  "verify disabled":   ["input","textarea","select","button","[aria-disabled='true']","[disabled]"],
  "verify selected":   ["option[selected]","input[type='checkbox' i]","input[type='radio' i]","[aria-selected='true']","[aria-checked='true']"],
  "verify not selected": ["option:not([selected])","[aria-selected='false']","[aria-checked='false'])"],
  "extract value":     ["input","textarea","select","[contenteditable]","[data-value]","div","span","p","td"]
};

function getTypeForAction(action) {
  const tags = ACTION_TAGS[action];
  if (!tags || tags.has("*")) return "generic";
  if (action === "fill") return "text-input";
  if (action === "select") return "dropdown";
  if (action === "check" || action === "uncheck") return "checkbox-radio";
  if (action === "click" || action === "hover") return "clickable";
  if (action === "drag") return "draggable";
  if (action.startsWith("verify")) return "generic";
  if (action === "extract value") return "extractable";
  return "generic";
}

/* --------------------- helpers génériques --------------------- */
function norm(s){ if(!s) return ""; const nf=s.normalize("NFKD"); const no=nf.replace(/[\p{M}]/gu,""); return no.trim().replace(/\s+/g," ").toLowerCase(); }
function textOf($,el){ return norm($(el).text()); }
function shortText($,el){ const t=textOf($,el); return t && t.length<=60 ? t : ""; }
function attr($,el,name){ const v=$(el).attr(name); return Array.isArray(v)?(v[0]??null):(v??null); }
function cssEscape(s){ return String(s).replace(/\\/g,"\\\\").replace(/"/g,'\\"'); }

function hasActionMatch($,tag,el){
  const t=(tag||"").toLowerCase();
  const known=new Set(["input","a","button","textarea","select","summary","label","div","span"]);
  if(!known.has(t)) return true;
  if(t==="div"||t==="span"){
    const role=attr($,el,"role");
    return $(el).attr("onclick")!=null || role==="button" || $(el).attr("tabindex")!=null;
  }
  return true;
}

function tagOkForAction($,tag,action,el){
  tag=(tag||"").toLowerCase();
  const allowed=ACTION_TAGS[action]||new Set();
  if(allowed.size===0) return true;
  if(!allowed.has(tag)){
    return action==="click" && (tag==="div"||tag==="span") && hasActionMatch($,tag,el);
  }
  if(tag==="input"){
    const itype=(attr($,el,"type")||"").toLowerCase();
    if(action==="fill"){
      return ["text","email","password","search","number","tel","url","date","datetime-local","time","month","week",""].includes(itype);
    }
    if(action==="check"||action==="uncheck"){
      return ["checkbox","radio","switch","toggle"].includes(itype);
    }
    if(action==="click"){
      return ["button","submit","reset","image"].includes(itype) || hasActionMatch($,tag,el);
    }
  }
  return true;
}

function buildCssSelector($,el){
  const did=attr($,el,"id"); if(did) return `#${cssEscape(did)}`;
  const dt=attr($,el,"data-testid"); if(dt) return `[data-testid="${cssEscape(dt)}"]`;
  const nm=attr($,el,"name"); if(nm) return `${el.name}[name="${cssEscape(nm)}"]`;
  const al=attr($,el,"aria-label"); if(al) return `${el.name}[aria-label="${cssEscape(al)}"]`;
  const ph=attr($,el,"placeholder"); if(ph) return `${el.name}[placeholder="${cssEscape(ph)}"]`;
  const cls=attr($,el,"class");
  if(cls){ const classes=String(cls).trim().split(/\s+/).filter(Boolean); if(classes.length) return `${el.name}.${classes.slice(0,3).map(cssEscape).join(".")}`; }
  const path=[]; let cur=el;
  while(cur && cur.name){
    let idx=1, prev=cur.prev;
    while(prev){ if(prev.type==="tag" && prev.name===cur.name) idx+=1; prev=prev.prev; }
    path.push(`${cur.name}:nth-of-type(${idx})`); cur=cur.parent;
  }
  return path.reverse().join(" > ");
}

/* --------------------- couche ACTION-AWARE --------------------- */
function prefilterByAction($, action){
  const sels = ACTION_PREFILTER[action] || ["*"];
  // Union de tous les sélecteurs d’action
  const nodes = new Set();
  for(const sel of sels){
    $(sel).each((_,el)=>nodes.add(el));
  }
  // Ajoute les hits évidents
  $('[data-testid], [name], [aria-label], [placeholder], [id]').each((_,el)=>nodes.add(el));
  return [...nodes];
}

// relie <label> au contrôle (for= / wrapping)
function linkLabelToControl($, labelTextNorm){
  $("label").each((_,lab)=>{
    const t=norm($(lab).text());
    if(t===labelTextNorm){
      const f=$(lab).attr("for");
      if(f){
        const target = $(`#${typeof CSS!=="undefined" && CSS.escape ? CSS.escape(f) : f}`);
        if(target && target.length) target.attr("__from_label_for","1");
      }
      $(lab).find("input,select,textarea").each((__,d)=>$(d).attr("__from_label_for","1"));
    }
  });
}

/* --------------------- scoring renforcé --------------------- */
function scoreCandidate($, el, labelNorm, action){
  let score=0; const reasons=[];

  if($(el).attr("__from_label_for")!=null){ score+=1000; reasons.push("label[for]"); }

  // exact matches
  const dt=attr($,el,"data-testid"); if(dt && norm(dt)===labelNorm){ score+=450; reasons.push("data-testid==label"); }
  const nm=attr($,el,"name");        if(nm && norm(nm)===labelNorm){ score+=340; reasons.push("name==label"); }
  const al=attr($,el,"aria-label");  if(al && norm(al)===labelNorm){ score+=320; reasons.push("aria-label==label"); }
  const ph=attr($,el,"placeholder"); if(ph && norm(ph)===labelNorm){ score+=300; reasons.push("placeholder==label"); }
  const idv=attr($,el,"id");         if(idv && norm(idv)===labelNorm){ score+=260; reasons.push("id==label"); }
  const alt = attr($, el, "alt");
  if (alt && norm(alt) === labelNorm) {
    score += 300;
    reasons.push("alt==label");
  }
  if (alt && norm(alt).includes(labelNorm)) {
    score += 150;
    reasons.push("alt~label");
  }
  // contains matches
  for(const [field,w] of [["data-testid",200],["name",180],["aria-label",160],["placeholder",140],["id",120],["class",90]]){
    const v=attr($,el,field); const vn=norm(Array.isArray(v)?v.join(" "):(v||""));
    if(v && labelNorm && vn.includes(labelNorm)){ score+=w; reasons.push(`${field}~label`); }
  }

  // texte visible pour clickables
  if(action==="click"||action==="hover"){
    const t=shortText($,el);
    if(t && norm(t)===labelNorm){ score+=260; reasons.push("text==label"); }
    else if(t && norm(t).includes(labelNorm)){ score+=160; reasons.push("text~label"); }
  }

  // bonus action-specific (type/role)
  const role = (attr($,el,"role")||"").toLowerCase();
  const itype= (attr($,el,"type")||"").toLowerCase();

  if(action==="fill"){
    if(el.name==="input"||el.name==="textarea") score+=80;
    if(["text","email","password","search","number","tel","url","date","datetime-local","time","month","week",""].includes(itype)) score+=60;
    if(role==="textbox") score+=60;
  }
  if(action==="select"){
    if(el.name==="select") score+=120;
    if(role==="combobox" || attr($,el,"aria-haspopup")==="listbox") score+=120;
  }
  if(action==="check"||action==="uncheck"){
    if(el.name==="input" && ["checkbox","radio"].includes(itype)) score+=120;
    if(role==="checkbox" || role==="radio") score+=100;
  }
  if(action==="click"||action==="hover"){
    if(el.name==="button" || role==="button") score+=120;
    if(el.name==="a" && attr($,el,"href")) score+=100;
    if(el.name==="input" && ["button","submit","reset","image"].includes(itype)) score+=100;
  }
  if(action==="drag"){
    if(attr($,el,"draggable")==="true" || attr($,el,"data-draggable")) score+=150;
  }

  // compat action
  if(tagOkForAction($,el.name,action,el)){ score+=60; reasons.push("action-compatible"); }
  else { score-=220; reasons.push("action-mismatch"); }

  // bonus attrs stables
  if(attr($,el,"data-testid")) { score+=70; reasons.push("has data-testid"); }
  if(attr($,el,"id"))          { score+=40; reasons.push("has id"); }

  // pénalité profondeur
  let depth=0, p=el.parent; while(p && p.type==="tag"){ depth++; p=p.parent; } score-=Math.min(depth,10)*2;

  return {score, reasons};
}

function isHidden($, el) {
  if (!el) return false;

  // attributs directs
  if ($(el).attr("hidden") != null) return true;
  if ((attr($,el,"type")||"").toLowerCase() === "hidden") return true;
  if ((attr($,el,"aria-hidden")||"").toLowerCase() === "true") return true;

  // classes connues
  const cls = attr($,el,"class") || "";
  if (/\b(hidden|sr-only|invisible)\b/.test(cls)) return true;

  // check parent chain
  let p = el.parent;
  while (p && p.type === "tag") {
    const pcl = attr($,p,"class") || "";
    if (pcl.includes("hidden") || (attr($,p,"aria-hidden")||"") === "true") {
      return true;
    }
    p = p.parent;
  }

  return false;
}


/* --------------------- API principale --------------------- */
export function findIdentifier(html, label, action="click"){
  const $ = cheerio.load(html, { xmlMode:false, decodeEntities:true });
  const labelN = norm(label);
  action = String(action).toLowerCase().trim();

  linkLabelToControl($, labelN);

  // 1) préfiltrage action-aware
  const pool = new Set(prefilterByAction($, action));

  // 2) si pool vide (page exotique), fallback "tout" mais filtré par compat action
  if(pool.size===0) $("*").each((_,el)=>{ if(tagOkForAction($,el.name,action,el)) pool.add(el); });

  // 3) scoring
  let best=null, bestScore=-1e12, bestReasons=[];
  for (const el of pool) {
    if (isHidden($, el)) continue;   // ⛔ exclure les hidden

    const {score, reasons} = scoreCandidate($, el, labelN, action);
    if (score>bestScore) {
      best=el;
      bestScore=score;
      bestReasons=reasons;
    }
  }

  if(!best){
    return { found:false, identifier:null, strategy:null, confidence:0, css_selector:null, type:getTypeForAction(action), reasons:["no-candidate"] };
  }

  // 4) construction sélecteur — descend si conteneur vers contrôle réel
  let target = best;

// 🆕 remonter si c’est un span/div interne mais contenu dans <button> ou <a>
if (["span","div","svg","path"].includes(target.name)) {
  let parent = target.parent;
  while (parent && parent.type === "tag") {
    if (["button","a","label"].includes(parent.name)) {
      target = parent;
      bestReasons.push("remonté-vers-parent-cliquable");
      break;
    }
    parent = parent.parent;
  }
}

  if($(best).is("div,span,label") && $(best).find("input,textarea,select").length){
    target = $(best).find("input,textarea,select").first()[0];
    bestReasons.push("descend-to-control");
  }

  let identifier=null, strategy=null;

  const did = attr($,target,"id");
  if(did){ identifier = `#${did}`; strategy="id"; }
  else {
    const priorities = ["data-testid","name","aria-label","placeholder"];
    for(const k of priorities){
      const v = attr($,target,k);
      if(v){
        if(k==="data-testid") identifier = `[data-testid="${v}"]`;
        else if(k==="name")   identifier = `${target.name}[name="${v}"]`;
        else if(k==="aria-label") identifier = `${target.name}[aria-label="${v}"]`;
        else identifier = `${target.name}[placeholder="${v}"]`;
        strategy = k; break;
      }
    }
    if(!identifier){ identifier = buildCssSelector($, target); strategy="css-path"; }
  }

  const css_selector = buildCssSelector($, target);
  const attributes = {};
  for(const k of ["id","data-testid","name","aria-label","placeholder","class","type","role"]) attributes[k]=attr($,target,k);

  const confidence = Math.max(0, Math.min(100, Math.trunc(bestScore/10 + 50)));

  return {
    found: true,
    identifier,
    strategy,
    confidence,
    css_selector,
    tag: target.name,
    attributes,
    type: getTypeForAction(action),
    reasons: bestReasons,
    labelle:label
  };
}
