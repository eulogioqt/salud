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
document.addEventListener("pointermove", (e) => { const t = tipTarget(e); if (t) showTip(t.dataset.tip, e.clientX, e.clientY); else if (!(e.target.closest && e.target.closest(".mchart.line"))) hideTip(); });
document.addEventListener("pointerdown", (e) => { const t = tipTarget(e); if (t && e.pointerType !== "mouse") showTip(t.dataset.tip, e.clientX, e.clientY); });
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
const exSet = (name) => (S.exSet || {})[exKeyName(name)] || {};
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
const EX_ALIASES = { "elevacion laterales (maquina)": "elevacion lateral (maquina)", "flexiones de brazos (con peso agregado)": "flexiones (con peso anadido)", "dead hang": "colgado en barra" };
const exKeyName = (name) => { const n = norm(name).replace(/\s+/g, " ").trim(); return EX_ALIASES[n] || n; };

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
const volOf = (kind, sets) => (["peso", "lastre"].includes(kind) ? sets.reduce((a, s_) => a + (s_.weight_kg || 0) * (s_.reps || 0), 0) : 0);
function metricTxt(kind, v) {
  if (v == null) return "—";
  const [m, , u] = exMetric(kind);
  if (m === "secs") return fmtSecs(v);
  if (m === "dist") return fmtDist(v);
  return (m === "added" ? "+" : "") + fmt(v, m === "e1rm" ? 1 : 0) + (u ? " " + u : "");
}

// ------------------------------------------------------------- niveles de fuerza
// Fuente: Strength Level (strengthlevel.com), tablas «By Bodyweight» de hombre y mujer (niveles.js), consultadas el 2026-11-10.
// Cada nivel = percentil entre los usuarios de ese sexo y peso: principiante 5 %, novato 20 %, intermedio 50 %, avanzado 80 %, élite 95 %.
// Valores = 1RM en kg (mancuernas: por mancuerna), reps máximas o lastre 1RM. Entre filas de la tabla se interpola por peso corporal;
// cada sesión se compara con el peso corporal de ese día (pesajes interpolados).
// «Leyenda» = top 1 % (percentil 99), extrapolado de la curva de Strength Level (no lo publican).
const LVL = ["Principiante", "Novato", "Intermedio", "Avanzado", "Élite", "Leyenda"];
const PCT = [5, 20, 50, 80, 95];
const STD = [
  // [regex, métrica, tabla de niveles.js (SL_TABLES), tipos, máquina/polea]
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
  [/^sit ?ups?$/, "reps", "sit-ups.reps", ["corporal"]],
  [/^abdominal corto$|^crunch/, "reps", "crunches.reps", ["corporal"]],
  [/remo en t/, "1rm", "t-bar-row", ["peso"], true],
  [/^fondos? de triceps$|^fondos? en banco|bench dip/, "reps", "bench-dips.reps", ["corporal"]],
];
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
  return { all: [...pts, legend], off, slope, metric };
}
// bw: número (peso fijo) o función fecha → peso (cada sesión con el peso de ese día).
function exLevel(e, bw) {
  const n = exKeyName(e.name);
  const sd = STD.find(([rx, , , kinds]) => rx.test(n) && kinds.includes(e.kind));
  if (!sd) return null;
  const [, metric, slug, , machine] = sd;
  const bwFn = typeof bw === "function" ? bw : () => bw;
  const ratio = loadRatio(e.name);
  let best = null;
  for (const x of e.sessions) {
    const b = bwFn(x.date); if (!b) continue;
    const model = slModel(slug, metric, b); if (!model) continue;
    const mk = machineKg(e.name, x.notes);
    for (const s_ of workSets(x.sets)) {
      let v = null;
      // Lo apuntado incluye el peso de la máquina: para comparar con los estándares se usa solo lo cargado.
      if (metric === "1rm" || metric === "db") { const w = s_.weight_kg != null ? s_.weight_kg - mk : null; v = w > 0 ? e1rm(w, s_.reps, e.name) : null; if (v != null) v *= ratio; if (v != null && metric === "db") v /= 2; }
      else if (metric === "add") v = s_.reps && s_.weight_kg > 0 ? (b + s_.weight_kg) / HEVY_PCT[Math.min(s_.reps, 30) - 1] - b : null;
      else v = s_.reps;
      if (v == null) continue;
      const z = zOf(model, v);
      if (!best || z > best.z) best = { z, v, s_, b, model, date: x.date };
    }
  }
  if (!best) return null;
  const { z, v: raw, s_: rawSet, b: bwUsed, model } = best;
  const pct = Math.min(99.9, Math.max(0.1, PHI(z) * 100));
  const cuts = model.all.slice(1).map((x) => x - model.off); // novato, intermedio, avanzado, élite, leyenda (en las unidades del valor)
  let idx = 0; while (idx < cuts.length && raw >= cuts[idx]) idx++;
  const lo = idx ? cuts[idx - 1] : 0, hi = cuts[idx];
  const frac = hi == null ? 1 : Math.max(0, Math.min(1, (raw - lo) / (hi - lo)));
  const need = hi == null ? null : `${metric === "reps" ? "+" + Math.ceil(hi - raw) + " reps" : "+" + fmt(Math.max(1, hi - raw)) + " kg de 1RM" + (metric === "db" ? " por mancuerna" : "")} para ${LVL[idx + 1]}`;
  const valTxt = metric === "1rm" ? `1RM ≈ ${fmt(raw)} kg` + (ratio !== 1 ? ` (polea × ${fmt(ratio, 2)})` : "") : metric === "db" ? `1RM ≈ ${fmt(raw)} kg por mancuerna (${fmt(raw * 2)} kg las dos)`
    : metric === "add" ? `lastre 1RM ≈ +${fmt(raw)} kg` : `${raw} reps seguidas`;
  const cutsTxt = `Cortes para ${sexWord()} de ${fmt(bwUsed, 1)} kg: ` + cuts.map((x, i) => `${LVL[i + 1]} ${metric === "reps" ? Math.round(x) : (metric === "add" && x > 0 ? "+" : "") + fmt(x)}`).join(" · ");
  return { idx, frac, score: idx + frac, raw, pct, z, metric, need, valTxt, cutsTxt, cuts, rawSet, machine: !!machine, solid: !machine, model, bw: bwUsed, date: best.date, name: e.name };
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
function lvlPill(L) {
  if (!L) return null;
  const u = L.metric === "reps" ? " reps" : " kg", sg = (x) => (L.metric === "add" && x > 0 ? "+" : "") + fmt(x) + u;
  const lines = [`${LVL[L.idx]} · ${TIER[L.idx][1]} · ${topTxt(L.pct)}`, `Más fuerte que el ${fmt(L.pct)} % de los ${sexWord()} de ${fmt(L.bw, 1)} kg` + (L.date ? ` (tu peso el ${dateLabel(L.date, { day: "numeric", month: "short" })})` : ""),
    "## Tu marca", L.valTxt, L.need ? "Siguiente | " + L.need.replace(/ para .*/, "") + " → " + LVL[L.idx + 1] : "Rango máximo",
    "## Cortes", ...L.cuts.map((c, i) => `${LVL[i + 1]} | ${sg(c)}`)];
  if (L.machine) lines.push("## Ojo", "Máquina/polea: orientativo");
  lines.push("Pulsa para ver la curva");
  return tip(h("span", { class: "lvl l" + L.idx + (L.machine ? " soft" : "") + " click", onclick: (ev) => { ev.stopPropagation(); levelSheet(L.name, L); } }, LVL[L.idx]), lines.join("\n"));
}
function lvlBar(L) {
  return h("div", { class: "lbar" }, LVL.map((_, i) => h("i", { class: (i < L.idx ? "on" : i === L.idx ? "cur" : "") + " t" + i }, i === L.idx ? h("b", { style: { width: (L.idx === 5 ? 100 : L.frac * 100) + "%" } }) : null)));
}

// ------------------------------------------------------------- estadísticas
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00") - Date.parse(a + "T12:00")) / 864e5);
const mondayOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return isoLocal(dt); };
const MAIN_GROUPS = ["Pecho", "Espalda", "Pierna", "Hombro", "Brazos", "Core"];

// Récords como en Hevy: varias métricas por ejercicio según su tipo.
const REC_LABEL = { w: "Peso máximo", e1: "1RM estimado", sv: "Volumen (mejor serie)", vol: "Volumen de sesión", reps: "Máx. repeticiones",
  sreps: "Reps en una sesión", secs: "Máx. tiempo", stime: "Tiempo en una sesión", dist: "Máx. distancia" };
const REC_KINDS = { peso: ["e1", "w", "sv"], lastre: ["w", "sv", "reps"], corporal: ["reps", "sreps"], asistido: ["reps", "sreps"],
  tiempo: ["secs", "stime"], cardio: ["dist", "w"] };
function recsOf(kind, sets, name) {
  const ws_ = workSets(sets), r = {};
  const up = (k, v, st) => { if (v != null && v > 0 && (r[k] == null || v > r[k].v)) r[k] = { v, set: st }; };
  for (const st of ws_) {
    up("w", st.weight_kg, st); up("e1", kind === "peso" ? e1rm(st.weight_kg, st.reps, name) : null, st);
    up("sv", (st.weight_kg || 0) * (st.reps || 0), st); up("reps", st.reps, st); up("secs", st.seconds, st); up("dist", st.distance_m, st);
  }
  const vol = volOf(kind, sets); if (vol) r.vol = { v: vol };
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
      const rs = recsOf(ex.kind, ex.sets, ex.name);
      for (const t of REC_KINDS[ex.kind] || []) {
        const x = rs[t]; if (!x) continue;
        const old = e.rec[t];
        if (old && x.v > old.v + 1e-9) prs.push({ date: w.date, name: ex.name, kind: ex.kind, type: t, value: x.v, prev: old.v, set: x.set, wid: w.id });
        if (!old || x.v > old.v + 1e-9) e.rec[t] = { v: x.v, date: w.date, set: x.set, wid: w.id };
      }
      e.sessions.push({ date: w.date, wid: w.id, metric, vol: volOf(ex.kind, ex.sets), sets: ex.sets, notes: ex.notes, rs, prs: ex.prs || [] });
      e.last = w.date; e.name = ex.name;
    }
  }
  const list = Object.values(exs);
  for (const e of list) e.level = exLevel(e, bwAt);
  // racha: semanas seguidas (la actual cuenta si ya hay entreno; si no, se mira desde la anterior)
  const weeksWith = new Set(ws.map((w) => mondayOf(w.date)));
  let streak = 0, wk = mondayOf(todayISO());
  if (!weeksWith.has(wk)) wk = addDays(wk, -7);
  while (weeksWith.has(wk)) { streak++; wk = addDays(wk, -7); }
  return { list, prs: prs.reverse(), streak, first: asc.length ? asc[0].date : todayISO(),
    byDate: ws.reduce((m, w) => { (m[w.date] = m[w.date] || []).push(w); return m; }, {}) };
}

const PERIODS = [["7", "Última semana", 7, "la semana anterior"], ["30", "Último mes", 30, "el mes anterior"], ["90", "Últimos 3 meses", 90, "los 3 meses anteriores"],
  ["365", "Último año", 365, "el año anterior"], ["all", "Desde siempre", null, null]];
function periodRange(key, st) {
  const today = todayISO(), P = PERIODS.find((p) => p[0] === key) || PERIODS[1];
  if (!P[2]) return { key: P[0], from: st.first, to: today, days: daysBetween(st.first, today) + 1, label: P[1], all: true };
  return { key: P[0], from: addDays(today, -(P[2] - 1)), to: today, days: P[2], label: P[1], prevLabel: P[3] };
}
function periodStats(st, ws, R) {
  const inR = (d) => d >= R.from && d <= R.to;
  const L = ws.filter((w) => inR(w.date));
  const agg = (X) => ({ n: X.length, min: X.reduce((a, w) => a + (w.duration_min || 0), 0), vol: X.reduce((a, w) => a + (w.volume_kg || 0), 0), sets: X.reduce((a, w) => a + w.sets_count, 0) });
  const cur = agg(L);
  const prev = R.all ? null : agg(ws.filter((w) => w.date >= addDays(R.from, -R.days) && w.date < R.from));
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
  const gran = R.days <= 31 ? "day" : R.days <= 120 ? "week" : "month";
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
  return { L, cur, prev, groups, top, buckets, gran, bLabel, perWeek: cur.n / weeks, prs: st.prs.filter((p) => inR(p.date) && ["e1", "w", "reps", "secs", "dist"].includes(p.type)) };
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
function heatmap(byDate) {
  const avail = Math.max(280, Math.min(728, window.innerWidth - 66)), weeksBack = avail < 520 ? 17 : 30;
  const today = todayISO();
  const [y, m, d] = today.split("-").map(Number); const t0 = new Date(y, m - 1, d); t0.setDate(t0.getDate() - ((t0.getDay() + 6) % 7) - 7 * (weeksBack - 1));
  const gap = 3, cell = Math.min(20, Math.floor(avail / weeksBack) - gap), W = weeksBack * (cell + gap), H = 7 * (cell + gap);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H + 14}`, width: W, height: H + 14, class: "heat" });
  let lastMonth = -1;
  for (let wk = 0; wk < weeksBack; wk++) for (let dd = 0; dd < 7; dd++) {
    const dt = new Date(t0); dt.setDate(t0.getDate() + wk * 7 + dd); const iso = isoLocal(dt);
    if (iso > today) continue;
    const ws = byDate[iso] || []; const vol = ws.reduce((a, w) => a + (w.volume_kg || 0) + (w.duration_min || 0) * 30, 0);
    const lvl = !ws.length ? 0 : vol > 12000 ? 4 : vol > 7000 ? 3 : vol > 3000 ? 2 : 1;
    const r = svgEl("rect", { x: wk * (cell + gap), y: 14 + dd * (cell + gap), width: cell, height: cell, rx: 3, class: "h" + lvl,
      "data-tip": dateLabel(iso, { weekday: "long", day: "numeric", month: "short" }) + (ws.length ? "\n" + ws.map((w) => `${w.title} · ${w.duration_min ? fmt(w.duration_min) + " min · " : ""}${fmt(w.volume_kg)} kg`).join("\n") : "\nDescanso") });
    if (ws.length) { r.style.cursor = "pointer"; r.addEventListener("click", () => workoutSheet(ws[0].id)); }
    svg.append(r);
    if (dd === 0 && dt.getMonth() !== lastMonth) { lastMonth = dt.getMonth(); const t = svgEl("text", { x: wk * (cell + gap), y: 10, class: "axis" }); t.textContent = dt.toLocaleDateString("es-ES", { month: "short" }); svg.append(t); }
  }
  return svg;
}

// ------------------------------------------------------------- vista
function viewTraining() {
  const T = S.training; if (!T) return h("div");
  S.tTab = S.tTab || "resumen"; S.tPeriod = S.tPeriod || "30";
  const ws = T.workouts;
  const head = h("div", { class: "row wrap", style: { marginBottom: "12px" } }, h("h2", { class: "vt" }, "Entreno"), h("span", { class: "grow" }),
    h("button", { class: "btn sm ghost", onclick: () => importCsv() }, "Importar de Hevy"));
  if (!ws.length) return h("div", { class: "training" }, head, h("div", { class: "card empty" }, icon("dumbbell"), h("h3", null, "Aún no hay entrenos"),
    h("p", { class: "muted" }, "Dime «entreno hecho» por el chat y lo traigo de Hevy, o importa el CSV de Hevy.")));
  const st = S.tStats && S.tStats._src === ws && S.tStats._bw === S.weights && S.tStats._set === S.exSet ? S.tStats : (S.tStats = Object.assign(trainingStats(ws, S.bw), { _src: ws, _bw: S.weights, _set: S.exSet }));
  const tabs = h("div", { class: "seg tabs2" }, [["resumen", "Resumen"], ["historial", "Historial"], ["ejercicios", "Ejercicios"], ["records", "Récords"], ["nivel", "Nivel"]]
    .map(([k, l]) => h("button", { class: S.tTab === k ? "on" : "", onclick: () => { S.tTab = k; render(); } }, l)));
  const body = { resumen: tResumen, historial: tHistorial, ejercicios: tEjercicios, records: tRecords, nivel: tNivel }[S.tTab](st, ws);
  return h("div", { class: "training" }, head, tabs, body);
}

function kpi(l, v, s, delta, tipTxt) {
  return tip(h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v num" }, v),
    h("div", { class: "s" }, delta ? h("span", { class: "dl " + (delta.v > 0 ? "up" : delta.v < 0 ? "down" : "") }, delta.t) : null, delta && s ? " " : null, s || "")), tipTxt);
}
function deltaOf(cur, prev, f = (x) => fmt(x)) {
  if (prev == null) return null;
  const dv = cur - prev;
  return { v: dv, t: (dv > 0 ? "▲ " : dv < 0 ? "▼ " : "= ") + (dv ? f(Math.abs(dv)) : "") };
}

function tResumen(st, ws) {
  const R = periodRange(S.tPeriod, st), P = periodStats(st, ws, R);
  const sel = h("select", { class: "input sm psel", onchange: (e) => { S.tPeriod = e.target.value; render(); } },
    PERIODS.map(([k, l, d]) => h("option", { value: k, selected: k === R.key }, d ? l : `${l} (desde ${dateLabel(st.first, { month: "short", year: "numeric" })})`)));
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
    h("div", { class: "prow" }, h("div", { class: "faint" }, R.all ? `Desde el ${dateLabel(R.from, { day: "numeric", month: "short", year: "numeric" })} · ${fmt(days)} días entrenados` : `${dateLabel(R.from, { day: "numeric", month: "short" })} – hoy · ${days} ${days === 1 ? "día entrenado" : "días entrenados"}`), h("span", { class: "grow" }), sel),
    h("div", { class: "kpis five" },
      kpi("Entrenos", fmt(c.n), `${fmt(P.perWeek, 1)}/sem.`, deltaOf(c.n, pv && pv.n), `${c.n} entrenos ${R.all ? "en total" : "en " + R.label.toLowerCase()}${pv ? `\n${pv.n} ${vs}` : ""}`),
      kpi("Tiempo", fmt(c.min / 60, 1) + " h", c.n ? fmt(c.min / c.n) + " min/entreno" : "", deltaOf(c.min / 60, pv && pv.min / 60, (x) => fmt(x, 1) + " h"), pv ? `${fmt(pv.min / 60, 1)} h ${vs}` : null),
      kpi("Volumen", fmt(c.vol / 1000, 1) + " t", "", deltaOf(c.vol / 1000, pv && pv.vol / 1000, (x) => fmt(x, 1) + " t"), `${fmt(c.vol)} kg levantados (como en Hevy: todas las series)${pv ? `\n${fmt(pv.vol)} kg ${vs}` : ""}`),
      kpi("Series", fmt(c.sets), c.n ? fmt(c.sets / c.n, 1) + "/entreno" : "", deltaOf(c.sets, pv && pv.sets), pv ? `${fmt(pv.sets)} series ${vs}` : null),
      kpi("Racha", st.streak + " sem.", "seguidas", null, "Semanas seguidas con al menos un entreno")),
    h("div", { class: "hl" }, hl.map(([l, v, s_, fn]) => h(fn ? "button" : "div", { class: "hli" + (fn ? " click" : ""), onclick: fn || undefined }, h("span", { class: "l" }, l), h("b", null, v), h("span", { class: "s" }, s_)))),
    h("div", { class: "card panel" }, h("h3", null, "Actividad", h("span", { class: "faint", style: { fontWeight: 400 } }, (window.innerWidth - 66 < 520 ? " · últimos 4 meses" : " · últimos 7 meses") + " · más oscuro = más volumen")), h("div", { class: "heat-wrap" }, heatmap(st.byDate))),
    showBars ? h("div", { class: "grid2 gap-big" },
      h("div", { class: "card panel" }, h("h3", null, P.gran === "day" ? "Minutos por día" : P.gran === "week" ? "Entrenos por semana" : "Entrenos por mes"),
        bars(P.buckets.map((b) => ({ v: P.gran === "day" ? b.min || (b.n ? 30 : 0) : b.n, label: `${P.bLabel(b)}\n${b.n} ${b.n === 1 ? "entreno" : "entrenos"}${b.min ? " · " + fmt(b.min) + " min" : ""}` })), { h: 90 }),
        h("div", { class: "axis-row" }, h("span", null, P.bLabel(P.buckets[0]).replace("Semana del ", "")), h("span", null, "hoy"))),
      h("div", { class: "card panel" }, h("h3", null, "Volumen"),
        bars(P.buckets.map((b) => ({ v: b.vol, label: `${P.bLabel(b)}\n${fmt(b.vol)} kg · ${fmt(b.sets)} series` })), { h: 90 }),
        h("div", { class: "axis-row" }, h("span", null, P.bLabel(P.buckets[0]).replace("Semana del ", "")), h("span", null, "hoy")))) : null,
    h("div", { class: "grid2 gap-big" },
      h("div", { class: "card panel" }, h("h3", null, "Series por semana y grupo", h("span", { class: "faint", style: { fontWeight: 400 } }, " · zona verde = 10–20 recomendadas")),
        h("div", { class: "gbars wk" }, groups.map(([g, n]) => { const pw = n / Math.max(1, R.days / 7), max = 26; const zone = pw < 10 ? "low" : pw > 20 ? "high" : "ok";
          return tip(h("div", { class: "gb" }, h("span", { class: "gl" }, g),
            h("span", { class: "gt" }, h("span", { class: "zone", style: { left: (100 * 10 / max) + "%", width: (100 * 10 / max) + "%" } }), h("i", { style: { width: Math.min(100, 100 * pw / max) + "%", "--h": GROUP_HUE[g] } })),
            h("b", { class: "num " + zone }, fmt(pw, pw < 10 ? 1 : 0))),
            `${g}: ${fmt(pw, 1)} series efectivas por semana (${n} en el periodo)\n${zone === "low" ? "Por debajo de 10/semana: poco estímulo para crecer" : zone === "high" ? "Más de 20/semana: mucho volumen, vigila la recuperación" : "Dentro de lo recomendado (10–20)"}`); }))),
      h("div", { class: "card panel" }, h("h3", null, "Lo que más has hecho"),
        P.top.length ? h("div", { class: "exlist" }, P.top.slice(0, 6).map(({ e, n }) => exRow(e, null, `${n} ${n === 1 ? "sesión" : "sesiones"} en el periodo`))) : h("div", { class: "muted" }, "Nada en este periodo."))),
    P.prs.length ? h("div", { class: "card panel" }, h("h3", null, "Récords del periodo"), h("div", { class: "exlist" }, P.prs.slice(0, 6).map((p) => prRow(p)))) : null);
}

const EQ_LABEL = { barra: "Barra", mancuerna: "Mancuernas", maquina: "Máquina", discos: "Máquina de discos", cable: "Cable", polea: "Polea ×0,5", corporal: "Corporal", otro: "Otro" };
function eqTag(name) {
  const c = exSet(name); const t = [c.equipment ? EQ_LABEL[c.equipment] : null, c.machine_kg ? `máq. ${fmt(c.machine_kg, 1)} kg` : null, isUni(name) ? "1 brazo" : null].filter(Boolean).join(" · ");
  return t ? h("span", { class: "eqtag" }, t) : null;
}
function exRow(e, extra, sub) {
  const [, lbl] = exMetric(e.kind);
  return h("button", { class: "exrow", onclick: () => exerciseSheet(e.name) }, exIcon(e.name, 34),
    h("div", { class: "exr-t" }, h("div", { class: "exr-n" }, h("span", null, e.name), lvlPill(e.level), eqTag(e.name)),
      h("div", { class: "exr-s" }, sub || `${e.sessions.length} sesiones · última ${dateLabel(e.last, { day: "numeric", month: "short" })}`)),
    h("div", { class: "exr-v" }, h("b", { class: "num" }, metricTxt(e.kind, e.best)), h("span", null, extra || lbl)));
}
function prRow(p) {
  const setTxt = p.set && ["w", "e1", "sv"].includes(p.type) ? " · " + setShort(p.kind, p.set) : "";
  return h("button", { class: "exrow", onclick: () => exerciseSheet(p.name) }, exIcon(p.name, 34),
    h("div", { class: "exr-t" }, h("div", { class: "exr-n" }, h("span", null, p.name)), h("div", { class: "exr-s" }, dateLabel(p.date, { weekday: "short", day: "numeric", month: "short" }) + ` · antes ${recTxt(p.type, p.prev, p.kind)}` + setTxt)),
    h("div", { class: "exr-v pr" }, h("b", { class: "num" }, recTxt(p.type, p.value, p.kind)), h("span", null, REC_LABEL[p.type])));
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
  const recent = st.prs.filter((p) => ["e1", "w", "reps", "secs", "dist"].includes(p.type) || (p.type === "w" && p.kind === "lastre"));
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
  for (const e of L) { const w = e.level.machine ? 0.5 : 1; sw += w; sz += w * e.level.z; }
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
  const setF = (k, v) => { S[k] = S[k] === v ? null : v; render(); };
  return h("div", null,
    h("div", { class: "card lvhero" },
      h("div", { class: "lvh-b" }, lvlBadge(G.idx, 64)),
      h("div", { class: "lvh-t" }, h("span", { class: "faint" }, "Tu nivel global"), h("b", { class: "tn t" + G.idx }, LVL[G.idx]),
        h("span", { class: "muted" }, `${topTxt(G.pct)} · media de ${xs.length} ejercicios (las máquinas cuentan la mitad)`),
        h("div", { class: "dist" }, counts.map((n, i) => n ? tip(h("i", { class: "t" + i, style: { flex: n } }), `${LVL[i]}: ${n} ejercicios`) : null)),
        h("div", { class: "dleg" }, counts.map((n, i) => h("button", { class: "chip t" + i + (fT === i ? " on" : ""), onclick: () => setF("lvTier", i) }, h("i"), `${LVL[i]} ${n}`))))),
    h("div", { class: "sec-t" }, "Por grupo muscular · de mejor a peor"),
    h("div", { class: "lvgroups" }, groups.map((r) => {
      const best = r.L[0], worst = r.L[r.L.length - 1];
      return h("button", { class: "lvg" + (fG === r.g ? " on" : ""), onclick: () => setF("lvGroup", r.g) },
        h("div", { class: "lvg-h" }, lvlBadge(r.idx, 34), h("div", null, h("b", null, r.g), h("span", { class: "tn t" + r.idx }, LVL[r.idx]), h("em", null, topTxt(r.pct)))),
        h("div", { class: "lvg-dots" }, r.L.map((e) => tip(h("i", { class: "t" + e.level.idx }), `${e.name}\n${LVL[e.level.idx]} · ${topTxt(e.level.pct)}`))),
        h("div", { class: "lvg-f" }, h("span", null, "Mejor: ", h("b", null, best.name)), r.L.length > 1 ? h("span", null, "Peor: ", h("b", null, worst.name)) : null));
    })),
    h("div", { class: "row wrap", style: { margin: "18px 2px 8px" } }, h("div", { class: "sec-t", style: { margin: 0 } }, "Por ejercicio" + (fG ? " · " + fG : "") + (fT != null ? " · " + LVL[fT] : "")), h("span", { class: "grow" }),
      fG || fT != null ? h("button", { class: "btn sm ghost", onclick: () => { S.lvGroup = null; S.lvTier = null; render(); } }, "Quitar filtros") : null),
    h("div", { class: "card panel" }, h("div", { class: "exlist" }, shown.length ? shown.map((e) => h("button", { class: "exrow lvrow", onclick: () => exerciseSheet(e.name) }, exIcon(e.name, 34),
      h("div", { class: "exr-t" }, h("div", { class: "exr-n" }, h("span", null, e.name)), h("div", { class: "exr-s" }, e.level.valTxt), lvlBar(e.level)),
      h("div", { class: "exr-v" }, h("div", { class: "lvr click", onclick: (ev) => { ev.stopPropagation(); levelSheet(e.name, e.level); } }, lvlBadge(e.level.idx, 20), lvlPill(e.level)), h("span", null, topTxt(e.level.pct)))))
      : h("div", { class: "muted" }, "Nada con estos filtros."))),
    h("div", { class: "row", style: { marginTop: "10px" } }, h("button", { class: "btn", onclick: () => levelsInfoSheet(st) }, "ⓘ Cómo funcionan los niveles · tablas y gráficas")),
    h("div", { class: "note" }, `Fuente: Strength Level (strengthlevel.com), tablas de ${sexWord()} por peso corporal. Cada entreno se compara con tu peso de ese día (pesajes; los días sin pesaje se interpolan entre el anterior y el siguiente). Último pesaje: ${fmt(S.bw, 1)} kg (${dateLabel(S.bwDate, { day: "numeric", month: "short" })}). Niveles por percentil: Novato 20 %, Intermedio 50 %, Avanzado 80 %, Élite 95 % (top 5 %), Leyenda 99 % (top 1 %, extrapolado). Se compara tu mejor 1RM estimado con la tabla de Hevy, tus reps máximas o tu lastre. Mancuernas: entre dos. Poleas que pesan la mitad: × 0,5. Máquinas (etiqueta punteada): orientativo.`));
}

// Información general de los niveles: cómo se calculan y las tablas de cada ejercicio (por peso corporal y sexo).
function levelsInfoSheet(st) {
  const slugs = Object.keys(SL_TABLES).sort((a, b) => SL_NAMES[a].localeCompare(SL_NAMES[b], "es"));
  let cur = S.lvInfo && SL_TABLES[S.lvInfo] ? S.lvInfo : "bench-press";
  const mine = (st && st.list) || [];
  const without = mine.filter((e) => !e.level && ["peso", "lastre", "corporal"].includes(e.kind)).map((e) => e.name);
  const unitOf = (k) => (k.endsWith(".reps") ? "reps" : k.endsWith(".add") ? "kg de lastre" : "kg (1RM)");
  const body = h("div");
  const draw = () => {
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
    const step = hi - lo > 200 ? 50 : hi - lo > 80 ? 20 : hi - lo > 30 ? 10 : 5;
    for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) { svg.append(svgEl("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), class: "grid" })); const t = svgEl("text", { x: L - 6, y: y(g) + 4, "text-anchor": "end", class: "axis" }); t.textContent = fmt(g); svg.append(t); }
    for (let bw = 40; bw <= 140; bw += 20) { const t = svgEl("text", { x: x(bw), y: H - 8, "text-anchor": "middle", class: "axis" }); t.textContent = bw + " kg"; svg.append(t); }
    ["H", "M"].forEach((sx) => [0, 1, 2, 3, 4, 5].forEach((lv) => {
      const d = T[sx].map((r, i) => (i ? "L" : "M") + x(r[0]).toFixed(1) + " " + y(r[lv + 1]).toFixed(1)).join("");
      const pth = svgEl("path", { d, class: "lvl-line t" + lv + (sx === "M" ? " fem" : ""), fill: "none" });
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
        h("li", null, h("b", null, "Cálculo: "), "1RM estimado con la tabla de Hevy; mancuernas = una mancuerna; poleas que pesan la mitad × 0,5; a las máquinas se les resta su peso; lastre = peso corporal + lastre. En máquinas es orientativo (cada máquina es distinta)."),
        h("li", null, h("b", null, "Ejercicios sin tabla: "), `${Object.keys(SL_TABLES).length} tablas cargadas. Los que no tienen tabla no muestran nivel, pero sí récords, 1RM y progreso.` + (without.length ? ` Tuyos sin nivel: ${without.join(", ")}.` : ""))),
      h("div", { class: "sec-t" }, "Tabla por ejercicio"),
      h("select", { class: "input", onchange: (ev) => { cur = ev.target.value; draw(); } }, slugs.map((k) => h("option", { value: k, selected: k === cur }, SL_NAMES[k]))),
      h("div", { class: "lv-legend" }, LVL.map((l, i) => h("span", { class: "lg t" + i }, l + (i === 5 ? " (extrapolada)" : ""))), h("span", { class: "lg solid" }, "— hombres"), h("span", { class: "lg dash" }, "- - mujeres"), e && e.level ? h("span", { class: "lg me" }, "● tú") : null),
      h("div", { class: "chart-scroll" }, svg),
      h("div", { class: "faint", style: { fontSize: "12.5px", margin: "4px 0 10px" } }, `Eje vertical: ${unit}. Eje horizontal: peso corporal.`),
      h("div", { class: "sec-t" }, `Valores para ${sx === "M" ? "mujeres" : "hombres"} (${unit})`), tbl);
  };
  draw();
  sheet("Niveles de fuerza", body, null, { wide: true });
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
  S.exSet = set;
}
function prChips(prs) {
  if (!prs || !prs.length) return null;
  return h("div", { class: "prchips" }, prs.map((t) => tip(h("span", { class: "prchip" }, icon("trophy"), PR_SHORT[t] || t), `Récord: ${REC_LABEL[t] || t}`)));
}
function lvlInline(L, size = 20, ex) {
  if (!L) return null;
  return h("span", { class: "lvin" + (ex ? " click" : ""), onclick: ex ? (ev) => { ev.stopPropagation(); levelSheet(ex.name, L); } : null }, lvlBadge(L.idx, size), lvlPill(L), h("em", null, topTxt(L.pct)));
}
// Curva de niveles: percentil frente a tu marca, con los cortes de cada rango.
function levelSheet(name, L) {
  const M = L.model, unit = L.metric === "reps" ? "reps" : "kg";
  const val = (x) => x - M.off; // en las unidades del ejercicio (lastre: kg añadidos)
  const cuts = M.all.map(val); // princ., novato, int., avanzado, élite, leyenda
  const xmin = Math.max(0, Math.min(cuts[0], L.raw) * 0.75), xmax = Math.max(cuts[5], L.raw) * 1.12;
  const W = Math.max(300, Math.min(700, window.innerWidth - 72)), H = 250, PL = 34, PR = 14, PT = 12, PB = 30;
  const X = (v) => PL + (v - xmin) / (xmax - xmin) * (W - PL - PR), Y = (p) => PT + (1 - p / 100) * (H - PT - PB);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "mchart line lvcurve" });
  ensureTierDefs();
  // bandas de rango
  const edges = [xmin, ...cuts.slice(1), xmax];
  for (let i = 0; i < 6; i++) {
    const a = Math.max(xmin, edges[i]), b = Math.min(xmax, edges[i + 1]);
    if (b <= a) continue;
    svg.append(svgEl("rect", { x: X(a), y: PT, width: X(b) - X(a), height: H - PT - PB, fill: `url(#tg${i})`, opacity: 0.16 }));
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
  for (let i = 0; i <= 120; i++) { const v = xmin + (xmax - xmin) * i / 120; const p = PHI(zOf(M, Math.max(v, 0.01))) * 100; d += (i ? "L" : "M") + X(v).toFixed(1) + " " + Y(p).toFixed(1); }
  svg.append(svgEl("path", { d, class: "ln" }));
  // cortes
  cuts.slice(1).forEach((c, i) => { if (c < xmin || c > xmax) return; svg.append(svgEl("line", { x1: X(c), x2: X(c), y1: PT, y2: H - PB, class: "cut t" + (i + 1) }));
    const t = svgEl("text", { x: X(c) + 3, y: PT + 10 + (i % 2) * 12, class: "axis" }); t.textContent = (L.metric === "add" && c > 0 ? "+" : "") + fmt(c) + (unit === "kg" ? "" : ""); svg.append(t); });
  // tú
  svg.append(svgEl("line", { x1: X(L.raw), x2: X(L.raw), y1: Y(L.pct), y2: H - PB, class: "you-l" }), svgEl("circle", { cx: X(L.raw), cy: Y(L.pct), r: 6, class: "you" }));
  const ty = svgEl("text", { x: X(L.raw), y: Y(L.pct) - 10, "text-anchor": "middle", class: "you-t" }); ty.textContent = "Tú"; svg.append(ty);
  // al pasar el ratón: qué percentil y rango tendrías con esa marca y cuánto te separa
  const gl = svgEl("line", { y1: PT, y2: H - PB, class: "guide", style: "display:none" }), gd = svgEl("circle", { r: 5, class: "hov", style: "display:none" });
  const hit = svgEl("rect", { x: PL, y: 0, width: W - PL - PR, height: H, fill: "transparent" });
  svg.append(gl, gd, hit);
  const fmtv = (v) => (L.metric === "add" && v > 0 ? "+" : "") + fmt(v, L.metric === "reps" ? 0 : v < 20 ? 1 : 0) + " " + unit;
  const mv = (ev) => {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    const v = Math.max(xmin, Math.min(xmax, xmin + (q.x - PL) / (W - PL - PR) * (xmax - xmin)));
    const p = PHI(zOf(M, Math.max(v, 0.01))) * 100;
    let i = 0; while (i < 5 && v >= cuts[i + 1]) i++;
    gl.setAttribute("x1", X(v)); gl.setAttribute("x2", X(v)); gl.style.display = ""; gd.setAttribute("cx", X(v)); gd.setAttribute("cy", Y(p)); gd.style.display = "";
    const diff = v - L.raw;
    showTip([`${L.metric === "reps" ? "Con " : "1RM de "}${fmtv(v)}`, `Rango | ${LVL[i]}`, `Percentil | ${fmt(p, p > 99 ? 1 : 0)} % (${topTxt(p)})`,
      `Frente a ti | ${Math.abs(diff) < 0.5 ? "es tu marca" : (diff > 0 ? "+" : "−") + fmt(Math.abs(diff), Math.abs(diff) < 10 ? 1 : 0) + " " + unit}`,
      i < 5 ? `Siguiente rango | ${LVL[i + 1]} en ${fmtv(cuts[i + 1])}` : "Rango máximo"].join("\n"), ev.clientX, ev.clientY);
  };
  hit.addEventListener("pointermove", mv); hit.addEventListener("pointerdown", mv);
  hit.addEventListener("pointerleave", () => { gl.style.display = "none"; gd.style.display = "none"; hideTip(); });
  const rows = LVL.map((n, i) => {
    const from = i ? cuts[i] : null, falta = from != null && L.raw < from ? from - L.raw : null;
    return h("tr", { class: i === L.idx ? "cur" : "" }, h("td", null, h("span", { class: "lvr" }, lvlBadge(i, 18), h("span", { class: "tn t" + i }, n))),
      h("td", { class: "r num" }, (() => { const sg = (x) => (L.metric === "add" && x > 0 ? "+" : "") + fmt(x); const to = i < 5 ? cuts[i + 1] : null;
        return i === 0 ? `menos de ${sg(to)} ${unit}` : i === 5 ? `${sg(from)} ${unit} o más` : `${sg(from)} – ${sg(to)} ${unit}`; })()),
      h("td", { class: "r num faint" }, i ? "más que el " + ["", "20 %", "50 %", "80 %", "95 %", "99 %"][i] : "—"),
      h("td", { class: "r num" }, falta != null ? "+" + fmt(falta, falta < 10 ? 1 : 0) + " " + unit : i <= L.idx ? "✓" : ""));
  });
  sheet("Nivel · " + name, [
    h("div", { class: "lvhero mini" }, h("div", { class: "lvh-b" }, lvlBadge(L.idx, 54)), h("div", { class: "lvh-t" }, h("b", { class: "tn t" + L.idx }, LVL[L.idx]),
      h("span", { class: "muted" }, `${topTxt(L.pct)} · más fuerte que el ${fmt(L.pct)} % de los ${sexWord()} de ${fmt(L.bw, 1)} kg` + (L.date ? ` (tu peso el ${dateLabel(L.date, { day: "numeric", month: "short" })})` : "")), h("span", { class: "faint" }, L.valTxt + (L.need ? " · " + L.need : "")))),
    h("div", { class: "card panel flat" }, h("h3", null, L.metric === "reps" ? "Reps máximas → percentil" : L.metric === "add" ? "Lastre (1RM) → percentil" : "1RM → percentil"), svg),
    h("table", { class: "t lvtable" }, h("tr", null, h("th", null, "Rango"), h("th", { class: "r" }, L.metric === "reps" ? "Reps" : "1RM"), h("th", { class: "r" }, "Percentil"), h("th", { class: "r" }, "Te falta")), rows),
    h("div", { class: "note" }, "Strength Level publica los cortes de principiante a élite para " + sexWord() + " de cada peso corporal; la curva entre ellos y el corte de Leyenda (top 1 %) están interpolados. " + (L.machine ? "En máquinas y poleas es orientativo." : "")),
  ], null, { wide: true });
}

async function workoutSheet(id) {
  const sh = sheet("Entreno", h("div", { class: "muted" }, "Cargando…"), null, { wide: true });
  let w;
  try { [w] = await Promise.all([api("GET", "/api/workouts/" + id), ensureTrainingMeta()]); } catch (e) { toast(e.message, { error: true }); sh.close(); return; }
  const exBlocks = w.exercises.map((ex) => {
    const prev = ex.previous ? ex.previous.sets.filter((s_) => s_.type !== "calentamiento") : [];
    const has = (f) => ex.sets.some((s_) => s_[f] != null && s_[f] !== 0);
    const cols = [];
    if (["peso", "lastre", "asistido"].includes(ex.kind) || has("weight_kg")) cols.push(["Kg", (s_) => (s_.weight_kg ? (ex.kind === "lastre" ? "+" : ex.kind === "asistido" ? "−" : "") + fmt(Math.abs(s_.weight_kg), 1) : ex.kind === "lastre" ? "corporal" : "—")]);
    if (has("distance_m")) cols.push(["Distancia", (s_) => (s_.distance_m ? fmtDist(s_.distance_m) : "—")]);
    if (has("seconds")) cols.push(["Tiempo", (s_) => (s_.seconds ? fmtSecs(s_.seconds) : "—")]);
    if (has("reps") || !cols.length) cols.push(["Reps", (s_) => (s_.reps ?? "—")]);
    const hasRpe = has("rpe");
    let wi = 0, n = 0;
    const rows_ = ex.sets.map((st) => {
      const work = st.type !== "calentamiento"; if (work) n++;
      const pv = work ? prev[wi++] : null;
      return h("tr", { class: st.type === "calentamiento" ? "warm" : "" }, h("td", null, setBadge(st, n)),
        h("td", { class: "prevc" }, pv ? setShort(ex.kind, pv) : "—"),
        cols.map(([, f]) => h("td", { class: "r num" }, f(st))), hasRpe ? h("td", { class: "r num faint" }, st.rpe ? "RPE " + fmt(st.rpe, 1) : "") : null);
    });
    const e1 = ex.kind === "peso" ? Math.max(0, ...workSets(ex.sets).map((s_) => e1rm(s_.weight_kg, s_.reps, ex.name) || 0)) : 0;
    const L = exLevel({ name: ex.name, kind: ex.kind, sessions: [{ date: w.date, sets: ex.sets, notes: ex.notes }] }, bwAt);
    return h("div", { class: "exb" },
      h("div", { class: "exb-h v2" }, exIcon(ex.name, 40),
        h("div", { class: "exb-tt" },
          h("div", { class: "exb-r1" }, h("button", { class: "exn", onclick: () => exerciseSheet(ex.name) }, ex.name), prChips(ex.prs)),
          L ? h("div", { class: "exb-r2" }, lvlInline(L, 18, { name: ex.name, kind: ex.kind })) : null),
        e1 ? tip(h("span", { class: "e1r faint" }, "1RM ≈ " + fmt(e1) + " kg"), "1RM estimado de la mejor serie (tabla de Hevy: peso ÷ % según reps)" + (isUni(ex.name) ? "\nA un brazo: se usan la mitad de las reps" : "")) : null),
      ex.notes ? h("div", { class: "exnote" }, ex.notes) : null,
      h("table", { class: "t sets" }, h("tr", null, h("th", null, "Serie"), h("th", null, "Anterior"), cols.map(([l]) => h("th", { class: "r" }, l)), hasRpe ? h("th", null, "") : null), rows_));
  });
  const nPR = w.exercises.reduce((a, ex) => a + (ex.prs || []).length, 0);
  const inten = h("div", { class: "seg" });
  let curI = w.intensity;
  const drawI = () => inten.replaceChildren(...INTENS.map((k) => h("button", { class: k === curI ? "on" : "", onclick: async () => {
    curI = k; drawI(); await act(() => api("PUT", "/api/workouts/" + w.id, { intensity: k }), "Intensidad guardada");
  } }, k)));
  drawI();
  sh.set(w.title, [
    h("div", { class: "wstats big" },
      h("div", null, h("span", null, "Duración"), h("b", null, w.duration_min ? fmt(w.duration_min) + " min" : "—")),
      h("div", null, h("span", null, "Volumen"), h("b", null, fmt(w.volume_kg) + " kg")),
      h("div", null, h("span", null, "Series"), h("b", null, String(w.sets_count))),
      h("div", null, h("span", null, "Ejercicios"), h("b", null, String(w.exercises.length)))),
    w.activity_id ? h("div", { class: "field" }, h("label", { class: "f" }, "Intensidad (para el gasto estimado)"), inten) : null,
    ...exBlocks,
    h("div", { class: "note" }, `Origen: ${w.source}` + (w.volume_source === "hevy" ? " · volumen tomado de Hevy" : " · volumen: kg × reps de todas las series, como en Hevy")),
  ], [h("button", { class: "btn ghost danger", onclick: (e) => confirmDel(e, async () => { await act(() => api("DELETE", "/api/workouts/" + w.id), "Entreno eliminado"); sh.close(); }) }, "Eliminar"),
    h("span", { class: "grow" }), w.activity_id ? h("button", { class: "btn", onclick: () => { sh.close(); goDay(w.date); } }, "Ver día") : null],
  { big: true, desc: w.notes || "", titleExtra: [
    nPR ? tip(h("span", { class: "prc lg" }, icon("trophy"), `${nPR} ${nPR === 1 ? "récord" : "récords"}`), w.exercises.filter((ex) => ex.prs && ex.prs.length).map((ex) => `${ex.name}: ${ex.prs.map((t) => PR_SHORT[t]).join(", ")}`).join("\n")) : null,
    h("span", { class: "datec" }, dateLabel(w.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) + (w.start_time ? " · " + w.start_time : "")),
    bwAt(w.date) ? tip(h("span", { class: "datec" }, `${fmt(bwAt(w.date), 1)} kg`), bwExact(w.date) ? "Tu peso ese día (pesaje)" : "Tu peso ese día (interpolado entre pesajes)") : null] });
}

// Ajustes del ejercicio: material, peso de la máquina, polea que pesa la mitad y si es a un brazo.
function exSettingsPanel(name, kind, rec) {
  if (!["peso", "lastre"].includes(kind)) return null;
  const cfg = exSet(name);
  const eq = h("select", { class: "input sm" }, [["", "—"], ["barra", "Barra"], ["mancuerna", "Mancuernas (apunto las dos)"], ["maquina", "Máquina de placas"], ["discos", "Máquina de discos"], ["cable", "Cable / polea normal"], ["polea", "Polea que pesa la mitad"], ["corporal", "Peso corporal"], ["otro", "Otro"]]
    .map(([k, l]) => h("option", { value: k, selected: (cfg.equipment || "") === k }, l)));
  const mk = h("input", { class: "input sm num", type: "number", step: "0.5", min: "0", value: cfg.machine_kg ?? "", placeholder: "0" });
  const uni = h("input", { type: "checkbox", checked: isUni(name) });
  const best = rec.w;
  const ratio = loadRatio(name), mach = cfg.machine_kg || 0;
  const real = best && (ratio !== 1 || mach) ? best.v * ratio : null;
  const save = async () => {
    const body = { name, equipment: eq.value || null, machine_kg: mk.value === "" ? null : +mk.value, unilateral: uni.checked ? 1 : 0,
      load_ratio: eq.value === "polea" ? 0.5 : null };
    await act(() => api("PUT", "/api/exercise-settings", body), "Ajustes guardados");
    S.exSet = await api("GET", "/api/exercise-settings"); S.tStats = null;
    if (S._exSh) S._exSh.close();
    render(); setTimeout(() => exerciseSheet(name), 160);
  };
  return h("details", { class: "card panel flat exset" + (cfg.name_key ? " has" : "") },
    h("summary", null, h("b", null, "Material y peso real"), h("span", { class: "faint" }, [cfg.equipment ? eq.selectedOptions[0].textContent : null, mach ? `máquina ${fmt(mach, 1)} kg` : null, ratio !== 1 ? "polea × 0,5" : null, isUni(name) ? "a un brazo" : null].filter(Boolean).join(" · ") || "sin ajustar")),
    h("div", { class: "exset-b" },
      h("div", { class: "grid3" }, h("div", null, h("label", { class: "f" }, "Material"), eq), h("div", null, h("label", { class: "f" }, "Peso de la máquina incluido en lo que apuntas (kg)"), mk),
        h("label", { class: "chk" }, uni, " A un brazo (apunto las reps de los dos)")),
      real != null ? h("div", { class: "note" }, `Tu mayor peso: ${fmt(best.v, 1)} kg apuntados${ratio !== 1 ? ` → ${fmt(real, 1)} kg reales (polea × 0,5)` : ""}${mach ? ` · de ellos ${fmt(mach, 1)} kg son de la máquina → ${fmt(best.v * ratio - mach, 1)} kg cargados` : ""}.`) : null,
      h("div", { class: "note" }, "Récords y volumen: tal cual lo apuntas en Hevy. Nivel: se aplica la polea (× 0,5) y se resta el peso de la máquina, porque los estándares cuentan solo lo cargado (la barra sí cuenta). Si un día usas otra máquina, pon en la nota de Hevy «la máquina pesa X kg» y ese día se usa ese peso."),
      h("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "8px" } }, h("button", { class: "btn sm primary", onclick: save }, "Guardar"))));
}

async function exerciseSheet(name) {
  const hist = await api("GET", "/api/exercises/history?name=" + encodeURIComponent(name));
  if (!hist.length) return;
  const kind = hist[0].kind;
  const asc = [...hist].reverse();
  const dl = (d) => dateLabel(d, { day: "numeric", month: "short", year: "2-digit" });
  const rsAsc = asc.map((e) => recsOf(e.kind, e.sets, e.name));
  const types = REC_KINDS[kind] || ["reps"];
  // récords con fecha (como Hevy)
  const rec = {};
  asc.forEach((e, i) => { for (const t of types) { const x = rsAsc[i][t]; if (x && (!rec[t] || x.v > rec[t].v + 1e-9)) rec[t] = { v: x.v, set: x.set, date: e.date }; } });
  const e = (S.tStats && S.tStats.list.find((x) => exKeyName(x.name) === exKeyName(name))) || null;
  const L = e && e.level;
  const allSets = hist.flatMap((x) => workSets(x.sets).map((s_) => ({ ...s_, date: x.date })));
  const totalVol = hist.reduce((a, x) => a + volOf(x.kind, x.sets), 0);
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
    h("div", { class: "exhero" }, exIcon(name, 64), h("div", { class: "grow" }, h("div", { class: "faint" }, exGroup(name) + " · " + ({ peso: "con peso", lastre: "con lastre", corporal: "peso corporal", asistido: "asistido", tiempo: "isométrico", cardio: "cardio / carga" }[kind] || kind) + (isUni(name) ? " · a un brazo (reps de los dos lados)" : "") + (/mancuerna/.test(norm(name)) ? " · peso de las dos mancuernas" : "")),
      h("div", { class: "exhero-v" }, h("b", { class: "num" }, main ? recTxt(types[0], main.v, kind) : "—"), h("span", null, REC_LABEL[types[0]] + " · récord")),
      L ? h("div", { class: "exhero-l click", onclick: () => levelSheet(name, L) }, lvlBadge(L.idx, 22), lvlPill(L), h("span", { class: "faint" }, `≈ top ${fmt(Math.max(0.5, 100 - L.pct))} % · ` + (L.need || "por encima de élite")), lvlBar(L)) : null)),
    exSettingsPanel(name, kind, rec),
    h("div", { class: "card panel flat" }, h("h3", null, "Récords personales"),
      h("div", { class: "recgrid" }, types.map((t) => { const r = rec[t]; return h("div", { class: "rec" }, h("span", null, REC_LABEL[t]), h("b", { class: "num" }, r ? recTxt(t, r.v, kind) : "—"),
        h("em", null, r ? (r.set && ["w", "e1", "sv"].includes(t) ? setShort(kind, r.set) + " · " : "") + dateLabel(r.date, { day: "numeric", month: "short", year: "2-digit" }) : "")); }))),
    h("div", { class: "kpis five tight" },
      kpi("Sesiones", String(hist.length), "desde " + dateLabel(asc[0].date, { month: "short", year: "2-digit" })),
      kpi("Última", dateLabel(hist[0].date, { day: "numeric", month: "short" }), workSets(hist[0].sets).map((s_) => setShort(kind, s_)).slice(0, 2).join(", ")),
      kpi("Series", fmt(allSets.length), "efectivas en total"),
      kpi("Reps totales", fmt(totalReps), ""),
      isW ? kpi("Volumen total", fmt(totalVol / 1000, 1) + " t", "", null, fmt(totalVol) + " kg (todas las series)") : kpi("Media reps", allSets.length ? fmt(totalReps / allSets.length, 1) : "—", "por serie")),
    h("div", { class: "card panel flat" }, h("div", { class: "row wrap", style: { marginBottom: "6px" } }, h("h3", { style: { margin: 0 } }, "Progreso"), h("span", { class: "grow" }), chips), chartBox),
    rmRows.length ? h("div", { class: "card panel flat" }, h("h3", null, "Mejor peso por repeticiones"), h("div", { class: "rmgrid" }, rmRows.map(([r, x]) =>
      tip(h("div", { class: "rm" }, h("span", null, r + " rep" + (r > 1 ? "s" : "")), h("b", { class: "num" }, (kind === "lastre" ? "+" : "") + fmt(x.w, 1)), h("em", null, dateLabel(x.date, { day: "numeric", month: "short" }))),
        kind === "peso" ? `${r} × ${fmt(x.w, 1)} kg → 1RM ≈ ${fmt(e1rm(x.w, +r, name))} kg` : null)))) : null,
    h("div", { class: "sec-t" }, "Historial"),
    h("div", { class: "hist" }, hist.map((e2) => { const L2 = exLevel({ name: e2.name, kind: e2.kind, sessions: [{ date: e2.date, sets: e2.sets, notes: e2.notes }] }, bwAt); return h("div", { class: "hrow", onclick: () => workoutSheet(e2.workout_id) },
      h("div", { class: "hd" }, h("b", null, dateLabel(e2.date, { day: "numeric", month: "short", year: e2.date.slice(0, 4) === todayISO().slice(0, 4) ? undefined : "2-digit" })), h("span", null, e2.title), L2 ? lvlInline(L2, 16, { name: e2.name, kind: e2.kind }) : null),
      h("div", { class: "hs" }, e2.sets.map((s_) => h("span", { class: "hset " + s_.type }, setShort(e2.kind, s_)))),
      h("div", { class: "hv num" }, (() => { const r = recsOf(e2.kind, e2.sets, e2.name)[types[0]]; return r ? recTxt(types[0], r.v, kind) : "—"; })())); })),
    h("div", { class: "note" }, "1RM estimado igual que Hevy: peso ÷ % según las reps (10 reps = 75 %, 16 reps = 65 %, 30 o más = 50 %). Con muchas repeticiones es menos fiable." + (isUni(name) ? " A un brazo: se usan la mitad de las reps." : "")),
  ], null, { wide: true, sub: "Estadísticas del ejercicio" });
}
