"use strict";
/* Salud — módulo de entreno: historial estilo Hevy, estadísticas, récords y pictogramas. */

// ------------------------------------------------------------ pictogramas
// Iconos de trazo (viewBox 48) por patrón de movimiento. Se eligen por el nombre del ejercicio.
const EX_ICONS = {
  bench: "M7 34h30M11 34v7M33 34v7M13 30h18M8 17h26M8 13v8M34 13v8M17 30l-1-13M27 30l1-13|c10,29,3",
  incline: "M8 40l26-14M12 38v4M30 28v8M14 34l16-9M8 16h26M8 12v8M34 12v8M18 31l-2-15M28 26l1-10|c11,36,3",
  machine: "M38 6v36M12 10v26M12 36h14v6M16 18h18M30 14v8M16 15v15M16 30h10|c16,11,3",
  fly: "M24 15v15M24 30l-5 12M24 30l5 12M8 19h32M8 19L4 7M40 19l4-12|c24,10,3.5|c8,19,2|c40,19,2",
  dips: "M6 24h14M28 24h14M10 24v18M38 24v18M24 15v14M24 17l-7 7M24 17l7 7M24 29l-3 10M24 29l3 10|c24,10,3.5",
  pullup: "M5 14h38M14 14l-3 8 9-4M34 14l3 8-9-4M24 16v16M24 32l-4 10M24 32l4 10|c24,9,3.5",
  muscleup: "M4 28h40M17 28l2-13M31 28l-2-13M19 15h10M24 15v14M24 29l-3 13M24 29l3 13|c24,9,3.5",
  rings: "M14 2v8M34 2v8M14 16l-3 7 9-4M34 16l3 7-9-4M24 18v14M24 32l-4 10M24 32l4 10|c14,13,3|c34,13,3|c24,11,3.5",
  hang: "M5 6h38M19 6l2 13M29 6l-2 13M21 19h6M24 19v14M24 33l-2 10M24 33l2 10|c24,14,3.5",
  scapular: "M3 6h32M14 6l2 13M24 6l-2 13M16 19h6M19 19v14M19 33l-2 10M19 33l2 10M41 34V20M37 24l4-4 4 4|c19,13,3.5",
  hangleg: "M5 6h38M18 6l2 12M28 6l-2 12M23 18v14M23 32h16|c23,12,3.5",
  parleg: "M4 24h14M30 24h14M8 24v18M40 24v18M24 15v13M24 17l-7 7M24 17l7 7M24 28l9-5M33 23l1 10|c24,10,3.5",
  frontlever: "M6 8h36M14 8v12M14 20h28M14 24h24|c10,22,3",
  pulldown: "M10 8h28M24 2v6M24 20L12 8M24 20l12-12M24 20v14M24 34h10v8M14 34h20|c24,15,3",
  row: "M16 17l14 7M30 24l-3 18M30 24l5 18M20 19v12M12 32h18M12 29v6M30 29v6|c13,14,3",
  tbar: "M8 42l26-22M12 39v4M34 20l3 3M31 23v12M25 35h12M15 36l-7-3|c38,17,3",
  rower: "M4 42h40M30 34l-8-4M22 30l-6-10M16 20l10 4M16 20l-4 12M12 32l10 0|c15,15,3|c34,34,4",
  squat: "M10 14h28M10 10v8M38 10v8M24 14l-2 12M22 26l10 4M32 30l-4 12M22 26l4 4|c24,9,3",
  legpress: "M6 42l12-22M18 20l-6 16M12 36l14-8M26 28l6-10M30 8l12 14|c16,16,3",
  legext: "M12 8v28M16 11v19M16 30h12M28 30l12-6M12 36h18v6|c16,7,3|c41,23,2.5",
  legcurl: "M6 32h32M10 34v8M34 34v8M10 28h20M30 28l6-12|c7,27,3|c37,14,2.5",
  deadlift: "M20 15l8 11M28 26v16M28 26l-4 16M22 18v16M8 34h30|c18,12,3|c8,34,5|c38,34,5",
  abd: "M24 10v15M14 26h20M21 26l-8 14M27 26l8 14M3 31h6M3 31l3-3M3 31l3 3M45 31h-6M45 31l-3-3M45 31l-3 3|c24,6,3",
  add: "M24 10v15M14 26h20M21 26l-8 14M27 26l8 14M3 31h6M9 31l-3-3M9 31l-3 3M45 31h-6M39 31l3-3M39 31l3 3|c24,6,3",
  lateral: "M24 15v15M24 17l-13 4M24 17l13 4M24 30l-4 12M24 30l4 12M9 18v6M39 18v6|c24,10,3.5",
  revfly: "M13 20l17 4M30 24l-3 18M30 24l3 18M16 21l6-11M19 10h6M16 21l-1 12M13 33h5|c10,18,3",
  ohp: "M8 6h32M8 2v8M40 2v8M24 17l-9-11M24 17l9-11M24 17v15M24 32l-4 10M24 32l4 10|c24,13,3",
  curl: "M20 12v20M20 16v10M20 26l10-8M28 14l4 8M20 32l-3 10M20 32l3 10|c20,8,3",
  hammer: "M20 12v20M20 16v10M20 26l9-7M29 13v11M27 13h4M27 24h4M20 32l-3 10M20 32l3 10|c20,8,3",
  preacher: "M10 14v20M10 34h10M18 34v8M13 30l12-10M12 26l11-7M23 19l3-10M22 9h7|c10,9,3",
  wrist: "M6 30h20M26 30l5-5M33 17v12M30 17h6M30 29h6M41 12a6 6 0 1 1 -4 -2",
  triceps: "M34 4v20M20 12v20M20 16l8 10M28 26h6M20 32l-3 10M20 32l3 10|c20,8,3",
  ohtri: "M22 17v17M22 34l-3 9M22 34l3 9M22 18l6-12M28 6l-8 5M40 42L21 12|c22,12,3",
  core: "M11 26l29 6M14 27v10M14 37h7M40 32v6|c8,24,3",
  crunch: "M4 40h40M26 37l8-10 6 11M26 37l-10-6M16 31l4-8|c13,28,3",
  dragon: "M6 38h20M10 38v6M22 38v6M11 34L37 8|c8,33,3",
  twist: "M10 40h22M16 38l6-15M16 38l14-5M30 33l6 7M23 23l9 1|c22,18,3|c34,24,3.5",
  pushup: "M6 36l28-10M31 27v13M14 33l-2 7M6 36v4|c38,24,3",
  pike: "M6 41l14-22M20 19l10 21M27 41h6|c30,34,3",
  run: "M22 14l4 12M26 26l-8 6M18 32l-6-2M26 26l6 6M32 32l-2 10M22 18l-8 4M22 18l10 2|c22,9,3",
  farmer: "M24 15v15M24 17l-6 12M24 17l6 12M24 30l-5 12M24 30l5 12|c24,10,3.5|c18,33,3.5|c30,33,3.5",
  swim: "M4 36q5-4 10 0t10 0t10 0t10 0M8 26l14-4M22 22l12 2M22 22l10-10|c38,24,3",
  calf: "M24 10v18M24 28l-3 10M24 28l3 10M18 40h12M21 38v-2|c24,6,3",
  calfseat: "M12 10v18M12 28h16M28 28l2 10M26 38h8M18 24h14|c12,6,3",
  benchdip: "M4 26h14M7 26v16M15 26v16M16 26l4-10M20 16l2 14M22 30l12-2M34 28l2 14|c20,11,3",
  kneeraise: "M4 42h40M10 40h16M26 40l6-10M32 30l8 4|c7,38,3",
  legraise: "M4 42h40M10 40h16M26 40l12-16|c7,38,3",
  generic: "M10 24h28M10 17v14M14 19v10M38 17v14M34 19v10",
};
const EX_RULES = [
  [/front lever/, "frontlever"], [/escapular|scapular/, "scapular"], [/colgad|dead hang|hang\b/, "hang"],
  [/rodillas al pecho en barras paralelas|paralelas/, "parleg"], [/levantamiento de rodillas tumbado/, "kneeraise"], [/levantamiento de piernas tumbado/, "legraise"], [/levantamiento de (piernas|rodillas) en barra|hanging (leg|knee)/, "hangleg"],
  [/muscle ?up/, "muscleup"], [/anillas|rings?\b/, "rings"],
  [/fondo de tricep|bench dip/, "benchdip"], [/fondo|\bdip/, "dips"], [/encima de la cabeza|overhead|press frances/, "ohtri"], [/tricep|patada|pushdown/, "triceps"],
  [/jalon al pecho|pulldown|pull down|jalon de remo/, "pulldown"], [/aperturas? invertidas?|reverse fly|pajaro|face pull/, "revfly"],
  [/banca.*inclin|inclin.*banca|press inclinado/, "incline"], [/banca|bench/, "bench"],
  [/press de pecho|pecho \(|chest press|press pecho/, "machine"], [/apertura|fly|cruce|pec deck|mariposa|contractor/, "fly"],
  [/dominad|pull ?up|chin ?up/, "pullup"],
  [/ergometro|remadora|rowing machine|ski ?erg/, "rower"], [/remo en t|t bar|t-bar/, "tbar"], [/remo|row\b|pull over|pullover/, "row"],
  [/sentadilla|squat|hack|zancada|lunge|bulgara/, "squat"], [/prensa|press de piernas|leg press/, "legpress"],
  [/extension de (cuadriceps|pierna)|leg extension|cuadriceps/, "legext"], [/femoral|leg curl|curl de pierna|isquio/, "legcurl"],
  [/peso muerto|deadlift|hip thrust|rumano|good morning|hiperextension/, "deadlift"],
  [/gemelo.*sentad|seated calf/, "calfseat"], [/gemelo|calf|pantorrilla/, "calf"],
  [/abduccion|abductor/, "abd"], [/aduccion|adductor/, "add"],
  [/elevacion(es)? lateral|lateral raise|posterior/, "lateral"], [/press (de )?hombro|militar|overhead press|arnold|shoulder press/, "ohp"],
  [/muneca|rodillo de antebrazo|wrist/, "wrist"], [/predicador|preacher|scott/, "preacher"], [/martillo|hammer/, "hammer"], [/curl|bicep/, "curl"],
  [/flexion en pica|pike/, "pike"], [/flexion|push ?up/, "pushup"],
  [/dragon/, "dragon"], [/russian twist|giro ruso/, "twist"], [/abdominal|crunch|sit ?up/, "crunch"],
  [/plancha|plank|elevacion(es)? de piernas|levantamiento de (piernas|rodillas)|leg raise|l-sit|rueda|hollow|core|v-up/, "core"],
  [/carrera|correr|running|cinta|treadmill|sprint/, "run"], [/granjero|farmer/, "farmer"], [/natacion|piscina|swim/, "swim"],
];
const GROUP_OF = { bench: "Pecho", incline: "Pecho", machine: "Pecho", fly: "Pecho", dips: "Pecho", benchdip: "Brazos", pushup: "Pecho", kneeraise: "Core", legraise: "Core", pike: "Hombro",
  pullup: "Espalda", muscleup: "Espalda", rings: "Espalda", hang: "Espalda", scapular: "Espalda", pulldown: "Espalda", row: "Espalda", tbar: "Espalda",
  frontlever: "Core", hangleg: "Core", parleg: "Core", core: "Core", crunch: "Core", dragon: "Core", twist: "Core",
  squat: "Pierna", legpress: "Pierna", legext: "Pierna", legcurl: "Pierna", deadlift: "Pierna", calf: "Pierna", calfseat: "Pierna", abd: "Pierna", add: "Pierna",
  lateral: "Hombro", revfly: "Hombro", ohp: "Hombro", curl: "Brazos", hammer: "Brazos", preacher: "Brazos", wrist: "Brazos", triceps: "Brazos", ohtri: "Brazos",
  rower: "Cardio", run: "Cardio", farmer: "Cardio", swim: "Cardio", generic: "Otros" };
const GROUP_HUE = { Pecho: 14, Espalda: 212, Pierna: 140, Hombro: 38, Brazos: 280, Core: 186, Cardio: 330, Otros: 0 };
const WEIGHTED_RX = /peso (anadido|agregado)|lastre|weighted/;
// Marcas pequeñas para distinguir variantes: material (abajo a la derecha), variante (arriba a la derecha) y lastre (abajo a la izquierda).
const EQUIP_MARKS = [
  [/smith/, "M-4 -5v10M4 -5v10M-4 0h8"], [/maquina de discos|discos/, "c0,0,4.2|c0,0,1.2"], [/maquina|pec deck/, "M-3.5 -4h7v8h-7zM-3.5 0h7"],
  [/cable|polea|cuerda|jalon/, "c0,-1.8,2.4|M0 0.6v4.6"], [/mancuerna/, "M-3.5 0h7M-4.5 -2.6v5.2M4.5 -2.6v5.2"],
  [/barra ez|\bez\b/, "M-5 0l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5M-4 -3v6M4 -3v6"], [/\(barra\)|con barra/, "M-5 0h10M-3 -3.5v7M3 -3.5v7"], [/anillas/, "c0,1,3|M0 -2v-4"],
];
const VAR_MARKS = [
  [/pec deck|mariposa/, "M-3.5 -3.5v7M3.5 -3.5v7"], [/jalon de tricep/, "M0 -4.5v9M-3 1.5l3 3 3-3"], [/elevacion a/, "M0 4.5v-9M-3 -1.5l3-3 3 3"],
  [/un brazo|una mano|a un /, "M-1.5 -3l2-1.5v9"], [/agarre en v|cerrad|diamante/, "M-3.5 -3l3.5 6 3.5-6"], [/agarre recto/, "M-4.5 0h9"],
  [/invertid|palmas arriba/, "M-3.5 1.5l3.5-3.5 3.5 3.5"], [/chin up/, "M-3.5 -2.5q3.5 7 7 0"], [/inclinad/, "M-4 3.5l8-7"], [/declinad/, "M-4 -3.5l8 7"],
  [/cuerda/, "M-2 -4q-2 4 0 8M2 -4q2 4 0 8"], [/iso-?lateral/, "c-2.5,0,1.5|c2.5,0,1.5"], [/tumbad/, "M-5 2.5h10|c-3,-1.2,1.3"],
  [/sentad/, "M-3 -4.5v7h6v2.5"], [/de pie\b/, "M0 -5v10M-2.5 5h5"], [/pseudo/, "M-4 -2h8M-4 2h8"], [/remo alto/, "M0 4.5v-9M-3 -1.5l3-3 3 3"],
  [/extension de muneca/, "M-3.5 -1.5l3.5 3.5 3.5-3.5"], [/en barra\b|en barras/, "M-5 -3h10M-3 -3v6"], [/corto/, "M-3 0h6"],
];
function exMarks(name) {
  const n = norm(name), out = [];
  const eq = EQUIP_MARKS.find(([rx]) => rx.test(n)); if (eq) out.push([41, 41, eq[1]]);
  const va = VAR_MARKS.find(([rx]) => rx.test(n)); if (va) out.push([41, 7, va[1]]);
  if (WEIGHTED_RX.test(n)) out.push([7, 41, "c0,0,4.2", true]);
  return out;
}
const exKey = (name) => { const n = norm(name); for (const [rx, k] of EX_RULES) if (rx.test(n)) return k; return "generic"; };
const exGroup = (name) => GROUP_OF[exKey(name)];

function exIcon(name, size = 40) {
  const key = typeof name === "string" && EX_ICONS[name] ? name : exKey(name);
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 48 48"); svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2.6");
  svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
  for (const part of EX_ICONS[key].split("|")) {
    if (part.startsWith("c")) {
      const [cx, cy, r] = part.slice(1).split(",");
      const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r); svg.append(c);
    } else { const p = document.createElementNS(NS, "path"); p.setAttribute("d", part); svg.append(p); }
  }
  if (typeof name === "string" && !EX_ICONS[name]) for (const [cx, cy, d, fill] of exMarks(name)) {
    const bg = document.createElementNS(NS, "circle"); bg.setAttribute("cx", cx); bg.setAttribute("cy", cy); bg.setAttribute("r", 7.2); bg.setAttribute("class", "hole"); svg.append(bg);
    const g = document.createElementNS(NS, "g"); g.setAttribute("transform", `translate(${cx} ${cy})`); g.setAttribute("stroke-width", "2");
    for (const part of d.split("|")) {
      if (part.startsWith("c")) { const [x, y, r] = part.slice(1).split(","); const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", r); if (fill) c.setAttribute("fill", "currentColor"); g.append(c); }
      else { const pth = document.createElementNS(NS, "path"); pth.setAttribute("d", part); g.append(pth); }
    }
    svg.append(g);
  }
  const hue = GROUP_HUE[GROUP_OF[key]] ?? 0;
  return h("span", { class: "exi" + (key === "generic" ? " gen" : ""), style: { "--h": hue }, "data-tip": GROUP_OF[key] }, svg);
}


// ------------------------------------------------------------- tooltips
// Un único tooltip para todas las gráficas: cualquier elemento con data-tip lo muestra al pasar el ratón (o al tocar en el móvil).
const TIP = { el: null };
function showTip(text, x, y) {
  if (!TIP.el) { TIP.el = h("div", { class: "ctip" }); document.body.append(TIP.el); }
  const t = TIP.el; t.replaceChildren(); t.style.display = "block";
  // Formato: 1.ª línea en negrita · «## Título» = sección · «etiqueta | valor» = fila en dos columnas
  text.split("\n").forEach((ln, i) => {
    let el;
    if (ln.startsWith("## ")) el = h("div", { class: "tt-s" }, ln.slice(3));
    else if (ln.includes(" | ")) { const [a, b] = ln.split(" | "); el = h("div", { class: "tt-r" }, h("span", null, a), h("b", null, b)); }
    else el = h("div", { class: i === 0 ? "tt-h" : "tt-l" }, ln);
    t.append(el);
  });
  const r = t.getBoundingClientRect();
  let L = x + 14, T = y - r.height - 12;
  if (L + r.width > window.innerWidth - 8) L = x - r.width - 14;
  if (L < 8) L = 8;
  if (T < 8) T = y + 18;
  t.style.left = L + "px"; t.style.top = T + "px";
}
function hideTip() { if (TIP.el) TIP.el.style.display = "none"; }
const tipTarget = (e) => (e.target && e.target.closest ? e.target.closest("[data-tip]") : null);
// En el móvil (táctil) el tooltip sale al tocar, pero no en botones (al tocarlos se hace la acción) y se va solo a los 3 s
let TIP_T = null;
const isAction = (t) => t && t.closest && t.closest("button, a, input, select, label, .clickable, [onclick]");
document.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; const t = tipTarget(e); if (t) showTip(t.dataset.tip, e.clientX, e.clientY); else if (!(e.target.closest && e.target.closest(".mchart.line"))) hideTip(); });
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const t = tipTarget(e);
  if (!t || isAction(t)) { hideTip(); return; }
  showTip(t.dataset.tip, e.clientX, e.clientY); clearTimeout(TIP_T); TIP_T = setTimeout(hideTip, 3000);
});
window.addEventListener("blur", hideTip); document.addEventListener("visibilitychange", hideTip);
document.addEventListener("pointerleave", hideTip);
window.addEventListener("scroll", hideTip, true);
window.addEventListener("hashchange", hideTip);
document.addEventListener("click", (e) => { if (!tipTarget(e) && !(e.target.closest && e.target.closest(".mchart.line"))) hideTip(); });
const tip = (el, text) => { if (text) el.setAttribute("data-tip", text); return el; };

// ------------------------------------------------------------- series
const SET_T = { calentamiento: ["W", "Calentamiento"], fallo: ["F", "Al fallo"], drop: ["D", "Drop set"] };
function fmtSecs(x) { const m = Math.floor(x / 60), s_ = Math.round(x % 60); return m ? `${m}:${String(s_).padStart(2, "0")}` : `${s_} s`; }
const fmtDist = (m) => (m >= 1000 ? fmt(m / 1000, 2) + " km" : fmt(m) + " m");
function setLoad(kind, st) {
  if (kind === "cardio" || kind === "tiempo") {
    return [st.weight_kg ? fmt(st.weight_kg, 1) + " kg" : null, st.distance_m ? fmtDist(st.distance_m) : null, st.seconds ? fmtSecs(st.seconds) : null].filter(Boolean).join(" · ") || "—";
  }
  if (kind === "corporal" || !st.weight_kg) return "corporal";
  return (kind === "lastre" ? "+" : kind === "asistido" ? "−" : "") + fmt(Math.abs(st.weight_kg), 1) + " kg";
}
function setShort(kind, st) {
  if (kind === "cardio" || kind === "tiempo") return setLoad(kind, st) + (st.reps ? " × " + st.reps : "");
  if (kind === "corporal" || !st.weight_kg) return (st.reps ?? "?") + " reps";
  return setLoad(kind, st) + " × " + (st.reps ?? "?");
}
function setBadge(st, n) { const t = SET_T[st.type]; return tip(h("span", { class: "setn " + (st.type || "normal") }, t ? t[0] : String(n)), t ? t[1] : "Serie efectiva " + n); }
// 1RM estimado con Epley (como Hevy), válido hasta 30 reps; a partir de ~12 reps es menos preciso.
// En ejercicios a un brazo/una mano las reps apuntadas son las de los dos lados: se usan la mitad.
// 1RM estimado EXACTAMENTE como Hevy: peso ÷ porcentaje según reps (tabla de su centro de ayuda; más de 30 reps = 50 %).
const HEVY_PCT = [1, .97, .94, .92, .89, .86, .83, .81, .78, .75, .73, .71, .70, .68, .67, .65, .64, .63, .61, .60, .59, .58, .57, .56, .55, .54, .53, .52, .51, .50];
// Ajustes por ejercicio (BD): material, peso de la máquina, polea que pesa la mitad, a un brazo.
const exSet = (name) => { const all = S.exSet || {}, k = exKeyName(name); return all[k] || Object.values(all).find((x) => baseKey(x.name) === k) || {}; };
const UNI_RX = /un brazo|una mano|jalon de remo/;
// A un brazo: apuntas el peso normal y las reps de los dos brazos sumadas → por brazo, la mitad.
const isUni = (name) => { if (!name) return false; const u = exSet(name).unilateral; return u != null ? !!u : UNI_RX.test(norm(name)); };
const loadRatio = (name) => (name && exSet(name).load_ratio) || 1;
// Peso de la máquina incluido en lo apuntado: el de la nota del ejercicio en Hevy («la máquina pesa 9kg») o el guardado en ajustes.
// Las barras (también la del Smith) forman parte del estándar y no se restan.
const NOTE_MK = /(?:m[aá]quina|carro|trineo|plataforma)\s+pesa\s+(\d+(?:[.,]\d+)?)\s*kg/i;
function machineKg(name, notes) {
  const m = notes && NOTE_MK.exec(notes);
  if (m) return parseFloat(m[1].replace(",", "."));
  return exSet(name).machine_kg || 0;
}
const e1rm = (w, r, name) => { if (!w || !r) return null; if (isUni(name)) r = Math.max(1, Math.round(r / 2)); return w / HEVY_PCT[Math.min(Math.round(r), 30) - 1]; };
const EX_ALIASES = { "elevacion laterales (maquina)": "elevacion lateral (maquina)", "flexiones de brazos (con peso agregado)": "flexiones (con peso anadido)", "dead hang": "colgado en barra",
  "vuelos posteriores": "aperturas invertidas", "vuelo posterior": "aperturas invertidas", "vuelos posteriores (maquina)": "aperturas invertidas", "vuelo posterior (maquina)": "aperturas invertidas", "vuelos posteriores en maquina": "aperturas invertidas", "vuelo posterior en maquina": "aperturas invertidas" };  // vuelos posteriores = aperturas invertidas (mismo ejercicio)
const baseKey = (name) => { const n = norm(name).replace(/\s+/g, " ").trim(); return EX_ALIASES[n] || n; };
// Ejercicios unidos por la persona (mismo ejercicio o misma máquina con otro nombre en Hevy): clave → clave del principal
let USER_ALIAS = {}, USER_NAMES = {};
const exKeyName = (name) => { const k = baseKey(name); return USER_ALIAS[k] || k; };
// Nombre con el que se muestra: el del ejercicio principal si está unido a otro
const dispName = (name) => USER_NAMES[exKeyName(name)] || name;
function setExSet(set) {
  S.exSet = set || {};
  USER_ALIAS = {}; USER_NAMES = {};
  for (const x of Object.values(S.exSet)) if (x.same_as) { USER_ALIAS[baseKey(x.name)] = baseKey(x.same_as); USER_NAMES[baseKey(x.same_as)] = x.same_as; }
  for (const k of Object.keys(USER_ALIAS)) { const seen = new Set([k]); while (USER_ALIAS[USER_ALIAS[k]] && !seen.has(USER_ALIAS[k])) { seen.add(USER_ALIAS[k]); USER_ALIAS[k] = USER_ALIAS[USER_ALIAS[k]]; } }
  // el ajuste (peso de la máquina…) del principal vale para sus alias
  for (const [a, k] of Object.entries(USER_ALIAS)) { const t = Object.values(S.exSet).find((x) => baseKey(x.name) === k); if (t) S.exSet[k] = t; }
}

// Métrica principal por tipo de ejercicio (para récords y gráficas)
function exMetric(kind) {
  return { peso: ["e1rm", "1RM estimado", "kg"], lastre: ["added", "Lastre máximo", "kg"], corporal: ["reps", "Máx. repeticiones", "reps"],
    asistido: ["reps", "Máx. repeticiones", "reps"], tiempo: ["secs", "Máx. tiempo", "s"], cardio: ["dist", "Máx. distancia", "m"] }[kind] || ["reps", "Repeticiones", ""];
}
const workSets = (sets) => { const w = sets.filter((s_) => s_.type !== "calentamiento"); return w.length ? w : sets; };
function sessionMetric(kind, sets, name) {
  const m = exMetric(kind)[0];
  let best = null;
  for (const s_ of workSets(sets)) {
    let v = null;
    if (m === "e1rm") v = e1rm(s_.weight_kg, s_.reps, name);
    else if (m === "added") v = s_.weight_kg || 0;
    else if (m === "reps") v = s_.reps;
    else if (m === "secs") v = s_.seconds;
    else if (m === "dist") v = s_.distance_m || s_.seconds;
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}
// Volumen como en Hevy: todas las series (calentamientos incluidos).
// Volumen como Hevy: fondos y dominadas con lastre cuentan (peso corporal + lastre) × reps; el resto, solo el peso apuntado
const fullBW = (name) => /fondo|dips?\b|dominada|pull.?up|chin.?up/.test(norm(name || "")) && !/banco|bench|asistid|assist|escapular/.test(norm(name || ""));
const volOf = (kind, sets, name, date) => {
  if (!["peso", "lastre"].includes(kind)) return 0;
  const bw = kind === "lastre" && fullBW(name) && date && typeof bwAt === "function" ? bwAt(date) || S.bw : null;
  return sets.reduce((a, s_) => a + ((bw || 0) + (s_.weight_kg || 0)) * (s_.reps || 0) * (bw || (s_.weight_kg || 0) > 0 ? 1 : 0), 0);
};
function metricTxt(kind, v) {
  if (v == null) return "—";
  const [m, , u] = exMetric(kind);
  if (m === "secs") return fmtSecs(v);
  if (m === "dist") return fmtDist(v);
  return (m === "added" ? "+" : "") + fmt(v, m === "e1rm" ? 1 : 0) + (u ? " " + u : "");
}

// ------------------------------------------------------------- niveles de fuerza
// Fuente: Strength Level (strengthlevel.com), tablas «By Bodyweight» de hombre y mujer, que sirve nuestro servidor desde su caché (/api/strength).
// Cada nivel = percentil entre los usuarios de ese sexo y peso: principiante 5 %, novato 20 %, intermedio 50 %, avanzado 80 %, élite 95 %.
// Valores = 1RM en kg (mancuernas: por mancuerna), reps máximas o lastre 1RM. Entre filas de la tabla se interpola por peso corporal;
// cada sesión se compara con el peso corporal de ese día (pesajes interpolados).
// «Leyenda» = top 1 % (percentil 99), extrapolado de la curva de Strength Level (no lo publican).
// Tablas de Strength Level: las sirve nuestro servidor desde su caché (descargadas de strengthlevel.com, que es la fuente).
const SL_TABLES = {}, SL_NAMES = {};
const LVL = ["Principiante", "Novato", "Intermedio", "Avanzado", "Élite", "Leyenda"];
const PCT = [5, 20, 50, 80, 95];
const STD = [
  // [regex, métrica, tabla de Strength Level (su página, + .reps / .add en peso corporal), tipos, máquina/polea]
  [/press de banca inclinado \(barra\)/, "1rm", "incline-bench-press", ["peso"]],
  [/press de banca inclinado \(mancuerna\)/, "db", "incline-dumbbell-bench-press", ["peso"]],
  [/press de banca \(mancuerna\)/, "db", "dumbbell-bench-press", ["peso"]],
  [/press de banca \((barra|maquina smith)\)/, "1rm", "bench-press", ["peso"]],
  [/press de (banca inclinado \(maquina|pecho)/, "1rm", "chest-press", ["peso"], true],
  [/^aperturas \(maquina\)|aperturas inclinadas \(maquina\)|mariposa|pec deck/, "1rm", "machine-chest-fly", ["peso"], true],
  [/press de hombros \(mancuerna\)/, "db", "dumbbell-shoulder-press", ["peso"]],
  [/press de hombros/, "1rm", "machine-shoulder-press", ["peso"], true],
  [/elevacion(es)? lateral(es)? \(mancuerna\)/, "db", "dumbbell-lateral-raise", ["peso"]],
  [/elevacion(es)? lateral(es)? \(maquina\)/, "1rm", "machine-lateral-raise", ["peso"], true],
  [/jalon al pecho/, "1rm", "lat-pulldown", ["peso"], true],
  [/remo sentado/, "1rm", "seated-cable-row", ["peso"], true],
  [/curl de biceps \(cable\)/, "1rm", "cable-bicep-curl", ["peso"], true],
  [/curl de biceps \(mancuerna\)/, "db", "dumbbell-curl", ["peso"]],
  [/curl martillo \(mancuerna\)/, "db", "dumbbell-hammer-curl", ["peso"]],
  [/curl predicador \(maquina\)|curl de biceps \(maquina\)|curl en maquina/, "1rm", "machine-bicep-curl", ["peso"], true],
  [/curl predicador/, "1rm", "preacher-curl", ["peso"], true],
  [/curl con barra/, "1rm", "barbell-curl", ["peso"]],
  [/triceps con polea|jalon de triceps/, "1rm", "tricep-pushdown", ["peso"], true],
  [/press de piernas/, "1rm", "leg-press", ["peso"], true],
  [/sentadilla hack/, "1rm", "hack-squat", ["peso"], true],
  [/extension de pierna/, "1rm", "leg-extension", ["peso"], true],
  [/curl de pierna sentado/, "1rm", "seated-leg-curl", ["peso"], true],
  [/aduccion/, "1rm", "hip-adduction", ["peso"], true],
  [/abduccion/, "1rm", "hip-abduction", ["peso"], true],
  [/gemelos sentado/, "1rm", "seated-calf-raise", ["peso"], true],
  [/gemelos de pie/, "1rm", "machine-calf-raise", ["peso"], true],
  [/^dominada \(con peso/, "add", "pull-ups.add", ["lastre"]],
  [/^dominadas?\b(?!.*una mano)/, "add", "pull-ups.add", ["asistido"]], [/^fondos?\b/, "add", "dips.add", ["asistido"]],  // asistidas: lastre negativo
  [/^fondos \(con peso/, "add", "dips.add", ["lastre"]],
  [/^muscle up \(con peso/, "add", "muscle-ups.add", ["lastre"]],
  [/^dominada$/, "reps", "pull-ups.reps", ["corporal"]],
  [/^fondos$/, "reps", "dips.reps", ["corporal"]],
  [/^muscle up$/, "reps", "muscle-ups.reps", ["corporal"]],
  [/^flexiones$/, "reps", "push-ups.reps", ["corporal"]],
  [/curl martillo \(cable\)/, "1rm", "cable-hammer-curl", ["peso"], true],
  [/chin up \(con peso|supinas? \(con peso/, "add", "chin-ups.add", ["lastre"]],
  [/chin up|dominadas? supinas?/, "reps", "chin-ups.reps", ["corporal"]],
  [/levantamiento de piernas en barra|hanging leg raise/, "reps", "hanging-leg-raise.reps", ["corporal"]],
  [/levantamiento de rodillas en barra|hanging knee raise/, "reps", "hanging-knee-raise.reps", ["corporal"]],
  [/curl de muneca palmas arriba|^curl de muneca \((barra|mancuerna)\)|wrist curl/, "1rm", "wrist-curl", ["peso"]],
  [/flexiones diamante|diamond push/, "reps", "diamond-push-ups.reps", ["corporal"]],
  [/flexion a una mano|one arm push/, "reps", "one-arm-push-ups.reps", ["corporal"]],
  [/^dominadas? a una mano$|^one arm pull ?ups?$/, "reps", "one-arm-pull-ups.reps", ["corporal"]],
  [/^sit ?ups?$/, "reps", "sit-ups.reps", ["corporal"]],
  [/^abdominal corto$|^crunch/, "reps", "crunches.reps", ["corporal"]],
  [/remo en t/, "1rm", "t-bar-row", ["peso"], true],
  [/^fondos? de triceps$|^fondos? en banco|bench dip/, "reps", "bench-dips.reps", ["corporal"]],
];
// Rango mínimo con 1 repetición estricta (por brazo) en habilidades raras: Strength Level solo compara con quien ya las registra.
// Dominada a una mano → Élite desde 1 rep y Leyenda desde lo que hace la mitad de quien la registra; muscle-up → Avanzado;
// flexión a una mano → Intermedio (según las clasificaciones habituales de calistenia).
// (min: rango con 1 rep; leg: índice del corte de Strength Level que pasa a ser Leyenda)
// (min: rango con 1 rep o con cualquier lastre; map: {rango nuestro: corte de Strength Level que se usa})
const SKILL_MIN = { "one-arm-pull-ups.reps": { min: 4, map: { 5: 2 } }, "muscle-ups.reps": { min: 3 }, "ring-muscle-ups.reps": { min: 3 },
  "muscle-ups.add": { min: 3, map: { 4: 3, 5: 4 } }, "one-arm-push-ups.reps": { min: 2 } };
// Habilidades sin tabla de Strength Level: cortes propios (segundos, estimación). Front lever completo: Élite al sostenerlo (desde 1 s), Leyenda desde 15 s.
const CUSTOM_SKILLS = [[/^front lever( sostenid[ao])?$/, "tiempo", "secs", { 4: 1, 5: 15 }, 4, "front-lever"]];
function customModel(cuts, f) {
  const all = [0, 0, 0, 0, 0, 0];
  for (let k = f; k < 6; k++) all[k] = cuts[k];
  for (let k = 0; k < f; k++) all[k] = 0.5 + (all[f] - 0.5) * k / f;
  const lg = (x) => Math.log(Math.max(0.5, x));
  return { all, off: 0, slope: (lg(all[5]) - lg(all[4])) / (Z[5] - Z[4]), metric: "secs", skill: f };
}
// Series que cuentan como estrictas según la nota («la última con goma», «las últimas dos con goma», «con una pierna»…)
function strictSets(sets, notes) {
  const t = norm(notes || "");
  if (/pierna|tuck|recogid|straddle|abiert/.test(t)) return [];
  const m = t.match(/(?:la|las) ultimas? ?(dos|tres|cuatro|\d)? ?con (goma|banda)/);
  if (m) { const n = { dos: 2, tres: 3, cuatro: 4 }[m[1]] || +m[1] || 1; return sets.slice(0, Math.max(0, sets.length - n)); }
  if (/goma|banda|asistid/.test(t) && !/sin (goma|banda)/.test(t)) return [];
  return sets;
}
// Percentil a partir de los cortes de Strength Level, interpolando en escala normal (z) con la carga en logaritmo.
// Principiante 5 % · Novato 20 % · Intermedio 50 % · Avanzado 80 % · Élite 95 % · Leyenda 99 % (top 1 %, extrapolado).
const Z = [-1.645, -0.8416, 0, 0.8416, 1.645, 2.326];
const PHI = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
// z (escala normal) de un valor según el modelo de cortes; la carga va en logaritmo.
function zOf(M, raw) {
  const lg = (x) => Math.log(Math.max(0.5, x)), A = M.all, val = raw + M.off;
  if (val <= A[0]) return Z[0] + (lg(val) - lg(A[0])) / ((lg(A[1]) - lg(A[0])) / (Z[1] - Z[0]));
  if (val >= A[5]) return Z[5] + (lg(val) - lg(A[5])) / M.slope;
  let i = 0; while (val >= A[i + 1]) i++;
  return Z[i] + (Z[i + 1] - Z[i]) * (lg(val) - lg(A[i])) / (lg(A[i + 1]) - lg(A[i]));
}
// Peso corporal en una fecha: pesajes del día; entre dos pesajes se interpola en línea recta; fuera de ellos, el más cercano.
function bwAt(d) {
  const W = S.weights || [];
  if (!W.length) return null;
  if (!d || d >= W[W.length - 1].date) return W[W.length - 1].kg;
  if (d <= W[0].date) return W[0].kg;
  let i = 0; while (W[i + 1].date < d) i++;
  const A = W[i], B = W[i + 1]; if (B.date === d) return B.kg;
  const t = (Date.parse(d) - Date.parse(A.date)) / (Date.parse(B.date) - Date.parse(A.date));
  return A.kg + (B.kg - A.kg) * t;
}
function bwExact(d) { return (S.weights || []).some((w) => w.date === d); }
const sexKey = () => (S.sex === "M" ? "M" : "H");
const sexWord = () => (S.sex === "M" ? "mujeres" : "hombres");
// Cortes [principiante…élite] para un peso corporal, interpolando entre filas de la tabla (fuera del rango, la fila extrema).
function slCuts(slug, bw, sx) {
  const T = SL_TABLES[slug] && SL_TABLES[slug][sx || sexKey()];
  if (!T || !bw) return null;
  if (bw <= T[0][0]) return T[0].slice(1);
  if (bw >= T[T.length - 1][0]) return T[T.length - 1].slice(1);
  let i = 0; while (T[i + 1][0] < bw) i++;
  const t = (bw - T[i][0]) / (T[i + 1][0] - T[i][0]);
  return T[i].slice(1).map((v, k) => v + (T[i + 1][k + 1] - v) * t);
}
function slModel(slug, metric, bw) { return slModelSx(slug, metric, bw, sexKey()); }
function slModelSx(slug, metric, bw, sx) {
  const base = slCuts(slug, bw, sx); if (!base) return null;
  // Para «lastre» se trabaja con carga total (peso corporal + lastre); para el resto, con el valor tal cual.
  const off = metric === "add" ? bw : 0;
  const pts = base.map((x) => Math.max(0.5, x + off));
  for (let k = 1; k < pts.length; k++) if (pts[k] <= pts[k - 1]) pts[k] = pts[k - 1] * 1.05;
  const lg = (x) => Math.log(Math.max(0.5, x));
  const slope = (lg(pts[4]) - lg(pts[3])) / (Z[4] - Z[3]);
  const legend = Math.exp(lg(pts[4]) + slope * (Z[5] - Z[4]));
  const sk = SKILL_MIN[slug];
  if (sk) { // los rangos por debajo del mínimo quedan antes de «1 rep» (o de «algo de lastre»): o la haces o no
    const all = [...pts, legend], f = sk.min, one = metric === "add" ? off + 0.5 : 1, low = metric === "add" ? off * 0.9 : 0.5;
    for (const [k, v] of Object.entries(sk.map || {})) all[+k] = pts[v];
    for (let k = 0; k < f; k++) all[k] = low + (one - low) * k / f;
    all[f] = one;
    for (let k = f + 1; k < 6; k++) if (all[k] <= all[k - 1]) all[k] = all[k - 1] + 1;
    const lg2 = (x) => Math.log(Math.max(0.5, x));
    return { all, off, slope: (lg2(all[5]) - lg2(all[4])) / (Z[5] - Z[4]), metric, skill: f };
  }
  return { all: [...pts, legend], off, slope, metric };
}
// bw: número (peso fijo) o función fecha → peso (cada sesión con el peso de ese día).
function exLevel(e, bw) {
  const n = exKeyName(e.name), cfg = exSet(e.name);
  let sd = null;
  if (cfg.sl_slug) { // tabla elegida para este ejercicio
    const metric = e.kind === "corporal" ? "reps" : e.kind === "lastre" ? "add" : cfg.equipment === "mancuerna" ? "db" : "1rm";
    const key = cfg.sl_slug + (metric === "reps" ? ".reps" : metric === "add" ? ".add" : "");
    if (SL_TABLES[key]) sd = [null, metric, key, [e.kind], ["maquina", "discos", "polea", "cable"].includes(cfg.equipment)];
  }
  const cs = !sd && CUSTOM_SKILLS.find(([rx, k]) => rx.test(n) && k === e.kind);
  if (cs) sd = [null, cs[2], cs[5], [e.kind], false];
  sd = sd || STD.find(([rx, , , kinds]) => rx.test(n) && kinds.includes(e.kind));
  if (!sd) return null;
  const [, metric, slug, , machine] = sd;
  const bwFn = typeof bw === "function" ? bw : () => bw;
  const ratio = loadRatio(e.name);
  let best = null;
  for (const x of e.sessions) {
    const b = bwFn(x.date); if (!b) continue;
    const model = cs ? customModel(cs[3], cs[4]) : slModel(slug, metric, b); if (!model) continue;
    const mk = machineKg(e.name, x.notes);
    for (const s_ of cs ? strictSets(workSets(x.sets), x.notes) : workSets(x.sets)) {
      let v = null;
      // Lo apuntado incluye el peso de la máquina: para comparar con los estándares se usa solo lo cargado.
      if (metric === "1rm" || metric === "db") { const w = s_.weight_kg != null ? s_.weight_kg - mk : null; v = w > 0 ? e1rm(w, s_.reps, e.name) : null; if (v != null) v *= ratio; if (v != null && metric === "db") v /= 2; }
      else if (metric === "add") v = s_.reps && s_.weight_kg != null && (s_.weight_kg > 0 || (e.kind === "asistido" && s_.weight_kg < 0 && b + s_.weight_kg > 0)) ? (b + s_.weight_kg) / HEVY_PCT[Math.min(s_.reps, 30) - 1] - b : null;
      else if (metric === "secs") v = s_.seconds || null;
      // a una mano: reps de los dos lados → por brazo (salvo «solo derecha/izquierda» en la nota: son las de ese brazo)
      else v = s_.reps && isUni(e.name) && !/solo (con )?(el |la )?(brazo |mano )?(derech|izquierd)/.test(norm(x.notes || "")) ? Math.ceil(s_.reps / 2) : s_.reps;
      if (v == null) continue;
      const z = zOf(model, v);
      if (!best || z > best.z) best = { z, v, s_, b, model, date: x.date };
    }
  }
  if (!best) return null;
  const { z, v: raw, s_: rawSet, b: bwUsed, model } = best;
  let pct = Math.min(99.9, Math.max(0.1, PHI(z) * 100));
  const cuts = model.all.slice(1).map((x) => x - model.off); // novato, intermedio, avanzado, élite, leyenda (en las unidades del valor)
  let idx = 0; while (idx < cuts.length && raw >= cuts[idx]) idx++;
  const floor = model.skill || null;  // habilidad rara: rango mínimo con 1 rep (ver SKILL_MIN)
  const lo = idx ? cuts[idx - 1] : 0, hi = cuts[idx];
  const frac = hi == null ? 1 : Math.max(0, Math.min(1, (raw - lo) / (hi - lo)));
  const need = hi == null ? null : `${metric === "reps" ? "+" + Math.ceil(hi - raw) + " reps" : metric === "secs" ? "+" + Math.ceil(hi - raw) + " s" : "+" + fmt(Math.max(1, hi - raw)) + " kg de 1RM" + (metric === "db" ? " por mancuerna" : "")} para ${LVL[idx + 1]}`;
  const valTxt = metric === "1rm" ? `1RM ≈ ${fmt(raw)} kg` + (ratio !== 1 ? ` (polea × ${fmt(ratio, 2)})` : "") : metric === "db" ? `1RM ≈ ${fmt(raw)} kg por mancuerna (${fmt(raw * 2)} kg las dos)`
    : metric === "add" ? (raw >= 0 ? `lastre 1RM ≈ +${fmt(raw)} kg` : `asistencia 1RM ≈ ${fmt(-raw)} kg`) : metric === "secs" ? `${fmt(raw)} s aguantando (estricto)` : `${raw} reps seguidas`;
  const cutsTxt = `Cortes para ${sexWord()} de ${fmt(bwUsed, 1)} kg: ` + cuts.map((x, i) => `${LVL[i + 1]} ${metric === "reps" ? Math.round(x) : (metric === "add" && x > 0 ? "+" : "") + fmt(x)}`).join(" · ");
  return { idx, frac, score: idx + frac, raw, pct, z, metric, need, floor, slug, valTxt, cutsTxt, cuts, rawSet, machine: !!machine, solid: true, model, bw: bwUsed, date: best.date, name: e.name };
}
// Paleta de rangos: cobre → plata → oro → esmeralda → diamante → mítico
const TIER = [["Principiante", "Cobre", ["#e0a070", "#9c5a2c", "#6e3a17"]], ["Novato", "Plata", ["#f1f4f8", "#aab4bf", "#6f7a86"]],
  ["Intermedio", "Oro", ["#ffe79a", "#e0a915", "#9a6c00"]], ["Avanzado", "Esmeralda", ["#9ff0c4", "#18b46b", "#0b6e40"]],
  ["Élite", "Diamante", ["#d9fbff", "#5cc8f5", "#4a5ee8"]], ["Leyenda", "Mítico", ["#ffd36b", "#ff5f6d", "#8e3cf0"]]];
let TIER_DEFS = false;
function ensureTierDefs() {
  if (TIER_DEFS) return; TIER_DEFS = true;
  const svg = svgEl("svg", { width: 0, height: 0, style: "position:absolute", "aria-hidden": "true" });
  const defs = svgEl("defs", {});
  TIER.forEach(([, , [a, b, c]], i) => {
    const g = svgEl("linearGradient", { id: "tg" + i, x1: "0", y1: "0", x2: "1", y2: "1" });
    g.append(svgEl("stop", { offset: "0", "stop-color": a }), svgEl("stop", { offset: ".55", "stop-color": b }), svgEl("stop", { offset: "1", "stop-color": c }));
    const g2 = svgEl("linearGradient", { id: "tgd" + i, x1: "0", y1: "0", x2: "0", y2: "1" });
    g2.append(svgEl("stop", { offset: "0", "stop-color": c }), svgEl("stop", { offset: "1", "stop-color": b }));
    defs.append(g, g2);
  });
  svg.append(defs);
  document.body.append(svg);
}
// Emblema tipo «rango»: escudo con el color del nivel y tantas marcas como nivel.
function lvlBadge(idx, size = 30) {
  ensureTierDefs();
  const svg = svgEl("svg", { viewBox: "0 0 32 36", width: size, height: size * 36 / 32, class: "badge t" + idx });
  svg.append(svgEl("path", { d: "M16 1.5 29 6v11c0 8.5-5.6 14.4-13 17.5C8.6 31.4 3 25.5 3 17V6z", class: "bs", fill: `url(#tgd${idx})` }),
    svgEl("path", { d: "M16 5 25.5 8.4v8.4c0 6.4-4.1 11-9.5 13.5-5.4-2.5-9.5-7.1-9.5-13.5V8.4z", class: "bi", fill: `url(#tg${idx})` }),
    svgEl("path", { d: "M16 5 25.5 8.4v3.2C20 13 12 13 6.5 11.6V8.4z", class: "shine" }));
  if (idx === 5) svg.append(svgEl("path", { d: "M16 9.5l2.1 4.4 4.8.6-3.5 3.3.9 4.8-4.3-2.3-4.3 2.3.9-4.8-3.5-3.3 4.8-.6z", class: "bm" }));
  else for (let i = 0; i <= idx; i++) svg.append(svgEl("path", { d: `M10.5 ${22 - i * 3.6}l5.5-3 5.5 3`, class: "bm" }));
  return svg;
}
// En listas, solo el escudo (con su nombre y datos al pasar el ratón); el nombre del rango, en la ficha del ejercicio
function lvlShield(L, size = 20) {
  if (!L) return null;
  const pill = lvlPill(L);
  return tip(h("span", { class: "lvsh click", onclick: (ev) => { ev.stopPropagation(); levelSheet(L.name, L); } }, lvlBadge(L.idx, size)), pill.getAttribute("data-tip"));
}
function lvlPill(L) {
  if (!L) return null;
  const u = L.metric === "reps" ? " reps" : " kg", sg = (x) => (L.metric === "add" && x > 0 ? "+" : "") + fmt(x) + u;
  const lines = [`${LVL[L.idx]} · ${TIER[L.idx][1]} · ${topTxt(L.pct)}`, `Más fuerte que el ${fmt(L.pct)} % de los ${sexWord()} de ${fmt(L.bw, 1)} kg` + (L.date ? ` (tu peso el ${dateLabel(L.date, { day: "numeric", month: "short" })})` : ""),
    "## Tu marca", L.valTxt, L.need ? "Siguiente | " + L.need.replace(/ para .*/, "") + " → " + LVL[L.idx + 1] : "Rango máximo",
    "## Cortes", ...L.cuts.map((c, i) => `${LVL[i + 1]} | ${sg(c)}`)];
  lines.push("Pulsa para ver la curva");
  return tip(h("span", { class: "lvl l" + L.idx + " click", onclick: (ev) => { ev.stopPropagation(); levelSheet(L.name, L); } }, LVL[L.idx]), lines.join("\n"));
}
// Una sola barra del color del rango: cuánto llevas hacia el siguiente
function lvlBar(L, withText) {
  const top = L.idx === 5, w = top ? 100 : Math.max(3, Math.min(100, (L.frac || 0) * 100));
  const bar = h("div", { class: "lbar1" }, h("i", { style: { width: w + "%", background: `linear-gradient(90deg, ${TIER[L.idx][2][0]}, ${TIER[L.idx][2][1]})` } }));
  if (!withText) return bar;
  return h("div", { class: "lbar1w" }, bar, h("span", null, top ? "Rango máximo" : `${fmt(w)} % hacia ${LVL[L.idx + 1]}`));
}

// ------------------------------------------------------------- estadísticas
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00") - Date.parse(a + "T12:00")) / 864e5);
const mondayOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return isoLocal(dt); };
const MAIN_GROUPS = ["Pecho", "Espalda", "Pierna", "Hombro", "Brazos", "Core"];

// Récords como en Hevy: varias métricas por ejercicio según su tipo.
const REC_LABEL = { w: "Peso máximo", e1: "1RM estimado", sv: "Volumen (mejor serie)", vol: "Volumen de sesión", reps: "Máx. repeticiones",
  sreps: "Reps en una sesión", secs: "Máx. tiempo", stime: "Tiempo en una sesión", dist: "Máx. distancia" };
// Récords que avisan con trofeo (como Hevy): 1RM, peso máximo y mejor serie (volumen); en peso corporal, reps; tiempo; distancia.
// El volumen de la sesión y las reps de una sesión se ven en la ficha, pero no dan trofeo.
const TROPHY = ["e1", "w", "sv", "reps", "secs", "dist"];
const REC_KINDS = { peso: ["e1", "w", "sv"], lastre: ["w", "sv", "vol"], corporal: ["reps", "sreps"], asistido: ["reps", "sreps"],
  tiempo: ["secs", "stime"], cardio: ["dist", "w"] };
function recsOf(kind, sets, name, date) {
  const ws_ = workSets(sets), r = {};
  const up = (k, v, st) => { if (v != null && v > 0 && (r[k] == null || v > r[k].v)) r[k] = { v, set: st }; };
  for (const st of ws_) {
    up("w", st.weight_kg, st); up("e1", kind === "peso" ? e1rm(st.weight_kg, st.reps, name) : null, st);
    up("sv", kind === "lastre" ? volOf(kind, [st], name, date) : (st.weight_kg || 0) * (st.reps || 0), st); up("reps", st.reps, st); up("secs", st.seconds, st); up("dist", st.distance_m, st);
  }
  const vol = volOf(kind, sets, name, date); if (vol) r.vol = { v: vol };
  const sr = ws_.reduce((a, st) => a + (st.reps || 0), 0); if (sr) r.sreps = { v: sr };
  const stt = ws_.reduce((a, st) => a + (st.seconds || 0), 0); if (stt) r.stime = { v: stt };
  return r;
}
function recTxt(t, v, kind) {
  if (v == null) return "—";
  if (t === "secs" || t === "stime") return fmtSecs(v);
  if (t === "dist") return fmtDist(v);
  if (t === "reps" || t === "sreps") return fmt(v) + " reps";
  return (t === "w" && kind === "lastre" ? "+" : "") + fmt(v, t === "e1" ? 1 : v < 100 ? 1 : 0) + " kg";
}

function trainingStats(ws, bw) {
  const asc = [...ws].sort((a, b) => (a.date + (a.start_time || "")).localeCompare(b.date + (b.start_time || "")));
  const exs = {}, prs = [];
  for (const w of asc) {
    for (const ex of w.exercises) {
      const k = exKeyName(ex.name);
      const e = exs[k] || (exs[k] = { name: ex.name, kind: ex.kind, sessions: [], best: null, last: null, rec: {} });
      const metric = sessionMetric(ex.kind, ex.sets, ex.name);
      if (metric != null && (e.best == null || metric > e.best)) { e.best = metric; e.bestDate = w.date; }
      const rs = recsOf(ex.kind, ex.sets, ex.name, w.date);
      for (const t of REC_KINDS[ex.kind] || []) {
        const x = rs[t]; if (!x) continue;
        const old = e.rec[t];
        if (old && x.v > old.v + 1e-9) prs.push({ date: w.date, name: ex.name, kind: ex.kind, type: t, value: x.v, prev: old.v, set: x.set, wid: w.id });
        if (!old || x.v > old.v + 1e-9) e.rec[t] = { v: x.v, date: w.date, set: x.set, wid: w.id };
      }
      e.sessions.push({ date: w.date, wid: w.id, metric, vol: volOf(ex.kind, ex.sets, ex.name, w.date), sets: ex.sets, notes: ex.notes, rs, prs: ex.prs || [] });
      e.last = w.date; e.name = USER_NAMES[k] || ex.name;
    }
  }
  const list = Object.values(exs);
  for (const e of list) e.level = exLevel(e, bwAt);
  // Subidas de rango: la sesión en la que el ejercicio pasa a un rango mejor que el mejor que tenía
  const ups = [];
  for (const e of list) {
    if (!e.level) continue;
    let best = null;
    for (const x of e.sessions) {
      const Li = exLevel({ name: e.name, kind: e.kind, sessions: [x] }, bwAt);
      if (!Li) continue;
      if (best != null && Li.idx > best) ups.push({ date: x.date, wid: x.wid, name: e.name, kind: e.kind, from: best, to: Li.idx, L: Li });
      if (best == null || Li.idx > best) best = Li.idx;
    }
  }
  ups.sort((a, b) => b.date.localeCompare(a.date));
  // racha: semanas seguidas (la actual cuenta si ya hay entreno; si no, se mira desde la anterior)
  const weeksWith = new Set(ws.map((w) => mondayOf(w.date)));
  let streak = 0, wk = mondayOf(todayISO());
  if (!weeksWith.has(wk)) wk = addDays(wk, -7);
  while (weeksWith.has(wk)) { streak++; wk = addDays(wk, -7); }
  return { list, prs: prs.reverse(), ups, streak, first: asc.length ? asc[0].date : todayISO(),
    byDate: ws.reduce((m, w) => { (m[w.date] = m[w.date] || []).push(w); return m; }, {}) };
}

// Periodos: una semana, un mes, un año concretos (con ‹ › para moverse) o todo. Se compara con el mismo tramo del periodo anterior.
const GRANS = [["semana", "Semana"], ["mes", "Mes"], ["año", "Año"], ["todo", "Todo"]];
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function periodRange(gran, off, st) {
  const today = todayISO();
  if (gran === "todo") return { key: "todo", gran, off: 0, from: st.first, to: today, end: today, days: daysBetween(st.first, today) + 1, label: "Desde siempre", all: true };
  let from, end, label, prevFrom, prevEnd, prevLabel;
  if (gran === "semana") {
    from = addDays(mondayOf(today), 7 * off); end = addDays(from, 6);
    label = off === 0 ? "Esta semana" : off === -1 ? "La semana pasada" : "Semana del " + dateLabel(from, { day: "numeric", month: "short" });
    prevFrom = addDays(from, -7); prevEnd = addDays(end, -7); prevLabel = "la semana anterior";
  } else if (gran === "mes") {
    const [y, m] = today.split("-").map(Number), d0 = new Date(y, m - 1 + off, 1);
    from = isoLocal(d0); end = isoLocal(new Date(d0.getFullYear(), d0.getMonth() + 1, 0));
    label = cap1(d0.toLocaleDateString("es-ES", { month: "long", year: "numeric" }));
    prevFrom = isoLocal(new Date(d0.getFullYear(), d0.getMonth() - 1, 1)); prevEnd = isoLocal(new Date(d0.getFullYear(), d0.getMonth(), 0)); prevLabel = "el mes anterior";
  } else {
    const y = Number(today.slice(0, 4)) + off; from = `${y}-01-01`; end = `${y}-12-31`; label = String(y);
    prevFrom = `${y - 1}-01-01`; prevEnd = `${y - 1}-12-31`; prevLabel = "el año anterior";
  }
  const to = end > today ? today : end, days = daysBetween(from, to) + 1;
  const prevTo = addDays(prevFrom, days - 1) > prevEnd ? prevEnd : addDays(prevFrom, days - 1);  // mismo tramo: si el periodo va por la mitad, se compara con la misma mitad
  return { key: gran, gran, off, from, to, end, days, label, prevFrom, prevTo, prevLabel: (to < end ? "el mismo tramo de " : "") + prevLabel, canNext: end < today, canPrev: from > st.first };
}
function periodStats(st, ws, R) {
  const inR = (d) => d >= R.from && d <= R.to;
  const L = ws.filter((w) => inR(w.date));
  const agg = (X) => ({ n: X.length, min: X.reduce((a, w) => a + (w.duration_min || 0), 0), vol: X.reduce((a, w) => a + (w.volume_kg || 0), 0), sets: X.reduce((a, w) => a + w.sets_count, 0) });
  const cur = agg(L);
  const prev = R.all || R.prevTo < st.first ? null : agg(ws.filter((w) => w.date >= R.prevFrom && w.date <= R.prevTo));  // sin datos del periodo anterior, no hay comparación
  const groups = Object.fromEntries(MAIN_GROUPS.map((g) => [g, 0]));
  const exN = {};
  for (const w of L) for (const ex of w.exercises) {
    const g = exGroup(ex.name); groups[g] = (groups[g] || 0) + ex.sets.filter((s_) => s_.type !== "calentamiento").length;
    const k = exKeyName(ex.name); exN[k] = (exN[k] || 0) + 1;
  }
  if (!groups.Cardio) delete groups.Cardio;
  if (!groups.Otros) delete groups.Otros;
  const top = st.list.filter((e) => exN[exKeyName(e.name)]).map((e) => ({ e, n: exN[exKeyName(e.name)] })).sort((a, b) => b.n - a.n);
  // cubetas para las barras
  const gran = R.gran === "semana" || R.gran === "mes" ? "day" : R.gran === "año" ? "month" : R.days <= 120 ? "week" : "month";
  const buckets = [], bi = {};
  const keyOf = (d) => (gran === "day" ? d : gran === "week" ? mondayOf(d) : d.slice(0, 7) + "-01");
  let k = keyOf(R.from);
  while (k <= R.to) {
    bi[k] = buckets.length; buckets.push({ k, n: 0, vol: 0, min: 0, sets: 0 });
    if (gran === "day") k = addDays(k, 1); else if (gran === "week") k = addDays(k, 7);
    else { const [y, m] = k.split("-").map(Number); k = isoLocal(new Date(y, m, 1)); }
  }
  for (const w of L) { const b = buckets[bi[keyOf(w.date)]]; if (b) { b.n++; b.vol += w.volume_kg || 0; b.min += w.duration_min || 0; b.sets += w.sets_count; } }
  const bLabel = (b) => (gran === "day" ? dateLabel(b.k, { weekday: "short", day: "numeric", month: "short" }) : gran === "week" ? "Semana del " + dateLabel(b.k, { day: "numeric", month: "short" }) : dateLabel(b.k, { month: "long", year: "numeric" }));
  const weeks = Math.max(1, R.days / 7);
  return { L, cur, prev, groups, top, buckets, gran, bLabel, perWeek: cur.n / weeks, prs: st.prs.filter((p) => inR(p.date) && TROPHY.includes(p.type)), ups: (st.ups || []).filter((u) => inR(u.date)) };
}

// --------------------------------------------------------------- gráficas
const NS_ = "http://www.w3.org/2000/svg";
const svgEl = (t, a) => { const e = document.createElementNS(NS_, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
// Línea con área; al pasar el ratón muestra el punto más cercano con su dato.
function miniLine(points, opts = {}) {
  const W = opts.w || Math.max(280, Math.min(700, window.innerWidth - 72)), H = opts.h || 160, P = 8, L = opts.axis ? 38 : P, B = opts.axis ? 20 : P;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "mchart line" });
  const vals = points.map((p) => p.v).filter((x) => x != null);
  if (vals.length < 2) { const t = svgEl("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "axis" }); t.textContent = "Faltan sesiones para la gráfica"; svg.append(t); return svg; }
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi === lo) { hi += 1; lo -= 1; } const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const x = (i) => L + (i * (W - L - P)) / (points.length - 1), y = (v) => P + ((hi - v) * (H - P - B)) / (hi - lo);
  const fv = opts.fmtV || ((v) => fmt(v, 1));
  if (opts.axis) for (const g of [lo + pad, (lo + hi) / 2, hi - pad]) {
    svg.append(svgEl("line", { x1: L, x2: W - P, y1: y(g), y2: y(g), class: "grid" }));
    const t = svgEl("text", { x: L - 6, y: y(g) + 4, "text-anchor": "end", class: "axis" }); t.textContent = opts.axisFmt ? opts.axisFmt(g) : fmt(g, g < 20 ? 1 : 0); svg.append(t);
  }
  let d = "";
  points.forEach((p, i) => { if (p.v == null) return; d += (d ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1); });
  const firstI = points.findIndex((p) => p.v != null);
  let lastI = points.length - 1; while (points[lastI].v == null) lastI--;
  svg.append(svgEl("path", { d: d + `L${x(lastI)} ${H - B}L${x(firstI)} ${H - B}Z`, class: "area" }), svgEl("path", { d, class: "ln" }));
  const mx = Math.max(...vals);
  points.forEach((p, i) => { if (p.v == null) return; svg.append(svgEl("circle", { cx: x(i), cy: y(p.v), r: p.v === mx ? 3.8 : 2.4, class: p.v === mx ? "dot best" : "dot" })); });
  if (opts.axis) for (const i of [firstI, lastI]) { const t = svgEl("text", { x: x(i), y: H - 5, "text-anchor": i === firstI ? "start" : "end", class: "axis" }); t.textContent = points[i].label; svg.append(t); }
  // interacción
  const guide = svgEl("line", { y1: P, y2: H - B, class: "guide", style: "display:none" });
  const hov = svgEl("circle", { r: 5, class: "hov", style: "display:none" });
  const hit = svgEl("rect", { x: L, y: 0, width: W - L, height: H, fill: "transparent" });
  svg.append(guide, hov, hit);
  const move = (e) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    let i = Math.round(((q.x - L) / (W - L - P)) * (points.length - 1)); i = Math.max(0, Math.min(points.length - 1, i));
    let j = i, k2 = i; while (j >= 0 && points[j].v == null) j--; while (k2 < points.length && points[k2].v == null) k2++;
    i = j < 0 ? k2 : k2 >= points.length ? j : i - j <= k2 - i ? j : k2;
    const p = points[i];
    guide.setAttribute("x1", x(i)); guide.setAttribute("x2", x(i)); guide.style.display = "";
    hov.setAttribute("cx", x(i)); hov.setAttribute("cy", y(p.v)); hov.style.display = "";
    showTip(p.tip || `${p.label}\n${fv(p.v)}`, e.clientX, e.clientY);
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { guide.style.display = "none"; hov.style.display = "none"; hideTip(); });
  return svg;
}
function bars(values, opts = {}) {
  const W = opts.w || 600, H = opts.h || 110, n = values.length, gap = n > 40 ? 1.5 : n > 20 ? 3 : 5, bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...values.map((v) => v.v));
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "mchart bars", preserveAspectRatio: "none" });
  values.forEach((v, i) => {
    const hh = Math.max(v.v ? 3 : 1.5, ((H - 2) * v.v) / max);
    const g = svgEl("g", { "data-tip": v.label, class: "bg" });
    g.append(svgEl("rect", { x: i * (bw + gap) - gap / 2, y: 0, width: bw + gap, height: H, fill: "transparent" }),
      svgEl("rect", { x: i * (bw + gap), y: H - hh, width: bw, height: hh, rx: Math.min(4, bw / 3), class: v.v ? (i === n - 1 ? "b now" : "b") : "b zero" }));
    svg.append(g);
  });
  return svg;
}
// Mapa de actividad: un año o todo (semanas en columnas; si no cabe, se desliza y empieza por lo último)
function heatmap(byDate, from, to) {
  const avail = Math.max(280, Math.min(728, window.innerWidth - 66));
  const t0d = mondayOf(from), weeks = Math.floor(daysBetween(t0d, to) / 7) + 1, today = todayISO();
  const gap = 3, cell = Math.max(11, Math.min(20, Math.floor(avail / weeks) - gap)), W = weeks * (cell + gap), H = 7 * (cell + gap);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H + 14}`, width: W, height: H + 14, class: "heat" });
  let lastMonth = -1;
  for (let wk = 0; wk < weeks; wk++) for (let dd = 0; dd < 7; dd++) {
    const iso = addDays(t0d, wk * 7 + dd);
    if (iso > today || iso > to || iso < from) continue;
    svg.append(heatCell(byDate, iso, wk * (cell + gap), 14 + dd * (cell + gap), cell));
    const mo = Number(iso.slice(5, 7));
    if (mo !== lastMonth && Number(iso.slice(8)) <= 7) { lastMonth = mo; const t = svgEl("text", { x: wk * (cell + gap), y: 10, class: "axis" }); t.textContent = dateLabel(iso, { month: "short" }); svg.append(t); }
  }
  const wrap = h("div", { class: "heat-wrap" }, svg);
  if (W > avail) requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
  return wrap;
}
function heatCell(byDate, iso, x, y, cell, num) {
  const ws = byDate[iso] || []; const vol = ws.reduce((a, w) => a + (w.volume_kg || 0) + (w.duration_min || 0) * 30, 0);
  const lvl = !ws.length ? 0 : vol > 12000 ? 4 : vol > 7000 ? 3 : vol > 3000 ? 2 : 1;
  const g = svgEl("g", { "data-tip": dateLabel(iso, { weekday: "long", day: "numeric", month: "short" }) + (ws.length ? "\n" + ws.map((w) => `${w.title} · ${w.duration_min ? fmt(w.duration_min) + " min · " : ""}${fmt(w.volume_kg)} kg`).join("\n") : "\nDescanso") });
  g.append(svgEl("rect", { x, y, width: cell, height: cell, rx: Math.min(8, cell / 5), class: "h" + lvl }));
  if (num) { const t = svgEl("text", { x: x + cell / 2, y: y + cell / 2 + 4, "text-anchor": "middle", class: "hnum" + (lvl >= 2 ? " on" : "") }); t.textContent = String(Number(iso.slice(8))); g.append(t); }
  if (ws.length) { g.style.cursor = "pointer"; g.addEventListener("click", () => workoutSheet(ws[0].id)); }
  return g;
}
// Un mes como calendario (lunes a domingo), con el número de cada día
function monthCal(byDate, from, end) {
  const avail = Math.max(280, Math.min(520, window.innerWidth - 66)), gap = 5, cell = Math.min(52, Math.floor((avail - 6 * gap) / 7));
  const t0d = mondayOf(from), weeks = Math.floor(daysBetween(t0d, end) / 7) + 1, W = 7 * cell + 6 * gap, H = weeks * (cell + gap) + 16;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "heat cal" });
  "LMXJVSD".split("").forEach((d, i) => { const t = svgEl("text", { x: i * (cell + gap) + cell / 2, y: 11, "text-anchor": "middle", class: "axis" }); t.textContent = d; svg.append(t); });
  for (let wk = 0; wk < weeks; wk++) for (let dd = 0; dd < 7; dd++) {
    const iso = addDays(t0d, wk * 7 + dd);
    if (iso < from || iso > end) continue;
    const c = heatCell(byDate, iso, dd * (cell + gap), 16 + wk * (cell + gap), cell, true);
    if (iso > todayISO()) c.setAttribute("opacity", ".35");
    svg.append(c);
  }
  return h("div", { class: "heat-wrap cal" }, svg);
}

// ------------------------------------------------------------- vista
function viewTraining() {
  const T = S.training; if (!T) return h("div");
  S.tTab = S.tTab || "resumen"; S.tGran = S.tGran || "mes"; S.tOff = S.tOff || 0;
  const ws = T.workouts;
  const head = h("div", { class: "row wrap", style: { marginBottom: "12px" } }, h("h2", { class: "vt" }, "Entreno"), h("span", { class: "grow" }),
    tip(h("button", { class: "btn sm ghost", onclick: () => importCsv() }, "Subir CSV de Hevy"), "Subir CSV de Hevy\nTrae de golpe los entrenos que falten: no duplica\n## Cómo sacarlo\nHevy → Perfil → ⚙ Ajustes → Exportar e importar datos → Exportar entrenos"));
  if (!ws.length) return h("div", { class: "training" }, head, h("div", { class: "card empty" }, icon("dumbbell"), h("h3", null, "Aún no hay entrenos"),
    h("p", { class: "muted" }, "Dime «entreno hecho» por el chat y lo traigo de Hevy, o importa el CSV de Hevy.")));
  const st = S.tStats && S.tStats._src === ws && S.tStats._bw === S.weights && S.tStats._set === S.exSet ? S.tStats : (S.tStats = Object.assign(trainingStats(ws, S.bw), { _src: ws, _bw: S.weights, _set: S.exSet }));
  const tabs = h("div", { class: "seg tabs2" }, [["resumen", "Resumen"], ["historial", "Historial"], ["ejercicios", "Ejercicios"], ["records", "Récords"], ["nivel", "Nivel"]]
    .map(([k, l]) => h("button", { class: S.tTab === k ? "on" : "", onclick: () => { S.tTab = k; render(); } }, l)));
  const body = { resumen: tResumen, historial: tHistorial, ejercicios: tEjercicios, records: tRecords, nivel: tNivel }[S.tTab](st, ws);
  return h("div", { class: "training" }, head, tabs, body);
}

// Diseño B: cada cifra con su icono de color (mismo estilo que Peso/Pasos/Entreno en Hoy)
const KPI_ICON = { "Entrenos": ["🏋️", "e"], "Tiempo": ["⏱️", "s"], "Volumen": ["📦", "w"], "Series": ["🔁", "e"], "Racha": ["🔥", "c"],
  "Sesiones": ["📅", "e"], "Última": ["🕒", "s"], "Reps totales": ["🔢", "w"], "Volumen total": ["📦", "w"], "Media reps": ["🔢", "w"],
  "Último peso": ["⚖️", "w"], "Media 7 días": ["📉", "w"], "Ingesta media 7 d": ["🍽️", "c"], "Mantenimiento observado": ["🔥", "e"],
  "Récords": ["🏆", "c"], "Más trabajado": ["💪", "e"], "Menos trabajado": ["🪫", "s"], "Tu punto fuerte": ["⭐", "c"] };
const kpiLbl = (l) => { const ic = KPI_ICON[l]; return ic ? [h("span", { class: "sic " + ic[1] }, ic[0]), l] : l; };
function kpi(l, v, s, delta, tipTxt) {
  return tip(h("div", { class: "kpi" }, h("div", { class: "l" }, kpiLbl(l)),
    h("div", { class: "v num" }, h("span", { class: "vv" }, v), delta && delta.t ? h("span", { class: "dl " + (delta.v > 0 ? "up" : delta.v < 0 ? "down" : "") }, delta.t) : null),
    h("div", { class: "s" }, s || "")), tipTxt);
}
function deltaOf(cur, prev, f = (x) => fmt(x)) {
  if (prev == null) return null;
  const dv = cur - prev;
  return { v: dv, t: (dv > 0 ? "▲ " : dv < 0 ? "▼ " : "= ") + (dv ? f(Math.abs(dv)) : "") };
}

function tResumen(st, ws) {
  const R = periodRange(S.tGran, S.tOff, st), P = periodStats(st, ws, R);
  const nav = (d) => { S.tOff += d; render(); };
  const sel = h("div", { class: "pnav" },
    h("div", { class: "seg pgran" }, GRANS.map(([k, l]) => h("button", { class: S.tGran === k ? "on" : "", onclick: () => { S.tGran = k; S.tOff = 0; render(); } }, l))),
    R.all ? null : h("div", { class: "pstep" }, h("button", { class: "icon-btn", disabled: !R.canPrev, onclick: () => nav(-1), "aria-label": "Anterior" }, icon("left")),
      h("b", null, R.label), h("button", { class: "icon-btn", disabled: !R.canNext, onclick: () => nav(1), "aria-label": "Siguiente" }, icon("right"))));
  const pv = P.prev, c = P.cur, vs = R.prevLabel ? "vs " + R.prevLabel : "";
  const groups = Object.entries(P.groups).sort((a, b) => b[1] - a[1]);
  const gmax = Math.max(1, ...groups.map((g) => g[1]));
  // lo destacado
  const lv = st.list.filter((e) => e.level && e.level.solid && e.sessions.length >= 3).sort((a, b) => b.level.pct - a.level.pct);
  const weakG = groups.filter(([g]) => MAIN_GROUPS.includes(g)).sort((a, b) => a[1] - b[1])[0];
  const days = new Set(P.L.map((w) => w.date)).size;
  const hl = [
    ["Récords", P.prs.length ? String(P.prs.length) : "0", P.prs.length ? "último: " + P.prs[0].name : "ninguno en el periodo", () => { S.tTab = "records"; render(); }],
    ["Más trabajado", groups[0] && groups[0][1] ? groups[0][0] : "—", groups[0] && groups[0][1] ? `${groups[0][1]} series efectivas` : "", null],
    ["Menos trabajado", weakG ? weakG[0] : "—", weakG ? `${weakG[1]} series · ${weakG[1] < 10 ? "¿le das un poco más?" : "bien repartido"}` : "", null],
    ["Tu punto fuerte", lv[0] ? lv[0].name : "—", lv[0] ? LVL[lv[0].level.idx] + (S.bw ? "" : "") : "", () => { S.tTab = "nivel"; render(); }],
  ];
  const showBars = P.buckets.length > 1;
  const yr = (b) => (P.gran === "day" ? "" : "");
  return h("div", null,
    sel,
    h("div", { class: "prow" }, h("div", { class: "faint" }, `${dateLabel(R.from, { day: "numeric", month: "short", year: R.all || R.gran === "año" ? "numeric" : undefined })} – ${R.to === todayISO() ? "hoy" : dateLabel(R.to, { day: "numeric", month: "short" })} · ${fmt(days)} ${days === 1 ? "día entrenado" : "días entrenados"}`)),
    h("div", { class: "kpis five" },
      kpi("Entrenos", fmt(c.n), `${fmt(P.perWeek, 1)}/sem.`, deltaOf(c.n, pv && pv.n), `${c.n} entrenos ${R.all ? "en total" : "· " + R.label}${pv ? `\n${pv.n} ${vs}` : ""}`),
      kpi("Tiempo", fmt(c.min / 60, 1) + " h", c.n ? fmt(c.min / c.n) + " min/entreno" : "", deltaOf(c.min / 60, pv && pv.min / 60, (x) => fmt(x, 1) + " h"), pv ? `${fmt(pv.min / 60, 1)} h ${vs}` : null),
      kpi("Volumen", fmt(c.vol / 1000, 1) + " t", c.n ? fmt(c.vol / c.n) + " kg/entreno" : "", deltaOf(c.vol / 1000, pv && pv.vol / 1000, (x) => fmt(x, 1) + " t"), `${fmt(c.vol)} kg levantados (como en Hevy: todas las series)${pv ? `\n${fmt(pv.vol)} kg ${vs}` : ""}`),
      kpi("Series", fmt(c.sets), c.n ? fmt(c.sets / c.n, 1) + "/entreno" : "", deltaOf(c.sets, pv && pv.sets), pv ? `${fmt(pv.sets)} series ${vs}` : null),
      kpi("Racha", st.streak + " sem.", "seguidas", null, "Semanas seguidas con al menos un entreno")),
    h("div", { class: "hl" }, hl.map(([l, v, s_, fn]) => h(fn ? "button" : "div", { class: "hli" + (fn ? " click" : ""), onclick: fn || undefined }, h("span", { class: "l" }, kpiLbl(l)), h("b", null, v), h("span", { class: "s" }, s_)))),
    R.gran === "semana" ? null : h("div", { class: "card panel" }, h("h3", null, "Actividad", h("span", { class: "faint", style: { fontWeight: 400 } }, " · más oscuro = más volumen")),
      R.gran === "mes" ? monthCal(st.byDate, R.from, R.end) : heatmap(st.byDate, R.from, R.to)),
    showBars ? h("div", { class: "grid2 gap-big" },
      h("div", { class: "card panel" }, h("h3", null, P.gran === "day" ? "Minutos por día" : P.gran === "week" ? "Entrenos por semana" : "Entrenos por mes"),
        bars(P.buckets.map((b) => ({ v: P.gran === "day" ? b.min || (b.n ? 30 : 0) : b.n, label: `${P.bLabel(b)}\n${b.n} ${b.n === 1 ? "entreno" : "entrenos"}${b.min ? " · " + fmt(b.min) + " min" : ""}` })), { h: 90 }),
        h("div", { class: "axis-row" }, h("span", null, P.bLabel(P.buckets[0]).replace("Semana del ", "")), h("span", null, R.to === todayISO() ? "hoy" : P.bLabel(P.buckets[P.buckets.length - 1]).replace("Semana del ", "")))),
      h("div", { class: "card panel" }, h("h3", null, "Volumen"),
        bars(P.buckets.map((b) => ({ v: b.vol, label: `${P.bLabel(b)}\n${fmt(b.vol)} kg · ${fmt(b.sets)} series` })), { h: 90 }),
        h("div", { class: "axis-row" }, h("span", null, P.bLabel(P.buckets[0]).replace("Semana del ", "")), h("span", null, R.to === todayISO() ? "hoy" : P.bLabel(P.buckets[P.buckets.length - 1]).replace("Semana del ", ""))))) : null,
    h("div", { class: "grid2 gap-big" },
      h("div", { class: "card panel" }, h("h3", null, "Series por semana y grupo", h("span", { class: "faint", style: { fontWeight: 400 } }, " · zona verde = 10–20 recomendadas")),
        h("div", { class: "gbars wk" }, groups.map(([g, n]) => { const pw = n / Math.max(1, R.days / 7), max = 26; const zone = pw < 10 ? "low" : pw > 20 ? "high" : "ok";
          return tip(h("div", { class: "gb" }, h("span", { class: "gl" }, g),
            h("span", { class: "gt" }, h("span", { class: "zone", style: { left: (100 * 10 / max) + "%", width: (100 * 10 / max) + "%" } }), h("i", { style: { width: Math.min(100, 100 * pw / max) + "%", "--h": GROUP_HUE[g] } })),
            h("b", { class: "num " + zone }, fmt(pw, pw < 10 ? 1 : 0))),
            `${g}: ${fmt(pw, 1)} series efectivas por semana (${n} en el periodo)\n${zone === "low" ? "Por debajo de 10/semana: poco estímulo para crecer" : zone === "high" ? "Más de 20/semana: mucho volumen, vigila la recuperación" : "Dentro de lo recomendado (10–20)"}`); }))),
      h("div", { class: "card panel" }, h("h3", null, "Lo que más has hecho"),
        P.top.length ? h("div", { class: "exlist" }, P.top.slice(0, 6).map(({ e, n }) => exRow(e, null, `${n} ${n === 1 ? "sesión" : "sesiones"} en el periodo`))) : h("div", { class: "muted" }, "Nada en este periodo."))),
    P.prs.length ? h("div", { class: "card panel" }, h("div", { class: "row", style: { marginBottom: "6px" } }, h("h3", { style: { margin: 0 } }, "Récords del periodo", h("span", { class: "faint", style: { fontWeight: 400 } }, ` · ${P.prs.length} · los más recientes`)), h("span", { class: "grow" }),
      P.prs.length > 6 ? h("button", { class: "btn sm ghost", onclick: () => sheet(`Récords · ${R.label}`, h("div", { class: "exlist" }, P.prs.map((p) => prRow(p))), null, { sub: `${P.prs.length} récords, del más reciente al más antiguo` }) }, `Ver todos (${P.prs.length})`) : null),
      h("div", { class: "exlist" }, P.prs.slice(0, 6).map((p) => prRow(p)))) : null,
    P.ups.length ? h("div", { class: "card panel" }, h("div", { class: "row", style: { marginBottom: "6px" } }, h("h3", { style: { margin: 0 } }, "Nuevos rangos", h("span", { class: "faint", style: { fontWeight: 400 } }, ` · ${P.ups.length}`)), h("span", { class: "grow" }),
      P.ups.length > 6 ? h("button", { class: "btn sm ghost", onclick: () => sheet(`Nuevos rangos · ${R.label}`, h("div", { class: "exlist" }, P.ups.map((u) => upRow(u))), null, { sub: `${P.ups.length} rangos nuevos, del más reciente al más antiguo` }) }, `Ver todos (${P.ups.length})`) : null),
      h("div", { class: "exlist" }, P.ups.slice(0, 6).map((u) => upRow(u)))) : null);
}
// Una subida de rango: de qué rango a cuál, con el escudo nuevo
function upRow(u) {
  return h("button", { class: "exrow", onclick: () => exerciseSheet(u.name) }, exIcon(u.name, 34),
    h("div", { class: "exr-t" }, h("div", { class: "exr-n" }, h("span", null, dispName(u.name))),
      h("div", { class: "exr-s" }, dateLabel(u.date, { weekday: "short", day: "numeric", month: "short" }) + " · " + u.L.valTxt)),
    h("div", { class: "exr-v up" }, h("span", { class: "upfromto" }, h("span", { class: "upfrom" }, lvlBadge(u.from, 14), h("span", { class: "lvname sm l" + u.from }, LVL[u.from])), h("span", { class: "uparr" }, icon("up")), lvlShield(u.L, 18), h("b", { class: "lvname l" + u.to }, LVL[u.to]))));
}
function upChip(u) {
  return tip(h("span", { class: "upchip" }, icon("up"), LVL[u.to]), `Nuevo rango: ${LVL[u.from]} → ${LVL[u.to]}`);
}

const EQ_LABEL = { barra: "Barra", mancuerna: "Mancuernas", maquina: "Máquina", discos: "Máquina de discos", cable: "Cable", polea: "Polea ×0,5", corporal: "Corporal", otro: "Otro" };
function eqTag(name) {
  const c = exSet(name); const t = [c.equipment ? EQ_LABEL[c.equipment] : null, c.machine_kg ? `máq. ${fmt(c.machine_kg, 1)} kg` : null, isUni(name) ? "1 brazo" : null].filter(Boolean).join(" · ");
  return t ? h("span", { class: "eqtag" }, t) : null;
}
function exRow(e, extra, sub) {
  const [, lbl] = exMetric(e.kind);
  return h("button", { class: "exrow", onclick: () => exerciseSheet(e.name) }, exIcon(e.name, 34),
    h("div", { class: "exr-t" }, h("div", { class: "exr-n" }, h("span", null, e.name), lvlShield(e.level, 18)),
      h("div", { class: "exr-s" }, sub || `${e.sessions.length} sesiones · última ${dateLabel(e.last, { day: "numeric", month: "short" })}`)),
    h("div", { class: "exr-v" }, h("b", { class: "num" }, metricTxt(e.kind, e.best)), h("span", null, extra || lbl)));
}
function prRow(p) {
  const setTxt = p.set && ["w", "e1", "sv"].includes(p.type) ? " · " + setShort(p.kind, p.set) : "";
  return h("button", { class: "exrow", onclick: () => exerciseSheet(p.name) }, exIcon(p.name, 34),
    h("div", { class: "exr-t" }, h("div", { class: "exr-n" }, h("span", null, dispName(p.name)), (() => { const e = (S.tStats && S.tStats.list || []).find((x) => exKeyName(x.name) === exKeyName(p.name)); return e && e.level ? lvlShield(e.level, 18) : null; })()),
      h("div", { class: "exr-s" }, dateLabel(p.date, { weekday: "short", day: "numeric", month: "short" }) + ` · antes ${recTxt(p.type, p.prev, p.kind)}` + setTxt)),
    h("div", { class: "exr-v pr" }, h("b", { class: "num" }, h("span", { class: "trophy" }, icon("trophy")), recTxt(p.type, p.value, p.kind)), h("span", null, REC_LABEL[p.type])));
}

function tHistorial(st, ws) {
  let lastMonth = null; const out = [];
  for (const w of ws) {
    const mo = dateLabel(w.date, { month: "long", year: "numeric" });
    if (mo !== lastMonth) { out.push(h("div", { class: "sec-t" }, mo)); lastMonth = mo; }
    out.push(workoutCard(w));
  }
  return h("div", null, out);
}

function bestSetOf(ex) {
  if (ex.stats && ex.stats.best) return ex.stats.best;
  const ws_ = workSets(ex.sets);
  return ws_.reduce((a, s_) => ((s_.seconds || 0) + (s_.distance_m || 0) + (s_.weight_kg || 0) * 10 + (s_.reps || 0) > (a.seconds || 0) + (a.distance_m || 0) + (a.weight_kg || 0) * 10 + (a.reps || 0) ? s_ : a), ws_[0]);
}
function workoutCard(w) {
  const [y, m, d] = w.date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return h("div", { class: "card wcard v2", onclick: () => workoutSheet(w.id) },
    h("div", { class: "wdate" }, h("b", null, String(d)), h("span", null, dt.toLocaleDateString("es-ES", { weekday: "short" }))),
    h("div", { class: "wbody" },
      h("div", { class: "wc-h" }, h("div", { class: "wc-t" }, w.title), w.prs_count ? tip(h("span", { class: "prc" }, icon("trophy"), String(w.prs_count)), `${w.prs_count} récords en este entreno`) : null, h("span", { class: "grow" }), w.start_time ? h("span", { class: "faint" }, w.start_time) : null),
      w.notes ? h("div", { class: "wc-desc" }, w.notes) : null,
      h("div", { class: "wchips" }, w.duration_min ? h("span", null, fmt(w.duration_min) + " min") : null, w.volume_kg ? h("span", null, fmt(w.volume_kg) + " kg") : null, h("span", null, w.sets_count + " series")),
      h("div", { class: "wc-ex" }, w.exercises.map((ex) => { const b = ex.sets.length ? bestSetOf(ex) : null; return h("div", { class: "wc-exr" }, exIcon(ex.name, 22),
        h("span", { class: "n" }, `${ex.sets.length} × ${ex.name}`), h("span", { class: "b num" }, b ? setShort(ex.kind, b) : "")); }))));
}

function tEjercicios(st) {
  const q = h("input", { class: "input", placeholder: "Buscar ejercicio", value: S.exQuery || "" });
  const list = h("div", { class: "exlist" });
  const sortSel = h("div", { class: "seg" }, [["sesiones", "Más hechos"], ["recientes", "Recientes"], ["grupo", "Por grupo"], ["material", "Por material"]]
    .map(([k, l]) => h("button", { class: (S.exSort || "sesiones") === k ? "on" : "", onclick: () => { S.exSort = k; render(); } }, l)));
  const draw = () => {
    const qq = norm(q.value); S.exQuery = q.value;
    const xs = st.list.filter((e) => !qq || norm(e.name).includes(qq));
    const s_ = S.exSort || "sesiones";
    if (s_ === "sesiones") xs.sort((a, b) => b.sessions.length - a.sessions.length);
    else if (s_ === "recientes") xs.sort((a, b) => b.last.localeCompare(a.last));
    else if (s_ === "grupo") xs.sort((a, b) => exGroup(a.name).localeCompare(exGroup(b.name)) || b.sessions.length - a.sessions.length);
    const eqOf = (e) => (["peso", "lastre"].includes(e.kind) ? EQ_LABEL[exSet(e.name).equipment] || "Sin ajustar" : "Sin peso");
    if (s_ === "material") xs.sort((a, b) => (eqOf(a) === "Sin ajustar" ? -1 : 0) - (eqOf(b) === "Sin ajustar" ? -1 : 0) || eqOf(a).localeCompare(eqOf(b)) || b.sessions.length - a.sessions.length);
    const out = []; let g = null;
    for (const e of xs) {
      const k = s_ === "grupo" ? exGroup(e.name) : s_ === "material" ? eqOf(e) : null;
      if (k && k !== g) { g = k; out.push(h("div", { class: "sec-t" }, k)); }
      out.push(exRow(e));
    }
    list.replaceChildren(...out);
  };
  q.addEventListener("input", draw); draw();
  return h("div", null, h("div", { class: "row wrap", style: { marginBottom: "10px" } }, h("div", { class: "search grow", style: { minWidth: "200px" } }, icon("search"), q), sortSel),
    h("div", { class: "card panel" }, list));
}

function tRecords(st) {
  const kinds = [["peso", "Con peso"], ["lastre", "Con lastre"], ["corporal", "Peso corporal"], ["tiempo", "Isométricos"], ["cardio", "Cardio / cargas"]];
  const recent = st.prs.filter((p) => TROPHY.includes(p.type));
  return h("div", null,
    recent.length ? h("div", { class: "card panel" }, h("h3", null, "Récords recientes"), h("div", { class: "exlist" }, recent.slice(0, 8).map(prRow))) : null,
    ...kinds.map(([k, t]) => {
      const xs = st.list.filter((e) => e.kind === k && Object.keys(e.rec).length).sort((a, b) => (b.best || 0) - (a.best || 0));
      if (!xs.length) return null;
      const types = REC_KINDS[k];
      return h("div", { class: "card panel" }, h("h3", null, t),
        h("div", { class: "rtable-wrap" }, h("table", { class: "t rtable" },
          h("tr", null, h("th", null, "Ejercicio"), types.map((ty) => h("th", { class: "r" }, REC_LABEL[ty].replace(" (volumen)", "")))),
          xs.map((e) => h("tr", { onclick: () => exerciseSheet(e.name) },
            h("td", null, h("div", { class: "rt-n" }, exIcon(e.name, 26), h("span", null, e.name))),
            types.map((ty) => { const r = e.rec[ty]; return h("td", { class: "r num" }, r ? tip(h("span", null, recTxt(ty, r.v, e.kind)),
              `${REC_LABEL[ty]}: ${recTxt(ty, r.v, e.kind)}${r.set && ["w", "e1", "sv"].includes(ty) ? " (" + setShort(e.kind, r.set) + ")" : ""}\n${dateLabel(r.date, { day: "numeric", month: "short", year: "numeric" })}`) : "—"); }))))));
    }));
}

function zToIdx(pct) { return pct >= 99 ? 5 : pct >= 95 ? 4 : pct >= 80 ? 3 : pct >= 50 ? 2 : pct >= 20 ? 1 : 0; }
const topTxt = (pct) => "top " + fmt(Math.max(0.1, 100 - pct), 100 - pct < 1 ? 1 : 0) + " %";
function lvAgg(L) {
  let sw = 0, sz = 0;
  for (const e of L) { const w = 1; sw += w; sz += w * e.level.z; }
  const pct = PHI(sz / sw) * 100;
  return { pct, idx: zToIdx(pct) };
}
function tNivel(st) {
  if (!S.bw) return h("div", { class: "card panel muted" }, "Para calcular niveles hace falta tu peso: apúntalo en Hoy (o la báscula en Progreso) y tu sexo en Ajustes.");
  const xs = st.list.filter((e) => e.level).sort((a, b) => b.level.pct - a.level.pct);
  if (!xs.length) return h("div", { class: "card panel muted" }, "Aún no hay ejercicios con estándares.");
  const G = lvAgg(xs);
  const counts = TIER.map((_, i) => xs.filter((e) => e.level.idx === i).length);
  const byG = {};
  for (const e of xs) (byG[exGroup(e.name)] = byG[exGroup(e.name)] || []).push(e);
  const groups = Object.entries(byG).map(([g, L]) => ({ g, L, ...lvAgg(L) })).sort((a, b) => b.pct - a.pct);
  const fT = S.lvTier, fG = S.lvGroup;
  const shown = xs.filter((e) => (fT == null || e.level.idx === fT) && (!fG || exGroup(e.name) === fG));
  // al filtrar, se baja a la lista de ejercicios (en el móvil quedaba debajo de los grupos)
  const setF = (k, v) => { S[k] = S[k] === v ? null : v; render(); setTimeout(() => { const el = document.getElementById("lv-list"); if (el && S[k] != null && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30); };
  return h("div", null,
    h("div", { class: "card lvhero" },
      h("div", { class: "lvh-b" }, lvlBadge(G.idx, 64)),
      h("div", { class: "lvh-t" }, h("span", { class: "faint" }, "Tu nivel global"), h("b", { class: "tn t" + G.idx }, LVL[G.idx]),
        h("span", { class: "muted" }, `${topTxt(G.pct)} · media de ${xs.length} ejercicios (las máquinas cuentan la mitad)`),
        h("div", { class: "dist" }, counts.map((n, i) => n ? tip(h("i", { class: "t" + i, style: { flex: n } }), `${LVL[i]}: ${n} ejercicios`) : null)),
        h("div", { class: "dleg" }, counts.map((n, i) => h("button", { class: "chip t" + i + (fT === i ? " on" : ""), onclick: () => setF("lvTier", i) }, h("i"), `${LVL[i]} ${n}`))))),
    h("div", { class: "sec-t" }, "Por grupo muscular · de mejor a peor", h("span", { class: "only-m faint" }, " · desliza →")),
    h("div", { class: "lvgroups" }, groups.map((r) => {
      const best = r.L[0], worst = r.L[r.L.length - 1];
      return h("button", { class: "lvg" + (fG === r.g ? " on" : ""), onclick: () => setF("lvGroup", r.g) },
        h("div", { class: "lvg-h" }, lvlBadge(r.idx, 34), h("div", null, h("b", null, r.g), h("span", { class: "tn t" + r.idx }, LVL[r.idx]), h("em", null, topTxt(r.pct)))),
        h("div", { class: "lvg-dots" }, r.L.map((e) => tip(h("i", { class: "t" + e.level.idx }), `${e.name}\n${LVL[e.level.idx]} · ${topTxt(e.level.pct)}`))),
        h("div", { class: "lvg-f" }, h("span", null, "Mejor: ", h("b", null, best.name)), r.L.length > 1 ? h("span", null, "Peor: ", h("b", null, worst.name)) : null));
    })),
    h("div", { class: "row wrap", id: "lv-list", style: { margin: "18px 2px 8px", scrollMarginTop: "70px" } }, h("div", { class: "sec-t", style: { margin: 0 } }, "Por ejercicio" + (fG ? " · " + fG : "") + (fT != null ? " · " + LVL[fT] : "")), h("span", { class: "grow" }),
      fG || fT != null ? h("button", { class: "btn sm ghost", onclick: () => { S.lvGroup = null; S.lvTier = null; render(); } }, "Quitar filtros") : null),
    h("div", { class: "card panel" }, h("div", { class: "exlist" }, shown.length ? shown.map((e) => h("button", { class: "exrow lvrow", onclick: () => exerciseSheet(e.name) }, exIcon(e.name, 34),
      h("div", { class: "exr-t" }, h("div", { class: "exr-n" }, h("span", null, e.name)), h("div", { class: "exr-s" }, e.level.valTxt), lvlBar(e.level)),
      h("div", { class: "exr-v" }, h("div", { class: "lvr click", onclick: (ev) => { ev.stopPropagation(); levelSheet(e.name, e.level); } }, lvlShield(e.level, 22), h("b", { class: "lvname l" + e.level.idx }, LVL[e.level.idx])), h("span", null, topTxt(e.level.pct)))))
      : h("div", { class: "muted" }, "Nada con estos filtros."))),
    h("div", { class: "row", style: { marginTop: "10px" } }, h("button", { class: "btn", onclick: () => levelsInfoSheet(st) }, "ⓘ Cómo funcionan los niveles · tablas y gráficas")),
    h("div", { class: "note" }, `Fuente: Strength Level (strengthlevel.com), tablas de ${sexWord()} por peso corporal. Cada entreno se compara con tu peso de ese día (pesajes; los días sin pesaje se interpolan entre el anterior y el siguiente). Último pesaje: ${fmt(S.bw, 1)} kg (${dateLabel(S.bwDate, { day: "numeric", month: "short" })}). Niveles por percentil: Novato 20 %, Intermedio 50 %, Avanzado 80 %, Élite 95 % (top 5 %), Leyenda 99 % (top 1 %, extrapolado). Se compara tu mejor 1RM estimado con la tabla de Hevy, tus reps máximas o tu lastre. Mancuernas: entre dos. Poleas que pesan la mitad: × 0,5. A las máquinas se les resta su peso si lo indicas.`));
}

// Información general de los niveles: cómo se calculan y las tablas de cada ejercicio (por peso corporal y sexo).
function strengthInfo(st, body) {
  let cur = S.lvInfo || "bench-press";
  let opts = Object.keys(SL_TABLES).map((k) => [k, SL_NAMES[k]]);
  const mine = (st && st.list) || [];
  const without = mine.filter((e) => !e.level && ["peso", "lastre", "corporal"].includes(e.kind)).map((e) => e.name);
  const unitOf = (k) => (k.endsWith(".reps") ? "reps" : k.endsWith(".add") ? "kg de lastre" : "kg (1RM)");
  api("GET", "/api/strength/").then((idx) => { // todos los ejercicios con tabla en el servidor
    const all = idx.flatMap((x) => x.types.includes("w") ? [[x.slug, x.name]] : [[x.slug + ".reps", x.name + " (reps)"], ...(x.types.includes("add") ? [[x.slug + ".add", x.name + " (lastre)"]] : [])]);
    if (all.length) { opts = all; draw(); }
  }).catch(() => {});
  const draw = async () => {
    if (!SL_TABLES[cur]) { try { addSL(await api("GET", "/api/strength/" + cur.replace(/\.(reps|add)$/, ""))); } catch (e) { /* sin tabla */ } }
    if (!SL_TABLES[cur]) cur = "bench-press";
    if (!SL_TABLES[cur]) { body.replaceChildren(h("div", { class: "muted" }, "Cargando tablas…")); return; }
    S.lvInfo = cur;
    const metric = cur.endsWith(".reps") ? "reps" : cur.endsWith(".add") ? "add" : "1rm";
    // Filas con Leyenda (top 1 %): no la publica Strength Level, se extrapola igual que en el cálculo del nivel.
    const withLeg = (sx) => SL_TABLES[cur][sx].map((r) => { const m = slModelSx(cur, metric, r[0], sx); return [...r, m ? m.all[5] - m.off : null]; });
    const T = { H: withLeg("H"), M: withLeg("M") }, unit = unitOf(cur);
    const W = Math.max(300, Math.min(760, window.innerWidth - 60)), H = 260, L = 40, R = 12, Tp = 10, B = 26;
    const all = ["H", "M"].flatMap((sx) => T[sx].flatMap((r) => r.slice(1)));
    let lo = Math.min(0, ...all), hi = Math.max(...all) * 1.05;
    const x = (bw) => L + ((bw - 40) / 100) * (W - L - R), y = (v) => Tp + ((hi - v) / (hi - lo)) * (H - Tp - B);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "lvinfo" });
    const defs = svgEl("defs", {}), lg_ = svgEl("linearGradient", { id: "legGrad", gradientUnits: "userSpaceOnUse", x1: L, y1: 0, x2: W - R, y2: 0 });
    TIER[5][2].forEach((c, i) => lg_.append(svgEl("stop", { offset: String(i / 2), "stop-color": c }))); defs.append(lg_); svg.append(defs);
    const step = hi - lo > 200 ? 50 : hi - lo > 80 ? 20 : hi - lo > 30 ? 10 : 5;
    for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) { svg.append(svgEl("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), class: "grid" })); const t = svgEl("text", { x: L - 6, y: y(g) + 4, "text-anchor": "end", class: "axis" }); t.textContent = fmt(g); svg.append(t); }
    for (let bw = 40; bw <= 140; bw += 20) { const t = svgEl("text", { x: x(bw), y: H - 8, "text-anchor": "middle", class: "axis" }); t.textContent = bw + " kg"; svg.append(t); }
    ["H", "M"].forEach((sx) => [0, 1, 2, 3, 4, 5].forEach((lv) => {
      const d = T[sx].map((r, i) => (i ? "L" : "M") + x(r[0]).toFixed(1) + " " + y(r[lv + 1]).toFixed(1)).join("");
      const pth = svgEl("path", { d, class: "lvl-line t" + lv + (sx === "M" ? " fem" : ""), fill: "none", ...(lv === 5 ? { stroke: "url(#legGrad)" } : {}) });
      const tt = svgEl("title", {}); tt.textContent = `${sx === "H" ? "Hombres" : "Mujeres"} · ${LVL[lv]}`; pth.append(tt); svg.append(pth);
    }));
    const e = mine.find((x_) => x_.level && STD.some(([rx, , sl]) => sl === cur && rx.test(exKeyName(x_.name))));
    if (e && e.level) { const c = svgEl("circle", { cx: x(Math.min(140, Math.max(40, e.level.bw))), cy: y(e.level.raw), r: 5.5, class: "me-pt" }); const tt = svgEl("title", {}); tt.textContent = `Tú: ${e.level.valTxt} con ${fmt(e.level.bw, 1)} kg`; c.append(tt); svg.append(c); }
    const sx = S.sex === "M" ? "M" : "H";
    const tbl = h("div", { class: "tbl-wrap" }, h("table", { class: "t" }, h("tr", null, h("th", null, "Peso corporal"), LVL.map((l) => h("th", { class: "r" }, l))),
      T[sx].map((r) => h("tr", { class: S.bw && Math.abs(r[0] - S.bw) < 2.5 ? "rowhl" : "" }, h("td", null, r[0] + " kg"), r.slice(1).map((v, i) => h("td", { class: "r num" + (i === 5 ? " faint" : "") }, v == null ? "—" : v === 0.5 ? "<1" : (i === 5 ? "≈" : "") + fmt(v, metric === "reps" ? 0 : 0)))))));
    body.replaceChildren(
      h("p", { class: "muted", style: { marginTop: 0 } }, "Los niveles comparan tu mejor marca con la de miles de personas de tu mismo sexo y peso corporal (datos públicos de Strength Level). Cada nivel es un percentil: Principiante 5 %, Novato 20 %, Intermedio 50 %, Avanzado 80 %, Élite 95 % y Leyenda 99 % (este último lo extrapolamos)."),
      h("ul", { class: "info-l" },
        h("li", null, h("b", null, "Peso corporal: "), "Strength Level publica una fila cada 5 kg (hombres 50–140 kg, mujeres 40–120 kg); entre filas se interpola, así que vale para cualquier peso. Cada entreno se compara con tu peso de ese día (los días sin pesaje se interpolan)."),
        h("li", null, h("b", null, "Sexo: "), "hay tablas separadas para hombres y mujeres; se usa el sexo de tu perfil."),
        h("li", null, h("b", null, "Altura y edad: "), "no se usan. Strength Level no tiene tablas por altura; por edad sí publica, pero no las aplicamos."),
        h("li", null, h("b", null, "Cálculo: "), "1RM estimado con la tabla de Hevy; mancuernas = una mancuerna; poleas que pesan la mitad × 0,5; a las máquinas se les resta su peso; lastre = peso corporal + lastre."),
        h("li", null, h("b", null, "Ejercicios sin tabla: "), `${opts.length} tablas de Strength Level en el servidor (citadas a ellos: son sus datos). A cualquier ejercicio se le puede elegir su tabla de Strength Level en su ficha («Material, peso real y nivel»): se descarga de strengthlevel.com la primera vez y queda guardada. Sin tabla no hay nivel, pero sí récords, 1RM y progreso.` + (without.length ? ` Tuyos sin nivel: ${without.join(", ")}.` : ""))),
      h("div", { class: "sec-t" }, "Tabla por ejercicio"),
      h("select", { class: "input", onchange: (ev) => { cur = ev.target.value; draw(); } }, [...opts].sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => h("option", { value: k, selected: k === cur }, n))),
      h("div", { class: "lv-legend" }, LVL.map((l, i) => h("span", { class: "lg t" + i }, l + (i === 5 ? " (extrapolada)" : ""))), h("span", { class: "lg solid" }, "— hombres"), h("span", { class: "lg dash" }, "- - mujeres"), e && e.level ? h("span", { class: "lg me" }, "● tú") : null),
      h("div", { class: "chart-scroll" }, svg),
      h("div", { class: "faint", style: { fontSize: "12.5px", margin: "4px 0 10px" } }, `Eje vertical: ${unit}. Eje horizontal: peso corporal.`),
      h("div", { class: "sec-t" }, `Valores para ${sx === "M" ? "mujeres" : "hombres"} (${unit})`), tbl,
      h("details", { style: { marginTop: "12px" } }, h("summary", null, `Todos los ejercicios de Strength Level (${opts.length})`),
        h("div", { class: "chips-l" }, [...opts].sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => h("button", { class: "chip" + (k === cur ? " on" : ""), onclick: () => { cur = k; draw(); } }, n)))));
  };
  draw();
}
// Info de niveles: fuerza (Strength Level) y cardio (Swimming, Running, Rowing y Cycling Level), con todas sus pruebas.
const XL_TABS = [["strength", "Fuerza"], ["swimming", "Natación"], ["running", "Carrera"], ["rowing", "Remo"], ["cycling", "Bici"]];
const fmtT = (sec) => { if (sec == null) return "—"; const h_ = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s_ = sec % 60;
  const ss = (s_ % 1 ? s_.toFixed(1) : String(Math.round(s_))).padStart(s_ % 1 ? 4 : 2, "0"); return (h_ ? h_ + ":" + String(m).padStart(2, "0") : m) + ":" + ss; };
function levelsInfoSheet(st) {
  const body = h("div"), seg = h("div", { class: "seg", style: { flexWrap: "wrap", marginBottom: "12px" } });
  let tab = S.lvInfoTab || "strength", xl = null;
  const show = async () => {
    S.lvInfoTab = tab;
    seg.replaceChildren(...XL_TABS.map(([k, l]) => h("button", { class: tab === k ? "on" : "", onclick: () => { tab = k; show(); } }, l)));
    if (tab === "strength") return strengthInfo(st, body);
    if (!xl) xl = await api("GET", "/api/levels/").catch(() => ({}));
    const site = xl[tab];
    if (!site || !site.items.length) { body.replaceChildren(h("div", { class: "muted" }, "Aún no hay datos de esta web en el servidor.")); return; }
    let cur = S["lvx_" + tab] || site.items[0].slug, sx = S.sex === "M" ? "M" : "H";
    const draw = async () => {
      S["lvx_" + tab] = cur;
      const d = await api("GET", `/api/levels/${tab}/${cur}`).catch(() => null);
      const byTime = d && !/distanc/i.test(d.name || "");
      const tbl = d ? h("div", { class: "tbl-wrap" }, h("table", { class: "t" }, h("tr", null, h("th", null, "Edad"), LVL.slice(0, 5).map((l) => h("th", { class: "r" }, l)), h("th", { class: "r faint" }, "Récord")),
        d[sx][0].map((r) => h("tr", null, h("td", null, r[0] + " años"), r.slice(1, 7).map((v, i) => h("td", { class: "r num" + (i === 5 ? " faint" : "") }, byTime ? fmtT(v) : v == null ? "—" : fmt(v) + " m")))))) : h("div", { class: "muted" }, "No disponible");
      body.replaceChildren(
        h("p", { class: "muted", style: { marginTop: 0 } }, `Datos de `, h("a", { href: site.url, target: "_blank", rel: "noopener" }, site.name), `: tiempos de su comunidad por edad y sexo, con los mismos niveles por percentil que la fuerza (principiante 5 %, novato 20 %, intermedio 50 %, avanzado 80 %, élite 95 %). Más rápido = mejor nivel.` + (tab === "swimming" ? " No separa por estilos (braza, mariposa…)." : "")),
        h("div", { class: "row wrap", style: { gap: "8px" } }, h("select", { class: "input", style: { flex: 1, minWidth: "200px" }, onchange: (e) => { cur = e.target.value; draw(); } },
          site.items.map((x) => h("option", { value: x.slug, selected: x.slug === cur }, x.name))),
          h("div", { class: "seg" }, [["H", "Hombres"], ["M", "Mujeres"]].map(([k, l]) => h("button", { class: sx === k ? "on" : "", onclick: () => { sx = k; draw(); } }, l)))),
        h("div", { class: "sec-t" }, (d ? d.name : "") + (sx === "M" ? " · mujeres" : " · hombres")), tbl,
        h("details", { style: { marginTop: "12px" } }, h("summary", null, `Todas las pruebas de ${site.name} (${site.items.length})`),
          h("div", { class: "chips-l" }, site.items.map((x) => h("button", { class: "chip" + (x.slug === cur ? " on" : ""), onclick: () => { cur = x.slug; draw(); } }, x.name)))));
    };
    draw();
  };
  show();
  sheet("Niveles", [seg, body], null, { wide: true });
}

// ------------------------------------------------------------- hojas
const PR_SHORT = { e1: "1RM", w: "Peso", sv: "Volumen", vol: "Vol. sesión", reps: "Reps", sreps: "Reps sesión", secs: "Tiempo", stime: "Tiempo sesión", dist: "Distancia" };
async function ensureTrainingMeta() {
  if (S.weights === undefined || S.exSet === undefined) await loadBodyMeta();
}
// Pesajes (para el peso de cada día), sexo (tablas de niveles) y ajustes por ejercicio.
async function loadBodyMeta() {
  const [ws, st, set] = await Promise.all([api("GET", "/api/weights").catch(() => []), api("GET", "/api/settings").catch(() => ({})),
    api("GET", "/api/exercise-settings").catch(() => ({}))]);
  S.weights = (ws || []).filter((w) => w.kg).sort((a, b) => a.date.localeCompare(b.date));
  const last = S.weights[S.weights.length - 1];
  S.bw = last ? last.kg : null; S.bwDate = last ? last.date : null;
  const sx = ((st.settings || st).sexo || "").toUpperCase().slice(0, 1); S.sex = sx === "M" ? "M" : sx === "H" ? "H" : "";
  setExSet(set);
  await loadSLTables();
  setTimeout(autoGuessSL, 500);
}
// Tablas de Strength Level de los ejercicios a los que se les ha elegido una (ficha del ejercicio → «Material y nivel»).
const SL_FAIL = {};
// Ejercicios sin nivel: el servidor busca su página de Strength Level por el nombre (una vez; recuerda las que no existen).
async function autoGuessSL() {
  if (!S.training) { if ((S._slWait = (S._slWait || 0) + 1) < 20) setTimeout(autoGuessSL, 1500); return; }
  if (S._slGuessing) return; S._slGuessing = true;
  try {
    const seen = new Set(), todo = [];
    for (const w of (S.training.workouts || S.training)) for (const ex of w.exercises || []) {
      const k = exKeyName(ex.name); if (seen.has(k) || !["peso", "lastre", "corporal"].includes(ex.kind)) continue; seen.add(k);
      if (!exSet(ex.name).sl_slug && !exLevel({ name: ex.name, kind: ex.kind, sessions: [{ date: w.date, sets: ex.sets, notes: ex.notes }] }, () => S.bw || 75)) todo.push(ex.name);
    }
    let found = 0;
    for (const name of todo.filter((n) => !(S._slTried || (S._slTried = new Set())).has(n))) {
      S._slTried.add(name);
      const r = await api("GET", "/api/strength/adivinar?nombre=" + encodeURIComponent(name)).catch(() => null);
      if (r && r.nuevo) found++;
    }
    if (found) { setExSet(await api("GET", "/api/exercise-settings")); await loadSLTables(); S.tStats = null; if (S.view === "entreno") render(); }
  } finally { S._slGuessing = false; }
}
async function loadSLTables() {
  const want = new Set(STD.map(([, , k]) => k.replace(/\.(reps|add)$/, "")));
  for (const x of Object.values(S.exSet || {})) if (x.sl_slug) want.add(x.sl_slug);
  const slugs = [...want].filter((sl) => !SL_TABLES[sl] && !SL_TABLES[sl + ".reps"] && !SL_FAIL[sl]);
  if (!slugs.length) return;
  const got = await api("GET", "/api/strength/varias?slugs=" + slugs.join(",")).catch(() => ({}));
  for (const sl of slugs) if (got[sl]) addSL(got[sl]);
  // las que aún no estén en la caché del servidor se piden de una en una, sin bloquear la página
  for (const sl of slugs.filter((x) => !got[x])) api("GET", "/api/strength/" + sl).then((d) => { addSL(d); S.tStats = null; if (S.view === "entreno" && !S.sheetOpen) render(); }).catch(() => { SL_FAIL[sl] = "sin tabla"; });
}
function addSL(d) {
  const fix = (rows, reps) => (rows || []).map((r) => { r = r.slice(); for (let i = 2; i <= 5; i++) if (r[i] <= r[i - 1]) r[i] = r[i - 1] + (reps ? 0.5 : 1); return r; });
  const put = (key, k, label) => { if (d.H[k] && d.M[k]) { SL_TABLES[key] = { H: fix(d.H[k], k === "reps"), M: fix(d.M[k], k === "reps") }; SL_NAMES[key] = label; } };
  put(d.slug, "w", d.name);
  put(d.slug + ".reps", "reps", d.name + " (reps)");
  put(d.slug + ".add", "add", d.name + " (lastre)");
}
function prChips(prs, lead) {
  if ((!prs || !prs.length) && !lead) return null;
  return h("div", { class: "prchips" }, lead || null, (prs || []).map((t) => tip(h("span", { class: "prchip" }, icon("trophy"), PR_SHORT[t] || t), `Récord: ${REC_LABEL[t] || t}`)));
}
function lvlInline(L, size = 20, ex) {
  if (!L) return null;
  return h("span", { class: "lvin" + (ex ? " click" : ""), onclick: ex ? (ev) => { ev.stopPropagation(); levelSheet(ex.name, L); } : null }, lvlShield(L, size), h("em", null, topTxt(L.pct)));
}
// Curva de niveles: percentil frente a tu marca, con los cortes de cada rango.
function levelSheet(name, L) {
  const M = L.model, unit = L.metric === "reps" ? "reps" : L.metric === "secs" ? "s" : "kg";
  const val = (x) => x - M.off; // en las unidades del ejercicio (lastre: kg añadidos)
  const cuts = M.all.map(val); // princ., novato, int., avanzado, élite, leyenda
  const xmin = M.skill ? 0 : Math.max(0, Math.min(cuts[0], L.raw) * 0.75), xmax = Math.max(cuts[5], L.raw) * 1.12;
  const W = Math.max(300, Math.min(700, window.innerWidth - 72)), H = 268, PL = 34, PR = 14, PT = 30, PB = 30;
  const X = (v) => PL + (v - xmin) / (xmax - xmin) * (W - PL - PR), Y = (p) => PT + (1 - p / 100) * (H - PT - PB);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "mchart line lvcurve" });
  ensureTierDefs();
  // bandas de rango
  const edges = [xmin, ...cuts.slice(1), xmax];
  // habilidad rara: los rangos empiezan en el mínimo (con 1 rep); antes, «sin rango»
  const c0 = M.skill ? cuts[M.skill] : null;  // donde empieza el primer rango de una habilidad
  if (M.skill) { svg.append(svgEl("rect", { x: X(0), y: PT, width: X(c0) - X(0), height: H - PT - PB, class: "norank" })); edges[M.skill] = c0; }
  for (let i = M.skill || 0; i < 6; i++) {
    const a = Math.max(xmin, edges[i]), b = Math.min(xmax, edges[i + 1]);
    if (b <= a) continue;
    svg.append(svgEl("rect", { x: X(a), y: PT, width: X(b) - X(a), height: H - PT - PB, fill: `url(#tg${i})`, opacity: 0.16 }));
    if (X(b) - X(a) < 44) continue;  // banda demasiado estrecha para el nombre
    const t = svgEl("text", { x: (X(a) + X(b)) / 2, y: H - PB - 7, "text-anchor": "middle", class: "axis tierlbl t" + i }); t.textContent = LVL[i]; svg.append(t);
  }
  // eje X con kg/reps
  const step = (() => { const raw = (xmax - xmin) / (W < 420 ? 6 : 10), m = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((k) => k * m).find((k) => k >= raw) || raw; })();
  svg.append(svgEl("line", { x1: PL, x2: W - PR, y1: H - PB, y2: H - PB, class: "axisl" }));
  for (let v = Math.ceil(xmin / step) * step; v <= xmax; v += step) {
    svg.append(svgEl("line", { x1: X(v), x2: X(v), y1: H - PB, y2: H - PB + 4, class: "axisl" }));
    const t = svgEl("text", { x: X(v), y: H - PB + 16, "text-anchor": "middle", class: "axis" }); t.textContent = (L.metric === "add" && v > 0 ? "+" : "") + fmt(v) + (unit === "kg" ? " kg" : ""); svg.append(t);
  }
  for (const p of [20, 50, 80, 95]) { svg.append(svgEl("line", { x1: PL, x2: W - PR, y1: Y(p), y2: Y(p), class: "grid" })); const t = svgEl("text", { x: PL - 5, y: Y(p) + 4, "text-anchor": "end", class: "axis" }); t.textContent = p + "%"; svg.append(t); }
  // curva
  let d = "";
  for (let i = 0; i <= 120; i++) { const v = (M.skill ? c0 : xmin) + (xmax - (M.skill ? c0 : xmin)) * i / 120; const p = PHI(zOf(M, Math.max(v, 0.01))) * 100; d += (i ? "L" : "M") + X(v).toFixed(1) + " " + Y(p).toFixed(1); }
  svg.append(svgEl("path", { d, class: "ln" }));
  // cortes
  cuts.slice(1).forEach((c, i) => { if (c < xmin || c > xmax || (M.skill && i + 1 < M.skill)) return; svg.append(svgEl("line", { x1: X(c), x2: X(c), y1: PT, y2: H - PB, class: "cut t" + (i + 1) }));
    // eje de arriba: dónde empieza cada rango
    svg.append(svgEl("line", { x1: X(c), x2: X(c), y1: PT - 5, y2: PT, class: "cut t" + (i + 1) }));
    const t = svgEl("text", { x: X(c), y: PT - 9, "text-anchor": "middle", class: "axis cutl" }); t.textContent = (L.metric === "add" && c > 0 ? "+" : "") + fmt(c) + (unit === "kg" ? "" : ""); svg.append(t); });
  svg.append(svgEl("line", { x1: PL, x2: W - PR, y1: PT, y2: PT, class: "axisln" }));
  // tú
  svg.append(svgEl("line", { x1: X(L.raw), x2: X(L.raw), y1: Y(L.pct), y2: H - PB, class: "you-l" }), svgEl("circle", { cx: X(L.raw), cy: Y(L.pct), r: 6, class: "you" }));
  const hiY = Y(L.pct) - 10 < PT + 6, ty = svgEl("text", hiY ? { x: X(L.raw) + (X(L.raw) > W - PR - 40 ? -10 : 10), y: Y(L.pct) + 16, "text-anchor": X(L.raw) > W - PR - 40 ? "end" : "start", class: "you-t" } : { x: X(L.raw), y: Y(L.pct) - 10, "text-anchor": "middle", class: "you-t" }); ty.textContent = "Tú"; svg.append(ty);
  // al pasar el ratón: qué percentil y rango tendrías con esa marca y cuánto te separa
  const gl = svgEl("line", { y1: PT, y2: H - PB, class: "guide", style: "display:none" }), gd = svgEl("circle", { r: 5, class: "hov", style: "display:none" });
  const hit = svgEl("rect", { x: PL, y: 0, width: W - PL - PR, height: H, fill: "transparent" });
  svg.append(gl, gd, hit);
  const fmtv = (v) => (L.metric === "add" && v > 0 ? "+" : "") + fmt(v, L.metric === "reps" || L.metric === "secs" ? 0 : v < 20 ? 1 : 0) + " " + unit;
  const mv = (ev) => {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    const v = Math.max(xmin, Math.min(xmax, xmin + (q.x - PL) / (W - PL - PR) * (xmax - xmin)));
    const p = PHI(zOf(M, Math.max(v, 0.01))) * 100;
    let i = 0; while (i < 5 && v >= cuts[i + 1]) i++;
    gl.setAttribute("x1", X(v)); gl.setAttribute("x2", X(v)); gl.style.display = "";
    if (M.skill && v < c0) { gd.style.display = "none"; showTip([`${fmtv(v)}`, `Rango | sin rango (aún no sale)`, `Primer rango | ${LVL[M.skill]} en ${fmtv(c0)}`].join("\n"), ev.clientX, ev.clientY); return; }
    gd.setAttribute("cx", X(v)); gd.setAttribute("cy", Y(p)); gd.style.display = "";
    const diff = v - L.raw;
    showTip([`${L.metric === "reps" ? "Con " : L.metric === "secs" ? "Aguantando " : "1RM de "}${fmtv(v)}`, `Rango | ${LVL[i]}`, `Percentil | ${fmt(p, p > 99 ? 1 : 0)} % (${topTxt(p)})`,
      `Frente a ti | ${Math.abs(diff) < 0.5 ? "es tu marca" : (diff > 0 ? "+" : "−") + fmt(Math.abs(diff), Math.abs(diff) < 10 ? 1 : 0) + " " + unit}`,
      i < 5 ? `Siguiente rango | ${LVL[i + 1]} en ${fmtv(cuts[i + 1])}` : "Rango máximo"].join("\n"), ev.clientX, ev.clientY);
  };
  hit.addEventListener("pointermove", mv); hit.addEventListener("pointerdown", mv);
  hit.addEventListener("pointerleave", () => { gl.style.display = "none"; gd.style.display = "none"; hideTip(); });
  const rows = LVL.map((n, i) => (M.skill && i < M.skill ? null : (() => {
    const from = i ? cuts[i] : null, falta = from != null && L.raw < from ? from - L.raw : null;
    return h("tr", { class: i === L.idx ? "cur" : "" }, h("td", null, h("span", { class: "lvr" }, lvlBadge(i, 18), h("span", { class: "tn t" + i }, n))),
      h("td", { class: "r num" }, (() => { const sg = (x) => (L.metric === "add" && x > 0 ? "+" : "") + fmt(x); const to = i < 5 ? cuts[i + 1] : null;
        if (M.skill && i < M.skill) return i === 0 ? "aún no sale" : "—";
        if (M.skill && i === M.skill) return (L.metric === "add" ? "con lastre" : L.metric === "secs" ? "sostenerlo" : "1 rep") + ` – ${sg(to)} ${unit}`;
        return i === 0 ? `menos de ${sg(to)} ${unit}` : i === 5 ? `${sg(from)} ${unit} o más` : `${sg(from)} – ${sg(to)} ${unit}`; })()),
      h("td", { class: "r num faint" }, i ? "más que el " + ["", "20 %", "50 %", "80 %", "95 %", "99 %"][i] : "—"),
      h("td", { class: "r num" }, falta != null ? "+" + fmt(falta, falta < 10 ? 1 : 0) + " " + unit : i <= L.idx ? "✓" : ""));
  })()));
  sheet("Nivel · " + name, [
    h("div", { class: "lvhero mini" }, h("div", { class: "lvh-b" }, lvlBadge(L.idx, 54)), h("div", { class: "lvh-t" }, h("b", { class: "tn t" + L.idx }, LVL[L.idx]),
      h("span", { class: "muted" }, `${topTxt(L.pct)} · más fuerte que el ${fmt(L.pct)} % de los ${sexWord()} de ${fmt(L.bw, 1)} kg` + (L.date ? ` (tu peso el ${dateLabel(L.date, { day: "numeric", month: "short" })})` : "")), h("span", { class: "faint" }, L.valTxt + (L.need ? " · " + L.need : "")))),
    h("div", { class: "card panel flat" }, h("h3", null, L.metric === "reps" ? "Reps máximas → percentil" : L.metric === "secs" ? "Segundos → percentil" : L.metric === "add" ? "Lastre (1RM) → percentil" : "1RM → percentil"), svg),
    h("table", { class: "t lvtable" }, h("tr", null, h("th", null, "Rango"), h("th", { class: "r" }, L.metric === "reps" ? "Reps" : L.metric === "secs" ? "Segundos" : "1RM"), h("th", { class: "r" }, "Percentil"), h("th", { class: "r" }, "Te falta")), rows),
    L.floor ? h("div", { class: "note" }, `Habilidad: ${L.metric === "add" ? "con cualquier lastre" : L.metric === "secs" ? "con sostenerlo en estricto (sin goma ni pierna)" : "con 1 repetición estricta"} ya es ${LVL[L.floor]}. ${L.model.metric === "secs" ? "No hay tabla de Strength Level: cortes propios." : "Strength Level compara solo con quien registra este ejercicio (casi nadie lo registra si no lo hace), así que sus rangos bajos no tienen sentido para la gente que entrena en general."}`) : null,
    L.model.metric === "secs" ? null : h("div", { class: "note" }, "Strength Level publica los cortes de principiante a élite para " + sexWord() + " de cada peso corporal; la curva entre ellos y el corte de Leyenda (top 1 %) están interpolados. "),
  ], null, { wide: true });
}

function workoutSheet(id) { return onceOpen("wk:" + id, () => workoutSheet_(id)); }
async function workoutSheet_(id) {
  const sh = sheet("Entreno", h("div", { class: "muted" }, "Cargando…"), null, { wide: true });
  let w;
  try { [w] = await Promise.all([api("GET", "/api/workouts/" + id), ensureTrainingMeta()]); } catch (e) { toast(e.message, { error: true }); sh.close(); return; }
  // Cada ejercicio como tarjeta: series en filas sencillas (sin «anterior»)
  if (!S.tStats && S.training && S.training.workouts && S.training.workouts.length) S.tStats = Object.assign(trainingStats(S.training.workouts, S.bw), { _src: S.training.workouts, _bw: S.weights, _set: S.exSet });
  const wUps = ((S.tStats && S.tStats.ups) || []).filter((u) => u.wid === w.id);
  const exBlocks = w.exercises.map((ex) => {
    let n = 0;
    const rows_ = ex.sets.map((st) => {
      const work = st.type !== "calentamiento"; if (work) n++;
      const e1s = ex.kind === "peso" && work && st.weight_kg && st.reps ? e1rm(st.weight_kg, st.reps, ex.name) : null;
      return h("div", { class: "srow" + (work ? "" : " warm") }, setBadge(st, n),
        h("b", { class: "num" }, setShort(ex.kind, st)),
        h("span", { class: "grow faint" }, [st.type === "fallo" ? "al fallo" : st.type === "drop" ? "drop set" : null, st.rpe ? "RPE " + fmt(st.rpe, 1) : null].filter(Boolean).join(" · ")),
        e1s ? h("span", { class: "s-e1 num faint" }, "1RM " + fmt(e1s)) : null);
    });
    const e1 = ex.kind === "peso" ? Math.max(0, ...workSets(ex.sets).map((s_) => e1rm(s_.weight_kg, s_.reps, ex.name) || 0)) : 0;
    const L = exLevel({ name: ex.name, kind: ex.kind, sessions: [{ date: w.date, sets: ex.sets, notes: ex.notes }] }, bwAt);
    return h("div", { class: "exb card2" },
      h("div", { class: "exb-h v2" }, exIcon(ex.name, 40),
        h("div", { class: "exb-tt" },
          h("div", { class: "exb-r1" }, tip(h("button", { class: "exn", onclick: () => exerciseSheet(ex.name) }, dispName(ex.name)), dispName(ex.name) !== ex.name ? "En Hevy: " + ex.name : null),
            prChips(ex.prs, (() => { const u = wUps.find((x) => exKeyName(x.name) === exKeyName(ex.name)); return u ? upChip(u) : null; })())),
          h("div", { class: "exb-r2" }, L ? lvlShield(L, 16) : null, L ? h("span", { class: "lvname sm l" + L.idx }, LVL[L.idx]) : null, eqTag(ex.name),
            e1 ? tip(h("span", { class: "faint" }, "· 1RM ≈ " + fmt(e1) + " kg"), "1RM estimado de la mejor serie (tabla de Hevy: peso ÷ % según reps)" + (isUni(ex.name) ? "\nA un brazo: se usan la mitad de las reps" : "")) : null))),
      ex.notes ? h("div", { class: "exnote" }, ex.notes) : null,
      h("div", { class: "srows" }, rows_));
  });
  const nPR = w.exercises.reduce((a, ex) => a + (ex.prs || []).length, 0);
  const inten = h("div", { class: "seg" });
  let curI = w.intensity;
  const drawI = () => inten.replaceChildren(...INTENS.map((k) => h("button", { class: k === curI ? "on" : "", onclick: async () => {
    curI = k; drawI(); await act(() => api("PUT", "/api/workouts/" + w.id, { intensity: k }), "Intensidad guardada");
  } }, k)));
  drawI();
  const wChips = [
    wUps.length ? tip(h("span", { class: "upchip lg" }, icon("up"), `${wUps.length} ${wUps.length === 1 ? "rango nuevo" : "rangos nuevos"}`), wUps.map((u) => `${dispName(u.name)}: ${LVL[u.from]} → ${LVL[u.to]}`).join("\n")) : null,
    nPR ? tip(h("span", { class: "prc lg" }, icon("trophy"), `${nPR} ${nPR === 1 ? "récord" : "récords"}`), w.exercises.filter((ex) => ex.prs && ex.prs.length).map((ex) => `${ex.name}: ${ex.prs.map((t) => PR_SHORT[t]).join(", ")}`).join("\n")) : null,
    h("span", { class: "datec" }, dateLabel(w.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) + (w.start_time ? " · " + w.start_time : "")),
    bwAt(w.date) ? tip(h("span", { class: "datec" }, `${fmt(bwAt(w.date), 1)} kg`), bwExact(w.date) ? "Tu peso ese día (pesaje)" : "Tu peso ese día (interpolado entre pesajes)") : null].filter(Boolean);
  sh.set(w.title, [
    h("div", { class: "wchips" }, wChips),
    h("div", { class: "wstats big" },
      h("div", null, h("span", null, "Duración"), h("b", null, w.duration_min ? fmt(w.duration_min) + " min" : "—")),
      w.kcal != null ? tip(h("div", null, h("span", null, "Gasto"), h("b", null, "≈ " + fmt(w.kcal) + " kcal")), "Gasto neto estimado de la sesión (lo que suma al día): MET según tipo e intensidad × minutos × tu peso") : null,
      h("div", null, h("span", null, "Volumen"), h("b", null, fmt(w.volume_kg) + " kg")),
      h("div", null, h("span", null, "Series"), h("b", null, String(w.sets_count))),
      h("div", null, h("span", null, "Ejercicios"), h("b", null, String(w.exercises.length)))),
    w.activity_id ? h("div", { class: "field" }, h("label", { class: "f" }, "Intensidad (para el gasto estimado)"), inten) : null,
    ...exBlocks,
    h("div", { class: "note" }, `Origen: ${w.source}` + (w.volume_source === "hevy" ? " · volumen tomado de Hevy" : " · volumen: kg × reps de todas las series, como en Hevy")),
  ], [h("button", { class: "btn ghost danger", onclick: (e) => confirmDel(e, async () => { await act(() => api("DELETE", "/api/workouts/" + w.id), "Entreno eliminado"); sh.close(); }) }, "Eliminar"),
    h("span", { class: "grow" }), w.activity_id ? h("button", { class: "btn", onclick: () => { sh.close(); goDay(w.date); } }, "Ver día") : null],
  { big: true, desc: w.notes || "" });
}

// Ajustes del ejercicio: material, peso de la máquina, polea que pesa la mitad y si es a un brazo.
// Ajuste del usuario: solo el peso de la máquina (o si la polea pesa la mitad). Material, tabla y «a un brazo» los define el ejercicio.
function exSettingsPanel(name, kind, rec) {
  if (!["peso", "lastre"].includes(kind)) return null;
  const n = norm(name), cfg = exSet(name);
  const isMach = /maquina|discos|smith|prensa|hack/.test(n) || ["maquina", "discos"].includes(cfg.equipment);
  const isCable = /cable|polea/.test(n) || ["cable", "polea"].includes(cfg.equipment);
  if (!isMach && !isCable) return null;
  const mk = h("input", { class: "input sm num", type: "number", step: "0.5", min: "0", value: cfg.machine_kg ?? "", placeholder: "0" });
  const rN = h("input", { class: "input sm num ratio-in", type: "number", step: "1", min: "1", max: "8", value: String(Math.round(1 / (loadRatio(name) || 1))), placeholder: "1" });
  const mach = cfg.machine_kg || 0, ratio = loadRatio(name);
  const save = async () => {
    const body = { name };
    if (isMach) body.machine_kg = mk.value === "" ? null : +mk.value;
    if (isCable) { const n_ = Math.round(parseFloat(rN.value)); body.load_ratio = n_ > 1 ? 1 / n_ : null; }
    await act(() => api("PUT", "/api/exercise-settings", body), "Guardado");
    setExSet(await api("GET", "/api/exercise-settings")); S.tStats = null;
    if (S._exSh) S._exSh.close();
    render(); setTimeout(() => exerciseSheet(name), 160);
  };
  const btn = h("button", { class: "btn sm", onclick: save }, "Guardar");
  return h("div", { class: "exset2" },
    isMach ? [h("span", null, "Peso de la máquina"), h("div", { class: "exset2-in" }, mk, h("span", { class: "faint" }, "kg")), h("span", { class: "faint grow" }, "si lo incluyes al apuntar; para el nivel se cuenta solo lo cargado")]
      : [h("span", null, "Relación de la polea"), h("div", { class: "exset2-in" }, h("b", null, "1 :"), rN), h("span", { class: "faint grow" }, "1 : 2 = la polea pesa la mitad de lo que marca")],
    btn);
}

// Unir ejercicios: el mismo ejercicio (o la misma máquina) apuntado en Hevy con nombres distintos.
async function saveMerge(body, reopen) {
  await act(() => api("PUT", "/api/exercise-settings", body), body.same_as ? "Unidos" : "Separados");
  setExSet(await api("GET", "/api/exercise-settings")); S.tStats = null;
  for (const c of [...OPEN_SHEETS]) c();
  render(); setTimeout(() => exerciseSheet(reopen), 200);
}
function mergeRow(name, kind) {
  const k = exKeyName(name);
  const als = Object.values(S.exSet || {}).filter((x) => x.same_as && USER_ALIAS[baseKey(x.name)] === k && baseKey(x.name) !== k);
  return h("div", { class: "exmerge" },
    als.length ? [h("span", null, "También apuntado como"), als.map((a) => h("span", { class: "chip-x" }, a.name,
      h("button", { title: "Volver a separarlo", onclick: () => saveMerge({ name: a.name, same_as: "" }, name) }, "Separar")))] : null,
    h("button", { class: "lnk-btn", onclick: () => mergePicker(name, kind) }, als.length ? "+ Unir otro" : "¿Es el mismo que otro ejercicio? Unir"));
}
function mergePicker(name, kind) {
  const k = exKeyName(name);
  const same = (x) => x.kind === kind || (["peso", "lastre"].includes(x.kind) && ["peso", "lastre"].includes(kind));
  const list = ((S.tStats && S.tStats.list) || []).filter((x) => exKeyName(x.name) !== k && same(x)).sort((a, b) => b.sessions.length - a.sessions.length);
  const q = h("input", { class: "input", placeholder: "Buscar ejercicio…", type: "search" });
  const box = h("div", { class: "exlist mrg-list" });
  const me = ((S.tStats && S.tStats.list) || []).find((x) => exKeyName(x.name) === k);
  const draw = () => {
    const t = norm(q.value.trim());
    box.replaceChildren(...list.filter((x) => !t || norm(x.name).includes(t)).slice(0, 60).map((x) =>
      h("button", { class: "exrow", onclick: () => {
        // se queda como principal el que usas ahora (el de la sesión más reciente)
        const mine = me ? me.last : "", other = x.last || "";
        const [alias, main] = other > mine ? [name, x.name] : [x.name, name];
        saveMerge({ name: alias, same_as: main }, main);
      } }, exIcon(x.name, 30), h("div", { class: "grow" }, h("div", null, x.name),
        h("div", { class: "faint" }, `${x.sessions.length} sesiones · última ${dateLabel(x.last, { day: "numeric", month: "short", year: "2-digit" })}`)))));
  };
  q.oninput = draw; draw();
  sheet("Unir con otro ejercicio", [q, box], null, { desc: `Si «${name}» es el mismo ejercicio (o la misma máquina) que otro con distinto nombre en Hevy, únelos: el historial, los récords, el nivel y el peso de la máquina se cuentan juntos. Se queda como nombre principal el que usas ahora. Se puede separar cuando quieras.` });
  setTimeout(() => q.focus(), 50);
}
function exerciseSheet(name) { return onceOpen("ex:" + exKeyName(name), () => exerciseSheet_(USER_NAMES[exKeyName(name)] || name)); }
async function exerciseSheet_(name) {
  const hist = await api("GET", "/api/exercises/history?name=" + encodeURIComponent(name));
  if (!hist.length) return;
  const kind = hist[0].kind;
  const asc = [...hist].reverse();
  const dl = (d) => dateLabel(d, { day: "numeric", month: "short", year: "2-digit" });
  const rsAsc = asc.map((e) => recsOf(e.kind, e.sets, e.name, e.date));
  const types = REC_KINDS[kind] || ["reps"];
  // récords con fecha (como Hevy)
  const rec = {};
  asc.forEach((e, i) => { for (const t of types) { const x = rsAsc[i][t]; if (x && (!rec[t] || x.v > rec[t].v + 1e-9)) rec[t] = { v: x.v, set: x.set, date: e.date }; } });
  const e = (S.tStats && S.tStats.list.find((x) => exKeyName(x.name) === exKeyName(name))) || null;
  const L = e && e.level;
  const allSets = hist.flatMap((x) => workSets(x.sets).map((s_) => ({ ...s_, date: x.date })));
  const totalVol = hist.reduce((a, x) => a + volOf(x.kind, x.sets, x.name, x.date), 0);
  const totalReps = allSets.reduce((a, s_) => a + (s_.reps || 0), 0);
  // mejores pesos por nº de repeticiones (como Hevy)
  const repMax = {};
  if (["peso", "lastre"].includes(kind)) for (const s_ of allSets) if (s_.reps && s_.weight_kg != null && s_.reps <= 20) {
    if (!repMax[s_.reps] || s_.weight_kg > repMax[s_.reps].w) repMax[s_.reps] = { w: s_.weight_kg, date: s_.date };
  }
  const rmRows = Object.entries(repMax).sort((a, b) => a[0] - b[0]);
  // gráfica con selector de métrica
  const chartTypes = [...types, ...(kind === "peso" || kind === "lastre" ? ["vol", "sreps"] : [])].filter((t, i, a) => a.indexOf(t) === i && rsAsc.some((r) => r[t]));
  let cur = S.exChart && chartTypes.includes(S.exChart) ? S.exChart : chartTypes[0];
  const chartBox = h("div");
  const chips = h("div", { class: "seg chartsel" });
  const drawChart = () => {
    chips.replaceChildren(...chartTypes.map((t) => h("button", { class: t === cur ? "on" : "", onclick: () => { cur = S.exChart = t; drawChart(); } }, REC_LABEL[t].replace(" (volumen)", "").replace("Máx. ", "").replace("Mejor serie", "Mejor serie"))));
    const pts = asc.map((x, i) => { const r = rsAsc[i][cur]; return { v: r ? r.v : null, label: dl(x.date),
      tip: `${dl(x.date)} · ${x.title}\n${REC_LABEL[cur]}: ${r ? recTxt(cur, r.v, kind) : "—"}${r && r.set ? " (" + setShort(kind, r.set) + ")" : ""}\nSeries: ${workSets(x.sets).map((s_) => setShort(x.kind, s_)).join(", ")}` }; });
    chartBox.replaceChildren(miniLine(pts, { axis: true, h: 190, fmtV: (v) => recTxt(cur, v, kind), axisFmt: cur === "secs" || cur === "stime" ? fmtSecs : null }));
  };
  drawChart();
  const isW = ["peso", "lastre"].includes(kind);
  const main = rec[types[0]];
  S._exSh = sheet(name, [
    h("div", { class: "exhero" + (L ? " tinted" : ""), style: L ? { "--tc": TIER[L.idx][2][1] } : null },
      h("div", { class: "exh-ic" }, exIcon(name, 64), h("span", null, exGroup(name))),
      h("div", { class: "grow" }, [isUni(name) ? "a un brazo (reps de los dos lados)" : null, /mancuerna/.test(norm(name)) && (!exSet(name).equipment || exSet(name).equipment === "mancuerna") ? "peso de las dos mancuernas" : null].filter(Boolean).length
        ? h("div", { class: "faint exh-x" }, [isUni(name) ? "a un brazo (reps de los dos lados)" : null, /mancuerna/.test(norm(name)) && (!exSet(name).equipment || exSet(name).equipment === "mancuerna") ? "peso de las dos mancuernas" : null].filter(Boolean).join(" · ")) : null,
      h("div", { class: "exhero-v" }, h("b", { class: "num" }, main ? recTxt(types[0], main.v, kind) : "—"), h("span", null, REC_LABEL[types[0]] + " · tu récord")),
      L ? (() => {
        const u = (x) => (L.metric === "reps" ? fmt(Math.round(x)) + " reps" : (L.metric === "add" && x > 0 ? "+" : "") + fmt(x) + " kg");
        const lo = L.idx ? L.cuts[L.idx - 1] : 0, hi = L.cuts[L.idx];
        const how = L.metric === "reps" ? "reps seguidas" : L.metric === "add" ? "1RM con lastre" : L.metric === "db" ? "1RM por mancuerna" : "1RM";
        return h("div", { class: "exhero-next" },
          L.idx < 5 ? h("div", { class: "exn-ends" }, h("span", null, h("b", { class: "lvname l" + L.idx }, LVL[L.idx]), " " + u(lo)), h("span", null, h("b", { class: "lvname l" + (L.idx + 1) }, LVL[L.idx + 1]), " " + u(hi))) : null,
          tip(h("div", { class: "click", onclick: () => levelSheet(name, L) }, lvlBar(L)), "Pulsa para ver la curva de niveles"),
          h("div", { class: "exn-v" }, `Tu ${how}: `, h("b", null, u(L.raw)), L.idx < 5 && L.need ? ` · te faltan ${L.need.replace(/ para .*/, "").replace(" de 1RM", "")}` : " · rango máximo", ` · top ${fmt(Math.max(0.5, 100 - L.pct))} %`));
      })() : null)),
    h("div", { class: "kpis tight recs", style: { gridTemplateColumns: `repeat(${types.length}, 1fr)` } }, types.map((t) => { const r = rec[t];
      return h("div", { class: "kpi" }, h("div", { class: "l" }, h("span", { class: "sic c" }, "🏆"), REC_LABEL[t]), h("div", { class: "v num" }, r ? recTxt(t, r.v, kind) : "—"),
        h("div", { class: "s" }, r ? (r.set && ["w", "e1", "sv"].includes(t) ? setShort(kind, r.set) + " · " : "") + dateLabel(r.date, { day: "numeric", month: "short", year: "2-digit" }) : "")); })),
    h("div", { class: "kpis five tight" },
      kpi("Sesiones", String(hist.length), "desde " + dateLabel(asc[0].date, { month: "short", year: "2-digit" })),
      kpi("Última", dateLabel(hist[0].date, { day: "numeric", month: "short" }), workSets(hist[0].sets).map((s_) => setShort(kind, s_)).slice(0, 2).join(", ")),
      kpi("Series", fmt(allSets.length), "efectivas en total"),
      kpi("Reps totales", fmt(totalReps), ""),
      isW ? kpi("Volumen total", fmt(totalVol / 1000, 1) + " t", "", null, fmt(totalVol) + " kg (todas las series)") : kpi("Media reps", allSets.length ? fmt(totalReps / allSets.length, 1) : "—", "por serie")),
    exSettingsPanel(name, kind, rec),
    mergeRow(name, kind),
    h("div", { class: "card panel flat" }, h("div", { class: "row wrap", style: { marginBottom: "6px" } }, h("h3", { style: { margin: 0 } }, "Progreso"), h("span", { class: "grow" }), chips), chartBox),
    rmRows.length ? h("div", { class: "card panel flat" }, h("h3", null, "Mejor peso por repeticiones"), h("div", { class: "rmgrid" }, rmRows.map(([r, x]) =>
      tip(h("div", { class: "rm" }, h("span", null, r + " rep" + (r > 1 ? "s" : "")), h("b", { class: "num" }, (kind === "lastre" ? "+" : "") + fmt(x.w, 1)), h("em", null, dateLabel(x.date, { day: "numeric", month: "short" }))),
        kind === "peso" ? `${r} × ${fmt(x.w, 1)} kg → 1RM ≈ ${fmt(e1rm(x.w, +r, name))} kg` : null)))) : null,
    h("div", { class: "sec-t" }, "Historial"),
    h("div", { class: "hist" }, hist.map((e2) => { const L2 = exLevel({ name: e2.name, kind: e2.kind, sessions: [{ date: e2.date, sets: e2.sets, notes: e2.notes }] }, bwAt); return h("div", { class: "hrow", onclick: () => workoutSheet(e2.workout_id) },
      h("div", { class: "hd" }, h("b", null, dateLabel(e2.date, { day: "numeric", month: "short", year: e2.date.slice(0, 4) === todayISO().slice(0, 4) ? undefined : "2-digit" })), h("span", null, e2.title), exKeyName(e2.name) && baseKey(e2.name) !== baseKey(name) ? h("em", { class: "alias" }, "como " + e2.name) : null, L2 ? lvlInline(L2, 16, { name: e2.name, kind: e2.kind }) : null),
      h("div", { class: "hs" }, e2.sets.map((s_) => h("span", { class: "hset " + s_.type }, setShort(e2.kind, s_)))),
      h("div", { class: "hv num" }, (() => { const r = recsOf(e2.kind, e2.sets, e2.name, e2.date)[types[0]]; return r ? recTxt(types[0], r.v, kind) : "—"; })())); })),
    h("div", { class: "note" }, "1RM estimado igual que Hevy: peso ÷ % según las reps (10 reps = 75 %, 16 reps = 65 %, 30 o más = 50 %). Con muchas repeticiones es menos fiable." + (isUni(name) ? " A un brazo: se usan la mitad de las reps." : "")),
  ], null, { wide: true, sub: "Estadísticas del ejercicio", titleExtra: L ? h("span", { class: "exh-rank click", onclick: () => levelSheet(name, L) }, lvlBadge(L.idx, 22), h("b", { class: "lvname l" + L.idx }, LVL[L.idx])) : null });
}
