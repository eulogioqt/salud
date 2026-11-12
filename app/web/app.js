"use strict";
/* Salud — interfaz web. Sin dependencias ni compilación. */

// ---------------------------------------------------------------- utilidades
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === "html") el.innerHTML = v;
    else if (k in el && k !== "list" && k !== "type") { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
const NF = {};
function fmt(x, nd = 0) {
  if (x == null || Number.isNaN(x)) return "?";
  const key = nd;
  NF[key] = NF[key] || new Intl.NumberFormat("es-ES", { maximumFractionDigits: nd, minimumFractionDigits: 0, useGrouping: "always" });
  return NF[key].format(x);
}
const signed = (x, nd = 0) => x == null ? "—" : (x > 0 ? "+" : x < 0 ? "−" : "") + fmt(Math.abs(x), nd);
const parseNum = (v) => { if (v == null) return null; v = String(v).trim().replace(",", "."); if (v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const pad = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoLocal(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return isoLocal(new Date(y, m - 1, d + n)); };
const dateLabel = (iso, opts = { weekday: "long", day: "numeric", month: "short" }) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("es-ES", opts); };
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const FIELDS = ["kcal", "protein_g", "carbs_g", "fat_g"];
const MEALS = [["desayuno", "Desayuno"], ["almuerzo", "Almuerzo"], ["merienda", "Merienda"], ["cena", "Cena"], ["otro", "Otro"]];
// Lo que no viene de una etiqueta o del histórico es «Aprox.» (aproximado, estimación de comida fuera o sin datos oficiales)
const QUAL = { etiqueta: "Etiqueta", historico: "Histórico", provisional: "Sin etiqueta", estimacion: "Valores estimados", pendiente: "Sin etiqueta" };
const QORDER = ["etiqueta", "historico", "provisional", "estimacion", "pendiente"];
const ACT_TYPES = [["fuerza", "Fuerza"], ["calistenia", "Calistenia"], ["hyrox", "HYROX"], ["carrera", "Carrera"], ["bici", "Bici"], ["natacion", "Natación"], ["caminata", "Caminata"], ["otro", "Otro"]];
const STEP_TYPES = ["carrera", "hyrox", "caminata"];
const INTENS = ["suave", "normal", "dura", "muy dura"];
const CAT_HUE = { cereales: 38, carnes: 14, "lácteos": 212, bebidas: 186, alcohol: 280, conservas: 200, embutidos: 355, snacks: 48, suplementos: 245, legumbres: 120, dulces: 28, receta: 158, habitual: 158 };

function defaultMeal() {
  const hr = new Date().getHours();
  return hr < 11 ? "desayuno" : hr < 16 ? "almuerzo" : hr < 19 ? "merienda" : hr < 23 ? "cena" : "otro";
}
function scaleN(per, q) { const o = { missing: [...(per.missing || [])] }; for (const f of FIELDS) o[f] = per[f] == null ? null : per[f] * q; return o; }
function sumN(list) {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, missing: [] }; const m = new Set();
  for (const n of list) for (const f of FIELDS) { if (n[f] == null) m.add(f); else t[f] += n[f]; (n.missing || []).forEach((x) => m.add(x)); }
  t.missing = FIELDS.filter((f) => m.has(f)); return t;
}
const v = (n, f, nd = 0) => (n[f] == null ? "?" : fmt(n[f], nd)) + ((n.missing || []).includes(f) && n[f] != null ? "*" : "");

// ------------------------------------------------------------------- API
async function api(method, path, body) {
  const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (e) { /* vacío */ }
  if (r.status === 401 && data && data.login) { location.href = "/login"; throw new Error("Inicia sesión"); }
  if (!r.ok) { const err = new Error((data && data.error) || `Error ${r.status}`); err.status = r.status; throw err; }
  return data;
}
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); await refresh(); return r; }
  catch (e) { toast(e.message, { error: true }); throw e; }
}

// ----------------------------------------------------------------- estado
const S = { view: "hoy", date: todayISO(), day: null, catalog: null, rev: null, progress: null, libFilter: null, libQuery: "", progDays: 90, energyOpen: false, sheetOpen: 0, pendingRefresh: false };

async function loadCatalog() { S.catalog = await api("GET", "/api/catalog?all=1"); }
async function loadDay() {
  let st = await api("GET", "/api/state?date=" + S.date);
  // Al entrar sin fecha: si hoy aún no tiene nada y queda un día anterior sin cerrar, se abre ese (el de anoche, normalmente)
  if (S.autoDay) {
    const od = st.open_days || [], want = od.length && !st.today_entry_count ? od[od.length - 1] : st.today;
    if (want !== st.date) { S.date = want; st = await api("GET", "/api/state?date=" + want); }
  }
  if (S.autoDay) st.autoDate = st.date;
  S.day = st; S.rev = st.rev;
}
async function refresh() {
  if (S.view === "hoy") await Promise.all([loadDay(), loadCatalog()]);
  else if (S.view === "biblioteca") await loadCatalog();
  else if (S.view === "entreno") {
    [S.training] = await Promise.all([api("GET", "/api/workouts?limit=5000"), loadBodyMeta()]);
  }
  else if (S.view === "progreso") S.progress = await api("GET", `/api/progress?days=${S.progDays}&weeks=12`);
  const r = await api("GET", "/api/rev"); S.rev = r.rev;
  render();
}
// La web vigila la revisión de la BD: cambios hechos desde el chat aparecen solos.
setInterval(async () => {
  if (document.hidden) return;
  try {
    const r = await api("GET", "/api/rev");
    if (S.rev != null && r.rev !== S.rev) { if (S.sheetOpen) S.pendingRefresh = true; else await refresh(); }
  } catch (e) { /* servidor parado */ }
}, 4000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !S.sheetOpen) refresh().catch(() => {}); });

// ------------------------------------------------------------------ router
function route() {
  [...OPEN_SHEETS].forEach((c) => c());
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  S.view = ["hoy", "entreno", "biblioteca", "progreso"].includes(parts[0]) ? parts[0] : "hoy";
  if (S.view === "hoy") {
    S.autoDay = !/^\d{4}-\d{2}-\d{2}$/.test(parts[1] || "");
    S.date = !S.autoDay ? (parts[1] > todayISO() ? todayISO() : parts[1]) : S.day && S.day.autoDate ? S.day.autoDate : todayISO();
  }
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.v === S.view));
  $("#view").classList.toggle("wide", S.view !== "hoy");
  // Cambio de pestaña al instante: lo que ya tenemos (y se actualiza detrás) o un esqueleto de carga, nunca la pestaña anterior
  const cached = (S.view === "hoy" && S.day && S.day.date === S.date) || (S.view === "biblioteca" && S.catalog) || (S.view === "entreno" && S.training) || (S.view === "progreso" && S.progress);
  if (cached) render(); else $("#view").replaceChildren(skeleton(S.view));
  refresh().catch((e) => { $("#view").replaceChildren(h("div", { class: "card panel" }, h("h3", null, "No se puede conectar con el servidor"), h("div", { class: "muted" }, e.message))); });
}
let lastView = null;
window.addEventListener("hashchange", () => { const v0 = location.hash.split("/")[1] || "hoy"; if (v0 !== lastView) window.scrollTo(0, 0); lastView = v0; route(); });
// No se puede ir a días que aún no han llegado
const goDay = (d) => { const t = (S.day && S.day.today) || todayISO(); if (d > t) return; location.hash = "#/hoy/" + d; };

function skeleton(view) {
  const b = (hh, extra = {}) => h("div", { class: "sk", style: Object.assign({ height: hh + "px" }, extra) });
  const grid = (n, hh) => h("div", { class: "sk-grid" }, Array.from({ length: n }, () => b(hh)));
  return h("div", { class: "sk-wrap", "aria-busy": "true" },
    view === "hoy" ? [b(36, { width: "40%" }), b(330), grid(3, 90), b(120), b(120)]
      : view === "biblioteca" ? [b(42), b(34, { width: "70%" }), grid(4, 210), grid(4, 210)]
        : [b(36, { width: "30%" }), grid(4, 92), b(220), grid(2, 160)]);
}

function render() {
  const root = $("#view");
  if (S.view === "hoy") root.replaceChildren(viewHoy());
  else if (S.view === "biblioteca") root.replaceChildren(viewLibrary());
  else if (S.view === "entreno") root.replaceChildren(viewTraining());
  else root.replaceChildren(viewProgress());
}

// ------------------------------------------------------------------- toast
let toastT;
function toast(msg, opts = {}) {
  const el = $("#toast");
  el.replaceChildren(...[h("span", null, msg), opts.undo ? h("button", { onclick: () => { el.classList.remove("on"); opts.undo(); } }, "Deshacer") : null].filter(Boolean));
  el.className = "toast on" + (opts.error ? " err" : "");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), opts.undo ? 6000 : 2600);
}

// ------------------------------------------------------------------- sheets
const OPEN_SHEETS = new Set();
const SHEET_STACK = [];  // modales abiertos, de abajo arriba
let LAST_SHEET = null;  // para no abrir dos veces el mismo modal con varios clics seguidos
// Abre algo asíncrono una sola vez aunque se pulse varias veces mientras carga.
const OPENING = new Set();
async function onceOpen(key, fn) {
  if (OPENING.has(key)) return;
  OPENING.add(key);
  try { return await fn(); } finally { setTimeout(() => OPENING.delete(key), 250); }
}
function sheet(title, body, footer, opts = {}) {
  const tkey = typeof title === "string" ? title : null;
  if (tkey && LAST_SHEET && LAST_SHEET.key === tkey && LAST_SHEET.ctl.el.isConnected && !LAST_SHEET.ctl.el.parentNode.classList.contains("closing")
      && Date.now() - LAST_SHEET.t < 1200) return LAST_SHEET.ctl;
  // Los modales se apilan: uno nuevo se abre encima. Si se abre uno que ya estaba más abajo (mismo título o misma clave),
  // se vuelve a ese nivel: se cierran los de encima y él mismo, y se abre de nuevo en su sitio (sin escaleras infinitas).
  const skey = opts.key || tkey;
  if (skey) { const i = SHEET_STACK.findIndex((x) => x.key === skey); if (i >= 0) SHEET_STACK.slice(i).reverse().forEach((x) => x.close(true)); }
  S.sheetOpen++;
  document.body.classList.add("modal-open");
  const bd = h("div", { class: "backdrop" });
  const close = (instant) => {
    if (!bd.isConnected || bd.classList.contains("closing")) return;
    OPEN_SHEETS.delete(close);
    const si = SHEET_STACK.findIndex((x) => x.close === close); if (si >= 0) SHEET_STACK.splice(si, 1);
    bd.classList.add("closing"); if (instant === true) bd.style.display = "none";
    S.sheetOpen--; document.removeEventListener("keydown", onKey);
    setTimeout(() => bd.remove(), 140);
    if (!S.sheetOpen) document.body.classList.remove("modal-open");
    if (opts.onClose) opts.onClose();
    if (!S.sheetOpen && S.pendingRefresh) { S.pendingRefresh = false; refresh(); }
  };
  const onKey = (e) => { if (e.key === "Escape" && bd === document.querySelector("#sheet-root .backdrop:last-child")) close(); };
  document.addEventListener("keydown", onKey);
  OPEN_SHEETS.add(close); SHEET_STACK.push({ key: skey, close });
  const titleEl = h("h2", null, title), subEl = h("div", { class: "sheet-sub" }), descEl = h("div", { class: "sheet-desc hidden" }), extraEl = h("div", { class: "title-x" });
  const backEl = h("button", { class: "icon-btn round hidden", "aria-label": "Atrás" }, icon("back"));
  const bodyEl = h("div", { class: "sheet-b" });
  const footEl = h("div", { class: "sheet-f" });
  const sh = h("div", { class: "sheet" + (opts.wide ? " wide" : "") },
    h("div", { class: "grab" }),
    h("div", { class: "sheet-h" }, backEl, h("div", { class: "sheet-t" }, h("div", { class: "title-row" }, titleEl, extraEl), descEl, subEl),
      h("button", { class: "icon-btn round", onclick: close, "aria-label": "Cerrar" }, icon("x"))),
    bodyEl, footEl);
  bd.append(sh);
  bd.addEventListener("mousedown", (e) => { if (e.target === bd) close(); });
  $("#sheet-root").append(bd);
  const ctl = {
    close, el: sh,
    set(t, b, f, o = {}) {
      const clean = (x) => [].concat(x || []).flat(Infinity).filter((k) => k != null && k !== false);
      titleEl.textContent = t; subEl.textContent = o.sub || ""; subEl.classList.toggle("hidden", !o.sub);
      descEl.textContent = o.desc || ""; descEl.classList.toggle("hidden", !o.desc); sh.classList.toggle("big-title", !!o.big);
      extraEl.replaceChildren(...clean(o.titleExtra)); extraEl.classList.toggle("hidden", !clean(o.titleExtra).length);
      backEl.classList.toggle("hidden", !o.back); backEl.onclick = o.back || null;
      bodyEl.replaceChildren(...clean(b)); bodyEl.scrollTop = 0;
      const fc = clean(f); footEl.replaceChildren(...fc); footEl.classList.toggle("hidden", !fc.length);
    },
  };
  ctl.set(title, body, footer, opts);
  LAST_SHEET = { key: tkey, ctl, t: Date.now() };
  return ctl;
}

// Texto de una etiqueta con icono: recortado a la altura de las mayúsculas para que quede centrado con el icono en cualquier fuente
const tx = (s) => h("span", { class: "tx" }, s);
function icon(name) {
  const P = {
    x: "M6 6l12 12M18 6L6 18", back: "M15 18l-6-6 6-6", left: "M15 18l-6-6 6-6", right: "M9 18l6-6-6-6",
    plus: "M12 5v14M5 12h14", key: "M7.5 15a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM11 11.5h10M18 11.5v3M15 11.5v2", edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3", lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
    star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", chev: "M6 9l6 6 6-6",
    minus: "M5 12h14", barcode: "M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14", camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", out: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    swap: "M7 7h13l-3-3M17 17H4l3 3", up: "M12 19V5M6 11l6-6 6 6", pill: "M10.5 20.5l10-10a4.95 4.95 0 0 0-7-7l-10 10a4.95 4.95 0 0 0 7 7zM8.5 8.5l7 7", plug: "M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5", flag: "M5 21V4M5 4h12l-2.5 4L17 12H5", flame: "M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z", bolt: "M13 2L4 14h7l-1 8 9-12h-7z", cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
    target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", medal: "M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 9.5L6 3h4l2 5M15.5 9.5L18 3h-4l-2 5", check: "M5 12l5 5 9-10", route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8", dumbbell: "M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12", trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4v3h-4z", scale: "M5 4h14v16H5zM9 9a3 3 0 0 1 6 0M12 9l1-2",
  };
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "18"); s.setAttribute("height", "18");
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", P[name]); s.append(p);
  return s;
}
function mono(name, cat, img, lg) {
  const words = (name || "?").replace(/[()/—-]/g, " ").split(/\s+/).filter((w) => w.length > 1 || /\d/.test(w));
  const ini = ((words[0] || "?")[0] + ((words[1] || "")[0] || "")).toUpperCase();
  const hue = CAT_HUE[cat] ?? (([...(cat || name)].reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360);
  const src = img ? (/^(\/|data:|https?:)/.test(img) ? img : "/" + img) : null;
  return h("div", { class: "mono" + (lg ? " lg" : "") + (src ? " has-img" : ""), style: { "--h": hue } }, src ? h("img", { src, alt: "", loading: "lazy", onerror: (e) => { const m = e.target.parentNode; if (m) { m.classList.remove("has-img"); m.textContent = ini; } } }) : ini);
}
// Solo se marca lo que es menos fiable que la etiqueta (estimación, provisional, pendiente): lo bueno no necesita etiqueta.
// Qué es aproximado en una entrada: un badge por cada cosa. «Cantidad a ojo» (no pesada) y «Valores a ojo» (no son de la
// etiqueta ni de tu histórico: estimados o sin confirmar). Una comida estimada entera lleva los dos.
function estBadges(es) {
  es = [].concat(es);
  const whole = es.some((e) => e.kind === "estimacion");
  const qty = whole || es.some((e) => e.qty_est), vals = whole || es.some((e) => ["estimacion", "provisional", "pendiente"].includes(e.quality));
  return [qty ? h("span", { class: "q qest", title: whole ? "Comida estimada: la cantidad es a ojo" : "No se ha pesado ni contado: cantidad a ojo" }, "Cantidad a ojo") : null,
    vals ? h("span", { class: "q estimacion", title: whole ? "Comida estimada: los valores son una estimación" : "Los valores no son de la etiqueta: estimados o sin confirmar" }, "Valores a ojo") : null].filter(Boolean);
}
const estTag = (es) => { const b = estBadges(es); return b.length ? h("span", { class: "estb" }, b) : null; };
function qBadge(q) { return q && !["historico", "etiqueta"].includes(q) ? h("span", { class: "q " + q, title: QUAL[q] }, QUAL[q]) : null; }
function macroTxt(n, cls = "mc") {
  return h("span", { class: cls }, h("span", { class: "p" }, "P ", v(n, "protein_g")), " · ", h("span", { class: "c" }, "C ", v(n, "carbs_g")), " · ", h("span", { class: "g" }, "G ", v(n, "fat_g")));
}

// ---------------------------------------------------------------- vista Hoy
function viewHoy() {
  const st = S.day; if (!st) return h("div");
  const closed = st.status === "cerrado";
  const isToday = st.date === st.today;
  const head = h("div", { class: "dayhead" },
    h("button", { class: "icon-btn", onclick: () => goDay(addDays(S.date, -1)), title: "Día anterior" }, icon("left")),
    h("div", { class: "dh-t" }, h("h1", null, isToday ? "Hoy" : [h("span", { class: "dl-l" }, dateLabel(st.date)), h("span", { class: "dl-s" }, dateLabel(st.date, { weekday: "short", day: "numeric", month: "short" }))]),
      isToday ? h("span", { class: "muted", style: { fontSize: "14px" } }, dateLabel(st.date, { weekday: "short", day: "numeric", month: "short" })) : null),
    h("button", { class: "icon-btn", onclick: () => goDay(addDays(S.date, 1)), title: "Día siguiente", disabled: S.date >= st.today }, icon("right")),
    h("span", { class: "spacer" }),
    !isToday ? h("button", { class: "btn ghost sm", onclick: () => goDay(st.today) }, "Ir a hoy") : null,
    closed ? h("span", { class: "pill closed", title: "Día cerrado" }, icon("lock"), h("span", { class: "pl-t" }, "Cerrado")) : h("span", { class: "pill" }, "Abierto"));
  // Días anteriores sin cerrar: aviso en el propio día (no al añadir, que suele hacerlo el agente)
  const prev = (st.open_days || []).filter((d) => d < st.date);
  const warn = prev.length ? h("div", { class: "openwarn" }, icon("lock"),
    h("span", null, prev.length === 1 ? "Sin cerrar:" : `${prev.length} días sin cerrar:`),
    prev.map((d) => h("button", { class: "ow-d", onclick: () => goDay(d) }, tx(dateLabel(d, { weekday: "short", day: "numeric", month: "short" }))))) : null;
  const wrap = h("div", { class: closed ? "locked" : "" }, head, warn, summaryCard(st), bodyStrip(st));
  for (const [m] of MEALS) { const mb = mealBlock(st, m, closed); if (mb) wrap.append(mb); }
  const sb = suppBlock(st, closed); if (sb) wrap.append(sb);
  wrap.append(h("div", { class: "closebar" }, closed
    ? h("button", { class: "btn ghost", onclick: () => reopenSheet(st.date) }, "Reabrir día")  // el resumen del cierre está en «Desglose»
    : h("button", { class: "btn primary", onclick: () => closeSheet(st.date) }, "Cerrar día")));
  return wrap;
}

// Resumen del día (prototipo B): anillo de kcal + anillos de macros; al tocarlo, el desglose completo.
const NS_SVG = "http://www.w3.org/2000/svg";
const svgE = (t, a) => { const e = document.createElementNS(NS_SVG, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
function ringSvg(size, r, w, p, cls, center, laps) {
  const C = 2 * Math.PI * r, svg = svgE("svg", { width: size, height: size, viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`, class: "ring " + cls });
  svg.append(svgE("circle", { r, fill: "none", "stroke-width": w, class: "rg-bg" }));
  if (p > 0) svg.append(svgE("circle", { r, fill: "none", "stroke-width": w, class: "rg-fg", "stroke-linecap": "round", "stroke-dasharray": `${C * Math.min(1, p)} ${C}`, transform: "rotate(-90)" }));
  if (laps && p > 1) {
    // Lo que te pasas: otra vuelta encima con su color más oscuro (y otra aún más oscura si pasas del doble), con sombrita donde empieza
    const id = Math.random().toString(36).slice(2, 7), defs = svgE("defs", {});
    const f = svgE("filter", { id: "rsh" + id, x: "-30%", y: "-30%", width: "160%", height: "160%" });
    f.append(svgE("feDropShadow", { dx: 0, dy: 0, stdDeviation: 2, "flood-opacity": 0.4 })); defs.append(f); svg.prepend(defs);
    for (let k = 1; k < 3 && p > k; k++) {
      const ex = Math.min(1, p - k);
      svg.append(svgE("circle", { r, fill: "none", "stroke-width": w, style: `stroke:var(${k === 1 ? "--ring-over1" : "--ring-over3"})`, "stroke-linecap": "round", "stroke-dasharray": `${C * ex} ${C}`, transform: "rotate(-90)", filter: `url(#rsh${id})` }));
    }
  }
  for (const [y, txt, c] of center) { const t = svgE("text", { y, "text-anchor": "middle", class: c }); t.textContent = txt; svg.append(t); }
  return svg;
}
// Objetivo de hoy: cómo sale y con qué cuenta (lo que aún no se sabe se supone)
function goalSheet(st) {
  const tg = st.target || {}, closed = st.status === "cerrado";
  const change = async () => { sh.close(); const d = await api("GET", "/api/settings"); targetSheet(d.current_target, null); };
  const sub = dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" });
  if (!tg.dynamic) {
    const sh = sheet("Objetivo de hoy", [h("div", { class: "goal-hero" }, h("b", { class: "num" }, tg.kcal ? fmt(tg.kcal) : "—"), h("span", null, " kcal para comer hoy")),
      h("div", { class: "note" }, tg.mode ? `Objetivo fijo: ${fmt(tg.kcal)} kcal todos los días, te muevas lo que te muevas.` : "Aún no tienes objetivo.")],
      [h("span", { class: "grow" }), h("button", { class: "btn", onclick: change }, "Cambiar objetivo")], { sub });
    return;
  }
  // Paso a paso: lo que gastarás → déficit/superávit (lo que debe llegarle al cuerpo) → ÷ 0,9 por la digestión (lo que comes)
  const P = tg.base_parts || {}, off = tg.kcal_offset || 0, tef = tg.tef_pct || 0.1;
  const base = tg.base_kcal || 0, net = base + off, eat = tg.kcal, dig = eat - net;
  const mrow = (l, sub_, v) => h("div", { class: "gs-r" }, h("div", null, h("span", null, l), sub_ ? h("small", null, sub_) : null), h("b", { class: "num" }, v));
  const step = (n, title, op, val, desc, extra, last) => h("div", { class: "gp-step" + (last ? " last" : "") },
    h("span", { class: "gp-n" }, String(n)),
    h("div", { class: "gp-c" },
      h("div", { class: "gp-h" }, h("span", { class: "gp-t" }, title, op ? h("span", { class: "gp-op num" }, op) : null), h("b", { class: "num" }, fmt(val))),
      desc ? h("div", { class: "gp-s" }, desc) : null, extra || null));
  let n = 0;
  const sh = sheet("Objetivo de hoy", [
    h("div", { class: "goal-hero" }, h("b", { class: "num" }, fmt(eat)), h("span", null, " kcal para comer hoy")),
    h("div", { class: "gp" },
      step(++n, "Lo que gastarás hoy", null, base, null, h("div", { class: "gs mini" },
        mrow("Metabolismo basal", "en reposo, con tu peso", fmt(P.bmr || 0)),
        mrow("Día a día", st.day.neat_kcal == null ? "uno normal hasta que elijas al cerrar" : "el que elegiste", fmt(P.neat || 0)),
        mrow("Pasos", tg.steps_pending ? `${fmt(tg.projected_steps || 0)} previstos: tu media de los ${dateLabel(st.date, { weekday: "long" })}` : `${fmt(P.steps_n || 0)} reales`, fmt(P.steps || 0)),
        mrow("Entrenos", P.exercise ? "los apuntados hoy" : "ninguno apuntado (no se prevén)", fmt(P.exercise || 0)),
        P.ajuste ? mrow("Ajuste de calibración", "según cómo cambia tu peso", signed(P.ajuste, 0)) : null)),
      off ? step(++n, off < 0 ? "Quitas tu déficit" : "Sumas tu superávit", signed(off, 0), net,
        off < 0 ? "Lo que debe llegarle a tu cuerpo para bajar poco a poco." : "Lo que debe llegarle a tu cuerpo para subir poco a poco.") : null,
      step(++n, "Divides entre " + fmt(1 - tef, 1), "÷ " + fmt(1 - tef, 1), eat,
        `Digerir la comida gasta ~${fmt(tef * 100)} % de lo que comes. Para que te lleguen ${fmt(net)}, hay que comer ${fmt(net)} ÷ ${fmt(1 - tef, 1)} = ${fmt(eat)} (${fmt(dig)} se van en digerir).`, null, true)),
    !closed ? h("div", { class: "note" }, "Los pasos y el día a día se suponen para que el objetivo no cambie durante el día; al cerrar se ajustan con lo real. Los entrenos cuentan cuando los apuntas.") : null],
    [h("span", { class: "grow" }), h("button", { class: "btn", onclick: change }, "Cambiar objetivo")], { sub });
}
// Qué cuenta el gasto de hoy y qué falta (lo que explica el *), y con qué cuenta el objetivo
function gastoTip(st) {
  const en = st.energy, tg = st.target || {}, falta = [];
  if (en.steps == null) falta.push("los pasos de hoy");
  if (en.neat_pending) falta.push("el día a día (de pie, tareas…), que eliges al cerrar el día");
  const lines = ["Gasto de hoy hasta ahora", "Metabolismo + digestión de lo comido + pasos y entrenos apuntados."];
  if (falta.length) lines.push("## * Falta", ...falta.map((f) => "· " + f));
  lines.push("## Día a día", `Lo que te mueves sin contar pasos ni entrenos (de pie, tareas de casa…). Al cerrar eliges cómo fue; «normal» ≈ ${fmt(Math.round(150 * (en.neat_factor || 1)))} kcal para tu peso (150 para 75 kg, proporcional al peso).`);
  if (tg.dynamic) lines.push("## Cómo sale tu objetivo de comida", "(metabolismo + día a día + pasos + entrenos " + (tg.kcal_offset < 0 ? "− " : "+ ") + fmt(Math.abs(tg.kcal_offset || 0)) + ") ÷ 0,9", "El ÷ 0,9 es la digestión: comer gasta un 10 % de lo que comes.");
  if (tg.dynamic) lines.push("## Ya cuenta con", tg.steps_pending ? `tus pasos previstos: ${fmt(tg.projected_steps || 0)} (media de los ${dateLabel(st.date, { weekday: "long" })}; si llevas menos, cuenta con estos)` : "tus pasos de hoy", "un día a día normal", "los entrenos que ya estén apuntados");
  return lines.join("\n");
}
// El anillo compara lo comido con lo que «toca» comer; el balance, lo comido con lo gastado.
// No coinciden al pasarte: comer más también gasta algo más en digestión (10 %).
function ringTip(st) {
  const t = st.totals, tg = st.target || {}, kc = t.kcal || 0;
  if (!tg.kcal) return null;
  const d = kc - tg.kcal;
  return [d > 0 ? `${fmt(d)} kcal por encima de lo que tocaba comer` : `Te quedan ${fmt(-d)} kcal para el objetivo`,
    `Comido | ${fmt(kc)} kcal`, `Objetivo de comida | ${fmt(tg.kcal)} kcal`,
    tg.dynamic ? "Es lo que toca comer para que, con lo que gastas, el día acabe en tu objetivo." : null].filter(Boolean).join("\n");
}
function balTip(st) {
  const tg = st.target || {}, en = st.energy, b = st.balance;
  const goal = tg.dynamic ? (tg.kcal_offset || 0) : tg.kcal && en.total != null ? Math.round(tg.kcal - en.total) : null;
  return ["Balance = comido − gastado", `Hoy | ${b == null ? "?" : signed(b)} kcal (${b == null ? "—" : b < 0 ? "déficit" : b > 0 ? "superávit" : "equilibrio"})`,
    goal != null ? `Tu objetivo | ${signed(goal)} kcal` : null].filter(Boolean).join("\n");
}
function summaryCard(st) {
  const t = st.totals, tg = st.target || {}, en = st.energy;
  const kcalT = tg.kcal || 0, rest = kcalT && t.kcal != null ? kcalT - t.kcal : null, over = rest != null && rest < 0;
  const open = () => energySheet(st);
  const big = ringSvg(232, 98, 16, kcalT ? (t.kcal || 0) / kcalT : 0, "big" + (over ? " over" : ""), over ? [
    [-34, "Consumido", "rg-l"], [14, v(t, "kcal"), "rg-v"], [40, "/ " + fmt(kcalT) + " kcal", "rg-o"], [64, "+" + fmt(-rest) + " de más", "rg-x" + (-rest / kcalT > 1 ? " hi" : "")]] : [
    [-26, "Consumido", "rg-l"], [22, v(t, "kcal"), "rg-v"], [50, kcalT ? "/ " + fmt(kcalT) + " kcal" : "kcal · sin objetivo", "rg-o"]], true);
  const macro = (cls, label, f, target, unitT) => {
    const miss = (t.missing || []).includes(f);
    return h("div", { class: "mring " + cls }, ringSvg(96, 38, 9, target ? (t[f] || 0) / target : 0, cls, [[3, v(t, f) + (miss ? "+" : ""), "rg-mv"], [20, "/ " + unitT + " g", "rg-mo"]], true),
      h("div", { class: "mr-l" }, label, miss ? h("span", { class: "miss", title: "Hay valores desconocidos: el total es un mínimo" }, " *") : null));
  };
  const goalTxt = !tg.mode ? "Sin objetivo" : tg.dynamic ? (tg.kcal_offset ? `Objetivo: ${tg.kcal_offset < 0 ? "déficit" : "superávit"} de ${fmt(Math.abs(tg.kcal_offset))} kcal` : "Objetivo: comer lo que gastas") : "Objetivo fijo";
  return h("div", { class: "card summary b" },
    h("button", { class: "sum-goal", title: "Cómo sale tu objetivo de hoy", onclick: () => goalSheet(st) }, goalTxt, tg.dynamic ? h("span", { class: "sg-i" }, "?") : null),
    h("button", { class: "sum-des", onclick: open }, "Desglose ›"),
    tip(h("button", { class: "ring-btn", onclick: open, "aria-label": "Ver desglose" }, big), ringTip(st)),
    h("div", { class: "mrings" },
      macro("p", "Proteína", "protein_g", tg.protein_g, fmt(tg.protein_g)),
      macro("c", "Carbohidratos", "carbs_g", tg.carbs_g, fmt(tg.carbs_g)),
      macro("g", "Grasas", "fat_g", tg.fat_mid_g, fmt(tg.fat_mid_g))),
    h("div", { class: "sum-chips" },
      tip(h("button", { class: "schip", onclick: open }, "Gasto ", h("b", { class: "num" }, fmt(en.total)), en.complete && !en.neat_pending ? null : h("span", { class: "miss" }, " *")), gastoTip(st)),
      tip(h("button", { class: "schip", onclick: open }, st.balance == null ? "Balance " : st.balance < 0 ? "Déficit " : st.balance > 0 ? "Superávit " : "Equilibrio ", st.balance ? h("b", { class: "num" }, fmt(Math.abs(st.balance))) : st.balance == null ? h("b", null, "?") : null),
        balTip(st))));
}
// Desglose del día (diseño B): balance arriba, lo comido (macros y comidas) y lo gastado (cada parte con su barra).
function energySheet(st) {
  const t = st.totals, tg = st.target || {}, c = st.closure, en = st.energy, closed = st.status === "cerrado";
  const bal = st.balance, kc = t.kcal || 0;
  // balance que marcaba el objetivo: según gasto, la diferencia elegida; fijo, objetivo − gasto
  const balGoal = tg.dynamic ? (tg.kcal_offset || 0) : tg.kcal && en.total != null ? Math.round(tg.kcal - en.total) : null;
  const pct = (x, of) => (of ? Math.max(0, Math.min(100, (100 * x) / of)) : 0);
  const hero = h("div", { class: "bd-hero" },
    h("div", { class: "bd-n" }, h("span", null, "Consumido"), h("b", { class: "num" }, v(t, "kcal")), h("em", null, tg.kcal ? "objetivo " + fmt(tg.kcal) : "kcal")),
    h("span", { class: "bd-op" }, "−"),
    h("div", { class: "bd-n" }, h("span", null, "Gasto"), h("b", { class: "num" }, en.total == null ? "?" : fmt(en.total)), h("em", null, en.complete ? "estimado" : "faltan datos")),
    h("span", { class: "bd-op" }, "="),
    h("div", { class: "bd-n bal " + (bal == null ? "" : bal < 0 ? "def" : "sup") }, h("span", null, "Balance"), h("b", { class: "num" }, bal == null ? "?" : signed(bal)),
      h("em", null, balGoal == null ? (bal == null ? "—" : bal < 0 ? "déficit" : bal > 0 ? "superávit" : "equilibrio") : "objetivo " + signed(balGoal))));
  // Lo comido: lo que llevas de cada macro y una marca con su objetivo debajo
  const macroRow = (k, name, f, goal) => {
    const val = t[f] || 0, top = goal || 0, scale = Math.max(top * 1.25, val, 1);
    const diff = !kc || !top ? null : val - top;
    const dTxt = diff == null || k === "c" ? "" : Math.abs(diff) < 1 ? "✓" : signed(diff);
    return h("div", { class: "bd-m " + k },
      h("div", { class: "bd-mh" }, h("span", { class: "bd-chip " + k }, name[0]),
        h("span", { class: "bd-mn" }, h("b", { class: "num" }, v(t, f) + " g"), " ", h("span", null, name.toLowerCase())),
        h("span", { class: "bd-d num " + (!dTxt ? "" : (k === "p" && diff < -0.5) || (k === "g" && Math.abs(diff) > 0.15 * top) ? "off" : "ok") }, dTxt)),
      h("div", { class: "bd-bar" }, h("i", { style: { width: pct(val, scale) + "%" } }),
        top ? h("span", { class: "mark", style: { left: pct(top, scale) + "%" } }) : null),
      top ? h("div", { class: "bd-goal-l" }, h("span", { style: { left: pct(top, scale) + "%" } }, "objetivo " + fmt(top))) : null);
  };
  const meals = MEALS.map(([m, l]) => [l, (st.meals[m] && st.meals[m].totals && st.meals[m].totals.kcal) || 0, (st.meals[m] && st.meals[m].totals) || {}]).filter((x) => x[1] > 0).map((x, i) => [...x, i]);
  // Arriba: cuánto es aproximado y los macros; debajo, lo comido por comidas y lo gastado
  const apx = st.approx_kcal && kc ? h("div", { class: "bd-apx2" },
    h("b", { class: "num bd-apx2-n" }, Math.round(pct(st.approx_kcal, kc)) + " %"),
    h("div", { class: "grow" }, h("div", { class: "bd-apx2-t" }, "de lo que has comido es aproximado"),
      h("div", { class: "bd-apx2-s" }, `${fmt(st.approx_kcal)} kcal de comidas fuera o productos sin etiqueta. Al ponerles la etiqueta se corrige en todos los días.`))) : null;
  const eaten = h("div", { class: "bd-sec" },
    h("div", { class: "bd-st" }, h("span", { class: "grow" }, "Lo que has comido"),
      h("span", { class: "num bd-tot" }, h("b", null, v(t, "kcal")), tg.kcal ? h("span", { class: "faint" }, " / " + fmt(tg.kcal) + " kcal") : " kcal")),
    h("div", { class: "bd-macros" },
      macroRow("p", "Proteína", "protein_g", tg.protein_g), macroRow("c", "Carbohidratos", "carbs_g", tg.carbs_g), macroRow("g", "Grasas", "fat_g", tg.fat_mid_g)),
    (t.missing || []).length ? h("div", { class: "note warn" }, "Hay valores desconocidos: los totales son un mínimo.") : null,
    apx,
    meals.length ? h("div", { class: "bd-sub" }, "Por comidas") : null,
    meals.length ? h("div", { class: "bd-meals" }, h("div", { class: "bd-stack big" }, meals.map(([l, k, , i]) => h("i", { class: "m" + i, style: { flex: k }, title: `${l}: ${fmt(k)} kcal` }))),
      h("div", { class: "bd-parts" }, meals.map(([l, k, mt, i]) => h("div", { class: "bd-p" }, h("i", { class: "dot m" + i }),
        h("div", { class: "bd-pl" }, h("span", null, l), h("small", null, `P ${fmt(mt.protein_g || 0)} · C ${fmt(mt.carbs_g || 0)} · G ${fmt(mt.fat_g || 0)}`)),
        h("div", { class: "bd-pv num" }, h("b", null, fmt(k))))))) : h("div", { class: "faint sm" }, "Aún no has apuntado nada."));
  // Lo gastado
  const parts = [
    ["bmr", "Metabolismo basal", (en.missing_profile || []).length ? null : en.bmr, (en.missing_profile || []).length ? "completa tu perfil en Ajustes" : `en reposo · ${fmt(en.weight_used_kg, 1)} kg`],
    ["tef", "Digestión", en.tef, "10 % de lo que comes"],
    ["neat", "Día a día", en.neat_pending ? null : en.neat, en.neat_set ? "de pie, tareas… · " + en.neat_source : en.neat_pending ? "de pie, tareas… · se elige al cerrar el día" : "de pie, tareas… · normal"],
    ["steps", "Pasos", en.steps_kcal, en.steps == null ? "sin apuntar" : `${fmt(en.steps_effective)} pasos`],
    ...en.exercise.map((x) => ["ex", "Ejercicio · " + x.type, x.kcal, x.source.startsWith("estimado") ? "neto, estimado" : x.source]),
  ];
  const tot = en.total || parts.reduce((a, p) => a + (p[2] || 0), 0) || 1;
  const burned = h("div", { class: "bd-sec" },
    h("div", { class: "bd-st" }, h("span", { class: "grow" }, "Lo que has gastado"), h("span", { class: "num bd-tot" }, h("b", null, en.total == null ? "?" : fmt(en.total)), " kcal")),
    h("div", { class: "bd-sub" }, "Por partes"),
    h("div", { class: "bd-stack big" }, parts.filter((p) => p[2]).map((p) => h("i", { class: "e-" + p[0], style: { flex: p[2] }, title: `${p[1]}: ${fmt(p[2])} kcal` }))),
    h("div", { class: "bd-parts" }, parts.map(([k, l, val, sub]) => h("div", { class: "bd-p" }, h("i", { class: "dot e-" + k }),
      h("div", { class: "bd-pl" }, h("span", null, l), h("small", null, sub)),
      val == null ? (k === "steps" && !closed ? h("button", { class: "btn sm", onclick: () => stepsSheet(st) }, "Añadir") : k === "neat" ? h("span", { class: "faint", style: { fontSize: "12.5px" } }, "por definir") : h("span", { class: "miss" }, "falta"))
        : h("div", { class: "bd-pv num" }, h("b", null, fmt(val)))))));
  const closedNote = closed && c ? h("span", { class: "bd-closed-x", title: c.forced ? "Cerrado con datos incompletos" : "" }, icon("lock"),
    h("span", { class: "cx-l" }, tx(`Cerrado el ${dateLabel(c.closed_at.slice(0, 10), { day: "numeric", month: "short" })} a las ${c.closed_at.slice(11, 16)}` + (c.version > 1 ? ` · v${c.version}` : ""))),
    h("span", { class: "cx-s" }, tx(`${+c.closed_at.slice(8, 10)}/${+c.closed_at.slice(5, 7)} · ${c.closed_at.slice(11, 16)}` + (c.version > 1 ? ` · v${c.version}` : "")))) : null;
  const obs = closed && c && c.summary && (c.summary.observations || []).length
    ? h("div", { class: "bd-sec" }, h("div", { class: "bd-st" }, "Observaciones del cierre"), h("ul", { class: "bd-obs" }, c.summary.observations.map((o) => h("li", null, o)))) : null;
  sheet(closed ? "Resumen del día" : "Desglose del día", [hero, eaten, burned, obs,
    h("div", { class: "faint bd-foot" }, "El gasto es una estimación: tu metabolismo en reposo (según peso, altura, edad y sexo) + la digestión (10 % de lo que comes) + lo que te mueves en el día + tus pasos + tus entrenos.")], null, { sub: dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" }), titleExtra: closedNote });
}
function energyTable(en, balance) {
  const r = (a, b, c) => h("tr", null, h("td", null, a, c ? h("span", { class: "faint" }, " · " + c) : null), h("td", { class: "num" }, b));
  return h("div", { class: "energy" }, h("table", null,
    (en.missing_profile || []).length ? r("Metabolismo basal (BMR)", h("span", { class: "miss" }, "falta"), "completa en Ajustes: " + en.missing_profile.join(", "))
      : r("Metabolismo basal (BMR)", fmt(en.bmr), `${fmt(en.weight_used_kg, 1)} kg, ${en.weight_source}`),
    r("Efecto térmico (TEF)", fmt(en.tef), "10 % de lo ingerido"),
    r("NEAT sin pasos", fmt(en.neat), en.neat_source),
    r("Pasos", en.steps_kcal == null ? h("span", { class: "miss" }, "falta") : fmt(en.steps_kcal),
      en.steps == null ? null : `${fmt(en.steps_effective)} pasos netos` + (en.steps_in_activities ? ` (−${fmt(en.steps_in_activities)} de sesiones)` : "")),
    ...en.exercise.map((x) => r("Ejercicio: " + x.type, fmt(x.kcal), x.source.startsWith("estimado") ? "neto, estimado" : x.source)),
    en.calibration && en.calibration.ajuste_kcal ? r("Calibración de la base", signed(en.calibration.ajuste_kcal), "según tus pesajes") : null,
    h("tr", { class: "tot" }, h("td", null, "Gasto total estimado"), h("td", { class: "num" }, fmt(en.total))),
    h("tr", null, h("td", null, "Balance estimado"), h("td", { class: "num" }, signed(balance)))),
    h("div", { class: "faint", style: { marginTop: "6px" } }, "Estimación, no medición. ", en.method));
}

function bodyStrip(st) {
  const day = st.day, closed = st.status === "cerrado", en = st.energy;
  const el = h("input", { class: "inline num", inputMode: "decimal", placeholder: day.weight_kg == null && st.weight_interp != null ? fmt(st.weight_interp, 1) : "—", value: day.weight_kg == null ? "" : String(day.weight_kg).replace(".", ","), disabled: closed });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") el.blur(); });
  const fit = () => { el.style.width = Math.max(2, (el.value || el.placeholder || "—").length + 0.6) + "ch"; };  // «kg» pegado al número
  el.addEventListener("input", fit); fit();
  el.addEventListener("change", async () => {
    const n = parseNum(el.value);
    if (Number.isNaN(n)) { toast("Valor no válido", { error: true }); return; }
    if ((day.weight_kg ?? null) === n) return;
    await act(() => api("PUT", "/api/days/" + st.date, { weight_kg: n }), "Peso guardado").catch(() => { el.value = day.weight_kg ?? ""; });
  });
  el.addEventListener("click", (e) => e.stopPropagation());
  const scale = !!(S.pasos || {}).bascula && !((S.pasos || {}).off || []).includes("bascula");  // báscula conectada: el peso llega solo y no se toca a mano
  const weight = h("div", { class: "stat clickable", onclick: () => weightSheet(st) },
    h("div", { class: "lbl" }, h("span", null, h("span", { class: "sic w" }, "⚖"), "Peso"),
      scale ? h("span", { class: "lnk" }, "Ver") : S.me && !closed ? h("button", { class: "lnk-btn", title: "Que los pesajes de tu báscula lleguen solos", onclick: (e) => { e.stopPropagation(); stepsConnectSheet("bascula"); } }, "🔗 Conectar") : null),
    scale ? (day.weight_kg == null ? (st.weight_interp != null
        ? h("div", { class: "v" }, h("span", { class: "interp", title: "Sin pesaje: estimado con tu último pesaje y lo que has comido y gastado desde entonces" }, fmt(st.weight_interp, 1)), h("small", null, "kg"))
        : h("div", { class: "v none" }, h("small", null, "Aún sin pesaje")))
        : h("div", { class: "v" }, h("span", null, fmt(day.weight_kg, 1)), h("small", null, "kg")))
      : h("div", { class: "v" }, el, h("small", null, "kg")),
    h("div", { class: "s" }, [day.weight_kg == null && st.weight_interp != null ? "estimado" : null,
      st.avg7 != null && day.weight_kg != null ? `media 7 d ${fmt(st.avg7, 1)}` : null].filter(Boolean).join(" · ")));
  // Pasos: conectados al móvil → solo «Ver» (ficha con estadísticas); si no, se apuntan a mano y se ofrece conectar
  const auto = !!(S.pasos || {}).conectado && !((S.pasos || {}).off || []).includes("pasos");
  const skc = day.steps != null && en.steps_kcal != null ? fmt(en.steps_kcal) + " kcal" : null;
  const steps = h("div", { class: "stat clickable", onclick: auto ? () => stepsStatsSheet(st) : closed ? null : () => stepsSheet(st) },
    h("div", { class: "lbl" }, h("span", null, h("span", { class: "sic s" }, "👟"), "Pasos"),
      auto ? h("span", { class: "lnk" }, "Ver") : closed ? null : S.me ? h("button", { class: "lnk-btn", onclick: (e) => { e.stopPropagation(); stepsConnectSheet(); } }, "🔗 Conectar")
        : h("span", { class: "lnk" }, day.steps == null ? "+ Añadir" : "Editar")),
    day.steps == null ? h("div", { class: "v none" }, h("small", null, auto ? "Aún sin datos" : "Sin registrar"))
      : h("div", { class: "v sv" }, h("span", null, fmt(day.steps)), h("small", null, "pasos"), skc ? h("span", { class: "kcb skc" }, skc) : null),
    st.steps_hours ? blockBars(st.steps_hours, st.date === st.today) : null);
  const ws = st.workouts || [];
  const pend = ws.length ? [] : (st.sessions || []).filter((x) => !x.registrada);  // entrenos que han llegado del móvil y faltan
  const trainOn = !!(S.pasos || {}).entreno_ultimo && !((S.pasos || {}).off || []).includes("entreno");
  const other = st.activities.filter((a) => !ws.some((w) => w.activity_id === a.id));
  const kc = (id) => fmt((en.exercise.find((x) => x.id === id) || {}).kcal);
  const train = h("div", { class: "stat clickable", onclick: () => trainingDaySheet(st) },
    h("div", { class: "lbl" }, h("span", null, h("span", { class: "sic e" }, "🏋"), "Entreno"),
      ws.length ? h("span", { class: "lnk" }, "Ver") : pend.length ? h("span", { class: "det-badge", title: "El móvil ha detectado un entreno y falta subirlo" }, h("span", { class: "det-i" }, "!"), h("span", { class: "det-bt" }, "Falta subirlo")) : S.me && !closed && !trainOn ? h("button", { class: "lnk-btn", title: "Que se sepa solo cuándo entrenas", onclick: (e) => { e.stopPropagation(); stepsConnectSheet("entreno"); } }, "🔗 Conectar") : null),
    h("div", { class: "acts" }, ws.length || other.length
      ? [...ws.map((w) => h("div", { class: "a wk" },
          h("div", { class: "wk-t" }, h("b", null, w.title), chg(upsChip(w), w.prs_count ? h("span", { class: "prc", title: "Récords batidos en este entreno" }, icon("trophy"), tx(String(w.prs_count))) : null,
            w.activity_id ? kcChip((en.exercise.find((x) => x.id === w.activity_id) || {}).kcal) : null)),
          w.notes ? h("div", { class: "wk-d" }, w.notes) : null,
          h("div", { class: "wk-s" }, [w.duration_min ? fmt(w.duration_min) + " min" : null, w.sets_count + " series", fmt(w.volume_kg) + " kg"].filter(Boolean).join(" · ")))),
         ...other.map((a) => h("div", { class: "a" }, h("b", null, (ACT_TYPES.find((x) => x[0] === a.type) || [0, a.type])[1]), ` ${a.minutes ? fmt(a.minutes) + "′" : ""}`, h("span", { class: "faint" }, " · " + kc(a.id) + " kcal")))]
      : pend.length ? h("div", { class: "acts" }, pend.map((x) => h("div", { class: "a wk det" },
          h("div", { class: "wk-t" }, h("b", null, x.titulo || "Entreno")),
          h("div", { class: "wk-s det-s" }, `Detectado a las ${x.inicio}`, h("span", { class: "det-x" }, " · falta subirlo")))))
      : h("div", { class: "v none" }, h("small", null, day.rest_day === 1 ? "Descanso" : "Sin registrar"))));
  return h("div", { class: "strip" }, weight, steps, train);
}

// Ficha de peso (al tocar el peso en Hoy): gráfica, media de 7 días, cambio semanal y la báscula; lo demás en Progreso
async function weightSheet(st) {
  // Ficha del peso de ESE día (pesaje, hora, composición y otros pesajes del día) + la gráfica; lo demás, en Progreso
  let days = 30;
  const sub = dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" });
  const sh = sheet("Peso", h("div", { class: "muted" }, "Cargando…"), null, { wide: true, sub });
  const draw = async () => {
    const P = await api("GET", `/api/progress?days=${days}&weeks=4`).catch(() => null);
    if (!P) return;
    const ws = P.weights, dayW = st.day.weight_kg, bodies = (P.body || []).filter((b) => b.date === st.date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const main = bodies.find((b) => dayW != null && b.weight_kg != null && Math.abs(b.weight_kg - dayW) < 0.05) || null;
    const others = bodies.filter((b) => b !== main && b.weight_kg != null);
    const w7 = ws.find((w) => w.date === st.date) || {}, prev = ws.find((w) => w.date === addDays(st.date, -7)) || {};
    const scale = !!(S.pasos || {}).bascula && !((S.pasos || {}).off || []).includes("bascula");
    const src = main ? ({ movil: "báscula (llegó sola)", xiaomi: "captura de la báscula" }[main.source] || "apuntado") : "apuntado a mano";
    const tiles = main ? bodyTiles(main) : [];
    sh.set("Peso", [
      h("div", { class: "wday" },
        h("div", { class: "wday-v" }, dayW != null ? [h("b", { class: "num" }, fmt(dayW, 1)), h("span", null, " kg")]
          : st.weight_interp != null ? [h("b", { class: "num interp" }, fmt(st.weight_interp, 1)), h("span", null, " kg"), h("span", { class: "est-pill" }, "Estimado")] : h("span", { class: "muted" }, "Sin pesaje")),
        h("div", { class: "wday-s" }, dayW != null ? [main && main.time ? "a las " + main.time : null, src].filter(Boolean).join(" · ")
          : st.weight_interp != null ? (st.weight_est_fit ? "Sin pesaje ese día: lo comido y gastado desde el pesaje anterior, ajustado para encajar con el siguiente"
            : "Sin pesaje: tu último pesaje + lo que has comido y gastado desde entonces") : scale ? "Pésate al levantarte: llegará solo" : "Pésate al levantarte, después del baño y antes de comer"),
        w7.avg7 != null ? h("div", { class: "wday-s" }, `Media de 7 días ${fmt(w7.avg7, 2)} kg` + (prev.avg7 != null ? ` · ${signed(w7.avg7 - prev.avg7, 2)} kg en 7 días` : "")) : null),
      tiles.length ? h("div", { class: "btiles six" }, tiles) : null,
      others.length ? h("div", { class: "oth-w" }, h("div", { class: "faint sm" }, "Otros pesajes de ese día (no cuentan para la tendencia)"),
        others.map((b) => h("div", { class: "oth-r" }, h("span", { class: "num" }, `${fmt(b.weight_kg, 1)} kg`), h("span", { class: "faint" }, b.time ? " · " + b.time : ""), h("span", { class: "grow" }),
          st.status !== "cerrado" ? h("button", { class: "btn ghost sm", onclick: async () => { await setDayWeight(b, true); sh.close(); weightSheet(S.day); } }, "Usar como peso del día") : null))) : null,
      h("div", { class: "row", style: { margin: "14px 0 6px" } }, h("b", null, "Evolución"), h("span", { class: "grow" }),
        h("div", { class: "seg" }, [[7, "7 d"], [30, "30 d"], [90, "90 d"]].map(([d, l]) => h("button", { class: days === d ? "on" : "", onclick: () => { days = d; draw(); } }, l)))),
      h("div", { class: "card panel" }, weightChart(ws, P.body, st.date))],
      scale ? sheetFoot(`Último envío de la báscula: ${agoTxt(S.pasos.bascula)}`) : sheetFoot(null, "bascula"), { sub });
  };
  draw();
}

// Pasos por horas (cuando llegan del móvil): 24 barritas, la hora actual marcada
// Tarjeta pequeña: los pasos del día en 6 bloques de 4 horas
function blockBars(hrs, today) {
  const now = new Date().getHours(), B = [0, 4, 8, 12, 16, 20].map((a) => ({ a, v: hrs.slice(a, a + 4).reduce((x, y) => x + y, 0) }));
  const mx = Math.max(1, ...B.map((b) => b.v));
  return h("div", { class: "bbars" }, B.map((b) => {
    const fut = today && b.a > now, cur = today && now >= b.a && now < b.a + 4;
    return h("div", { class: "bb" + (fut ? " fut" : "") + (cur ? " now" : ""), title: `${b.a}:00–${b.a + 4}:00 · ${fmt(b.v)} pasos` },
      h("i", { style: { height: (fut ? 6 : Math.max(b.v ? 10 : 4, (100 * b.v) / mx)) + "%" } }));
  }));
}
// Pasos: datos comunes de las fichas (rachas, semanas, récords) a partir de /api/pasos/stats
async function stepsData(st) {
  const d = await api("GET", "/api/pasos/stats?date=" + st.date);
  const goal = d.goal || 8000, byDate = Object.fromEntries(d.days.map((x) => [x.date, x.steps]));
  let cur = 0, k = byDate[st.date] >= goal ? st.date : addDays(st.date, -1);
  while (byDate[k] >= goal) { cur++; k = addDays(k, -1); }
  let bestStreak = 0, run = 0, prev = null;
  for (const x of d.days) { run = x.steps >= goal ? (prev && addDays(prev, 1) === x.date && run ? run + 1 : 1) : 0; prev = x.date; bestStreak = Math.max(bestStreak, run); }
  return Object.assign(d, { goal, byDate, streak: cur, bestStreak });
}
const agoTxt = (ts) => { if (!ts) return "—"; const m = Math.round((Date.now() - new Date(ts.replace(" ", "T"))) / 60000); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : dateLabel(ts.slice(0, 10), { day: "numeric", month: "short" }); };
// Pie común de las fichas que llegan del móvil: estado del último envío + Conexiones + Ver todo en Progreso
// Conectado: estado del último envío + Conexiones + Ver todo. Sin conectar: «Sin conectar» + Conectar (verde) + Ver todo.
function sheetFoot(status, mode = null, label = "Ver todo en Progreso", hash = "#/progreso") {
  const off = !!mode, go = () => { for (const c of [...OPEN_SHEETS]) c(); location.hash = hash; };
  return [h("div", { class: "sfoot" },
    h("span", { class: "sf-st" + (off ? " off" : "") }, h("i", { class: "sf-dot" }), off ? "Sin conectar" : status),
    h("div", { class: "sf-b" },
      !S.me ? null : off ? h("button", { class: "btn sm primary", onclick: () => stepsConnectSheet(mode) }, icon("plug"), "Conectar")
        : h("button", { class: "btn sm", onclick: () => connectionsSheet() }, icon("plug"), "Conexiones"),
      label ? h("button", { class: "btn sm", onclick: go }, label) : null))];
}
function stepsFooter(d) { return sheetFoot(`Último envío del móvil: ${agoTxt(d.last_received)}`); }
// Ficha de pasos del día (desde Hoy): objetivo, gasto, distancia, racha y el día por horas frente a tu media
async function stepsStatsSheet(st) {
  const sub = dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" });
  const sh = sheet("Pasos", h("div", { class: "muted" }, "Cargando…"), null, { wide: true, sub });
  let d; try { d = await stepsData(st); } catch (e) { toast(e.message, { error: true }); sh.close(); return; }
  const en = st.energy, steps = st.day.steps || 0, today = st.date === st.today, now = new Date().getHours(), goal = d.goal;
  const hrs = d.hours || Array(24).fill(0), avg = d.avg_hours;
  const km = en.stride_m ? (Math.max(0, steps - (en.steps_in_activities || 0)) * en.stride_m) / 1000 : null;
  const C = 2 * Math.PI * 80, frac = Math.min(1, steps / goal);
  const ring = svgE("svg", { width: 180, height: 180, viewBox: "-90 -90 180 180", class: "sring" + (steps >= goal ? " done" : "") });
  ring.append(svgE("circle", { r: 80, fill: "none", "stroke-width": 10, class: "rg-bg" }));
  if (frac > 0) ring.append(svgE("circle", { r: 80, fill: "none", "stroke-width": 10, class: "rg-fg", "stroke-linecap": "round", "stroke-dasharray": `${C * frac} ${C}`, transform: "rotate(-90)" }));
  const accNow = hrs.slice(0, today ? now + 1 : 24).reduce((a, x) => a + x, 0), accAvg = avg ? avg.slice(0, today ? now + 1 : 24).reduce((a, x) => a + x, 0) : null;
  const diff = accAvg != null ? accNow - accAvg : null;
  const kv = (ic, l, v) => h("div", { class: "sh2-kv" }, h("span", null, h("span", { class: "kvi" }, icon(ic)), l), h("b", null, v));
  const goalSheet = () => {
    const inp = h("input", { class: "qty-in big num", inputMode: "numeric", value: String(goal) });
    const g = sheet("Objetivo de pasos", [h("div", { class: "steps-box" }, inp, h("div", { class: "faint" }, "pasos al día")),
      h("div", { class: "note" }, "Se usa para las rachas y los días cumplidos. 7.000–10.000 es lo habitual; mejor uno que puedas cumplir casi todos los días.")],
      [h("span", { class: "grow" }), h("button", { class: "btn primary lg", onclick: async () => { const n = parseNum(inp.value); if (!(n >= 1000)) return toast("Pon al menos 1.000", { error: true });
        await act(() => api("PUT", "/api/settings", { objetivo_pasos: String(Math.round(n)) }), "Objetivo guardado"); g.close(); sh.close(); stepsStatsSheet(st); } }, "Guardar")]);
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  };
  const mx = Math.max(1, ...hrs);
  const hchart = h("div", { class: "sch" }, hrs.map((v, i) => {
    const fut = today && i > now;
    return tip(h("div", { class: "sc" + (fut ? " fut" : "") + (!fut && !v ? " zero" : "") + (today && i === now ? " now" : "") },
      h("i", { style: { height: (fut || !v ? 0 : Math.max(3, (100 * v) / mx)) + "%" } })),
      `${String(i).padStart(2, "0")}:00–${String(i + 1).padStart(2, "0")}:00\n${fut ? "—" : fmt(v) + " pasos"}`);
  }));
  const peak = hrs.reduce((b, v, i) => (v > hrs[b] ? i : b), 0);
  sh.set("Pasos", [
    h("div", { class: "sh2" },
      h("div", { class: "sh2-ring" }, ring, h("div", { class: "sh2-in" }, h("b", { class: "num" }, fmt(steps)), h("span", null, "pasos"),
        h("button", { class: "sgoal", title: "Cambiar el objetivo de pasos", onclick: goalSheet }, `de ${fmt(goal)}`, icon("edit")))),
      h("div", { class: "sh2-side" },
        h("div", { class: "sh2-msg" + (steps >= goal ? " ok" : "") }, steps >= goal ? [icon("check"), "Objetivo cumplido"] : `Te faltan ${fmt(goal - steps)} pasos`),
        kv("bolt", "Gasto", en.steps_kcal != null ? `≈ ${fmt(en.steps_kcal)} kcal` : "—"),
        kv("route", "Distancia", km != null ? `${fmt(km, 1)} km` : "—"),
        kv("flame", "Racha", d.streak ? `${d.streak} ${d.streak === 1 ? "día" : "días"}` : "—")),
      h("button", { class: "more-lnk", onclick: () => stepsMoreSheet(st) }, icon("cal"), "Semana, rachas y récords", h("span", { class: "grow" }), "›")),
    h("div", { class: "card panel flat" }, h("h3", { style: { margin: 0 } }, "Por horas"), hchart,
      h("div", { class: "sch-x" }, [0, 6, 12, 18, 24].map((x) => h("span", null, x + " h"))),
      hrs[peak] ? h("div", { class: "faint sm", style: { marginTop: "6px" } }, `Hora más activa: ${peak}:00 · ${fmt(hrs[peak])} pasos`) : null),
  ], stepsFooter(d, sh), { wide: true, sub });
}
// Más estadísticas de pasos: semana L–D, rachas y récords, últimos 30 días y media por día de la semana
async function stepsMoreSheet(st) {
  const sh = sheet("Estadísticas de pasos", h("div", { class: "muted" }, "Cargando…"), null, { wide: true });
  let d; try { d = await stepsData(st); } catch (e) { toast(e.message, { error: true }); sh.close(); return; }
  const en = st.energy, goal = d.goal, byDate = d.byDate;
  const kmOf = (n) => (en.stride_m ? (n * en.stride_m) / 1000 : null);
  const wk0 = mondayOf(st.date), wkDays = [...Array(7)].map((_, i) => addDays(wk0, i));
  const wkSum = (m, n = 7) => [...Array(n)].reduce((a, _, i) => a + (byDate[addDays(m, i)] || 0), 0);
  const thisWk = wkSum(wk0), lastWkSame = wkSum(addDays(wk0, -7), Math.min(7, daysBetween(wk0, st.date) + 1));
  const weeks = {}; for (const x of d.days) { const m = mondayOf(x.date); weeks[m] = (weeks[m] || 0) + x.steps; }
  const bestWk = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0];
  const best = d.days.reduce((b, x) => (!b || x.steps > b.steps ? x : b), null);
  const last30 = d.days.filter((x) => x.date > addDays(st.date, -30)), hit30 = last30.filter((x) => x.steps >= goal).length;
  const prevDays = d.days.filter((x) => x.date < st.date).slice(-7), avg7 = prevDays.length ? prevDays.reduce((a, x) => a + x.steps, 0) / prevDays.length : null;
  const dow = [...Array(7)].map(() => []); for (const x of d.days.filter((x) => x.date > addDays(st.date, -56) && x.date < st.date)) dow[(new Date(x.date + "T12:00").getDay() + 6) % 7].push(x.steps);
  const dowAvg = dow.map((a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null));
  const LD = ["L", "M", "X", "J", "V", "S", "D"];
  const wmx = Math.max(goal * 1.1, ...wkDays.map((x) => byDate[x] || 0));
  const wchart = [h("div", { class: "swk" }, h("span", { class: "sw-goal", style: { bottom: (100 * goal) / wmx + "%" } }),
    wkDays.map((x) => { const v = byDate[x], fut = x > st.today; return tip(h("div", { class: "sw" + (x === st.date ? " cur" : "") + (v >= goal ? " ok" : "") + (!fut && !v ? " zero" : "") },
      h("i", { style: { height: (v ? Math.max(3, (100 * v) / wmx) : 0) + "%" } })),
      `${dateLabel(x, { weekday: "long", day: "numeric", month: "short" })}\n${fut ? "—" : v != null ? fmt(v) + " pasos" : "sin datos"}`); })),
    h("div", { class: "swk-x" }, LD.map((l, i) => h("em", { class: wkDays[i] === st.date ? "cur" : "" }, l)))];
  const wdiff = thisWk - lastWkSame;
  const dmx = Math.max(goal * 1.1, 1, ...last30.map((x) => x.steps));
  const dchart = last30.length > 1 ? h("div", { class: "sdays" }, h("span", { class: "sd-avg", style: { bottom: (100 * goal) / dmx + "%" } }),
    last30.map((x) => tip(h("i", { class: (x.date === st.date ? "cur" : "") + (x.steps >= goal ? " ok" : ""), style: { height: Math.max(3, (100 * x.steps) / dmx) + "%" } }),
      `${dateLabel(x.date, { weekday: "short", day: "numeric", month: "short" })}\n${fmt(x.steps)} pasos`))) : h("div", { class: "muted sm" }, "En unos días verás aquí tu mes.");
  const rec = (ic, l, v, sub_) => h("div", { class: "srec" }, h("span", { class: "srec-i" }, icon(ic)), h("div", null, h("div", { class: "srec-l" }, l), h("b", { class: "num" }, v), h("div", { class: "srec-s" }, sub_ || "")));
  sh.set("Estadísticas de pasos", [
    h("div", { class: "sgrid" },
      h("div", { class: "card panel flat" }, h("div", { class: "row" }, h("h3", { style: { margin: 0 } }, "Esta semana"), h("span", { class: "grow" }), h("span", { class: "faint sm" }, `--- objetivo ${fmt(goal)}`)),
        h("div", { class: "sw-tot" }, h("b", { class: "num" }, fmt(thisWk)), " pasos", kmOf(thisWk) != null ? h("span", { class: "faint" }, ` · ${fmt(kmOf(thisWk), 1)} km`) : null,
          lastWkSame ? h("span", { class: "sw-d " + (wdiff >= 0 ? "up" : "down") }, `${wdiff >= 0 ? "+" : "−"}${fmt(Math.abs(wdiff))} frente a la semana pasada`) : null), wchart),
      h("div", { class: "card panel flat" }, h("h3", null, "Rachas y récords"), h("div", { class: "srecs" },
        rec("flame", "Racha actual", d.streak ? `${d.streak} ${d.streak === 1 ? "día" : "días"}` : "0", `seguidos con ${fmt(goal)} o más`),
        rec("medal", "Mejor racha", d.bestStreak ? `${d.bestStreak} ${d.bestStreak === 1 ? "día" : "días"}` : "—"),
        rec("trophy", "Mejor día", best ? fmt(best.steps) : "—", best ? dateLabel(best.date, { day: "numeric", month: "short", year: "2-digit" }) : ""),
        rec("cal", "Mejor semana", bestWk ? fmt(bestWk[1]) : "—", bestWk ? "desde el " + dateLabel(bestWk[0], { day: "numeric", month: "short" }) : ""),
        rec("bolt", "Mejor hora", d.best_hour ? fmt(d.best_hour.steps) : "—", d.best_hour ? `${d.best_hour.hour}:00 · ${dateLabel(d.best_hour.date, { day: "numeric", month: "short" })}` : ""),
        rec("target", "Objetivo (30 días)", `${hit30} de ${last30.length || 0}`, "días cumplidos")))),
    h("div", { class: "card panel flat" }, h("div", { class: "row" }, h("h3", { style: { margin: 0 } }, "Últimos 30 días"), h("span", { class: "grow" }),
      avg7 != null ? h("span", { class: "faint sm" }, `media 7 días ${fmt(avg7)}`) : null), dchart,
      dowAvg.some((x) => x != null) ? [h("div", { class: "faint sm", style: { marginTop: "12px" } }, "Media por día de la semana (8 semanas)"),
        h("div", { class: "sdow" }, dowAvg.map((v, i) => h("div", null, h("em", null, LD[i]), h("b", { class: "num" }, v != null ? fmt(v / 1000, 1) + "k" : "—"))))] : null),
  ], stepsFooter(d, sh), { wide: true });
}
function hourBars(hrs, today) {
  const mx = Math.max(1, ...hrs), now = new Date().getHours();
  return h("div", { class: "hbars", title: "Pasos por hora" }, hrs.map((v, i) => h("i", { class: (today && i === now ? "now" : "") + (today && i > now ? " fut" : ""), style: { height: Math.max(v ? 8 : 3, (100 * v) / mx) + "%" }, title: `${i}:00 · ${fmt(v)} pasos` })));
}
// Conectar con el móvil (pasos, báscula o entreno). Android: una app que escriba en Health Connect + «HC Webhook» (la misma
// para todo) que lo manda aquí. iPhone: Salud + Atajos (de momento, solo los pasos).
// Báscula Xiaomi (S400 con Xiaomi Home): no escribe en Health Connect; ScaleLauncher (gratis) la lee por Bluetooth y sí.
function xiaomiGuide() {
  const L = (href, t) => h("a", { href, target: "_blank", rel: "noopener" }, t, " ↗");
  const li = (...c) => h("li", null, ...c);
  return h("details", { class: "xg" }, h("summary", null, "¿Báscula Xiaomi? Paso a paso con ScaleLauncher"),
    h("ol", null,
      li(h("b", null, "Instala openScale"), " (Google Play) y crea tu usuario. No añadas la báscula en ella."),
      li(h("b", null, "Instala ScaleLauncher"), " (gratis): ", L("https://f-droid.org/es/packages/de.pritcloud.scalelauncher/", "F-Droid"), ". Lee la báscula y guarda en Health Connect."),
      li(h("b", null, "Apunta la MAC"), " de la báscula: Xiaomi Home → tu báscula → ⋯ → Ajustes → Sobre el dispositivo."),
      li(h("b", null, "Saca su token"), " (24 caracteres) en el ordenador con ", L("https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor", "Xiaomi-cloud-tokens-extractor"), ": inicias sesión con tu cuenta de Xiaomi y te lo da junto a la MAC. No se lo pases a nadie."),
      li(h("b", null, "Quita la báscula de Xiaomi Home"), " (⋯ → Eliminar dispositivo). No la reinicies de fábrica."),
      li(h("b", null, "En ScaleLauncher"), ": Scale → MAC y token. Permissions → «Allow openScale access» y «Start automatically after reboot»."),
      li(h("b", null, "Users"), ": tu sexo, fecha de nacimiento, altura, peso de referencia y desviación 3 kg; marca «Use Health Connect only for this user»."),
      li(h("b", null, "Health Connect"), ": marca «Transfer measurements» y pulsa «Allow write access»."),
      li(h("b", null, "Pulsa Monitor"), " y pésate. Desde ahí, cada pesaje llega solo.")));
}
// Clave del móvil (HC Webhook): una sola para pasos, báscula y entrenos. Se ve solo al generarla.
async function mobileKeySheet(onNew) {
  let info = await api("GET", "/api/movil").catch(() => ({})), tok = null;
  const sh = sheet("Clave del móvil", null);
  const gen = async () => { tok = (await api("POST", "/api/movil", {})).token; info = await api("GET", "/api/movil").catch(() => info); onNew && onNew(tok); draw(); };
  const draw = () => sh.set("Clave del móvil", [
    h("p", { class: "muted wz-p" }, "Es la clave que pones en «HC Webhook» (Android). Una sola sirve para pasos, báscula y entrenos: si ya la tienes puesta, usa la misma para todo."),
    tok ? h("div", null, h("b", null, "Tu clave nueva"), h("div", { class: "faint sm" }, "Cópiala ahora: no se vuelve a mostrar. En HC Webhook va en el encabezado «Authorization»."), copyLine("Bearer " + tok))
      : info.configurado ? h("div", { class: "note" }, `Ya tienes una clave · creada ${whenTxt(info.clave_creada)}` + (info.ultimo ? ` · último uso ${whenTxt(info.ultimo)}` : " · aún sin usar"))
        : h("div", { class: "note" }, "Aún no tienes clave."),
  ], info.configurado || tok ? [
    h("button", { class: "btn ghost sm danger", onclick: async () => { if (!confirm("¿Borrar la clave? Dejarán de llegar pasos, pesajes y entrenos hasta que pongas otra.")) return; await api("DELETE", "/api/movil"); info = await api("GET", "/api/movil").catch(() => ({})); tok = null; draw(); } }, "Borrar"),
    h("span", { class: "grow" }),
    h("button", { class: "btn sm", onclick: async () => { if (!confirm("¿Generar una nueva? La actual dejará de funcionar y tendrás que cambiarla en HC Webhook.")) return; await gen(); } }, "Generar una nueva"),
  ] : [h("span", { class: "grow" }), h("button", { class: "btn primary", onclick: gen }, "Generar clave")]);
  draw();
}
const whenTxt = (s) => s ? dateLabel(s.slice(0, 10), { day: "numeric", month: "short" }) + (s.length > 11 ? " · " + s.slice(11, 16) : "") : "";
async function stepsConnectSheet(mode = "pasos") {
  let info = await api("GET", "/api/movil").catch(() => ({}));
  if ((info.off || []).includes(mode)) { await api("POST", "/api/movil", { off: mode, desactivar: false }).catch(() => null); info.off = info.off.filter((x) => x !== mode); }
  let tok = null, os = /iPhone|iPad/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : null;
  const M = {
    pasos: { t: "Conectar tus pasos", p: "Así los pasos llegan solos y por horas.",
      app: ["Una app que guarde tus pasos en Health Connect", "El propio móvil, Google Fit o tu pulsera. Compruébalo en Ajustes → Health Connect."],
      tipos: "Pasos (cada 15 min, con «Contar una vez» activado)", done: () => !!info.conectado, ok: () => `Conectado · último envío ${info.ultimo}`, wait: "Cuando llegue el primer envío, aquí pondrá «Conectado»." },
    bascula: { t: "Conectar tu báscula", p: "Así cada pesaje llega solo, con su composición.",
      app: ["Una app de báscula que guarde en Health Connect", "La de tu báscula, si guarda en Health Connect (Renpho, Withings, Zepp Life…).", "xiaomi"],
      tipos: "Peso, Grasa corporal, Masa magra, Masa ósea, Agua corporal y Metabolismo basal", done: () => !!info.bascula, ok: () => `Conectada · último pesaje ${whenTxt(info.bascula)}`, wait: "Pésate: cuando llegue el pesaje, aquí pondrá «Conectada»." },
    entreno: { t: "Conectar tus entrenos", p: "Así sabemos cuándo entrenas y, si al cerrar el día no has mandado el entreno, te lo pedimos. Las series y los pesos se los mandas a tu agente (captura o ChatGPT) o subes el CSV de Hevy en Entreno.",
      app: ["Una app de entreno que guarde en Health Connect", "Recomendada: Hevy → Ajustes → Integraciones → Health Connect, y al guardar el entreno deja activado «Health Connect»."],
      tipos: "Sesiones de ejercicio", done: () => !!info.entreno_ultimo, ok: () => `Conectado · último entreno ${whenTxt(info.entreno_ultimo)}`, wait: "Guarda un entreno: cuando llegue, aquí pondrá «Conectado»." },
  }[mode];
  const sh = sheet(M.t, null, null, { onClose: () => { clearInterval(tm); loadPasos(); } });
  let tm = null;
  const step = (n, t, d, extra) => h("div", { class: "ast" }, h("span", { class: "n" }, String(n)), h("div", null, h("b", null, t), d ? h("div", { class: "muted" }, d) : null, extra || null));
  const draw = () => {
    const seg = h("div", { class: "seg tg-seg" }, [["android", "Android"], ["ios", "iPhone"]].map(([k, l]) => h("button", { class: os === k ? "on" : "", onclick: () => { os = k; draw(); } }, l)));
    const keyBtn = (t) => h("button", { class: "btn sm", onclick: () => mobileKeySheet(async (k) => { tok = k; info = await api("GET", "/api/movil").catch(() => info); draw(); }) }, t);
    const tokLine = tok ? copyLine("Bearer " + tok) : info.configurado ? h("div", { class: "faint sm" }, "Usa la misma clave que ya tienes. ", keyBtn("Administrar")) : keyBtn("Generar mi clave");
    const url = copyLine(info.url || location.origin + "/api/hooks/salud");
    const have = !!info.conectado, done = M.done();
    let body;
    if (os === "android") {
      const [t1, d1, x1] = M.app;
      body = [
        step(1, t1, d1, x1 === "xiaomi" ? xiaomiGuide() : x1 ? h("a", { class: "btn sm ext", href: x1.href, target: "_blank", rel: "noopener" }, x1.t, " ↗") : null),
        have ? step(2, "En «HC Webhook», activa: " + M.tipos, h("span", { class: "faint" }, "La misma app y la misma clave que ya usas."))
          : step(2, "Instala «HC Webhook» y activa: " + M.tipos, "Gratis desde GitHub (la misma sirve para pasos, báscula y entrenos). En Webhooks → Añadir, pon esta dirección:",
            h("div", null, url, h("div", { class: "muted", style: { marginTop: "8px" } }, "Y en Encabezado, «Authorization» con tu clave (una para todo):"), tokLine,
              h("a", { class: "btn sm ext", style: { marginTop: "8px" }, href: "https://github.com/mcnaveen/health-connect-webhook/releases/latest", target: "_blank", rel: "noopener" }, "Descargar HC Webhook", " ↗"))),
      ];
    } else if (os === "ios") {
      body = mode !== "pasos" ? [h("p", { class: "muted" }, "En iPhone, de momento solo los pasos. Mientras, mándale la captura a tu agente.")] : [
        step(1, "Atajos → Automatización → Nueva → «Hora del día»", "Por ejemplo a las 14:00, 20:00 y 23:50, con «Ejecutar inmediatamente»."),
        step(2, "Acciones: «Buscar muestras de salud» (Pasos, hoy) → «Calcular estadísticas» (Suma) → «Obtener contenido de URL»",
          "POST a esta dirección, con el encabezado «Authorization» y un campo Número «steps» con la suma:", h("div", null, url, tokLine)),
      ];
    }
    sh.set(M.t, [h("p", { class: "muted wz-p" }, M.p, h("span", { class: "faint" }, " Es opcional: sin conectar nada, lo apuntas a mano o se lo dices a tu agente.")), seg,
      os ? h("div", { class: "agent-steps simple" }, body,
        os === "android" || mode === "pasos" ? h("div", { class: "ast" }, h("span", { class: "n" + (done ? " ok" : "") }, done ? "✓" : "3"),
          h("div", null, h("b", null, "Listo"), h("div", { class: "agent-wait soft" + (done ? " done" : "") }, done ? M.ok() : M.wait))) : null)
        : h("p", { class: "muted" }, "¿Qué móvil tienes?")], null);
  };
  draw();
  tm = setInterval(async () => { const r = await api("GET", "/api/movil").catch(() => null); if (r && (r.conectado !== info.conectado || r.bascula !== info.bascula || r.entreno_ultimo !== info.entreno_ultimo)) { info = r; draw(); refresh(); } }, 4000);
}
// Hevy a través del agente: Salud no puede conectarse a Hevy (solo acepta apps dadas de alta por ellos); tu agente sí.
// Sale «Conectado» en cuanto el agente sube un entreno tal cual viene de Hevy (no con capturas).
function hevyAgentSheet(ok) {
  if (ok === undefined) ok = (S.pasos || {}).hevy_agente;
  const step = (n, t, d, done) => h("div", { class: "ast" }, h("span", { class: "n" + (done ? " ok" : "") }, done ? "✓" : String(n)), h("div", null, h("b", null, t), d ? h("div", { class: "muted" }, d) : null));
  sheet("Hevy en tu agente", [
    h("p", { class: "muted wz-p" }, "Así tu agente sube cada entreno con todas sus series y pesos, sin capturas. Si además tienes los entrenos conectados por Health Connect, lo sube él solo cuando habléis."),
    h("div", { class: "agent-steps simple" },
      step(1, "Añade Hevy a tu agente", "En Claude: Ajustes → Conectores → busca Hevy. En ChatGPT: la app de Hevy."),
      step(2, "Dile «sube el entreno»", "Lo trae de Hevy y lo sube aquí."),
      step(3, "Listo", ok ? `Conectado · último entreno subido desde Hevy ${agoTxt(ok)}` : "Cuando suba el primero, aquí pondrá «Conectado».", !!ok)),
  ], null);
}
// Conexiones (menú de tu nombre): agente, pasos, báscula y Hevy en un solo sitio.
// Pasos «conectados» si el móvil ha mandado tramos en las últimas 48 h; báscula, si ya ha llegado algún pesaje del móvil.
async function connectionsSheet() {
  const [info0, ws] = await Promise.all([S.me ? api("GET", "/api/movil").catch(() => ({})) : {}, api("GET", "/api/workouts?limit=1").catch(() => ({ workouts: [] }))]);
  let info = info0, tok = null;
  const lastW = (ws.workouts || [])[0];
  const fresh = (ts, h_) => ts && Date.now() - new Date(ts.replace(" ", "T")) < h_ * 3600e3;
  const sh = sheet("Conexiones", null, null, { onClose: () => loadPasos() });
  const draw = () => {
    const pasosOk = fresh(info.pasos_ultimo, 48);
    const isOff = (k) => (info.off || []).includes(k);
    const st_ = (k, ok, any) => isOff(k) || !any ? "off" : ok ? "ok" : "warn";
    const btn_ = (k, any) => any && !isOff(k)
      ? h("button", { class: "btn sm ghost", onclick: async () => { if (!confirm("¿Desconectar? Lo que mande el móvil de esto dejará de guardarse (puedes desactivarlo también en HC Webhook).")) return; await api("POST", "/api/movil", { off: k }); info = await api("GET", "/api/movil").catch(() => info); draw(); loadPasos(); } }, "Desconectar")
      : h("button", { class: "btn sm ghost", onclick: () => stepsConnectSheet(k) }, "Conectar");
    const row_ = (ic, t, state, sub_, btn) => h("div", { class: "pc-row" }, h("span", { class: "pc-i " + state }, ic),
      h("div", { class: "grow" }, h("div", { class: "pc-t" }, h("b", null, t), h("span", { class: "pc-badge " + state }, { ok: "Conectado", warn: "Sin datos recientes", off: "Sin conectar", man: "A mano" }[state])),
        h("div", { class: "faint sm" }, sub_)), btn);
    sh.set("Conexiones", [
      h("p", { class: "muted wz-p" }, "Todo es opcional: la web y tu agente funcionan sin conectar nada. Esto solo hace que lleguen solos los datos."),
      h("div", { class: "pc-list" },
        S.me ? row_("✦", "Agente (Claude, ChatGPT…)", agentConnected() ? "ok" : "off",
          agentConnected() ? S.me.agente.agents.map((t) => agentOf(t.agent || t.kind).n).join(", ") : "Para apuntar por chat, mandar capturas de Hevy o de la báscula",
          h("button", { class: "btn sm ghost", onclick: () => connectAgent() }, agentConnected() ? "Gestionar" : "Conectar")) : null,
        S.me ? row_("👟", "Pasos del móvil", st_("pasos", pasosOk, info.pasos_ultimo), info.pasos_ultimo && !isOff("pasos") ? `Último envío ${agoTxt(info.pasos_ultimo)}` : "Que lleguen solos desde el móvil", btn_("pasos", info.pasos_ultimo)) : null,
        S.me ? row_("⚖", "Báscula", st_("bascula", !!info.bascula, info.bascula), info.bascula && !isOff("bascula") ? `Último pesaje ${whenTxt(info.bascula)}` : "Que cada pesaje llegue solo (peso, % de grasa…)", btn_("bascula", info.bascula)) : null,
        S.me ? row_("🏋", "Entrenos", st_("entreno", !!info.entreno_ultimo, info.entreno_ultimo), info.entreno_ultimo && !isOff("entreno") ? `Último entreno detectado ${whenTxt(info.entreno_ultimo)}` : "Que se sepa solo cuándo entrenas (Hevy u otra app)", btn_("entreno", info.entreno_ultimo)) : null,
        S.me ? row_("📋", "Series de Hevy", info.hevy_agente ? "ok" : "man", info.hevy_agente ? `A través de tu agente · último ${agoTxt(info.hevy_agente)}` : "Capturas a tu agente, o conecta Hevy a tu agente y las sube él",
          h("button", { class: "btn sm ghost", onclick: () => hevyAgentSheet(info.hevy_agente) }, info.hevy_agente ? "Ver" : "Cómo")) : null),
    ], S.me && info.configurado ? [h("button", { class: "btn sm ghost", onclick: () => mobileKeySheet(async () => { info = await api("GET", "/api/movil").catch(() => info); }) }, icon("key"), "Clave del móvil")] : null);
  };
  draw();
}
const phoneConnSheet = connectionsSheet;
async function loadPasos() { if (!S.me) return; S.pasos = await api("GET", "/api/movil").catch(() => ({})); if (S.view === "hoy") render(); }
function stepsSheet(st) {
  const en = st.energy;
  const inp = h("input", { class: "qty-in big num", inputMode: "numeric", value: st.day.steps ?? "", placeholder: "0" });
  const kcalEl = h("div", { class: "steps-kcal" });
  const draw = () => {
    const n = parseNum(inp.value);
    if (!(n >= 0) || n === null) { kcalEl.textContent = " "; return; }
    const eff = Math.max(0, n - (en.steps_in_activities || 0));
    const km = eff * en.stride_m / 1000, kcal = km * en.weight_used_kg * en.kcal_per_kg_km;
    kcalEl.replaceChildren(h("b", { class: "num" }, "≈ " + fmt(kcal) + " kcal"), h("span", null, ` · ${fmt(km, 1)} km · gasto neto sobre reposo`));
  };
  inp.addEventListener("input", draw);
  const save = async () => {
    const n = parseNum(inp.value);
    if (n !== null && !(n >= 0)) return toast("Número no válido", { error: true });
    await act(() => api("PUT", "/api/days/" + st.date, { steps: n == null ? null : Math.round(n) }), "Pasos guardados"); sh.close();
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  draw();
  const sh = sheet("Pasos", [h("div", { class: "steps-box" }, inp, h("div", { class: "faint" }, "pasos del día"), kcalEl),
    h("button", { class: "btn primary lg steps-save", onclick: save }, "Guardar"),
    h("div", { class: "note" }, `Zancada ${fmt(en.stride_m, 2)} m · ${fmt(en.weight_used_kg, 1)} kg · ${String(en.kcal_per_kg_km).replace(".", ",")} kcal/kg/km. Si una sesión de carrera ya está en el contador, se descuenta para no contarla dos veces.`)],
    sheetFoot(null, "pasos"), { sub: dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" }) });
  setTimeout(() => { inp.focus(); inp.select(); }, 60);
}

async function trainingDaySheet(st) {
  const ws = st.workouts || [];
  if (ws.length === 1) return workoutSheet(ws[0].id);
  const hv = await api("GET", "/api/hevy").catch(() => ({ configured: false }));
  const closed = st.status === "cerrado", rest = st.day.rest_day === 1;
  const pend = ws.length ? [] : (st.sessions || []).filter((x) => !x.registrada);
  const trainOn = !!(S.pasos || {}).entreno_ultimo && !((S.pasos || {}).off || []).includes("entreno");
  const sh = sheet("Entreno", [
    ws.length ? h("div", { class: "list" }, ws.map((w) => h("div", { class: "item", onclick: () => workoutSheet(w.id) },
      h("div", { class: "nm" }, w.title), h("div", { class: "kc num" }, fmt(w.duration_min) + "′"), h("div", { class: "sub" }, `${w.sets_count} series · ${fmt(w.volume_kg)} kg`), h("div"))))
      : pend.length ? h("div", { class: "det-card" },
          h("div", { class: "det-src" }, h("span", { class: "det-i" }, "!"), `Detectado en ${pend[0].app || "tu móvil"} · falta subirlo`),
          pend.map((x) => h("div", { class: "det-w" }, h("div", { class: "det-t" }, x.titulo || "Entreno"),
            h("div", { class: "det-kv" }, [["Empieza", x.inicio], ["Duración", fmt(x.minutos) + " min"]].map(([k, v]) => h("div", null, h("span", null, k), h("b", { class: "num" }, v)))))),
          hv.agente
            ? h("div", { class: "det-how" }, h("b", null, "Tu agente lo subirá desde Hevy"), " la próxima vez que habléis. ¿Lo quieres ya? Dile ", h("q", null, "sube el entreno"), ".")
            : h("div", { class: "det-how" }, "Dile a tu agente ", h("q", null, "sube el entreno"), " y pásale las capturas de Hevy.",
                h("div", { class: "det-tip" }, "Si conectas Hevy a tu agente, lo subirá él solo. ", h("button", { class: "lnk-btn", onclick: () => hevyAgentSheet() }, "Cómo"))))
      : h("div", { class: "card empty flat" }, icon("dumbbell"), h("h3", null, rest ? "Día de descanso" : "Sin entreno"),
        h("p", { class: "muted" }, rest ? "Hoy no cuenta ningún entreno." : "Mándale el entreno a tu agente («entreno hecho» o la captura de Hevy), o márcalo como día de descanso."),
        !closed ? h("button", { class: "btn", onclick: async () => { await act(() => api("PUT", "/api/days/" + st.date, { rest_day: !rest }), rest ? "Descanso quitado" : "Marcado como descanso"); sh.close(); } }, rest ? "Quitar descanso" : "Día de descanso") : null),
  ], trainOn ? sheetFoot(`Último entreno detectado: ${agoTxt(S.pasos.entreno_ultimo)}`, null, "Ir a Entreno", "#/entreno") : sheetFoot(null, "entreno", "Ir a Entreno", "#/entreno"),
  { sub: dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" }) });
}

function importCsv() {
  const fi = h("input", { type: "file", accept: ".csv,.json,text/csv,application/json" });
  fi.addEventListener("change", async () => {
    const file = fi.files[0]; if (!file) return;
    toast("Importando…");
    try {
      const r = await api("POST", "/api/hevy/import-csv", { csv: await file.text() });
      toast(`Hevy: ${r.created} nuevos · ${r.updated} actualizados` + (r.errors.length ? ` · ${r.errors.length} con error` : ""));
      if (r.skipped.length) setTimeout(() => toast(`${r.skipped.length} en días cerrados: reábrelos para importarlos`, { error: true }), 2800);
      await refresh();
    } catch (e) { toast(e.message, { error: true }); }
  });
  fi.click();
}

async function hevySync(full) {
  toast("Sincronizando con Hevy…");
  try {
    const r = await api("POST", "/api/hevy/sync", { full: !!full });
    const x = r.result;
    toast(x.created || x.updated || x.deleted ? `Hevy: ${x.created} nuevos · ${x.updated} actualizados${x.deleted ? " · " + x.deleted + " borrados" : ""}` : "Hevy: sin cambios");
    if (x.skipped.length) setTimeout(() => toast(`${x.skipped.length} entreno(s) en días cerrados: reábrelos para importarlos`, { error: true }), 2800);
    await refresh();
  } catch (e) { toast(e.message, { error: true }); }
}

// Suplementos (productos con categoría «Suplemento» y dosis sin kcal): un bloque propio al final de Hoy, fuera de las comidas.
// Se apuntan como una entrada más (franja «otro»); al cerrar el día se pregunta por los que falten.
const suppPortion = (f) => (f.portions || []).find((p) => p.is_default) || (f.portions || [])[0];
const isSupp = (f) => { const p = f && suppPortion(f); return !!(f && !f.deleted && !f.hidden && /suplement/i.test(f.category || "") && p && p.kcal != null && p.kcal < 20); };
function suppBlock(st, closed) {
  const sups = st.supplements || [];
  const taken = st.supplements_taken || {};
  if (!sups.length) return null;
  const ent = (id) => Object.values(st.meals).flatMap((m) => m.entries).find((e) => e.food_id === id);
  const nowT = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const foodOf = (id) => (S.catalog && S.catalog.foods || []).find((f) => f.id === id) || {};
  const toggle = async (x) => {
    const e = ent(x.id);
    if (e) await act(() => api("DELETE", "/api/entries/" + e.id), x.name + " quitado");
    else await act(() => api("POST", "/api/entries", { date: S.date, food_id: x.id, unit_key: x.portion_id ? "p:" + x.portion_id : "g", quantity: x.portion_id ? 1 : 5, meal: "otro", time: st.date === st.today ? nowT() : null }), x.name + " apuntado");
  };
  const head = h("div", { class: "meal-h" }, h("h3", null, "Suplementos"), h("span", { class: "mt num" }, `${Object.keys(taken).length} de ${sups.length}`));
  return h("div", { class: "meal supp-b" }, head, h("div", { class: "list" }, sups.map((x) => {
    const on = x.id in taken, fo = foodOf(x.id);
    return h("div", { class: "item b supp-it" + (on ? " on" : ""), onclick: closed ? null : () => toggle(x) },
      mono(x.name, fo.category, fo.image),
      h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, x.name)), h("div", { class: "sub" }, [x.dose, on && taken[x.id] ? "tomado a las " + taken[x.id] : on ? "tomado" : "sin tomar"].filter(Boolean).join(" · "))),
      h("div", { class: "supp-ck" + (on ? " on" : "") }, on ? icon("check") : null));
  })));
}
function mealBlock(st, meal, closed) {
  const supIds = new Set((st.supplements || []).map((x) => x.id));
  const supHide = new Set(Object.values(st.meals).flatMap((m) => m.entries).filter((e) => supIds.has(e.food_id)).map((e) => e.id));
  const m0 = st.meals[meal], m = supHide.size ? { ...m0, entries: m0.entries.filter((e) => !supHide.has(e.id)) } : m0;
  if (meal === "otro" && !m.entries.length && closed) return null;
  const head = h("div", { class: "meal-h" }, h("h3", null, m.label),
    m.entries.length ? h("span", { class: "mt num" }, h("b", null, v(m.totals, "kcal")), " kcal") : null,
    m.entries.length ? h("span", { class: "mchips num" }, h("i", { class: "p" }, v(m.totals, "protein_g")), h("i", { class: "c" }, v(m.totals, "carbs_g")), h("i", { class: "g" }, v(m.totals, "fat_g"))) : null,
    closed ? null : h("button", { class: "add-btn add", onclick: () => addSheet(meal) }, "+ Añadir"));
  if (!m.entries.length) return h("div", { class: "meal" }, head, closed ? h("div", { class: "empty-meal" }, "—") : h("div", { class: "empty-meal", onclick: () => addSheet(meal) }, "Añadir " + m.label.toLowerCase()));
  const list = h("div", { class: "list" });
  const foodOf = (id) => (S.catalog && S.catalog.foods || []).find((f) => f.id === id) || {};
  const chips = (n) => h("div", { class: "mchips num" }, h("i", { class: "p" }, v(n, "protein_g")), h("i", { class: "c" }, v(n, "carbs_g")), h("i", { class: "g" }, v(n, "fat_g")));
  const itemEl = (e, child) => { const fo = foodOf(e.food_id);
    return h("div", { class: "item b" + (child ? " child" : ""), onclick: closed ? null : (ev) => { ev.stopPropagation(); entrySheet(e); } },
      mono(e.name, fo.category, fo.image),
      h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, e.name), estTag(e)),
        h("div", { class: "sub" }, estTag(e), [e.time, e.unit_label, e.kind === "estimacion" && e.kcal_min != null ? `rango ${fmt(e.kcal_min)}–${fmt(e.kcal_max)}` : null].filter(Boolean).join(" · ")), chips(e)),
      h("div", { class: "kc num" }, v(e, "kcal"), h("small", null, "kcal"))); };
  // Las comidas habituales se muestran como un solo plato (desplegable con sus ingredientes)
  const es = m.entries;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e.template_id) { list.append(itemEl(e)); continue; }
    const grp = [e];
    while (i + 1 < es.length && es[i + 1].template_id === e.template_id) grp.push(es[++i]);
    const tpl = (S.catalog && S.catalog.templates || []).find((t) => t.id === e.template_id);
    const tot = { missing: [] };
    for (const f of ["kcal", "protein_g", "carbs_g", "fat_g"]) {
      tot[f] = grp.reduce((a, x) => a + (x[f] || 0), 0);
      if (grp.some((x) => x[f] == null || (x.missing || []).includes(f))) tot.missing.push(f);
    }
    const worst = grp.map((x) => x.quality).sort((a, b) => QORDER.indexOf(b) - QORDER.indexOf(a))[0];
    const key = e.date + ":" + e.template_id + ":" + e.id;
    S.openTpl = S.openTpl || {};
    const kids = h("div", { class: "tpl-kids" + (S.openTpl[key] ? "" : " hidden") }, grp.map((x) => itemEl(x, true)));
    const row = h("div", { class: "item b tpl" + (S.openTpl[key] ? " open" : ""), onclick: () => { S.openTpl[key] = !S.openTpl[key]; kids.classList.toggle("hidden"); row.classList.toggle("open"); } },
      mono(tpl ? tpl.name : "Comida habitual", "comida", tpl && tpl.image),
      h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, tpl ? tpl.name : "Comida habitual"), estTag(grp), h("span", { class: "chev" }, icon("right"))),
        h("div", { class: "sub" }, estTag(grp), [e.time, `comida habitual · ${grp.length} ${grp.length === 1 ? "alimento" : "alimentos"}`].filter(Boolean).join(" · ")), chips(tot)),
      h("div", { class: "kc num" }, v(tot, "kcal"), h("small", null, "kcal")));
    list.append(h("div", { class: "tpl-grp" }, row, kids));
  }
  return h("div", { class: "meal" }, head, list);
}

// --------------------------------------------------------- alta de comidas
function defUnit(f) {
  const us = f.units || [];
  return (f.default_unit && us.find((u) => u.key === f.default_unit)) || null;
}
function foodBasis(f) {
  if (isSupp(f)) { const p = suppPortion(f), u = (f.units || []).find((x) => x.key === "p:" + p.id); if (u) return [u.per, u.label]; }
  const du = defUnit(f);
  if (du && !["g", "ml"].includes(du.key)) return [du.per, du.label];
  if (f.per100) return [f.per100, "100 " + f.per100_unit];
  const u = (f.units || []).find((x) => x.key !== "x");
  return u ? [u.per, u.label] : [null, null];
}
function foodSub(f) {
  const [n, lbl] = foodBasis(f);
  if (!n) return "Sin datos nutricionales";
  return `${lbl} · ${v(n, "kcal")} kcal · ${v(n, "protein_g", 1)} P`;
}
// kcal + P/C/G en el mismo formato para todas las cards. La P se resalta según la densidad proteica (% de kcal).
function macroBadges(n, lbl) {
  if (!n) return h("div", { class: "mb none" }, "Sin datos");
  const pk = n.kcal ? (n.protein_g || 0) * 4 / n.kcal : 0;
  const pq = pk >= 0.3 ? "hi" : pk >= 0.15 ? "mid" : "lo";
  return h("div", { class: "mb" }, h("div", { class: "mb1" }, h("b", { class: "k" }, v(n, "kcal")), h("small", null, " kcal"), lbl ? h("span", { class: "per" }, " · " + lbl) : null),
    h("div", { class: "mchips num" }, h("i", { class: "p " + pq, title: n.kcal ? `${fmt(pk * 100)} % de las kcal vienen de proteína` : "" }, v(n, "protein_g", n.protein_g < 10 ? 1 : 0)),
      h("i", { class: "c" }, v(n, "carbs_g", n.carbs_g < 10 ? 1 : 0)), h("i", { class: "g" }, v(n, "fat_g", n.fat_g < 10 ? 1 : 0))));
}
// Fotos de productos y comidas: al tocarlas se ven en grande; ninguna imagen se arrastra
document.addEventListener("click", (e) => {
  const im = e.target.closest && e.target.closest(".pframe img, .food-head img");
  if (im && !im.closest(".tile")) { e.preventDefault(); e.stopPropagation(); zoomImg(im.src); }
}, true);
document.addEventListener("dragstart", (e) => { if (e.target.tagName === "IMG") e.preventDefault(); });
// Foto en grande (encima de todo; se cierra tocando o con Esc)
function zoomImg(src) {
  const ov = h("div", { class: "zoom-ov", onclick: () => close() }, h("img", { src, alt: "" }));
  const key = (e) => { if (e.key === "Escape") close(); };
  const close = () => { ov.remove(); document.removeEventListener("keydown", key, true); };
  document.addEventListener("keydown", key, true);
  document.body.append(ov);
}
function photoFrame(name, cat, img) {
  const src = img ? (/^(\/|data:|https?:)/.test(img) ? img : "/" + img) : null;
  const fr = h("div", { class: "pframe" + (src ? "" : " none") });
  if (src) fr.append(h("img", { src, alt: "", class: "zoomable", onerror: () => fr.replaceChildren(mono(name, cat, null, true)) }),
    h("button", { type: "button", class: "pzoom", title: "Ver en grande", onclick: () => zoomImg(src) }, "⤢"));
  else fr.append(mono(name, cat, null, true));
  return fr;
}
function tilePhoto(name, cat, img) {
  const src = img ? (/^(\/|data:|https?:)/.test(img) ? img : "/" + img) : null;
  if (src) return h("div", { class: "ph" }, h("img", { src, alt: "", loading: "lazy", onerror: (e) => { e.target.replaceWith(mono(name, cat)); } }));
  return h("div", { class: "ph none" }, mono(name, cat, null, true));
}
function foodTile(f, onclick) {
  const cat = f.kind === "receta" ? "receta" : f.category;
  const [n, lbl] = foodBasis(f);
  const tag = !f.reviewed ? h("span", { class: "rev" }, "Por revisar") : (["pendiente", "provisional", "estimacion"].includes(f.status) ? h("span", { class: "miss", title: "Los valores no son de la etiqueta: estimados o sin confirmar" }, "Valores a ojo") : null);
  return h("button", { class: "tile", onclick, type: "button" }, tilePhoto(f.name, cat, f.image),
    h("div", { class: "tx" }, h("div", { class: "tn" }, f.name), h("div", { class: "ts" }, tag, tag && f.kind === "receta" ? " · " : "", f.kind === "receta" ? "Receta" : "", !tag && f.kind !== "receta" ? (f.brand || f.category || "") : ""),
      macroBadges(n, lbl)));
}
function tplTile(t, onclick) {
  const imgs = t.image ? [t.image] : t.items.map((it) => (foodById(it.food_id) || {}).image).filter(Boolean).slice(0, 2);
  const ph = imgs.length ? h("div", { class: "ph" + (imgs.length > 1 ? " duo" : "") }, imgs.map((im) => h("img", { src: /^(\/|https?:)/.test(im) ? im : "/" + im, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }))) : h("div", { class: "ph none" }, mono(t.name, "habitual", null, true));
  return h("button", { class: "tile", onclick, type: "button" }, ph,
    h("div", { class: "tx" }, h("div", { class: "tn" }, t.name), h("div", { class: "ts" }, !t.reviewed ? h("span", { class: "rev" }, "Por revisar · ") : "Habitual · ", `${t.items.length} alimentos`),
      macroBadges(t.nutr, "plato")));
}
const foodById = (id) => S.catalog.foods.find((f) => f.id === id);

function addSheet(meal) {
  const ctx = { meal, time: S.date === todayISO() ? nowHM() : "", q: "" };
  const sh = sheet("Añadir a " + MEALS.find((x) => x[0] === meal)[1].toLowerCase(), []);
  const list = h("div");
  const search = h("input", { class: "input lg", placeholder: "Buscar alimento, receta o comida habitual", autocomplete: "off" });
  const drawList = () => {
    const q = norm(search.value.trim());
    const foods = S.catalog.foods.filter((f) => !f.hidden && !f.deleted && f.reviewed);
    const tpls = S.catalog.templates.filter((t) => !t.hidden && !t.deleted && t.reviewed).sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name, "es"));
    if (!foods.length && !tpls.length) { list.replaceChildren(h("div", { class: "card empty flat" }, h("h3", null, "Nada aceptado todavía"), h("p", { class: "muted" }, "Revisa y acepta productos en Comida para que aparezcan aquí."))); return; }
    const secs = [];
    if (q) {
      const ft = tpls.filter((t) => norm(t.name).includes(q));
      const ff = foods.filter((f) => norm(f.name).includes(q) || norm(f.original_name).includes(q));
      if (ft.length) secs.push(["Comidas habituales", ft.map((t) => tplTile(t, () => pickTemplate(t)))]);
      secs.push([ff.length ? "Alimentos" : "Sin resultados", ff.map((f) => foodTile(f, () => pickFood(f)))]);
    } else {
      if (tpls.length) secs.push(["Comidas habituales", tpls.map((t) => tplTile(t, () => pickTemplate(t)))]);
      const freq = foods.filter((f) => f.uses_60d > 0).sort((a, b) => b.uses_60d - a.uses_60d).slice(0, 8);
      if (freq.length) secs.push(["Frecuentes", freq.map((f) => foodTile(f, () => pickFood(f)))]);
      const rest = foods.slice().sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name, "es"));
      secs.push(["Todos", rest.map((f) => foodTile(f, () => pickFood(f)))]);
    }
    list.replaceChildren(...secs.map(([t, tiles]) => [h("div", { class: "sec-t" }, t), h("div", { class: "tiles" }, tiles)]).flat());
  };
  search.addEventListener("input", drawList);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = list.querySelector(".tile"); if (first) first.click(); }
  });
  const step1 = () => {
    sh.set("Añadir a " + MEALS.find((x) => x[0] === ctx.meal)[1].toLowerCase(),
      [h("div", { class: "search sticky" }, icon("search"), search),
        h("div", { class: "quick-actions" },
          h("button", { type: "button", class: "qa", onclick: () => estimateForm() }, icon("out"), "Comida fuera / estimación"),
          h("button", { type: "button", class: "qa", onclick: () => foodEditor(null) }, icon("plus"), "Nuevo producto")),
        list], null, { sub: dateLabel(S.date, { weekday: "long", day: "numeric", month: "long" }) });
    drawList(); setTimeout(() => search.focus(), 30);
  };
  const pickFood = (f) => {
    const form = amountForm(f, { meal: ctx.meal, time: ctx.time });
    sh.set("Añadir alimento", form.el, [h("span", { class: "grow" }), h("button", { class: "btn primary lg", onclick: submit }, "Añadir")], { back: step1 });
    form.onEnter = submit;
    async function submit() {
      const d = form.value(); if (!d) return;
      Object.assign(ctx, { meal: d.meal, time: d.time });
      await act(() => api("POST", "/api/entries", { date: S.date, food_id: f.id, ...d }), `${f.name} añadido`);
      sh.close();
    }
  };
  const pickTemplate = (t) => {
    const rows = t.items.map((it) => ({ it, on: true, qty: it.quantity }));
    const food = (id) => foodById(id);
    const totalEl = h("div", { class: "mprev" });
    const drawTotal = () => {
      const parts = rows.filter((r) => r.on && r.qty > 0).map((r) => { const u = (food(r.it.food_id).units || []).find((x) => x.key === r.it.unit_key); return u ? scaleN(u.per, r.qty) : { kcal: null, protein_g: null, carbs_g: null, fat_g: null }; });
      const n = sumN(parts);
      totalEl.replaceChildren(h("div", { class: "mp k" }, h("b", { class: "num" }, v(n, "kcal")), h("span", null, "kcal")),
        ...[["protein_g", "Proteína", "p"], ["carbs_g", "Carbohidratos", "c"], ["fat_g", "Grasas", "g"]].map(([f, l, c]) => h("div", { class: "mp " + c }, h("b", { class: "num" }, v(n, f), h("small", null, " g")), h("span", null, l))));
    };
    const meal = mealChips(t.meal || ctx.meal), timeIn = h("input", { class: "input", type: "time", value: ctx.time });
    const body = [
      h("div", { class: "tpl-list" }, rows.map((r) => {
        const f = food(r.it.food_id); const u = (f.units || []).find((x) => x.key === r.it.unit_key) || { label: r.it.unit_key, key: r.it.unit_key };
        const q = h("input", { class: "input num sm", value: String(r.qty).replace(".", ","), inputMode: "decimal", oninput: (e) => { r.qty = parseNum(e.target.value); drawTotal(); } });
        const row_ = h("label", { class: "tpl-row" });
        const cb = h("input", { type: "checkbox", checked: true, onchange: (e) => { r.on = e.target.checked; row_.classList.toggle("off", !r.on); drawTotal(); } });
        row_.append(cb, mono(f.name, f.category, f.image), h("div", { class: "nm" }, f.name), q, h("span", { class: "u" }, ["g", "ml"].includes(u.key) ? u.key : u.label));
        return row_;
      })),
      totalEl,
      h("div", { class: "note" }, "Las cantidades cambian solo para hoy; la comida habitual no se modifica."),
      whenRow(meal, timeIn),
    ];
    drawTotal();
    sh.set(t.name, body, [h("span", { class: "grow" }),
      h("button", { class: "btn primary lg", onclick: async () => {
        if (rows.some((r) => r.on && !(r.qty > 0))) return toast("Cantidad no válida", { error: true });
        await act(() => api("POST", `/api/templates/${t.id}/apply`, { date: S.date, meal: meal.value, time: timeIn.value || null,
          items: rows.map((r) => ({ id: r.it.id, quantity: r.qty, skip: !r.on })) }), `${t.name} añadida`);
        sh.close();
      } }, "Añadir " + rows.length + " alimentos")], { back: step1, sub: "Comida habitual" });
  };
  const estimateForm = () => {
    const f = estimateFields({ meal: ctx.meal, time: ctx.time });
    sh.set("Comida fuera", f.el, [h("span", { class: "grow" }),
      h("button", { class: "btn primary lg", onclick: async () => {
        const d = f.value(); if (!d) return;
        await act(() => api("POST", "/api/entries", { date: S.date, estimate: true, ...d }), "Estimación añadida"); sh.close();
      } }, "Añadir")], { back: step1, sub: "Estimación" });
  };
  step1();
}

function mealSelect(val) {
  return h("select", { class: "input" }, MEALS.map(([k, l]) => h("option", { value: k, selected: k === val }, l)));
}

function mealChips(val) {
  let cur = val || defaultMeal();
  const el = h("div", { class: "seg full" });
  const draw = () => el.replaceChildren(...MEALS.map(([k, l]) => h("button", { type: "button", class: k === cur ? "on" : "", onclick: () => { cur = k; draw(); } }, l)));
  draw();
  return { el, get value() { return cur; } };
}
function field(label, ...kids) { return h("div", { class: "field" }, h("label", { class: "f" }, label), ...kids); }
function whenRow(meal, time) {
  return h("div", { class: "when" }, field("Comida", meal.el), field("Hora", time));
}

function amountForm(food, init) {
  const du0 = defUnit(food);
  const units = (food.units || []).slice().sort((a, b) => (du0 && b.key === du0.key) - (du0 && a.key === du0.key));
  let unit = init.unit_key, qty = init.quantity;
  if (!unit || !units.find((u) => u.key === unit)) {
    const last = food.last && units.find((u) => u.key === food.last.unit_key);
    const du = defUnit(food);
    if (last) { unit = last.key; qty = food.last.quantity; }
    else if (du) { unit = du.key; qty = ["g", "ml"].includes(du.key) ? du.default_qty : 1; }
    else { const g = units.find((u) => u.key === "g" || u.key === "ml") || units[0]; unit = g ? g.key : null; qty = g ? g.default_qty : 1; }
  }
  // Raciones por unidad («1 barrita (23 g)»): si solo hay una, el chip dice «unidades» y abajo se explica cuánto es una
  const UNIT_RX = /^1\s+([^()]+?)\s*\(([^)]+)\)$/;
  const perUnit = units.filter((u) => u.key.startsWith("p:") && UNIT_RX.test(u.label));
  const uLabel = (u) => ({ g: "gramos", ml: "ml", rac: "raciones", total: "receta entera", x: "ración" })[u.key] || (perUnit.length === 1 && perUnit[0] === u ? "unidades" : u.label);
  const uHint = (u) => { const m = perUnit.length === 1 && perUnit[0] === u && u.label.match(UNIT_RX); return m ? `1 unidad = 1 ${m[1]} (${m[2]})` : null; };
  const qIn = h("input", { class: "qty-in num", value: String(qty ?? "").replace(".", ","), inputMode: "decimal", "aria-label": "Cantidad" });
  const isMass = () => ["g", "ml"].includes(unit);
  const stepBy = (dir) => {
    const q = parseNum(qIn.value) || 0, st = isMass() ? (q >= 100 ? 10 : 5) : (q < 1 || (dir < 0 && q <= 1) ? 0.5 : 1);
    let n = Math.round((q + dir * st) * 100) / 100; if (n <= 0) n = st;
    qIn.value = String(n).replace(".", ","); draw();
  };
  const unitsEl = h("div", { class: "chips" });
  const drawUnits = () => unitsEl.replaceChildren(...units.map((u) => h("button", { type: "button", class: "chip" + (u.key === unit ? " on" : ""), onclick: () => {
    const was = isMass(); unit = u.key;
    if (was && !isMass()) qIn.value = "1";
    if (!was && isMass()) qIn.value = String(u.default_qty);
    drawUnits(); draw();
  } }, uLabel(u))));
  const meal = mealChips(init.meal), timeIn = h("input", { class: "input", type: "time", value: init.time || "" });
  const prev = h("div", { class: "mprev" }), note = h("div", { class: "note" });
  let qtyEst = !!init.qty_est;
  const qeBtn = h("button", { type: "button", class: "qe-btn" + (qtyEst ? " on" : ""), title: "Márcalo si no lo has pesado ni contado", onclick: () => { qtyEst = !qtyEst; qeBtn.classList.toggle("on", qtyEst); draw(); } },
    h("i", { class: "qe-box" }, icon("check")), "Cantidad a ojo (sin pesar)");
  const draw = () => {
    const u = units.find((x) => x.key === unit), q = parseNum(qIn.value);
    const n = u && q > 0 ? scaleN(u.per, q) : { kcal: null, protein_g: null, carbs_g: null, fat_g: null, missing: [] };
    prev.replaceChildren(
      h("div", { class: "mp k" }, h("b", { class: "num" }, v(n, "kcal")), h("span", null, "kcal")),
      ...[["protein_g", "Proteína", "p"], ["carbs_g", "Carbohidratos", "c"], ["fat_g", "Grasas", "g"]].map(([f, l, c]) =>
        h("div", { class: "mp " + c }, h("b", { class: "num" }, v(n, f, 1), h("small", null, " g")), h("span", null, l))));
    if (!u) { note.textContent = "Este alimento no tiene unidades registrables."; note.className = "note warn"; return; }
    const miss = u.per.missing || [];
    note.className = "note" + (miss.length || ["pendiente", "provisional"].includes(u.quality) ? " warn" : "");
    const vq = ["estimacion", "provisional", "pendiente"].includes(u.quality) ? "Valores a ojo (no son de la etiqueta)" : "Valores de " + (u.quality === "etiqueta" ? "la etiqueta" : "tu histórico");
    note.textContent = [uHint(u), vq, qtyEst ? "cantidad a ojo" : null, uHint(u) ? null : u.basis, miss.length === 4 ? "sin datos: se registra como pendiente (no cuenta como 0)" : miss.length ? "macros incompletos: no se suman como 0" : null].filter(Boolean).join(" · ");
  };
  qIn.addEventListener("input", draw);
  const form = { onEnter: null };
  qIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && form.onEnter) form.onEnter();
    if (e.key === "ArrowUp") { e.preventDefault(); stepBy(1); }
    if (e.key === "ArrowDown") { e.preventDefault(); stepBy(-1); }
  });
  drawUnits(); draw();
  form.el = h("div", null,
    h("div", { class: "food-head" }, food.image ? h("div", { class: "pframe sm" }, h("img", { src: /^(\/|data:|https?:)/.test(food.image) ? food.image : "/" + food.image, alt: "" })) : mono(food.name, food.kind === "receta" ? "receta" : food.category, null, true),
      h("div", { class: "fh-t" }, h("div", { class: "fh-n" }, food.name), h("div", { class: "fh-s" }, foodSub(food)))),
    h("div", { class: "qty" },
      h("div", { class: "stepper" }, h("button", { type: "button", onclick: () => stepBy(-1), "aria-label": "Menos" }, icon("minus")), qIn,
        h("button", { type: "button", onclick: () => stepBy(1), "aria-label": "Más" }, icon("plus"))),
      unitsEl),
    qeBtn,
    prev, note,
    whenRow(meal, timeIn));
  form.value = () => {
    const q = parseNum(qIn.value);
    if (!(q > 0)) { toast("Cantidad no válida", { error: true }); qIn.focus(); return null; }
    return { quantity: q, unit_key: unit, meal: meal.value, time: timeIn.value || null, qty_est: qtyEst };
  };
  setTimeout(() => { qIn.focus(); qIn.select(); }, 60);
  return form;
}

function estimateFields(init) {
  const name = h("input", { class: "input", placeholder: "Ej.: menú del día — pasta boloñesa y pan", value: init.name || "" });
  const num = (k, ph) => h("input", { class: "input num", inputMode: "decimal", placeholder: ph || "?", value: init[k] == null ? "" : String(init[k]).replace(".", ",") });
  const kc = num("kcal"), p = num("protein_g"), c = num("carbs_g"), g = num("fat_g"), mn = num("kcal_min", "mín."), mx = num("kcal_max", "máx.");
  const nota = h("input", { class: "input", placeholder: "Supuestos: tamaño, aceite, guarnición…", value: init.note || "" });
  const meal = mealChips(init.meal), timeIn = h("input", { class: "input", type: "time", value: init.time || "" });
  const el = h("div", null,
    field("Qué has comido", name),
    h("div", { class: "grid4 gap-top" }, field("kcal", kc), field("Proteína (g)", p), field("Carbohidratos (g)", c), field("Grasas (g)", g)),
    h("div", { class: "grid2 gap-top" }, field("Rango de kcal (opcional)", h("div", { class: "row" }, mn, h("span", { class: "faint" }, "–"), mx)), field("Notas", nota)),
    whenRow(meal, timeIn),
    h("div", { class: "note" }, "Se guarda como estimación. Lo que no sepas, déjalo vacío: no cuenta como 0. También puedes describírmelo por el chat."));
  setTimeout(() => name.focus(), 60);
  return { el, value: () => {
    const vals = { kcal: parseNum(kc.value), protein_g: parseNum(p.value), carbs_g: parseNum(c.value), fat_g: parseNum(g.value), kcal_min: parseNum(mn.value), kcal_max: parseNum(mx.value) };
    if (!name.value.trim()) { toast("Describe la comida", { error: true }); return null; }
    if (Object.values(vals).some(Number.isNaN)) { toast("Hay un número no válido", { error: true }); return null; }
    return { name: name.value.trim(), ...vals, note: nota.value || null, meal: meal.value, time: timeIn.value || null };
  } };
}

function entrySheet(e) {
  const del = async () => {
    await act(() => api("DELETE", "/api/entries/" + e.id));
    sh.close();
    toast(`${e.name} eliminado`, { undo: () => act(() => api("POST", `/api/entries/${e.id}/restore`), "Restaurado") });
  };
  let sh;
  if (e.kind === "estimacion") {
    const f = estimateFields({ ...e });
    sh = sheet("Editar estimación", f.el, [h("button", { class: "btn ghost danger", onclick: del }, "Eliminar"), h("span", { class: "grow" }),
      h("button", { class: "btn primary lg", onclick: async () => { const d = f.value(); if (!d) return; await act(() => api("PUT", "/api/entries/" + e.id, d), "Guardado"); sh.close(); } }, "Guardar")]);
    return;
  }
  const food = foodById(e.food_id);
  if (!food) { toast("Alimento no disponible", { error: true }); return; }
  const form = amountForm(food, { unit_key: e.unit_key, quantity: e.quantity, meal: e.meal, time: e.time, qty_est: e.qty_est });
  const save = async () => { const d = form.value(); if (!d) return; await act(() => api("PUT", "/api/entries/" + e.id, d), "Guardado"); sh.close(); };
  form.onEnter = save;
  sh = sheet("Editar", form.el, [h("button", { class: "btn ghost danger", onclick: del }, "Eliminar"), h("span", { class: "grow" }), h("button", { class: "btn primary lg", onclick: save }, "Guardar")], { sub: e.unit_label });
}

// ------------------------------------------------------------- actividad
function activitySheet(st) {
  const closed = st.status === "cerrado";
  const sh = sheet("Actividad", []);
  const draw = (editing) => {
    const acts = (S.day && S.day.date === st.date ? S.day.activities : st.activities);
    const list = acts.map((a) => h("div", { class: "item", onclick: closed ? null : () => draw(a) },
      h("div", { class: "nm" }, (ACT_TYPES.find((x) => x[0] === a.type) || [0, a.type])[1], a.description ? h("span", { class: "muted", style: { fontWeight: 400 } }, " · " + a.description) : null),
      h("div", { class: "kc num" }, fmt(((S.day.energy.exercise || []).find((x) => x.id === a.id) || {}).kcal), " kcal"),
      h("div", { class: "sub" }, [a.minutes ? fmt(a.minutes) + " min" : null, a.intensity, a.kcal_source === "manual" ? "kcal netas manuales" : "estimado", a.steps_in_activity ? fmt(a.steps_in_activity) + " pasos en sesión" : null].filter(Boolean).join(" · ")), h("div")));
    if (closed) { sh.set("Actividad", acts.length ? h("div", { class: "list" }, list) : h("div", { class: "muted" }, st.day.rest_day === 1 ? "Día de descanso" : "Sin actividad"), null); return; }
    const a = editing || { type: "fuerza", intensity: "normal" };
    let type = a.type, inten = a.intensity || "normal";
    const typeChips = h("div", { class: "chips" });
    const intSeg = h("div", { class: "seg" });
    const minIn = h("input", { class: "input num", inputMode: "numeric", value: a.minutes ?? "", placeholder: "min" });
    const kcIn = h("input", { class: "input num", inputMode: "numeric", value: a.kcal_source === "manual" ? a.kcal_net : "", placeholder: "auto" });
    const stIn = h("input", { class: "input num", inputMode: "numeric", value: a.steps_in_activity ?? "", placeholder: "—" });
    const desc = h("input", { class: "input", value: a.description || "", placeholder: "Ej.: pecho en Teatinos" });
    const stepsBox = h("div", null, h("label", { class: "f" }, "Pasos de la sesión ya incluidos en el contador"), stIn);
    const redraw = () => {
      typeChips.replaceChildren(...ACT_TYPES.map(([k, l]) => h("button", { class: "chip" + (k === type ? " on" : ""), onclick: () => { type = k; redraw(); } }, l)));
      intSeg.replaceChildren(...INTENS.map((k) => h("button", { class: k === inten ? "on" : "", onclick: () => { inten = k; redraw(); } }, k)));
      stepsBox.classList.toggle("hidden", !STEP_TYPES.includes(type));
    };
    redraw();
    const save = async () => {
      const body = { date: st.date, type, intensity: inten, minutes: parseNum(minIn.value), kcal_net: parseNum(kcIn.value), steps_in_activity: parseNum(stIn.value), description: desc.value || null };
      if ([body.minutes, body.kcal_net, body.steps_in_activity].some(Number.isNaN)) return toast("Número no válido", { error: true });
      if (editing) await act(() => api("PUT", "/api/activities/" + editing.id, body), "Actividad guardada");
      else await act(() => api("POST", "/api/activities", body), "Actividad añadida");
      draw();
    };
    const rest = st.day.rest_day === 1;
    sh.set(editing ? "Editar actividad" : "Actividad", [
      acts.length && !editing ? [h("div", { class: "list", style: { marginBottom: "16px" } }, list)] : null,
      h("div", { class: "sec-t" }, editing ? "Editar" : "Añadir sesión"),
      typeChips,
      h("div", { class: "grid2", style: { marginTop: "12px" } }, h("div", null, h("label", { class: "f" }, "Duración (min)"), minIn), h("div", null, h("label", { class: "f" }, "kcal netas (si las sabes)"), kcIn)),
      h("div", { style: { marginTop: "12px" } }, h("label", { class: "f" }, "Intensidad"), intSeg),
      h("div", { class: "grid2", style: { marginTop: "12px" } }, h("div", null, h("label", { class: "f" }, "Descripción"), desc), stepsBox),
      h("div", { class: "note" }, "Sin kcal manuales se estima el gasto NETO (MET − 1) para no duplicar el metabolismo basal."),
    ], [
      editing ? h("button", { class: "btn ghost danger", onclick: async () => { await act(() => api("DELETE", "/api/activities/" + editing.id), "Actividad eliminada"); draw(); } }, "Eliminar")
        : (!acts.length ? h("button", { class: "btn ghost", onclick: async () => { await act(() => api("PUT", "/api/days/" + st.date, { rest_day: !rest }), rest ? "Descanso desmarcado" : "Marcado como descanso"); sh.close(); } }, rest ? "Quitar descanso" : "Día de descanso") : null),
      h("span", { class: "grow" }),
      editing ? h("button", { class: "btn ghost", onclick: () => draw() }, "Cancelar") : null,
      h("button", { class: "btn primary", onclick: save }, editing ? "Guardar" : "Añadir")]);
  };
  draw();
}

// ----------------------------------------------------------------- cierre
function summaryView(s, extra) {
  const t = s.intake, tg = s.target || {}, en = s.energy, d = s.diffs || {};
  // fila principal (negrita) y filas de desglose (sangradas, más pequeñas)
  const main = (a, b, c) => h("tr", { class: "main" }, h("td", null, a), h("td", { class: "r num" }, b), h("td", { class: "r num faint" }, c || ""));
  const sub = (a, b, c) => h("tr", { class: "sub" }, h("td", null, a), h("td", { class: "r num" }, b), h("td", { class: "r num faint" }, c || ""));
  const gap = () => h("tr", { class: "gap" }, h("td", { colspan: 3 }));
  const bal = s.balance;
  return h("div", null,
    h("table", { class: "t sumtbl v2" },
      h("tr", null, h("th", null, ""), h("th", { class: "r" }, "Día"), h("th", { class: "r" }, "Objetivo · dif.")),
      main("Calorías", v(t, "kcal") + " kcal", tg.kcal ? `${fmt(tg.kcal)} · ${signed(d.kcal)}` : ""),
      sub("Proteína", v(t, "protein_g") + " g", tg.protein_g != null ? `${fmt(tg.protein_g)} · ${signed(d.protein_g)}` : ""),
      sub("Carbohidratos", v(t, "carbs_g") + " g", tg.carbs_g != null ? `${fmt(tg.carbs_g)} · ${signed(d.carbs_g)}` : ""),
      sub("Grasas", v(t, "fat_g") + " g", tg.fat_mid_g != null ? `${fmt(tg.fat_mid_g)} · ${signed((t.fat_g || 0) - tg.fat_mid_g)}` : ""),
      gap(),
      main("Gasto estimado", fmt(en.total) + " kcal" + (en.complete ? "" : " *"), en.complete ? "" : "incompleto"),
      sub("Metabolismo basal", fmt(en.bmr), ""), sub("Efecto térmico (TEF)", fmt(en.tef), ""), sub("NEAT sin pasos", fmt(en.neat), ""),
      sub("Pasos", en.steps_kcal == null ? "?" : fmt(en.steps_kcal), ""), sub("Ejercicio neto", fmt(en.exercise_kcal), ""),
      gap(),
      (() => { // el balance frente al que buscabas: según el gasto, la diferencia elegida; fijo, objetivo − gasto
        const objB = tg.dynamic ? tg.kcal_offset : tg.kcal && en.total != null ? tg.kcal - en.total : null;
        return h("tr", { class: "main bal " + (bal == null ? "" : bal < 0 ? "neg" : "pos") }, h("td", null, "Balance estimado"), h("td", { class: "r num" }, signed(bal) + " kcal"),
          h("td", { class: "r num faint" }, bal == null ? "" : objB != null ? `${signed(Math.round(objB))} · ${signed(Math.round(bal - objB))}` : bal < 0 ? "déficit" : "superávit"));
      })(),
      gap(),
      main("Peso", s.weight_kg != null ? fmt(s.weight_kg, 1) + " kg" : "—", s.avg7 != null ? "media 7 d " + fmt(s.avg7, 1) : ""),
      main("Pasos", s.steps != null ? fmt(s.steps) : "—", ""),
      main("Actividad", s.activities.length ? s.activities.map((a) => `${a.type}${a.minutes ? " " + fmt(a.minutes) + " min" : ""}`).join(", ") : "descanso", "")),
    (t.missing || []).length ? h("div", { class: "note warn" }, "* Totales mínimos: hay valores desconocidos.") : null,
    s.observations && s.observations.length ? h("ul", { class: "obs" }, s.observations.map((o) => h("li", null, o))) : null,
    extra || null);
}

// Cómo fue el día sin contar los pasos (de pie, tareas…): cambia el «día a día» del gasto
function neatPicker(date, onDone) {
  const st = S.day && S.day.date === date ? S.day : null;
  const levels = (st && st.neat_levels) || [{ key: "cama", label: "En cama o enfermo", kcal: 0 }, { key: "casa", label: "Casi todo el día sentado", kcal: 50 }, { key: "ligero", label: "Algo de movimiento: recados, cocinar", kcal: 100 }, { key: "normal", label: "Normal", kcal: 150 }, { key: "activo", label: "Activo: mucho de pie o tareas", kcal: 250 }, { key: "muy", label: "Muy activo: trabajo físico", kcal: 350 }];
  const cur = st ? st.day.neat_kcal : null;
  const short = { cama: "En cama / enfermo", casa: "Sentado casi todo", ligero: "Algo de movimiento", normal: "Normal", activo: "Activo", muy: "Muy activo" };
  return h("div", { class: "neat-pk" }, h("div", { class: "sec-t", style: { marginTop: 0 } }, "¿Cómo fue el día? ", h("span", { class: "faint", style: { textTransform: "none", letterSpacing: 0, fontWeight: 400 } }, "(sin contar los pasos)"), cur == null ? h("span", { style: { color: "var(--warn, #c2410c)", textTransform: "none", letterSpacing: 0, fontWeight: 500 } }, " · obligatorio") : null),
    h("div", { class: "neat-row" }, levels.map((l) => h("button", { class: "neat-b" + (cur != null && Math.abs(cur - l.kcal) < 1 ? " on" : ""), title: l.label,
      onclick: async () => { await act(() => api("PUT", "/api/days/" + date, { neat_kcal: l.kcal })); onDone && onDone(); } }, h("b", null, short[l.key] || l.label), h("span", null, "+" + fmt(l.kcal_adj ?? l.kcal) + " kcal")))));
}
async function closeSheet(date) {
  const sh = sheet("Cerrar día", h("div", { class: "muted" }, "Comprobando…"));
  const draw = async () => {
    let chk;
    try { chk = await api("GET", `/api/days/${date}/close-check`); } catch (e) { toast(e.message, { error: true }); return; }
    const fixes = { peso: ["weight_kg", "kg"], pasos: ["steps", "pasos"] };
    const warns = h("ul", { class: "warns" }, chk.warnings.map((w) => {
      const li = h("li", { class: w.level }, h("i", { class: "wdot" }), h("span", { class: "wt" }, w.text));
      if (fixes[w.code]) {
        const [field, ph] = fixes[w.code];
        const inp = h("input", { class: "input num", placeholder: ph, inputMode: "decimal" });
        const go = async () => { const n = parseNum(inp.value); if (n == null || n < 0 || (field === "weight_kg" && !(n > 0))) return; await act(() => api("PUT", "/api/days/" + date, { [field]: n })); draw(); };
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
        li.append(h("span", { class: "fix" }, inp, h("button", { class: "btn sm", onclick: go }, "Guardar")));
      } else if (w.code === "suplementos") {
        li.append(h("span", { class: "fix" }, (w.supplements || []).map((x) => h("button", { class: "btn sm", onclick: async () => {
          await act(() => api("POST", "/api/entries", { date, food_id: x.id, unit_key: x.portion_id ? "p:" + x.portion_id : "g", quantity: x.portion_id ? 1 : 5, meal: "otro" }), x.name + " apuntado"); draw(); } }, "Sí"))));
      } else if (w.code === "actividad") {
        li.append(h("span", { class: "fix" }, h("button", { class: "btn sm", onclick: async () => { await act(() => api("PUT", "/api/days/" + date, { rest_day: true })); draw(); } }, "Fue descanso"),
          h("button", { class: "btn sm", onclick: () => { activitySheet(S.day); } }, "Añadir")));
      }
      return li;
    }));
    const doClose = async (force) => {
      try {
        const r = await api("POST", `/api/days/${date}/close`, { force });
        if (!r.closed) { toast("Faltan datos importantes", { error: true }); return; }
        sh.close(); await refresh(); showClosure(S.day);
      } catch (e) { toast(e.message, { error: true }); }
    };
    sh.set("Cerrar " + (date === todayISO() ? "hoy" : dateLabel(date)), [
      neatPicker(date, () => draw()),
      chk.warnings.length ? [h("div", { class: "sec-t" }, chk.has_important ? "Falta por registrar" : "Avisos"), warns] : h("div", { class: "ok-box" }, "Todo registrado."),
      h("div", { class: "sec-t" }, "Resumen"), summaryView(chk.summary)],
      [h("button", { class: "btn", onclick: sh.close }, "Seguir editando"), h("span", { class: "grow" }),
        chk.needs_neat ? h("button", { class: "btn primary lg", disabled: true, title: "Antes elige cómo fue el día" }, "Cerrar día")
          : chk.has_important ? h("button", { class: "btn primary lg", onclick: () => doClose(true) }, "Cerrar igualmente") : h("button", { class: "btn primary lg", onclick: () => doClose(false) }, "Cerrar día")]);
  };
  draw();
}

function showClosure(st) {
  if (!st.closure) return;
  const c = st.closure;
  sheet(`Cierre · ${dateLabel(st.date)}`, summaryView(c.summary, h("div", { class: "note" },
    `Cerrado ${c.closed_at.slice(0, 16)}` + (c.version > 1 ? ` · versión ${c.version}` : "") + (c.forced ? " · cerrado con datos incompletos" : ""))), null);
}

function reopenSheet(date) {
  const reason = h("input", { class: "input", placeholder: "Motivo (opcional): p. ej. corregir cantidad del arroz" });
  const sh = sheet("Reabrir día", [h("div", { class: "muted", style: { marginBottom: "10px" } }, "El cierre anterior queda guardado en el historial. Tendrás que volver a cerrarlo."), reason],
    [h("button", { class: "btn", onclick: () => sh.close() }, "Cancelar"), h("span", { class: "grow" }),
      h("button", { class: "btn primary lg", onclick: async () => { await act(() => api("POST", `/api/days/${date}/reopen`, { reason: reason.value || null }), "Día reabierto"); sh.close(); } }, "Reabrir")]);
}

// ------------------------------------------------------------- biblioteca
function viewLibrary() {
  const c = S.catalog; if (!c) return h("div");
  const nRev = c.foods.filter((f) => !f.deleted && !f.hidden && !f.reviewed).length + c.templates.filter((t) => !t.deleted && !t.hidden && !t.reviewed).length;
  if (S.libFilter == null) S.libFilter = nRev ? "revisar" : "todo";
  const filters = [...(nRev ? [["revisar", `Por revisar · ${nRev}`]] : []), ["todo", "Todo"], ["producto", "Productos"], ["receta", "Recetas"], ["habitual", "Comidas habituales"], ["supl", "Suplementos"], ["pendiente", "Aproximados"]];
  const search = h("input", { class: "input", placeholder: "Buscar", value: S.libQuery, oninput: (e) => { S.libQuery = e.target.value; drawGrid(); } });
  const grid = h("div");
  const drawGrid = () => {
    const q = norm(S.libQuery), F = S.libFilter;
    const match = (n) => !q || norm(n).includes(q);
    const foods = c.foods.filter((f) => !f.deleted && match(f.name + " " + (f.original_name || "")) && (F === "oculto" ? f.hidden : !f.hidden) &&
      (F === "todo" || F === "oculto" || (F === "supl" && isSupp(f)) || (F === "revisar" && !f.reviewed) || (F === "producto" && f.kind === "producto") || (F === "receta" && f.kind === "receta") || (F === "pendiente" && ["pendiente", "provisional"].includes(f.status) || (F === "pendiente" && (f.units || []).every((u) => (u.per.missing || []).length === 4)))));
    const tpls = c.templates.filter((t) => !t.deleted && match(t.name) && (F === "oculto" ? t.hidden : !t.hidden) && (["todo", "habitual", "oculto"].includes(F) || (F === "revisar" && !t.reviewed))).sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name, "es"));
    const secs = [];
    if (tpls.length) secs.push(["Comidas habituales", tpls.map((t) => tplTile(t, () => templateEditor(t)))]);
    const recs = foods.filter((f) => f.kind === "receta"), prods = foods.filter((f) => f.kind === "producto");
    if (recs.length) secs.push(["Recetas", recs.map((f) => foodTile(f, () => recipeEditor(f)))]);
    const sups = prods.filter(isSupp), plain = prods.filter((f) => !isSupp(f));
    if (sups.length && ["todo", "supl", "revisar", "oculto", "pendiente"].includes(F)) secs.push(["Suplementos", sups.map((f) => foodTile(f, () => foodEditor(f)))]);
    if (plain.length && !["habitual", "supl"].includes(F)) secs.push(["Productos", plain.map((f) => foodTile(f, () => foodEditor(f)))]);
    if (F === "supl" && !sups.length) secs.push(["Suplementos", [h("button", { class: "tile add-supp", onclick: () => foodEditor(null, { supp: true }) }, h("b", null, "+ Añadir un suplemento"), h("span", { class: "faint" }, "creatina, vitaminas… (la dosis como ración)"))]]);
    grid.replaceChildren(...(secs.length ? secs.map(([t, tiles]) => [h("div", { class: "sec-t" }, `${t} · ${tiles.length}`), h("div", { class: "tiles" }, tiles)]).flat()
      : [h("div", { class: "muted", style: { padding: "20px 0" } }, "Nada por aquí.")]));
  };
  const chips = h("div", { class: "chips" }, filters.map(([k, l]) => h("button", { class: "chip" + (S.libFilter === k ? " on" : ""), onclick: () => { S.libFilter = k; render(); } }, l)));
  drawGrid();
  return h("div", { class: "lib" },
    h("div", { class: "row wrap", style: { marginBottom: "12px" } },
      h("div", { class: "search grow", style: { minWidth: "220px" } }, icon("search"), search),
      h("button", { class: "btn", onclick: () => foodEditor(null) }, "+ Producto"),
      h("button", { class: "btn", onclick: () => recipeEditor(null) }, "+ Receta"),
      h("button", { class: "btn", onclick: () => templateEditor(null) }, "+ Comida habitual"),
      S.libFilter === "supl" ? h("button", { class: "btn", onclick: () => foodEditor(null, { supp: true }) }, "+ Suplemento") : null),
    chips,
    S.libFilter === "revisar" && nRev ? h("div", { class: "rev-bar" }, h("span", { class: "faint" }, "Lo que ha creado tu agente. Al aceptarlo aparece al añadir comida."), h("span", { class: "grow" }),
      h("button", { class: "btn sm", onclick: async () => { if (!confirm(`¿Aceptar las ${nRev} cosas por revisar?`)) return; await act(() => api("POST", "/api/revisar/aceptar-todo", {}), "Aceptado"); S.libFilter = "todo"; refresh(); } }, "Aceptar todo")) : null,
    grid);
}

const numIn = (val, ph = "?") => h("input", { class: "input num", inputMode: "decimal", value: val == null ? "" : String(val).replace(".", ","), placeholder: ph });

function foodEditor(f, opt = {}) {
  const isNew = !f;
  f = f || (opt.supp ? { name: "", status: "etiqueta", category: "Suplemento", brand: "", source: "", notes: "", portions: [{ label: "1 dosis", amount: 5, unit: "g", kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, quality: "etiqueta", is_default: 1 }] }
    : { name: "", status: "etiqueta", category: "", brand: "", source: "", notes: "", portions: [{ label: "100 g", amount: 100, unit: "g", quality: "etiqueta", is_default: 1 }] });
  const name = h("input", { class: "input", value: f.name, placeholder: "Nombre" });
  const cats = [...new Set(S.catalog.foods.map((x) => x.category).filter(Boolean))].sort();
  const cat = h("input", { class: "input", value: f.category || "", list: "cats", placeholder: "Categoría" });
  const dl = h("datalist", { id: "cats" }, cats.map((c) => h("option", { value: c })));
  const brand = h("input", { class: "input", value: f.brand || "", placeholder: "Marca (opcional)" });
  const status = h("select", { class: "input" }, Object.entries(QUAL).map(([k, l]) => h("option", { value: k, selected: k === f.status }, l)));
  // Fuente: de dónde salen los valores (y con ella, el estado del dato)
  const SRC = [["etiqueta", "Etiqueta (a mano)", "etiqueta"], ["off", "Código de barras (Open Food Facts)", "etiqueta"], ["estimacion", "Estimación", "estimacion"], ["otra", "Otra", null]];
  const src0 = f.source || "", srcKind0 = !src0 ? (isNew ? "etiqueta" : "otra") : /^open food facts/i.test(src0) ? "off" : /^etiqueta/i.test(src0) ? "etiqueta"
    : /^estimaci/i.test(src0) ? "estimacion" : "otra";
  let offCode = (src0.match(/(\d{8,14})/) || [])[1] || null;
  const srcSel = h("select", { class: "input" }, SRC.map(([k, l]) => h("option", { value: k, selected: k === srcKind0 }, l)));
  const srcOther = h("input", { class: "input" + (srcKind0 === "otra" ? "" : " hidden"), value: srcKind0 === "otra" ? src0 : "", placeholder: "¿De dónde salen los valores?", style: { marginTop: "6px" } });
  const source = h("div", null, srcSel, srcOther);
  srcSel.addEventListener("change", () => { srcOther.classList.toggle("hidden", srcSel.value !== "otra"); const st_ = (SRC.find((x) => x[0] === srcSel.value) || [])[2]; if (st_) status.value = st_; });
  const sourceText = () => ({ etiqueta: "Etiqueta", off: "Open Food Facts" + (offCode ? " · " + offCode : ""), estimacion: "Estimación", otra: srcOther.value.trim() || null })[srcSel.value];
  const notes = h("textarea", { class: "input", rows: 2, placeholder: "Notas" }, f.notes || "");
  const duSel = h("select", { class: "input" }, h("option", { value: "" }, "Automático (por peso si se puede)"),
    (f.units || []).filter((u) => u.key !== "x").map((u) => h("option", { value: u.key, selected: u.key === f.default_unit }, u.key === "g" ? "Por peso (g)" : u.key === "ml" ? "Por volumen (ml)" : "Por unidad: " + u.label)));
  const prow = (p) => {
    const r = { id: p.id, el: null, deleted: false };
    r.label = h("input", { class: "input", value: p.label || "", placeholder: "p. ej. 1 lata" });
    r.amount = numIn(p.amount, ""); r.unit = h("select", { class: "input" }, [["", "—"], ["g", "g"], ["ml", "ml"], ["ud", "ud"]].map(([k, l]) => h("option", { value: k, selected: (p.unit || "") === k }, l)));
    r.kcal = numIn(p.kcal); r.p = numIn(p.protein_g); r.c = numIn(p.carbs_g); r.g = numIn(p.fat_g);
    r.q = h("select", { class: "input" }, Object.entries(QUAL).map(([k, l]) => h("option", { value: k, selected: k === (p.quality || "etiqueta") }, l)));
    r.def = h("input", { type: "radio", name: "pdef", checked: !!p.is_default, title: "Base para escalar por g/ml" });
    r.el = h("tr", null, h("td", null, r.label), h("td", { style: { width: "70px" } }, r.amount), h("td", { style: { width: "70px" } }, r.unit), h("td", { style: { width: "70px" } }, r.kcal),
      h("td", { style: { width: "62px" } }, r.p), h("td", { style: { width: "62px" } }, r.c), h("td", { style: { width: "62px" } }, r.g), h("td", { style: { width: "122px" } }, r.q),
      h("td", { style: { width: "28px", textAlign: "center" } }, r.def),
      h("td", { style: { width: "30px" } }, h("button", { class: "icon-btn", title: "Quitar", onclick: () => { r.deleted = true; r.el.remove(); } }, icon("x"))));
    return r;
  };
  const prows = (f.portions || []).map(prow);
  const tbody = h("tbody", null, prows.map((r) => r.el));
  const ptable = h("div", { class: "tbl-wrap" }, h("table", { class: "t ptable" },
    h("thead", null, h("tr", null, ...["Ración*", "Cant.*", "Ud.*", "kcal", "P", "C", "G", "Dato", "Base", ""].map((x) => h("th", null, x.endsWith("*") ? [x.slice(0, -1), h("i", { class: "req" }, "*")] : x)))), tbody));
  const applyOpen = h("input", { type: "checkbox", checked: true });
  const orig = !isNew && (f.original_name || f.historical_text || f.import_note) ? h("details", { style: { marginTop: "12px" } }, h("summary", null, "Origen e historial del dato"),
    h("pre", { class: "orig" }, [f.original_name && "Nombre original: " + f.original_name, f.previous_name && "Nombre anterior: " + f.previous_name, f.code && "Código: " + f.code,
      f.import_note && "Nota de importación: " + f.import_note, f.historical_text && "Referencia histórica:\n" + f.historical_text].filter(Boolean).join("\n\n"))) : null;
  let pendingImg = null, completeBtn = null;
  const photoBox = h("div", { class: "photo-box" });
  const fileIn = h("input", { type: "file", accept: "image/*", class: "hidden" });
  const drawPhoto = () => {
    const src = pendingImg || f.image;
    const rm = async () => {
      if (pendingImg) { pendingImg = null; offImg = null; drawPhoto(); return; }
      await act(() => api("DELETE", `/api/foods/${f.id}/image`), "Foto quitada"); f.image = null; drawPhoto();
    };
    photoBox.replaceChildren(h("div", { class: "pf-wrap" }, photoFrame(name.value || f.name || "?", f.category, src),
      src ? h("button", { type: "button", class: "pf-x", title: "Quitar foto", onclick: rm }, icon("x")) : null),
      h("div", { class: "pb-actions" },
        h("button", { type: "button", class: "btn sm", onclick: () => fileIn.click() }, icon("camera"), src ? "Cambiar foto" : "Añadir foto")));
  };
  fileIn.addEventListener("change", async () => {
    const file = fileIn.files[0]; if (!file) return;
    try {
      const url = await resizeImage(file, 640);
      if (isNew) { pendingImg = url; drawPhoto(); return; }
      const r = await api("POST", `/api/foods/${f.id}/image`, { data_url: url });
      f.image = r.image; drawPhoto(); toast("Foto guardada"); await loadCatalog(); render();
    } catch (e) { toast(e.message || "No se pudo cargar la imagen", { error: true }); }
    fileIn.value = "";
  });
  drawPhoto();
  // Código de barras o enlace de Open Food Facts: rellena nombre, marca, valores por 100 g, la ración y la foto (si no tiene)
  let offImg = null;
  const offNote = h("div", { class: "note hidden" });
  const applyOff = (o) => {
    if (!name.value.trim() || isNew) name.value = o.name || name.value;
    if (!brand.value.trim() && o.brand) brand.value = o.brand;
    offCode = o.code; srcSel.value = "off"; srcOther.classList.add("hidden");
    const q = o.complete ? "etiqueta" : "provisional";
    status.value = q;
    const setRow = (r, v, label, amount, unit) => { r.label.value = label; r.amount.value = String(amount).replace(".", ","); r.unit.value = unit;
      for (const [k, el] of [["kcal", r.kcal], ["protein_g", r.p], ["carbs_g", r.c], ["fat_g", r.g]]) el.value = v[k] == null ? "" : String(v[k]).replace(".", ",");
      r.q.value = q; };
    const live = prows.filter((r) => !r.deleted);
    let r100 = live.find((r) => parseNum(r.amount.value) === 100 && ["g", "ml", ""].includes(r.unit.value));
    if (!r100) { r100 = prow({ quality: q }); prows.push(r100); tbody.append(r100.el); }
    setRow(r100, o.per100, "100 " + o.unit, 100, o.unit);
    if (!live.some((r) => r.def.checked)) r100.def.checked = true;
    if (o.serving && !live.some((r) => r !== r100 && parseNum(r.amount.value) === o.serving.amount)) {
      const rs = prow({ quality: q }); prows.push(rs); tbody.append(rs.el); setRow(rs, o.serving, o.serving.label, o.serving.amount, o.serving.unit);
    }
    const hadPhoto = !!(f.image || pendingImg);
    if (o.image_url && !hadPhoto) { offImg = o.image_url; pendingImg = o.image_url; drawPhoto(); }
    offNote.className = "note off-found" + (o.complete ? "" : " warn");
    offNote.replaceChildren(`De Open Food Facts: ${o.name || "sin nombre"}${o.brand ? " (" + o.brand + ")" : ""} · ${o.per100.kcal == null ? "?" : fmt(o.per100.kcal)} kcal por 100 ${o.unit}` +
      (o.complete ? " · revísalo y guarda" : " · le faltan valores: complétalos con la etiqueta") + (offImg ? " · con su foto" : ""));
    if (o.image_url && hadPhoto) offNote.append(h("div", { class: "off-photo" }, h("img", { src: o.image_url, alt: "" }), h("span", null, "Ya tiene foto. ¿Usar la de Open Food Facts?"),
      h("button", { type: "button", class: "btn sm", onclick: (e) => { offImg = o.image_url; pendingImg = o.image_url; drawPhoto(); e.currentTarget.parentNode.remove(); toast("Se cambiará al guardar"); } }, "Usar esta foto")));
  };
  completeBtn = !isNew ? h("button", { type: "button", class: "off-cta", onclick: () => {
    const m = sheet("Completar producto", offChooser((o) => { m.close(); applyOff(o); }), null, { sub: "Con el código de barras o el enlace de Open Food Facts: valores, ración y foto" });
  } }, h("span", { class: "off-ic" }, icon("barcode")), h("span", null, h("b", null, "Completar con código de barras"), h("small", null, "Valores, ración y foto de Open Food Facts")), h("span", { class: "chev" }, icon("right"))) : null;
  const credit = f.image_source ? h("div", { class: "note", style: { marginTop: "-8px", marginBottom: "10px" } }, "Foto: ", f.image_source.startsWith("http") ? h("a", { href: f.image_source, target: "_blank", rel: "noopener" }, "Open Food Facts (CC BY-SA)") : f.image_source, " · cámbiala por la tuya cuando quieras") : null;
  const body = [dl, fileIn, completeBtn, offNote, photoBox, credit,
    h("div", { class: "grid2" }, h("div", null, h("label", { class: "f" }, "Nombre", h("i", { class: "req" }, " *")), name), h("div", null, h("label", { class: "f" }, "Estado del dato"), status)),
    h("div", { class: "grid3 src-grid", style: { marginTop: "10px" } }, h("div", null, h("label", { class: "f" }, "Categoría"), cat), h("div", null, h("label", { class: "f" }, "Marca"), brand), h("div", null, h("label", { class: "f" }, "Fuente"), source)),
    !isNew ? h("div", { class: "gap-top" }, field("Se registra por", duSel), h("div", { class: "note" }, "Las cosas que van por unidad (una lata, una bolsa, un yogur) se añaden por unidad y su resumen muestra la unidad, no los 100 g.")) : null,
    h("div", { class: "sec-t" }, "Raciones y valores"),
    ptable,
    h("div", { class: "row", style: { marginTop: "6px" } }, h("button", { class: "btn sm", onclick: () => { const r = prow({ quality: status.value }); prows.push(r); tbody.append(r.el); r.label.focus(); } }, "+ Ración"),
      h("span", { class: "note", style: { margin: 0 } }, h("i", { class: "req" }, "*"), " obligatorio. Valores vacíos = desconocidos (no cuentan como 0). «Base» fija qué ración se usa para escalar por gramos.")),
    h("div", { style: { marginTop: "10px" } }, h("label", { class: "f" }, "Notas"), notes),
    !isNew ? h("label", { class: "note row", style: { gap: "6px" } }, applyOpen, "Corregir también lo ya apuntado (todos los días, también los cerrados)") : null,
    orig];
  const save = async (accept) => {
    const portions = [];
    for (const r of prows) {
      if (r.deleted) { if (r.id) portions.push({ id: r.id, deleted: true }); continue; }
      const vals = { amount: parseNum(r.amount.value), kcal: parseNum(r.kcal.value), protein_g: parseNum(r.p.value), carbs_g: parseNum(r.c.value), fat_g: parseNum(r.g.value) };
      if (Object.values(vals).some(Number.isNaN)) return toast("Hay un número no válido", { error: true });
      portions.push({ id: r.id, label: r.label.value.trim(), unit: r.unit.value || null, quality: r.q.value, is_default: r.def.checked, ...vals });
    }
    const data = { name: name.value.trim(), category: cat.value.trim() || null, brand: brand.value.trim() || null, status: status.value, source: sourceText(), notes: notes.value.trim() || null, portions, ...(accept === true ? { reviewed: true } : {}), ...(!isNew ? { default_unit: duSel.value || null } : {}) };
    if (isNew) {
      const created = await act(() => api("POST", "/api/foods", data), "Producto creado");
      if (pendingImg && created) await act(() => offImg && pendingImg === offImg ? api("POST", `/api/foods/${created.id}/image-url`, { url: offImg, image_source: offImg })
        : api("POST", `/api/foods/${created.id}/image`, { data_url: pendingImg }));
    } else {
      await act(() => api("PUT", "/api/foods/" + f.id, { ...data, apply_open_days: applyOpen.checked }), "Guardado");
      if (offImg && pendingImg === offImg) await act(() => api("POST", `/api/foods/${f.id}/image-url`, { url: offImg, image_source: offImg }));
    }
    sh.close();
  };
  const fullOpts = { wide: true, sub: reviewSub(isNew, f) };
  const formFoot = () => [h("span", { class: "grow" }), ...saveButtons(isNew, f, save)];
  if (isNew && !opt.supp && !opt.manual) {
    // Nuevo producto: primero el código de barras (cámara, código o enlace); a mano, con un botón
    const sh = sheet("Nuevo producto", [offChooser((o) => { sh.close(); foodEditor(null, { ...opt, manual: true, off: o }); }, true, () => { sh.close(); foodEditor(null, { ...opt, manual: true }); })],
      [h("span", { class: "grow" }), h("button", { class: "btn", onclick: () => { sh.close(); foodEditor(null, { ...opt, manual: true }); } }, "Rellenar a mano")],
      { sub: "Escanea el código de barras o pega el enlace de Open Food Facts" });
    return;
  }
  const sh = sheet(isNew ? "Nuevo producto" : f.name, body, [
    isNew && !opt.supp && opt.manual ? h("button", { class: "btn ghost", onclick: () => { sh.close(); foodEditor(null, { ...opt, manual: false, off: null }); } }, icon("barcode"), "Usar código de barras") : null,
    !isNew ? h("button", { class: "btn ghost danger", onclick: (e) => confirmDel(e, () => act(() => api("POST", `/api/foods/${f.id}/deleted`, { value: true }), "Eliminado (recuperable desde la base de datos)").then(sh.close)) }, "Eliminar") : null,
    h("span", { class: "grow" }), ...saveButtons(isNew, f, save)], { wide: true, sub: reviewSub(isNew, f),
    titleExtra: isNew ? null : h("button", { class: "fav-btn" + (f.favorite ? " on" : ""), title: f.favorite ? "Quitar de favoritos" : "Añadir a favoritos (sale antes al buscar)",
      onclick: async (e) => { const b = e.currentTarget; await act(() => api("POST", `/api/foods/${f.id}/favorite`, { value: !f.favorite })); f.favorite = f.favorite ? 0 : 1; b.classList.toggle("on", !!f.favorite); b.textContent = f.favorite ? "★" : "☆"; } }, f.favorite ? "★" : "☆") });
  if (opt.off) applyOff(opt.off);
  if (isNew) setTimeout(() => name.focus(), 40);
}

// Elegir cómo traer un producto de Open Food Facts: cámara o código/enlace escrito
function offChooser(onFound, big, onManual) {
  const inp = h("input", { class: "input", placeholder: "Código de barras o enlace de Open Food Facts", inputMode: "text" });
  const note = h("div", { class: "note hidden" });
  const find = async (q) => {
    q = (q || inp.value).trim(); if (!q) { inp.focus(); return; }
    note.className = "note"; note.textContent = "Buscando en Open Food Facts…";
    try { onFound(await api("GET", "/api/off?q=" + encodeURIComponent(q))); }
    catch (e) { note.className = "note warn"; note.textContent = e.message + (onManual ? ". Puedes rellenarlo a mano con la etiqueta (botón de abajo)." : "."); }
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") find(); });
  return h("div", { class: "offc" + (big ? " big" : "") },
    h("button", { type: "button", class: "offc-cam", onclick: () => scanBarcode((c) => { inp.value = c; find(c); }) },
      h("span", { class: "offc-i" }, icon("camera")), h("b", null, "Escanear con la cámara"), h("span", null, "Apunta al código de barras del envase")),
    h("div", { class: "offc-or" }, h("span", null, "o")),
    h("div", { class: "offc-man" }, h("label", { class: "f" }, "Escribe el código o pega el enlace"),
      h("div", { class: "off-row" }, h("span", { class: "off-ic" }, icon("barcode")), inp, h("button", { type: "button", class: "btn primary", onclick: () => find() }, "Buscar"))),
    note);
}
let ZX_LOAD = null;
const loadZxing = () => ZX_LOAD || (ZX_LOAD = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "/vendor/zxing.min.js"; s.onload = () => ok(window.ZXing); s.onerror = () => { ZX_LOAD = null; ko(new Error("No se pudo cargar el lector")); }; document.head.append(s); }));
// Escáner de códigos de barras con la cámara: nativo (Chrome en Android) o con ZXing (ordenador, iPhone)
async function scanBarcode(onCode) {
  if (!("BarcodeDetector" in window)) return scanZxing(onCode);
  let stream = null, stop = false;
  const video = h("video", { class: "scan-v", playsInline: true, muted: true, autoplay: true });
  const msg = h("div", { class: "note" }, "Apunta al código de barras del envase");
  const sh = sheet("Escanear código", [h("div", { class: "scan-w" }, video, h("i", { class: "scan-line" })), msg], null, { onClose: () => { stop = true; if (stream) stream.getTracks().forEach((t) => t.stop()); } });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream; await video.play();
    const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const tick = async () => {
      if (stop) return;
      try { const r = await det.detect(video); if (r.length) { const c = r[0].rawValue; sh.close(); onCode(c); return; } } catch (e) { /* sigue */ }
      setTimeout(tick, 200);
    };
    tick();
  } catch (e) { msg.className = "note warn"; msg.textContent = "No se puede usar la cámara: escribe el código o pega el enlace."; }
}
async function scanZxing(onCode) {
  let reader = null;
  const video = h("video", { class: "scan-v", playsInline: true, muted: true, autoplay: true });
  const msg = h("div", { class: "note" }, "Apunta al código de barras del envase");
  const sh = sheet("Escanear código", [h("div", { class: "scan-w" }, video, h("i", { class: "scan-line" })), msg], null, { onClose: () => { if (reader) reader.reset(); } });
  try {
    const ZX = await loadZxing();
    reader = new ZX.BrowserMultiFormatReader();
    await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, (res) => { if (res) { const c = res.getText(); reader.reset(); sh.close(); onCode(c); } });
  } catch (e) { msg.className = "note warn"; msg.textContent = "No se puede usar la cámara: escribe el código o pega el enlace."; }
}

function saveButtons(isNew, item, save) {
  if (isNew || item.reviewed) return [h("button", { class: "btn primary lg", onclick: () => save() }, "Guardar")];
  return [h("button", { class: "btn", onclick: () => save() }, "Guardar"), h("button", { class: "btn primary lg", onclick: () => save(true) }, "Aceptar")];
}
function reviewSub(isNew, item) {
  if (isNew) return null;
  return item.reviewed ? "Aceptado" : "Por revisar · al aceptarlo aparecerá al añadir comida";
}

function confirmDel(ev, fn) {
  const b = ev.currentTarget;
  if (b.dataset.armed) return fn();
  b.dataset.armed = "1"; b.textContent = "¿Seguro? Pulsa otra vez";
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Eliminar"; } }, 3500);
}

function itemsEditor(items, excludeId, onChange) {
  // items: [{food_id, unit_key, quantity}]
  const wrap = h("div"), list = h("div"), totalEl = h("div", { class: "preview" });
  const draw = () => {
    list.replaceChildren(...items.map((it, i) => {
      const f = foodById(it.food_id) || { name: "?", units: [] };
      const q = numIn(it.quantity, "");
      q.addEventListener("input", () => { it.quantity = parseNum(q.value); drawTotal(); });
      const u = h("select", { class: "input" }, (f.units || []).map((x) => h("option", { value: x.key, selected: x.key === it.unit_key }, x.key === "g" ? "g" : x.key === "ml" ? "ml" : x.label)));
      u.addEventListener("change", () => { it.unit_key = u.value; drawTotal(); });
      return h("div", { class: "ing" }, h("div", { class: "nm", title: f.name }, f.name), q, u, h("button", { class: "icon-btn", onclick: () => { items.splice(i, 1); draw(); } }, icon("x")));
    }));
    drawTotal();
  };
  const totals = () => sumN(items.map((it) => { const f = foodById(it.food_id); const u = f && (f.units || []).find((x) => x.key === it.unit_key); return u && it.quantity > 0 ? scaleN(u.per, it.quantity) : { kcal: null, protein_g: null, carbs_g: null, fat_g: null }; }));
  const drawTotal = () => { const n = totals(); onChange && onChange(n); totalEl.replaceChildren(...[["kcal", "kcal total"], ["protein_g", "Proteína"], ["carbs_g", "Carbohidr."], ["fat_g", "Grasas"]].map(([k, l]) => h("div", null, h("div", { class: "v num" }, v(n, k)), h("div", { class: "l" }, l)))); };
  const inp = h("input", { class: "input", placeholder: "Añadir ingrediente…" });
  const dd = h("div", { class: "dropdown hidden" });
  const showDD = () => {
    const q = norm(inp.value.trim());
    const res = S.catalog.foods.filter((f) => !f.deleted && f.id !== excludeId && (!q || norm(f.name).includes(q))).slice(0, 30);
    dd.replaceChildren(...res.map((f) => h("div", { onmousedown: (e) => { e.preventDefault(); add(f); } }, f.name, h("span", { class: "faint" }, " · " + foodSub(f)))));
    dd.classList.toggle("hidden", !res.length);
  };
  const add = (f) => {
    const u = (f.units || []).find((x) => x.key === "g" || x.key === "ml") || (f.units || [])[0];
    if (!u) return toast("Ese alimento no tiene unidades", { error: true });
    items.push({ food_id: f.id, unit_key: u.key, quantity: ["g", "ml"].includes(u.key) ? 100 : 1 }); inp.value = ""; dd.classList.add("hidden"); draw();
  };
  inp.addEventListener("input", showDD); inp.addEventListener("focus", showDD); inp.addEventListener("blur", () => setTimeout(() => dd.classList.add("hidden"), 120));
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = dd.querySelector("div"); if (first) first.dispatchEvent(new MouseEvent("mousedown")); } });
  wrap.append(list, h("div", { class: "search", style: { marginTop: "8px" } }, icon("search"), inp, dd), totalEl);
  draw();
  return { el: wrap, totals };
}

function recipeEditor(r) {
  const isNew = !r;
  r = r || { name: "", recipe_servings: 1, recipe_cooked_weight_g: null, items: [], notes: "" };
  const items = (r.items || []).map((it) => ({ food_id: it.food_id, unit_key: it.unit_key, quantity: it.quantity }));
  const name = h("input", { class: "input", value: r.name, placeholder: "Ej.: Arroz con soja texturizada" });
  const serv = numIn(r.recipe_servings, "1"), cooked = numIn(r.recipe_cooked_weight_g, "opcional");
  const perEl = h("div", { class: "note" });
  const notes = h("textarea", { class: "input", rows: 2, placeholder: "Elaboración, aceite usado, etc." }, r.notes || "");
  const applyOpen = h("input", { type: "checkbox", checked: true });
  const drawPer = (n) => { const s = parseNum(serv.value) || 1; perEl.textContent = `Por ración (1/${fmt(s, 2)}): ${v(scaleN(n, 1 / s), "kcal")} kcal · P ${v(scaleN(n, 1 / s), "protein_g", 1)} · C ${v(scaleN(n, 1 / s), "carbs_g", 1)} · G ${v(scaleN(n, 1 / s), "fat_g", 1)}`; };
  const ed = itemsEditor(items, r.id, drawPer);
  serv.addEventListener("input", () => drawPer(ed.totals()));
  const body = [
    h("div", { class: "grid3" }, h("div", { style: { gridColumn: "span 1" } }, h("label", { class: "f" }, "Nombre"), name), h("div", null, h("label", { class: "f" }, "Raciones que salen"), serv), h("div", null, h("label", { class: "f" }, "Peso cocinado total (g)"), cooked)),
    h("div", { class: "sec-t" }, "Ingredientes (en crudo/seco, tal como los pesas)"), ed.el, perEl,
    h("div", { style: { marginTop: "10px" } }, h("label", { class: "f" }, "Notas"), notes),
    !isNew ? h("label", { class: "note row", style: { gap: "6px" } }, applyOpen, "Corregir también lo ya apuntado (todos los días, también los cerrados)") : null];
  const save = async (accept) => {
    if (!items.length) return toast("Añade al menos un ingrediente", { error: true });
    if (items.some((i) => !(i.quantity > 0))) return toast("Cantidad no válida", { error: true });
    const s = parseNum(serv.value), cw = parseNum(cooked.value);
    if (Number.isNaN(s) || Number.isNaN(cw)) return toast("Número no válido", { error: true });
    const data = { name: name.value.trim(), recipe_servings: s || 1, recipe_cooked_weight_g: cw, items, notes: notes.value.trim() || null, ...(accept === true ? { reviewed: true } : {}) };
    if (isNew) await act(() => api("POST", "/api/recipes", data), "Receta creada");
    else await act(() => api("PUT", "/api/foods/" + r.id, { ...data, apply_open_days: applyOpen.checked }), "Receta guardada");
    sh.close();
  };
  const sh = sheet(isNew ? "Nueva receta" : r.name, body, [
    !isNew ? h("button", { class: "btn ghost danger", onclick: (e) => confirmDel(e, () => act(() => api("POST", `/api/foods/${r.id}/deleted`, { value: true }), "Receta eliminada").then(sh.close)) }, "Eliminar") : null,
    h("span", { class: "grow" }), ...saveButtons(isNew, r, save)], { wide: true, sub: reviewSub(isNew, r) });
  if (opt.off) applyOff(opt.off);
  if (isNew) setTimeout(() => name.focus(), 40);
}

function templateEditor(t) {
  const isNew = !t;
  t = t || { name: "", meal: null, items: [] };
  const items = (t.items || []).map((it) => ({ food_id: it.food_id, unit_key: it.unit_key, quantity: it.quantity }));
  const name = h("input", { class: "input", value: t.name, placeholder: "Ej.: Batido habitual" });
  const meal = h("select", { class: "input" }, h("option", { value: "" }, "—"), MEALS.map(([k, l]) => h("option", { value: k, selected: k === t.meal }, l)));
  const ed = itemsEditor(items, null, null);
  const tFile = h("input", { type: "file", accept: "image/*", class: "hidden" });
  const tPhoto = h("div", { class: "photo-box" });
  const drawTP = () => tPhoto.replaceChildren(photoFrame(t.name || "?", "habitual", t.image),
    h("div", { class: "pb-actions" }, h("button", { type: "button", class: "btn sm", onclick: () => isNew ? toast("Guarda primero la comida habitual") : tFile.click() }, icon("camera"), t.image ? "Cambiar foto" : "Añadir foto"),
      t.image_source ? h("span", { class: "note", style: { margin: 0 } }, "Imagen ilustrativa · cámbiala por una foto tuya") : null));
  tFile.addEventListener("change", async () => {
    const file = tFile.files[0]; if (!file) return;
    try { const url = await resizeImage(file, 800); const r = await api("POST", `/api/templates/${t.id}/image`, { data_url: url }); t.image = r.image; t.image_source = null; drawTP(); toast("Foto guardada"); await loadCatalog(); render(); }
    catch (e) { toast(e.message, { error: true }); }
  });
  drawTP();
  const body = [tFile, tPhoto,
    h("div", { class: "grid2" }, h("div", null, h("label", { class: "f" }, "Nombre"), name), h("div", null, h("label", { class: "f" }, "Comida por defecto"), meal)),
    h("div", { class: "sec-t" }, "Alimentos"), ed.el,
    h("div", { class: "note" }, "Al añadirla al día se registran los alimentos por separado, editables uno a uno.")];
  const save = async (accept) => {
    if (!items.length) return toast("Añade al menos un alimento", { error: true });
    if (items.some((i) => !(i.quantity > 0))) return toast("Cantidad no válida", { error: true });
    const data = { name: name.value.trim(), meal: meal.value || null, items, ...(accept === true ? { reviewed: 1 } : {}) };
    if (isNew) await act(() => api("POST", "/api/templates", data), "Comida habitual creada");
    else await act(() => api("PUT", "/api/templates/" + t.id, data), "Guardada");
    sh.close();
  };
  const sh = sheet(isNew ? "Nueva comida habitual" : t.name, body, [
    !isNew ? h("button", { class: "btn ghost danger", onclick: (e) => confirmDel(e, () => act(() => api("PUT", "/api/templates/" + t.id, { deleted: 1 }), "Eliminada").then(sh.close)) }, "Eliminar") : null,
    h("span", { class: "grow" }), ...saveButtons(isNew, t, save)], { wide: true, sub: reviewSub(isNew, t),
    titleExtra: isNew ? null : h("button", { class: "fav-btn" + (t.favorite ? " on" : ""), title: t.favorite ? "Quitar de favoritas" : "Añadir a favoritas (sale antes al añadir comida)",
      onclick: async (e) => { const b = e.currentTarget; await act(() => api("PUT", "/api/templates/" + t.id, { favorite: t.favorite ? 0 : 1 })); t.favorite = t.favorite ? 0 : 1; b.classList.toggle("on", !!t.favorite); b.textContent = t.favorite ? "★" : "☆"; await loadCatalog(); } }, t.favorite ? "★" : "☆") });
  if (opt.off) applyOff(opt.off);
  if (isNew) setTimeout(() => name.focus(), 40);
}


function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Imagen no válida"));
    img.src = url;
  });
}

// ---------------------------------------------------------------- báscula
const BODY_ROWS = [["weight_kg", "Peso", "kg", 1], ["fat_pct", "Grasa", "%", 2], ["fat_kg", "Grasa", "kg", 1], ["muscle_kg", "Masa muscular", "kg", 1],
  ["skeletal_muscle_kg", "Músculo esquelético", "kg", 1], ["lean_kg", "Peso sin grasa", "kg", 1], ["water_pct", "Agua", "%", 1], ["protein_pct", "Proteína", "%", 1],
  ["bone_kg", "Hueso", "kg", 1], ["visceral_fat", "Grasa visceral", "", 1], ["bmr_kcal", "BMR báscula", "kcal", 0], ["bmi", "IMC", "", 1]];
// Medidas de la báscula: siempre las mismas y en el mismo orden (lo que no da la báscula sale «—»). Con `ref`, el cambio en ~1 mes.
const BODY_TILES = [["fat_pct", "Grasa", "%", 1], ["muscle_kg", "Masa muscular", "kg", 1], ["water_pct", "Agua", "%", 1], ["visceral_fat", "Grasa visceral", "", 0], ["bone_kg", "Hueso", "kg", 1], ["bmi", "IMC", "", 1]];
// Masa muscular como la calcula Xiaomi: peso − grasa − hueso (si la báscula no la manda)
function muscleOf(b) {
  if (b.muscle_kg != null) return b.muscle_kg;
  const fat = b.fat_kg != null ? b.fat_kg : b.fat_pct != null && b.weight_kg != null ? b.weight_kg * b.fat_pct / 100 : null;
  return b.weight_kg != null && fat != null && b.bone_kg != null ? Math.round((b.weight_kg - fat - b.bone_kg) * 10) / 10 : null;
}
const bodyVal = (b, k) => k === "muscle_kg" ? muscleOf(b) : b[k];
function bodyTiles(b, ref, withWeight) {
  const rows = withWeight ? [["weight_kg", "Peso", "kg", 1], ...BODY_TILES] : BODY_TILES;
  return rows.map(([k, l, u, nd]) => {
    const v = bodyVal(b, k), rv = ref ? bodyVal(ref, k) : null, d = v != null && rv != null ? v - rv : null;
    const why = k === "muscle_kg" && b.muscle_kg == null && v != null ? "Calculada como Xiaomi: peso − grasa − hueso"
      : k === "visceral_fat" && v == null ? "Necesita la impedancia de la báscula: llegará cuando la app la lea directamente" : null;
    return tip(h("div", { class: "btile" }, h("span", null, l),
      v == null ? h("b", { class: "num none" }, "—") : h("b", { class: "num" }, fmt(v, nd), u ? h("small", null, " " + u) : null,
        k === "fat_pct" && b.fat_kg != null ? h("small", { class: "sec" }, " · " + fmt(b.fat_kg, 1) + " kg") : null),
      d != null ? h("em", { class: "num" }, signed(d, nd) + " en ~1 mes") : null), why);
  });
}
// Peso del día de cada fecha: el pesaje (el más temprano) que coincide con el peso guardado en el día
function mainWeighing(list, dayW, date) {
  const w = dayW[date]; if (w == null) return null;
  return [...list].filter((b) => b.date === date && b.weight_kg != null && Math.abs(b.weight_kg - w) < 0.05).sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0] || null;
}
const setDayWeight = (b, on) => act(() => api("PUT", "/api/days/" + b.date, on ? { weight_kg: b.weight_kg, weight_time: b.time || null } : { weight_kg: null }),
  on ? "Ahora es el peso del día" : "Ya no cuenta como peso del día");
function bodyPanel(list, weights = []) {
  // Arriba, el último pesaje que cuenta como peso del día (los de después de comer, etc. no)
  const dayW0 = Object.fromEntries(weights.filter((w) => w.weight_kg != null).map((w) => [w.date, w.weight_kg]));
  const latest = list.find((b) => mainWeighing(list, dayW0, b.date) === b) || list[0];
  const ref = latest ? list.find((b) => b.date <= addDays(latest.date, -25)) : null;
  const head = h("div", { class: "row" }, h("h3", { style: { margin: 0 } }, "Báscula", h("span", { class: "faint", style: { fontWeight: 400 } }, " · composición por bioimpedancia: estimación, mira tendencias")),
    h("span", { class: "grow" }), h("button", { class: "btn sm", style: { whiteSpace: "nowrap" }, onclick: () => bodySheet() }, "+ Medición"));
  if (!latest) return h("div", { class: "card panel" }, head, h("div", { class: "muted", style: { padding: "14px 0 4px" } }, "Sin mediciones. Mándame la captura de la app de Xiaomi o añádela aquí."));
  const tiles = bodyTiles(latest, ref, true);
  return h("div", { class: "card panel" }, head,
    h("div", { class: "faint", style: { fontSize: "12.5px", margin: "4px 0 10px" } }, "Última: " + dateLabel(latest.date, { weekday: "short", day: "numeric", month: "short" }) + (latest.time ? " · " + latest.time : "") + (latest.notes ? " · " + latest.notes : "")),
    h("div", { class: "btiles seven" }, tiles),
    list.length > 1 ? histBody(list, weights) : null);
}
// Historial de pesajes: «Peso del día» (los que cuentan para la tendencia) o «Todos»; cada uno se puede marcar como peso del día
function histBody(list, weights) {
  const dayW = Object.fromEntries(weights.filter((w) => w.weight_kg != null).map((w) => [w.date, w.weight_kg]));
  const counts = (b) => mainWeighing(list, dayW, b.date) === b;
  let all = false;
  const tbl = h("div", { class: "tbl-wrap" }), seg = h("div", { class: "seg sm" });
  const draw = () => {
    seg.replaceChildren(...[[false, "Peso del día"], [true, "Todos los pesajes"]].map(([v, l]) => h("button", { class: all === v ? "on" : "", onclick: () => { all = v; draw(); } }, l)));
    const rows = list.filter((b) => all || counts(b));
    tbl.replaceChildren(h("table", { class: "t bhist" }, h("tr", null, h("th", null, "Fecha"), ...["Peso", "Grasa %", "Músculo", "Agua %", "Visceral"].map((x) => h("th", { class: "r" }, x)), h("th", { class: "c" }, "Cuenta"), h("th", null, "")),
      rows.map((b) => { const on = counts(b);
        return h("tr", { class: on ? "" : "nc" }, h("td", { class: "dtc" }, dateLabel(b.date, { weekday: "short", day: "numeric", month: "short" }), b.time ? h("span", { class: "faint" }, " · " + b.time) : null), ...["weight_kg", "fat_pct", "muscle_kg", "water_pct", "visceral_fat"].map((k) => h("td", { class: "r num" }, bodyVal(b, k) == null ? "—" : fmt(bodyVal(b, k), 1))),
          h("td", { class: "c" }, b.weight_kg == null ? null : tip(h("button", { class: "cnt-btn" + (on ? " on" : ""), onclick: () => setDayWeight(b, !on) }, icon("check")), on ? "Es el peso del día: cuenta para la media, la tendencia y los ajustes. Toca para quitarlo." : "No cuenta para la tendencia. Toca para usarlo como peso del día.")),
          h("td", null, h("button", { class: "icon-btn", title: "Eliminar", onclick: async () => { await act(() => api("DELETE", "/api/body/" + b.id), "Medición eliminada"); } }, icon("x")))); })));
  };
  draw();
  return h("details", { style: { marginTop: "10px" } }, h("summary", null, `Historial (${list.length})`), h("div", { class: "row", style: { margin: "8px 0" } }, seg), tbl);
}
function bodySheet() {
  const ins = {};
  const fld = (k, l) => { ins[k] = numIn(null, ""); return field(l, ins[k]); };
  const date = h("input", { class: "input", type: "date", value: todayISO() }), time = h("input", { class: "input", type: "time", value: nowHM() });
  const notes = h("input", { class: "input", placeholder: "Ej.: en ayunas, en ropa interior" });
  const sh = sheet("Nueva medición", [
    h("div", { class: "grid2" }, field("Fecha", date), field("Hora", time)),
    h("div", { class: "grid3 gap-top" }, fld("weight_kg", "Peso (kg)"), fld("fat_pct", "Grasa (%)"), fld("muscle_kg", "Masa muscular (kg)"),
      fld("water_pct", "Agua (%)"), fld("visceral_fat", "Grasa visceral"), fld("bmr_kcal", "BMR (kcal)"),
      fld("skeletal_muscle_kg", "Músculo esquelético (kg)"), fld("bone_kg", "Hueso (kg)"), fld("protein_pct", "Proteína (%)")),
    h("div", { class: "gap-top" }, field("Notas", notes)),
    h("div", { class: "note" }, "El peso se copia al día si aún no tiene peso. El resto de valores son estimaciones de la báscula."),
  ], [h("span", { class: "grow" }), h("button", { class: "btn primary lg", onclick: async () => {
    const body = { date: date.value, time: time.value || null, notes: notes.value || null };
    for (const k in ins) { const n = parseNum(ins[k].value); if (Number.isNaN(n)) return toast("Número no válido", { error: true }); body[k] = n; }
    await act(() => api("POST", "/api/body", body), "Medición guardada"); sh.close();
  } }, "Guardar")]);
}

// --------------------------------------------------------------- progreso
function viewProgress() {
  const P = S.progress; if (!P) return h("div");
  const ws = P.weights, measured = ws.filter((w) => w.weight_kg != null);
  const last = measured[measured.length - 1];
  const lastAvg = [...ws].reverse().find((w) => w.avg7 != null);
  const prevAvg = lastAvg ? ws.find((w) => w.date === addDays(lastAvg.date, -7)) : null;
  const logged7 = P.history.filter((d) => d.entries > 0 && d.date > addDays(todayISO(), -7));
  const avgK = logged7.length ? logged7.reduce((a, d) => a + (d.kcal || 0), 0) / logged7.length : null;
  const avgP = logged7.length ? logged7.reduce((a, d) => a + (d.protein_g || 0), 0) / logged7.length : null;
  const cal = P.calibration;
  const kpi = (l, val, s) => h("div", { class: "kpi" }, h("div", { class: "l" }, kpiLbl(l)), h("div", { class: "v num" }, val), h("div", { class: "s" }, s || ""));
  const range = h("div", { class: "seg" }, [[7, "7 d"], [30, "30 d"], [90, "90 d"], [365, "1 año"]].map(([d, l]) => h("button", { class: S.progDays === d ? "on" : "", onclick: async () => { S.progDays = d; await refresh(); } }, l)));
  return h("div", null,
    h("div", { class: "row", style: { marginBottom: "12px" } }, h("h2", { class: "vt" }, "Progreso"), h("span", { class: "grow" }), range),
    h("div", { class: "kpis" },
      kpi("Último peso", last ? fmt(last.weight_kg, 1) + " kg" : "—", last ? dateLabel(last.date, { day: "numeric", month: "short" }) : "sin pesajes"),
      kpi("Media 7 días", lastAvg ? fmt(lastAvg.avg7, 2) + " kg" : "—", prevAvg && prevAvg.avg7 != null ? signed(lastAvg.avg7 - prevAvg.avg7, 2) + " kg vs semana anterior" : ""),
      kpi("Ingesta media 7 d", avgK != null ? fmt(avgK) + " kcal" : "—", avgP != null ? `P ${fmt(avgP)} g · ${logged7.length} días` : ""),
      kpi("Mantenimiento observado", cal.observed_maintenance != null ? fmt(cal.observed_maintenance) + " kcal" : "—", cal.observed_maintenance != null ? `tendencia ${signed(cal.slope_kg_week, 2)} kg/sem · modelo ${fmt(cal.model_tdee_avg)}` : "faltan datos (≥14 días)")),
    h("div", { class: "card panel" }, h("h3", null, "Peso", h("span", { class: "faint", style: { fontWeight: 400 } }, " · puntos: pesajes · gruesa: media de 7 días · discontinua: lo esperado")), h("div", { class: "faint", style: { fontSize: "12.5px", marginTop: "-4px" } }, "Pésate siempre igual: al levantarte, después de ir al baño, antes de comer o beber y con la misma ropa (o sin ella)"), weightChart(ws, P.body)),
    calPanel(cal),
    stepsPanel(P.history, P.steps_goal),
    bodyPanel(P.body || [], P.weights || []),
    h("div", { class: "card panel" }, h("h3", null, "Semanas"), weeksTable(P.weeks)),
    h("div", { class: "card panel" }, h("h3", null, "Días"), daysTable(P.history)));
}

function weightChart(ws, bodies, sel, next) {
  if (next != null && ws.length) ws = [...ws, { date: addDays(ws[ws.length - 1].date, 1), next }];
  const first = ws.findIndex((w) => w.weight_kg != null || w.avg7 != null);
  if (first > 0) ws = ws.slice(Math.min(first, ws.length - 2));  // sin días vacíos delante: la gráfica empieza en el primer pesaje
  const pts = ws.filter((w) => w.weight_kg != null || w.avg7 != null);
  if (!pts.length) return h("div", { class: "muted", style: { padding: "30px 0", textAlign: "center" } }, "Aún no hay pesajes. Registra el peso cada mañana en Hoy.");
  const W = Math.max(300, Math.min(900, ($("#view") ? $("#view").clientWidth : 900) - 34)), H = 220, L = 40, R = 10, T = 10, B = 24;
  // Eje de tiempo real: cada día se sitúa a las 8:00 y cada pesaje a su hora (el peso del día, grande; los demás, pequeños y en gris)
  const idx = Object.fromEntries(ws.map((w, i) => [w.date, i])), mins = (t) => t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : 480;
  const byT = [...(bodies || [])].filter((b) => b.weight_kg != null).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const mainOf = (w) => w.weight_kg == null ? null : byT.find((b) => b.date === w.date && Math.abs(b.weight_kg - w.weight_kg) < 0.05) || null;
  const others = byT.filter((b) => idx[b.date] != null && b !== mainOf(ws[idx[b.date]]));
  const vals = pts.flatMap((p) => [p.weight_kg, p.avg7, p.interp]).concat(next != null ? [next] : [], others.map((b) => b.weight_kg)).filter((x) => x != null);
  // Eje Y ajustado a los datos: la variación ocupa la mayor parte del alto (mínimo 0,6 kg de margen para no exagerar el ruido)
  let lo = Math.min(...vals), hi = Math.max(...vals); const span = Math.max(hi - lo, 0.6), pad = span * 0.25, mid = (hi + lo) / 2;
  lo = mid - span / 2 - pad; hi = mid + span / 2 + pad;
  // Medio día de margen a cada lado: el primer y el último punto no quedan pegados al borde
  const n = ws.length, x = (i) => L + ((i + 0.5) * (W - L - R)) / n, y = (val) => T + ((hi - val) * (H - T - B)) / (hi - lo);
  const dayW = (W - L - R) / n, xt = (i, t) => x(i) + dayW * ((mins(t) - 480) / 1440);
  const xw = (i) => { const w = ws[i]; if (w.weight_kg == null) return x(i); const m = mainOf(w); return m ? xt(i, m.time) : x(i); };
  const NS = "http://www.w3.org/2000/svg", el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", preserveAspectRatio: "none" });
  const rg = hi - lo, step = rg > 12 ? 2 : rg > 6 ? 1 : rg > 2.5 ? 0.5 : 0.2, nd = step < 1 ? 1 : 0;
  for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) {
    svg.append(el("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), class: "grid" }));
    const t = el("text", { x: L - 6, y: y(g) + 4, "text-anchor": "end", class: "axis" }); t.textContent = fmt(g, nd); svg.append(t);
  }
  const ticks = Math.min(W < 500 ? 4 : 6, n); for (let k = 0; k < ticks; k++) { const i = Math.round((k * (n - 1)) / Math.max(1, ticks - 1)); const t = el("text", { x: x(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === ticks - 1 ? "end" : "middle", class: "axis" }); t.textContent = dateLabel(ws[i].date, { day: "numeric", month: "short" }); svg.append(t); }
  // Curva de peso: pesajes unidos; los días sin pesaje entre dos pesajes se interpolan en línea recta.
  let dc = ""; ws.forEach((w, i) => { const v = w.weight_kg ?? w.interp; if (v != null) dc += (dc ? "L" : "M") + xw(i).toFixed(1) + " " + y(v).toFixed(1); });
  if (dc) svg.append(el("path", { d: dc, class: "wline", "vector-effect": "non-scaling-stroke" }));
  let d = ""; ws.forEach((w, i) => { if (w.avg7 != null) d += (d ? "L" : "M") + x(i).toFixed(1) + " " + y(w.avg7).toFixed(1); });
  if (d) svg.append(el("path", { d, class: "avg", "vector-effect": "non-scaling-stroke" }));
  // Lo esperado por el modelo (lo que comes − lo que gastas): se corta donde falta la comida de algún día
  let de = "", prevE = false; ws.forEach((w, i) => { if (w.expected != null && w.expected >= lo && w.expected <= hi) { de += (prevE ? "L" : "M") + x(i).toFixed(1) + " " + y(w.expected).toFixed(1); prevE = true; } else prevE = false; });
  if (de) svg.append(el("path", { d: de, class: "exp", "vector-effect": "non-scaling-stroke" }));
  ws.forEach((w, i) => {
    const v = w.weight_kg ?? w.interp; if (v == null) return;
    svg.append(el("circle", { cx: xw(i), cy: y(v), r: w.weight_kg != null ? 3.2 : 2, class: w.weight_kg != null ? "pt" : "ipt" }));
  });
  for (const b of others) svg.append(el("circle", { cx: xt(idx[b.date], b.time), cy: y(b.weight_kg), r: 2.2, class: "opt" }));
  // Previsto de mañana: punto hueco unido con discontinua al último valor
  const ni = ws.findIndex((w) => w.next != null);
  if (ni > 0) { const pv = ws[ni - 1].weight_kg ?? ws[ni - 1].interp;
    if (pv != null) svg.append(el("line", { x1: xw(ni - 1), y1: y(pv), x2: x(ni), y2: y(ws[ni].next), class: "wnext-l", "vector-effect": "non-scaling-stroke" }));
    svg.append(el("circle", { cx: x(ni), cy: y(ws[ni].next), r: 4, class: "wnext-pt" })); }
  // El día que se está mirando: punto grande con aro
  const si = sel ? ws.findIndex((w) => w.date === sel) : -1, sv = si >= 0 ? ws[si].weight_kg ?? ws[si].interp : null;
  if (sv != null) { svg.append(el("circle", { cx: xw(si), cy: y(sv), r: 11, class: "sel-ring" })); svg.append(el("circle", { cx: xw(si), cy: y(sv), r: 6, class: "sel-pt" + (ws[si].weight_kg == null ? " est" : "") })); }
  // Al pasar el ratón (o el dedo): línea vertical y los datos de ese día
  const vline = el("line", { y1: T, y2: H - B, class: "hov hidden" }); svg.append(vline);
  const hov = el("circle", { r: 5.5, class: "hov-pt hidden" }); svg.append(hov);
  const box = h("div", { class: "wc" }, svg), tip_ = h("div", { class: "wc-tip hidden" }); box.append(tip_);
  box.append(h("div", { class: "wc-leg" }, h("span", null, h("i", { class: "sw pt" }), "Pesaje"), h("span", null, h("i", { class: "sw ipt" }), "Estimado"),
    others.length ? h("span", null, h("i", { class: "sw opt" }), "No cuenta") : null, h("span", null, h("i", { class: "sw avg" }), "Media 7 días"), h("span", null, h("i", { class: "sw exp" }), "Esperado")));
  let hideT = null;
  // Puntos de la gráfica (cada uno a su hora): al pasar el ratón o el dedo se elige el más cercano
  const P = [];
  ws.forEach((w, i) => {
    if (w.weight_kg != null) { const m = mainOf(w); P.push({ i, px: xw(i), v: w.weight_kg, t: m && m.time, k: "main" }); }
    else if (w.interp != null) P.push({ i, px: x(i), v: w.interp, k: "est" });
  });
  for (const b of others) P.push({ i: idx[b.date], px: xt(idx[b.date], b.time), v: b.weight_kg, t: b.time, k: "other" });
  const move = (ev) => {
    const r = svg.getBoundingClientRect(), cx = (ev.clientX - r.left) / r.width * W, cy = (ev.clientY - r.top) / r.height * H;
    if (!P.length) return;
    const p = P.reduce((best, q) => { const d = Math.abs(q.px - cx) * 3 + Math.abs(y(q.v) - cy); return !best || d < best.d ? { ...q, d } : best; }, null);
    const w = ws[p.i];
    vline.setAttribute("x1", p.px); vline.setAttribute("x2", p.px); vline.classList.remove("hidden");
    hov.setAttribute("cx", p.px); hov.setAttribute("cy", y(p.v)); hov.classList.remove("hidden");
    tip_.replaceChildren(...[h("b", null, dateLabel(w.date, { weekday: "short", day: "numeric", month: "short" }) + (p.t ? " · " + p.t : "")),
      h("div", null, h("i", { class: "sw " + { main: "pt", est: "ipt", other: "opt" }[p.k] }), { main: "Peso del día ", est: "Estimado (sin pesaje) ", other: "Otro pesaje " }[p.k], h("b", { class: "num" }, fmt(p.v, 1) + " kg")),
      p.k === "other" ? h("div", { class: "faint" }, "No cuenta para la tendencia") : null,
      p.k !== "other" && w.avg7 != null ? h("div", null, h("i", { class: "sw avg" }), "Media 7 días ", h("b", { class: "num" }, fmt(w.avg7, 2))) : null,
      p.k !== "other" && w.expected != null ? h("div", null, h("i", { class: "sw exp" }), "Esperado ", h("b", { class: "num" }, fmt(w.expected, 2))) : null].filter(Boolean));
    tip_.classList.remove("hidden");
    const px = (p.px / W) * r.width; tip_.style.left = Math.min(Math.max(px, 70), r.width - 70) + "px";
  };
  const leave = () => { clearTimeout(hideT); vline.classList.add("hidden"); hov.classList.add("hidden"); tip_.classList.add("hidden"); };
  // Ratón: se ve mientras está encima. Dedo: manteniendo pulsado (y deslizando sin soltar se mueve); al soltar se va a los 2 s.
  svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") move(e); });
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") leave(); });
  touchHold(svg, (e) => { clearTimeout(hideT); move(e); }, leave);
  window.addEventListener("scroll", leave, { passive: true, capture: true });
  return box;
}

// Pasos en Progreso: un día por barra (los días sin datos quedan en hueco), la línea del objetivo y lo básico
function stepsPanel(hist, goal) {
  const ds = (hist || []).filter((x) => x.steps != null);
  if (!ds.length) return null;
  goal = goal || 8000;
  const by = Object.fromEntries(ds.map((x) => [x.date, x.steps]));
  const n = Math.max(14, Math.min(S.progDays || 30, 90)), end = todayISO(), days = Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
  const mx = Math.max(goal, ...ds.map((x) => x.steps)) * 1.08, avg = ds.reduce((a, x) => a + x.steps, 0) / ds.length;
  const best = ds.reduce((a, x) => (x.steps > a.steps ? x : a)), hit = ds.filter((x) => x.steps >= goal).length;
  const kpi = (l, v, s_) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v num" }, v), h("div", { class: "s" }, s_ || ""));
  return h("div", { class: "card panel" }, h("h3", null, "Pasos", h("span", { class: "faint", style: { fontWeight: 400 } }, ` · objetivo ${fmt(goal)}`)),
    h("div", { class: "kpis k3" }, kpi("Media", fmt(avg), `${ds.length} ${ds.length === 1 ? "día" : "días"}`), kpi("Objetivo", `${hit} de ${ds.length}`, Math.round((100 * hit) / ds.length) + " % de los días"),
      kpi("Mejor día", fmt(best.steps), dateLabel(best.date, { day: "numeric", month: "short" }))),
    h("div", { class: "pbars" }, h("i", { class: "goal", style: { bottom: (100 * goal) / mx + "%" } }),
      days.map((d) => { const v = by[d]; return h("span", { class: v == null ? "gap" : v >= goal ? "ok" : "", style: { height: v == null ? "0" : Math.max(2, (100 * v) / mx) + "%" }, "data-tip": `${dateLabel(d, { weekday: "long", day: "numeric", month: "short" })}\n${v == null ? "Sin datos" : fmt(v) + " pasos" + (v >= goal ? " · objetivo cumplido" : "")}` }); })),
    h("div", { class: "pbars-x faint" }, h("span", null, dateLabel(days[0], { day: "numeric", month: "short" })), h("span", null, "hoy")));
}
// Calibración del gasto (Progreso): lo que dicen tus pesajes frente a lo que calcula el modelo
const CAL_ROWS = [["cal_ajuste_kcal", "Base: metabolismo y día a día", (v) => signed(v) + " kcal/día"], ["cal_pasos_factor", "Pasos", (v) => "× " + fmt(v, 2)], ["cal_ejercicio_factor", "Entrenos", (v) => "× " + fmt(v, 2)]];
// Qué parte de lo comido es aproximada (comidas fuera, sin etiqueta): explica parte del error del ajuste
function apxNote(hist) {
  const ds = (hist || []).filter((d) => d.entries > 0 && d.kcal), k = ds.reduce((a, d) => a + d.kcal, 0), ap = ds.reduce((a, d) => a + (d.approx_kcal || 0), 0);
  if (!k) return null;
  const p = Math.round((100 * ap) / k);
  return h("div", { class: "bd-apx cal-apx" }, h("div", { class: "bd-apx-bar" }, h("i", { style: { width: p + "%" } })),
    h("span", null, h("b", { class: "num" }, p + " %"), ` de lo que has comido ${ds.length === 1 ? "en el único día apuntado" : `en estos ${ds.length} días`} es aproximado (comidas fuera, productos sin etiqueta). ${p >= 25 ? "Es bastante: parte de la diferencia entre peso y balance puede venir de ahí." : "Es poco: tus datos son fiables para calibrar."}`));
}
function calPanel(cal) {
  if (!cal) return null;
  const ap = cal.applied || {}, est = cal.estimate, sd = cal.sd || {}, lr = cal.learned || {};
  const rows = CAL_ROWS.map(([k, l, f]) => h("div", { class: "cal-r" },
    h("div", { class: "grow" }, h("b", null, l), est ? h("div", { class: "faint sm" }, `tus datos dicen ${f(est[k])} ± ${k === "cal_ajuste_kcal" ? fmt(sd[k]) : fmt(sd[k], 2)}`) : null,
      est ? tip(h("div", { class: "cal-fi" },
        h("span", { class: "faint" }, "Fiabilidad ", h("span", { class: "fi-i" }, "ⓘ")), h("div", { class: "cal-bar" }, h("i", { style: { width: Math.round(Math.max(0, lr[k] || 0) * 100) + "%" } })),
        h("b", { class: "num" }, Math.round(Math.max(0, lr[k] || 0) * 100) + " %")), `Fiabilidad de este valor\nCuánto se fían tus datos de lo que dicen. Al principio el margen de error es amplio (base ±250 kcal, pasos y entrenos ±35 %) y se usa la fórmula tal cual: 0 %. Con cada semana de comidas y pesajes el margen se estrecha; si la base está en ±60, es un 76 % más estrecho: 76 %.\nCuanto más alta, más pesa este valor en tu gasto.`) : null),
    h("div", { class: "cal-v num" }, f(ap[k] ?? (k === "cal_ajuste_kcal" ? 0 : 1)))));
  const reload = async (p) => { await act(() => p); await refresh(); };
  return h("div", { class: "card panel" },
    h("div", { class: "row" }, h("h3", { style: { margin: 0 } }, "Calibración del gasto"), h("span", { class: "grow" }),
      h("span", { class: "pc-badge " + (cal.auto ? "ok" : "man") }, cal.auto ? "Automática" : "Manual")),
    h("p", { class: "faint sm cal-p" }, "Si apuntas todo lo que comes y te pesas por la mañana, el peso tiene que seguir al balance. Con la diferencia se corrige el gasto: los días sin entreno separan los pasos de la base y los de pocos pasos, la base de los pasos. Solo cambia lo que tus datos justifican; se revisa cada semana."),
    cal.ready ? null : h("div", { class: "note cal-n" }, cal.reason || "Aún sin datos suficientes."),
    apxNote(S.progress && S.progress.history),
    h("div", { class: "cal-list" }, rows),
    cal.updated ? h("div", { class: "faint sm", style: { marginTop: "6px" } }, "Última actualización: " + dateLabel(cal.updated, { day: "numeric", month: "short" })) : null,
    h("div", { class: "row", style: { gap: "8px", marginTop: "12px", flexWrap: "wrap" } },
      h("button", { class: "btn sm", onclick: () => calEditSheet(cal) }, icon("edit"), "Editar"),
      est && !cal.auto ? h("button", { class: "btn sm", onclick: () => reload(api("POST", "/api/calibration/apply", {})) }, "Usar lo que dicen mis datos") : null,
      !cal.auto ? h("button", { class: "btn sm ghost", onclick: () => reload(api("PUT", "/api/calibration", { cal_auto: "1" })) }, "Volver a automática") : null,
      h("span", { class: "grow" }),
      h("button", { class: "btn sm ghost danger", onclick: () => { if (confirm("¿Volver a los valores de fábrica? La calibración empieza de cero.")) reload(api("POST", "/api/calibration/reset", {})); } }, "Restablecer")));
}
function calEditSheet(cal) {
  const P = cal.params, D = cal.defaults;
  const F = [["cal_ajuste_kcal", "Base: metabolismo y día a día (kcal/día)", "+ = gastas más de lo calculado"], ["cal_pasos_factor", "Pasos (factor)", "1 = tal cual; 1,10 = un 10 % más"], ["cal_ejercicio_factor", "Entrenos (factor)", "1 = tal cual"]];
  const ins = {};
  const sh = sheet("Parámetros del gasto", [
    h("p", { class: "muted wz-p" }, "Si los cambias a mano, la calibración pasa a manual (puedes volver a automática cuando quieras)."),
    h("div", { class: "form" }, F.map(([k, l, d]) => h("label", { class: "fld" }, h("span", null, l, h("span", { class: "faint" }, ` · ${d} · de fábrica ${String(D[k]).replace(".", ",")}`)),
      ins[k] = h("input", { class: "input num", inputMode: "decimal", value: String(P[k]).replace(".", ",") }))))],
    [h("button", { class: "btn", onclick: () => sh.close() }, "Cancelar"), h("span", { class: "grow" }),
      h("button", { class: "btn primary", onclick: async () => {
        const body = {}; for (const [k] of F) { const n = parseNum(ins[k].value); if (n == null || Number.isNaN(n)) { toast("Valor no válido: " + k, { error: true }); return; } if (String(n) !== String(Number(P[k]))) body[k] = String(n); }
        if (Object.keys(body).length) await act(() => api("PUT", "/api/calibration", body), "Guardado");
        sh.close(); await refresh(); } }, "Guardar")]);
}

function weeksTable(weeks) {
  if (!weeks.length) return h("div", { class: "muted" }, "Sin datos todavía.");
  return h("div", { class: "tbl-wrap" }, h("table", { class: "t" },
    h("tr", null, ...["Semana", "Días", "kcal", "Aprox.", "P", "C", "G", "Peso medio", "Δ", "Gasto est.", "Balance"].map((x, i) => h("th", { class: i > 0 ? "r" : "" }, x))),
    [...weeks].reverse().map((w) => h("tr", null, h("td", null, dateLabel(w.week, { day: "numeric", month: "short" })), h("td", { class: "r" }, `${w.days_logged}/${w.days}`),
      h("td", { class: "r num" }, w.kcal == null ? "—" : fmt(w.kcal)), h("td", { class: "r num faint" }, w.approx_pct == null ? "—" : w.approx_pct + " %"), h("td", { class: "r num" }, w.protein_g == null ? "—" : fmt(w.protein_g)),
      h("td", { class: "r num" }, w.carbs_g == null ? "—" : fmt(w.carbs_g)), h("td", { class: "r num" }, w.fat_g == null ? "—" : fmt(w.fat_g)),
      h("td", { class: "r num" }, w.weight == null ? "—" : fmt(w.weight, 2)), h("td", { class: "r num" }, signed(w.weight_delta, 2)),
      h("td", { class: "r num" }, w.tdee == null ? "—" : fmt(w.tdee)), h("td", { class: "r num" }, signed(w.balance))))));
}

function daysTable(hist) {
  if (!hist.length) return h("div", { class: "muted" }, "Sin días registrados.");
  return h("div", { class: "tbl-wrap" }, h("table", { class: "t" },
    h("tr", null, ...["Día", "", "kcal", "P", "C", "G", "Peso", "Media 7d", "Pasos", "Gasto", "Balance"].map((x, i) => h("th", { class: i > 1 ? "r" : "" }, x))),
    [...hist].reverse().map((d) => {
      const m = d.missing || [], mk = (f) => (m.includes(f) ? "*" : "");
      return h("tr", { class: "click", onclick: () => goDay(d.date) }, h("td", null, dateLabel(d.date, { weekday: "short", day: "numeric", month: "short" })),
        h("td", null, d.status === "cerrado" ? h("span", { class: "pill closed", title: "Cerrado" }, icon("lock")) : ""),
        h("td", { class: "r num" }, d.entries ? fmt(d.kcal) + mk("kcal") : "—"), h("td", { class: "r num" }, d.entries ? fmt(d.protein_g) + mk("protein_g") : "—"),
        h("td", { class: "r num" }, d.entries ? fmt(d.carbs_g) + mk("carbs_g") : "—"), h("td", { class: "r num" }, d.entries ? fmt(d.fat_g) + mk("fat_g") : "—"),
        h("td", { class: "r num" }, d.weight_kg == null ? "—" : fmt(d.weight_kg, 1)), h("td", { class: "r num" }, d.avg7 == null ? "—" : fmt(d.avg7, 2)),
        h("td", { class: "r num" }, d.steps == null ? "—" : fmt(d.steps)), h("td", { class: "r num" }, fmt(d.tdee) + (d.tdee_complete ? "" : "*")),
        h("td", { class: "r num" }, d.entries ? signed(d.balance) : "—"));
    })));
}

// ----------------------------------------------------------------- ajustes
function hevyBox() {
  const box = h("div");
  const draw = async () => {
    const hv = await api("GET", "/api/hevy").catch(() => ({ configured: false }));
    const key = h("input", { class: "input", type: "password", placeholder: hv.configured ? "Guardada " + hv.key_hint + " · pega otra para cambiarla" : "Pega tu API key de Hevy", autocomplete: "off" });
    const lr = hv.last_result;
    box.replaceChildren(
      h("div", { class: "row" }, h("div", { class: "grow" }, key),
        h("button", { class: "btn", onclick: async () => { if (!key.value.trim()) return; await act(() => api("PUT", "/api/hevy", { api_key: key.value.trim() }), "API key guardada"); draw(); } }, "Guardar"),
        hv.configured ? h("button", { class: "btn primary", onclick: async () => { await hevySync(); draw(); } }, "Sincronizar") : null),
      h("div", { class: "note" }, hv.configured
        ? [`Conectado. Sincroniza solo al arrancar y cada 20 min.`, hv.last_sync ? ` Última: ${hv.last_sync}` : "", lr ? ` (${lr.created} nuevos, ${lr.updated} actualizados)` : "", " · ",
          h("a", { href: "#", onclick: async (e) => { e.preventDefault(); await hevySync(true); draw(); } }, "reimportar todo"), " · ",
          h("a", { href: "#", onclick: async (e) => { e.preventDefault(); await act(() => api("PUT", "/api/hevy", { api_key: "" }), "Hevy desconectado"); draw(); } }, "desconectar")]
        : "Necesita Hevy PRO. Crea la clave en hevy.com/settings?developer (Ajustes → Desarrollador) y pégala aquí. Se guarda solo en este ordenador."));
  };
  draw();
  return box;
}

// ---- Conectar un agente (Claude, ChatGPT, Codex…): conector MCP en <web>/mcp con inicio de sesión (OAuth).
// El agente se conecta él solo: la persona añade la dirección, inicia sesión aquí y pulsa «Permitir».
// Cada agente con su logotipo (web/logos, ver LEEME allí) y su color de marca.
const MCP_URL = () => location.origin + "/mcp";
const AGENTS = [
  { k: "claude", n: "Claude", sub: "Web, escritorio, móvil y Cowork", logo: "claude.png", c: "#d97757",
    steps: () => [["Añádelo en Claude", "«+ Añadir» → «Añadir conector personalizado» → nombre «Salud» y pega la dirección. Lo demás, como viene (Iniciar sesión ahora · Usar la identidad publicada de Claude · sin encabezados) → Añadir.", { href: "https://claude.ai/customize/connectors", t: "Abrir conectores de Claude" }],
      ["Pulsa «Conectar» y luego «Permitir»", ""],
      ["Quita los avisos", "En ese mismo conector, cambia «Requiere aprobación» por «Permitir siempre» (en los dos grupos de herramientas). Si no, te pedirá permiso cada vez que apunte algo."]] },
  { k: "claude-code", n: "Claude Code", sub: "Terminal", logo: "claude-code.png", c: "#d97757",
    steps: (u) => [["Ejecuta en una terminal", "", `claude mcp add --transport http --scope user salud ${u}`],
      ["En Claude Code: /mcp → salud → Authenticate", "y pulsa «Permitir»."]] },
  { k: "chatgpt", n: "ChatGPT", sub: "Modo desarrollador (de pago)", logo: "chatgpt.png", c: "#10a37f",
    steps: () => [["Añádelo en ChatGPT", "Ajustes → Aplicaciones → Avanzado → «Modo de desarrollador» → «Crear» → pega la dirección."],
      ["Pulsa «Crear» y luego «Permitir»", ""]] },
  { k: "codex", n: "Codex", sub: "OpenAI · app o CLI", logo: "codex.svg", c: "#7b6cf6",
    steps: (u) => [["Ejecuta en una terminal", "", `codex mcp add salud --url ${u}`, "codex mcp login salud"], ["Pulsa «Permitir»", ""]] },
  { k: "antigravity", n: "Antigravity", sub: "Google · IDE o CLI", logo: "antigravity.svg", c: "#4285f4",
    steps: (u) => [["Añádelo a su configuración MCP", "", `{"mcpServers": {"salud": {"serverUrl": "${u}"}}}`], ["Pulsa «Permitir» cuando se abra esta web", ""]] },
  { k: "otro", n: "Otro agente", sub: "Que admita MCP", logo: null, c: "#8a8f98",
    steps: () => [["Añade un servidor MCP remoto", "Con la dirección de arriba (HTTP + OAuth)."], ["Pulsa «Permitir» cuando se abra esta web", ""]] },
];
// Agente declarado por el propio agente al conectarse (puede no coincidir con el elegido en la web).
const agentOf = (name) => AGENTS.find((a) => name && (a.k === name || name.startsWith(a.k) || a.n.toLowerCase() === name)) || { k: name || "otro", n: name ? name[0].toUpperCase() + name.slice(1) : "Agente", logo: null, c: "#8a8f98" };
// Plan B para agentes sin MCP: token personal (cabecera Authorization: Bearer en /mcp, o el cliente salud_remoto.py del repositorio).
function agentPrompt(ag, tok) {
  const me = ag.k === "otro" ? "<tu nombre: claude, chatgpt, codex…>" : ag.k;
  return `Usa mi sistema de salud (comida, peso y entrenos): ${location.origin}\n` +
    `Si admites servidores MCP: conecta ${MCP_URL()} con la cabecera «Authorization: Bearer ${tok}».\n` +
    `Si no: clona https://github.com/eulogioqt/salud, guarda el token con «python3 app/salud_remoto.py login ${tok} --agente ${me}» (no lo repitas) y sigue AGENTS.md. ` +
    `Tu entorno necesita salir a internet a ${location.host} y github.com; si no puede, dime qué activar.\n` +
    `Después lee mi contexto (si está vacío, pregúntame mis objetivos).`;
}
const agentConnected = () => !!(S.me && S.me.agente && S.me.agente.connected);
function agentLogo(ag, size = 36) {
  return h("span", { class: "ag-logo", style: { width: size + "px", height: size + "px" } },
    ag.logo ? h("img", { src: "/logos/" + ag.logo, alt: "", width: size, height: size, class: ag.logo.endsWith(".png") ? "full" : "" }) : h("span", { class: "ag-dots" }, "…"));
}
const agentsUsed = () => (S.me && S.me.agente && S.me.agente.agents) || [];
function agentBtn(ag, onclick, connected) {
  return h("button", { class: "agent-btn" + (connected ? " on" : ""), style: { "--ac": ag.c }, onclick, disabled: !!connected }, agentLogo(ag),
    h("span", { class: "ag-t" }, h("b", null, ag.n), h("span", null, ag.sub)), connected ? h("span", { class: "ok-dot" }, "✓") : h("span", { class: "ag-go" }, icon("right")));
}
async function refreshAgents() {
  const r = await api("GET", "/api/token").catch(() => null);
  if (r && S.me) { S.me.agente = r; drawAccount(); if (S.onAgents) S.onAgents(); }
  return r;
}
// Lista de agentes conectados con su logo, último uso y «Desconectar» (borra su token: deja de funcionar al momento).
function agentList(onChange) {
  const a = (S.me && S.me.agente) || {};
  const used = a.agents || [];
  if (!used.length) return h("div", { class: "warn-t" }, "⚠ Ningún agente conectado");
  return h("div", { class: "ag-list" }, used.map((t) => { const ag = agentOf(t.agent || t.kind);
    return h("div", { class: "ag-item" }, agentLogo(ag, 32), h("div", { class: "grow" }, h("b", null, ag.n), h("div", { class: "faint" }, (t.via === "mcp" ? "Conector · " : "Token · ") + `último uso ${t.used}` + (t.kind && t.agent && !(t.agent || "").startsWith(t.kind) ? ` · elegido «${agentOf(t.kind).n}» en la web` : ""))),
      h("button", { class: "btn sm", onclick: async () => { if (!confirm(`¿Desconectar ${ag.n}? Su token dejará de funcionar.`)) return; await api("DELETE", "/api/token/" + t.id); await refreshAgents(); toast(ag.n + " desconectado"); onChange && onChange(); } }, "Desconectar")); }));
}
function copyLine(text, cls = "") {
  const done = h("span", { class: "faint" });
  return h("div", { class: "copy-line " + cls }, h("code", null, text),
    h("button", { class: "btn sm", onclick: async () => { try { await navigator.clipboard.writeText(text); done.textContent = "✓"; setTimeout(() => (done.textContent = ""), 1500); } catch (e) { toast("Cópialo a mano", { error: true }); } } }, "Copiar"), done);
}
function connectAgent() {
  let timer = null;
  const sh = sheet("Conectar un agente", null, null, { onClose: () => clearInterval(timer) });
  const step1 = () => sh.set("Conectar un agente", [
    h("p", { class: "muted", style: { marginTop: 0 } }, "Tu agente podrá apuntar y consultar tus comidas, peso y entrenos, solo en tu cuenta. Se conecta con esta web como una app más: inicias sesión y le das permiso. Puedes desconectarlo cuando quieras."),
    h("div", { class: "agent-grid" }, AGENTS.map((ag) => { const on = ag.k !== "otro" && agentsUsed().some((t) => t.kind === ag.k || t.agent === ag.k);
      return on ? agentBtn({ ...ag, sub: "Conectado" }, null, true) : agentBtn(ag, () => step2(ag)); })),
    agentConnected() ? h("div", null, h("div", { class: "sec-t" }, "Conectados"), agentList(step1)) : null]);
  const watch = async (status, ag, doneN) => {
    await refreshAgents();
    const before = new Set(((S.me && S.me.agente && S.me.agente.agents) || []).map((t) => t.id));
    clearInterval(timer);
    timer = setInterval(async () => {
      const r = await refreshAgents();
      const t = r && (r.agents || []).find((x) => !before.has(x.id));
      if (t) {
        clearInterval(timer); const real = agentOf(t.agent || t.kind);
        status.replaceChildren(agentLogo(real, 22), h("span", null, `Conectado: ${real.n}` + (t.agent && ag.k !== "otro" && !t.agent.startsWith(ag.k) ? ` (elegiste ${ag.n})` : "") + ". Ya puedes pedirle cosas."));
        status.classList.add("done"); if (doneN) { doneN.textContent = "✓"; doneN.classList.add("ok"); }
        const nm = sh.el.querySelector(".no-mcp"); if (nm) nm.closest(".sheet-f").classList.add("hidden");
      }
    }, 3000);
  };
  const step2 = (ag) => {
    const status = h("div", { class: "agent-wait soft" }, "Cuando pulses «Permitir», aquí pondrá «Conectado».");
    const doneN = h("span", { class: "n" }, String(ag.steps(MCP_URL()).length + 1));
    const u = MCP_URL();
    const steps = ag.steps(u);
    const extra = (x) => (typeof x === "object" ? h("a", { class: "btn sm ext", href: x.href, target: "_blank", rel: "noopener" }, x.t, " ↗")
      : /^(claude|codex|\{)/.test(x) ? copyLine(x) : h("div", { class: "muted" }, x));
    const noMcp = async () => {
      let tok; try { tok = (await api("POST", "/api/token", { kind: ag.k })).token; } catch (e) { toast(e.message, { error: true }); return; }
      sh.set("Conectar con un token", [h("p", { class: "muted", style: { marginTop: 0 } }, "Para agentes sin conectores. Pégale este mensaje a tu agente; el token solo se muestra ahora."),
        h("textarea", { class: "input mono-ta", rows: 8, readonly: true, onclick: (e) => e.target.select() }, agentPrompt(ag, tok))],
        [h("span", { class: "grow" }), h("button", { class: "btn primary", onclick: async (e) => { try { await navigator.clipboard.writeText(agentPrompt(ag, tok)); e.target.textContent = "✓ Copiado"; } catch (x) { toast("Cópialo a mano", { error: true }); } } }, "Copiar mensaje")],
        { back: () => step2(ag) });
    };
    sh.set("Conectar " + ag.n, [
      copyLine(u, "big"),
      h("div", { class: "agent-steps simple" },
        steps.map(([t, d, ...rest], i) => h("div", { class: "ast" }, h("span", { class: "n" }, String(i + 1)),
          h("div", null, h("b", null, t), d ? h("div", { class: "muted" }, d) : null, rest.map(extra)))),
        h("div", { class: "ast" }, doneN, h("div", null, h("b", null, "Escríbele en cualquier chat"), h("div", { class: "muted" }, "«Apunta mi desayuno», «¿cuánto llevo hoy?», «cierra el día»…"), status)))],
      [h("span", { class: "grow" }), h("button", { class: "btn ghost sm no-mcp", onclick: noMcp }, "Mi agente no tiene conectores")],
      { back: step1, titleExtra: agentLogo(ag, 26) });
    watch(status, ag, doneN);
  };
  step1();
}
function agentRow() {
  const box = h("div");
  const draw = () => box.replaceChildren(agentList(draw), h("div", { class: "row", style: { marginTop: "8px", justifyContent: "flex-end" } }, h("button", { class: "btn primary", onclick: connectAgent }, agentConnected() ? "Conectar otro" : "Conectar un agente")));
  draw();
  return box;
}

// ---- Objetivo diario: fijo o según el gasto del día (kcal = gasto estimado ± diferencia; proteína por kg, grasa en %)
const goalName = (off) => (off == null ? "" : off < -50 ? `déficit de ${fmt(-off)} kcal` : off > 50 ? `superávit de ${fmt(off)} kcal` : "mantenimiento");
const tgLine = (t) => (t && t.kcal ? `${fmt(t.kcal)} kcal · P ${fmt(t.protein_g)} · C ${fmt(t.carbs_g)} · G ${fmt(t.fat_mid_g)} g` : "—");
function targetCard(tg, onSaved) {
  const dyn = tg && tg.mode === "gasto";
  return h("button", { class: "tg-card", onclick: () => targetSheet(tg, onSaved) },
    h("span", { class: "sic e" }, dyn ? "🔥" : "🎯"),
    h("div", { class: "grow" }, h("b", null, !tg || !tg.mode ? "Sin objetivo" : dyn ? "Según tu gasto · " + goalName(tg.kcal_offset) : "Fijo"),
      h("div", { class: "faint" }, (dyn ? "Hoy: " : "") + tgLine(tg) + (dyn ? ` · P ${fmt(tg.protein_per_kg, 1)} g/kg · G ${fmt((tg.fat_min_pct + tg.fat_max_pct) / 2)} %` : ""))),
    h("span", { class: "lnk" }, "Cambiar ›"));
}
function targetSheet(tg, onSaved) {
  tg = tg || {};
  let mode = tg.mode === "gasto" ? "gasto" : "fijo";
  const off = numIn(tg.kcal_offset ?? -300, "0"), ppk = numIn(tg.protein_per_kg ?? 2, "2"), fpct = numIn(tg.fat_min_pct != null ? (tg.fat_min_pct + tg.fat_max_pct) / 2 : 30, "30");
  const kc = numIn(tg.mode === "gasto" ? null : tg.kcal), p = numIn(tg.mode === "gasto" ? null : tg.protein_g), fg = numIn(tg.mode === "gasto" ? null : tg.fat_mid_g);
  const vf = h("input", { class: "input", type: "date", value: todayISO() });
  const prev = h("div", { class: "tg-prev" }), body = h("div");
  const presets = [[-500, "Perder", "≈ −0,45 kg/sem"], [-300, "Perder suave", "≈ −0,3 kg/sem"], [0, "Mantener", "comer lo que gastas"], [250, "Ganar", "≈ +0,2 kg/sem"]];
  const pills = h("div", { class: "tg-pre" });
  const drawPills = () => pills.replaceChildren(...presets.map(([v_, l, d]) => h("button", { class: "tg-p" + (parseNum(off.value) === v_ ? " on" : ""), onclick: () => { off.value = String(v_); drawPills(); upd(); } },
    h("b", null, l), h("span", null, v_ === 0 ? "±0 kcal" : signed(v_) + " kcal"), h("em", null, d))));
  const payload = () => mode === "gasto"
    ? { mode, kcal_offset: parseNum(off.value), protein_per_kg: parseNum(ppk.value), fat_min_pct: parseNum(fpct.value), fat_max_pct: parseNum(fpct.value) }
    : { mode, kcal: parseNum(kc.value), protein_g: parseNum(p.value), fat_min_g: parseNum(fg.value), fat_max_g: parseNum(fg.value) };
  let timer = null;
  const upd = () => { clearTimeout(timer); timer = setTimeout(async () => {
    try {
      const r = await api("POST", "/api/targets/preview", payload());
      if (r.dynamic_error) { prev.className = "tg-prev err"; prev.replaceChildren(r.dynamic_error); return; }
      prev.className = "tg-prev";
      prev.replaceChildren(...[h("span", { class: "faint" }, mode === "gasto" ? "Hoy te saldría" : "Tu objetivo"),
        h("div", { class: "tg-big num" }, fmt(r.kcal), h("small", null, " kcal")),
        h("div", { class: "mchips num" }, h("i", { class: "p" }, fmt(r.protein_g) + " g"), h("i", { class: "c" }, fmt(r.carbs_g) + " g"), h("i", { class: "g" }, fmt(r.fat_mid_g) + " g")),
        mode === "gasto" ? h("div", { class: "faint tg-why" }, `Gasto estimado ${fmt(r.base_kcal)} kcal sin contar la digestión → comer ${fmt(r.kcal)} kcal para quedar en ${signed(r.kcal_offset || 0)} kcal de balance.`,
          r.steps_pending ? ` Aún no hay pasos de hoy: cuento ${r.projected_steps != null ? "tu media (" + fmt(r.projected_steps) + ")" : "0"} y se ajusta al apuntarlos.` : "", ` Proteína con ${fmt(r.weight_kg, 1)} kg.`) : null].filter(Boolean));
    } catch (e) { prev.className = "tg-prev err"; prev.replaceChildren(e.message); }
  }, 250); };
  [off, ppk, fpct, kc, p, fg].forEach((x) => x.addEventListener("input", () => { drawPills(); upd(); }));
  const seg = h("div", { class: "seg tg-seg" });
  const draw = () => {
    seg.replaceChildren(...[["gasto", "Según mi gasto"], ["fijo", "Fijo"]].map(([k, l]) => h("button", { class: mode === k ? "on" : "", onclick: () => { mode = k; draw(); } }, l)));
    body.replaceChildren(...(mode === "gasto" ? [
      h("p", { class: "muted tg-help" }, "Cada día el objetivo se ajusta a lo que gastas (metabolismo, pasos y entreno) más o menos la diferencia que elijas. Si entrenas o andas más, puedes comer más."),
      pills,
      h("div", { class: "grid3 tg-g" }, h("div", null, h("label", { class: "f" }, "Diferencia (kcal/día)"), off), h("div", null, h("label", { class: "f" }, "Proteína (g por kg)"), ppk),
        h("div", null, h("label", { class: "f" }, "Grasa (% de las kcal)"), fpct)),
      h("div", { class: "faint tg-help" }, "Proteína: 1,6–2,2 g/kg para mantener o ganar músculo. Grasa: 25–30 % es lo habitual. Los carbohidratos son el resto."),
    ] : [
      h("p", { class: "muted tg-help" }, "Las mismas cifras todos los días. Los carbohidratos son lo que queda."),
      h("div", { class: "grid3" }, h("div", null, h("label", { class: "f" }, "kcal"), kc), h("div", null, h("label", { class: "f" }, "Proteína g"), p), h("div", null, h("label", { class: "f" }, "Grasa g"), fg)),
    ]), prev);
    drawPills(); upd();
  };
  const sh = sheet("Objetivo diario", [seg, body], [h("span", { class: "grow" }),
    h("button", { class: "btn primary", onclick: async () => {
      try { await api("POST", "/api/targets", { ...payload(), valid_from: vf.value, provisional: true, note: "Editado desde la web" }); } catch (e) { toast(e.message, { error: true }); return; }
      toast("Objetivo guardado"); sh.close(); await refresh(); onSaved && onSaved(); } }, "Guardar")]);
  draw();
}
// ---- Primeros pasos (obligatorio la primera vez): tus datos → conectar tu agente (y él hace el resto) o, sin agente, objetivo y Hevy a mano
async function welcomeSheet() {
  const data = await api("GET", "/api/settings"); const st = data.settings;
  let page = "datos", path = null;
  const sexo = { v: st.sexo || "" };
  const born = h("input", { class: "input", type: "date", value: st.fecha_nacimiento || "" });
  const alt = numIn(st.altura_cm || null, "cm"), kg = numIn(st.peso_estimado_kg || null, "kg");
  const hevyOut = h("div", { class: "wz-res" });
  const order = () => (path === "manual" ? ["datos", "agente", "objetivo", "hevy"] : ["datos", "agente", "listo"]);
  const finish = async () => { await api("PUT", "/api/notes/bienvenida", { body: "hecho " + todayISO() }).catch(() => {}); done = true; sh.close(); await refresh(); };
  let done = false;
  const go = (p) => { page = p; draw(); };
  const P = {
    datos: () => ["Tus datos", [
      h("p", { class: "muted wz-p" }, "Para calcular cuánto gastas al día. Solo lo ves tú."),
      h("div", { class: "seg wz-seg" }, [["H", "Hombre"], ["M", "Mujer"]].map(([k, l]) => h("button", { class: sexo.v === k ? "on" : "", onclick: (e) => { sexo.v = k; e.target.parentNode.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target)); } }, l))),
      h("div", { class: "grid3 wz-g" }, h("div", null, h("label", { class: "f" }, "Fecha de nacimiento"), born), h("div", null, h("label", { class: "f" }, "Altura (cm)"), alt), h("div", null, h("label", { class: "f" }, "Peso aproximado (kg)"), kg))],
      [h("span", { class: "grow" }), h("button", { class: "btn primary", onclick: async () => {
        if (!sexo.v || !born.value || !(parseNum(alt.value) > 0) || !(parseNum(kg.value) > 0)) return toast("Rellena los cuatro datos", { error: true });
        try { await api("PUT", "/api/settings", { sexo: sexo.v, fecha_nacimiento: born.value, altura_cm: String(parseNum(alt.value)), peso_estimado_kg: String(parseNum(kg.value)) }); } catch (e) { return toast(e.message, { error: true }); }
        go("agente"); } }, "Siguiente")]],
    agente: () => ["Tu agente", [
      h("p", { class: "muted wz-p" }, "Con tu Claude (u otro agente) apuntas comidas hablando, le mandas capturas de Hevy o de la báscula, y él te configura el objetivo y vuelca tu historial."),
      agentConnected() ? h("div", { class: "agent-wait soft done", style: { marginBottom: "12px" } }, "✓ Agente conectado.") : null,
      h("button", { class: "wz-choice main", onclick: () => { path = "agente"; if (agentConnected()) go("listo"); else connectAgent(); } },
        h("b", null, agentConnected() ? "Seguir con mi agente" : "Conectar mi agente"), h("span", null, "Recomendado: lo demás lo haces hablando con él.")),
      h("button", { class: "wz-choice", onclick: () => { path = "manual"; go("objetivo"); } }, h("b", null, "Prefiero hacerlo a mano"), h("span", null, "Eliges tu objetivo y subes tu Hevy aquí. Puedes conectar un agente cuando quieras."))],
      [h("button", { class: "btn ghost", onclick: () => go("datos") }, "Atrás")]],
    listo: () => ["¡Listo!", [
      h("div", { class: "wz-big" }, "💬"),
      h("p", { class: "wz-p", style: { fontSize: "15px" } }, "Abre un chat nuevo con tu agente y dile:"),
      copyLine("Empezar con Salud", "big"),
      h("p", { class: "muted wz-p", style: { marginTop: "12px" } }, "Te preguntará qué quieres conseguir, te dejará fijado el objetivo y te ayudará a volcar tu historial de Hevy. Después ya puedes usarlo: «apunta mi desayuno», «cierra el día»…")],
      [h("button", { class: "btn ghost", onclick: () => go("agente") }, "Atrás"), h("span", { class: "grow" }), h("button", { class: "btn primary", onclick: finish }, "Terminar")]],
    objetivo: () => ["Tu objetivo", [
      h("p", { class: "muted wz-p" }, "Recomendado: según tu gasto. Cada día se ajusta a lo que gastas (metabolismo, pasos y entreno) más o menos lo que elijas."),
      targetCard(data.current_target, async () => { const d2 = await api("GET", "/api/settings"); data.current_target = d2.current_target; draw(); })],
      [h("button", { class: "btn ghost", onclick: () => go("agente") }, "Atrás"), h("span", { class: "grow" }), h("button", { class: "btn primary", onclick: () => go("hevy") }, "Siguiente")]],
    hevy: () => ["Tus entrenos de Hevy", [
      h("p", { class: "muted wz-p" }, "Opcional. Si usas Hevy, trae tu historial: récords, rangos y progreso salen de ahí."),
      h("ol", { class: "wz-ol" }, h("li", null, "En Hevy: ", h("b", null, "Perfil → ⚙ Ajustes → Exportar e importar datos → Exportar entrenos"), "."), h("li", null, "Sube aquí el archivo .csv:")),
      h("button", { class: "btn", onclick: () => { const fi = h("input", { type: "file", accept: ".csv,.json,text/csv,application/json" });
        fi.addEventListener("change", async () => { const f = fi.files[0]; if (!f) return; hevyOut.textContent = "Importando…";
          try { const r = await api("POST", "/api/hevy/import-csv", { csv: await f.text() }); hevyOut.textContent = `✓ ${r.created} entrenos importados` + (r.updated ? ` · ${r.updated} actualizados` : ""); } catch (e) { hevyOut.textContent = e.message; } });
        fi.click(); } }, "Subir archivo de Hevy"), hevyOut],
      [h("button", { class: "btn ghost", onclick: () => go("objetivo") }, "Atrás"), h("span", { class: "grow" }), h("button", { class: "btn primary", onclick: finish }, "Terminar")]],
  };
  const sh = sheet("Primeros pasos", null, null, { onClose: () => { S.onAgents = null; if (!done) setTimeout(() => api("GET", "/api/notes/bienvenida").then((n) => { if (!n.body) toast("Te lo volveré a mostrar hasta que termines los primeros pasos"); }).catch(() => {}), 50); } });
  let wasOn = agentConnected();
  S.onAgents = () => { if (agentConnected() !== wasOn) { wasOn = agentConnected(); if (page === "agente" && wasOn && path === "agente") go("listo"); else if (page === "agente") draw(); } };
  const draw = () => {
    const [title, body, foot] = P[page]();
    const ord = order(), i = ord.indexOf(page);
    sh.set(title, [h("div", { class: "wz-dots" }, ord.map((_, k) => h("i", { class: k === i ? "on" : k < i ? "done" : "" }))), ...body], foot, { sub: `Paso ${i + 1} de ${ord.length}` });
  };
  draw();
}
async function settingsSheet() {
  const data = await api("GET", "/api/settings");
  const tg = data.current_target || {}, st = data.settings;
  const prof = [["altura_cm", "Altura (cm)"], ["fecha_nacimiento", "Fecha de nacimiento"], ["sexo", "Sexo (H/M)"], ["peso_estimado_kg", "Peso estimado sin pesajes (kg)"], ]
    .map(([k, l]) => [k, l, k === "fecha_nacimiento" ? h("input", { class: "input", type: "date", value: st[k] || "" }) : h("input", { class: "input" + (k === "sexo" ? "" : " num"), value: st[k] })]);
  const hist = h("table", { class: "t" }, h("tr", null, ...["Desde", "kcal", "P", "G", ""].map((x) => h("th", null, x))),
    [...data.targets].reverse().map((t) => h("tr", null, h("td", null, t.valid_from), ...(t.mode === "gasto"
      ? [h("td", { colspan: 3 }, `Según gasto ${signed(t.kcal_offset || 0)} kcal · P ${fmt(t.protein_per_kg, 1)} g/kg · G ${fmt(((t.fat_min_pct || 0) + (t.fat_max_pct || 0)) / 2)} %`)]
      : [h("td", null, fmt(t.kcal)), h("td", null, fmt(t.protein_g)), h("td", null, fmt(((t.fat_min_g || 0) + (t.fat_max_g || t.fat_min_g || 0)) / 2))]), h("td", { class: "faint" }, t.provisional ? "provisional" : ""))));
  const sh = sheet("Ajustes", [
    h("div", { class: "sec-t" }, "Objetivo diario"),
    targetCard(tg, () => { sh.close(); settingsSheet(); }),
    h("details", { style: { marginTop: "8px" } }, h("summary", null, "Historial de objetivos"), hist),
    h("div", { class: "sec-t" }, "Lo que crea tu agente"),
    h("label", { class: "tg-card", style: { cursor: "pointer" } }, h("input", { type: "checkbox", checked: st.revisar_agente === "1", style: { width: "18px", height: "18px" },
      onchange: async (e) => { await act(() => api("PUT", "/api/settings", { revisar_agente: e.target.checked ? "1" : "0" }), e.target.checked ? "Lo revisarás en Comida" : "Se acepta solo"); } }),
      h("div", { class: "grow" }, h("b", null, "Revisar antes de usarlo"), h("div", { class: "faint" }, "Los productos, recetas y comidas habituales que cree tu agente quedan «por revisar» en Comida hasta que los aceptes. Si lo desactivas, se pueden usar al momento."))),
    h("div", { class: "sec-t" }, "Perfil para el gasto estimado"),
    h("div", { class: "grid4" }, prof.map(([k, l, inp]) => h("div", null, h("label", { class: "f" }, l), inp))),
    h("div", { class: "row", style: { marginTop: "8px", justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: async () => {
      const body = {}; for (const [k, , inp] of prof) body[k] = k === "sexo" ? inp.value.trim().toUpperCase() : k === "fecha_nacimiento" ? inp.value : (parseNum(inp.value) == null ? "" : String(parseNum(inp.value)));
      await act(() => api("PUT", "/api/settings", body), "Perfil guardado"); sh.close();
    } }, "Guardar perfil")),
    h("div", { class: "sec-t" }, "Datos"),
    h("div", { class: "row wrap" }, h("a", { class: "btn", href: "/api/export.zip" }, "Exportar todo (ZIP: JSON + CSV)"),
      h("button", { class: "btn", onclick: async () => { const r = await api("POST", "/api/backup", { reason: "manual" }); toast("Copia creada: " + r.path.split(/[\\/]/).pop()); } }, "Copia de seguridad ahora")),
    h("div", { class: "note" }, S.me ? "Las copias se guardan en el servidor, junto a tu base de datos (automáticas al arrancar y una vez al día)." : "Las copias se guardan en la carpeta Salud\\backups (automáticas al arrancar y una vez al día). La base de datos es Salud\\data\\salud.db."),
    S.me ? h("div", { class: "sec-t" }, "Cuenta") : null,
    S.me ? h("div", { class: "row" }, h("span", null, "Sesión iniciada como ", h("b", null, S.me.nombre || S.me.usuario)), h("span", { class: "grow" }),
      h("button", { class: "btn", onclick: async () => { await api("POST", "/api/logout", {}); location.href = "/login"; } }, "Cerrar sesión")) : null,
    S.me ? h("div", { class: "sec-t" }, "Agente (Claude, Codex, Gemini…)") : null,
    S.me ? agentRow() : null,
  ], null, { wide: true });
}
// Menú de cuenta (arriba a la derecha): nombre, Ajustes y Cerrar sesión
function drawAccount() {
  const b = $("#btn-acct"); if (!b) return;
  const name = S.me ? (S.me.nombre || S.me.usuario) : "Local";
  b.replaceChildren(h("span", { class: "av" + (S.me ? "" : " local") }, S.me ? name[0].toUpperCase() : icon("lock"), S.me && !agentConnected() ? h("span", { class: "av-alert", title: "Conecta tu agente" }, "!") : null), h("span", { class: "an" }, name), icon("chev"));
}
function accountMenu() {
  const old = document.querySelector(".acct-menu"); if (old) { old.remove(); return; }
  const name = S.me ? (S.me.nombre || S.me.usuario) : "Este ordenador";
  const menu = h("div", { class: "acct-menu" },
    h("div", { class: "am-h" }, h("span", { class: "av big" + (S.me ? "" : " local") }, S.me ? name[0].toUpperCase() : icon("lock")),
      h("div", null, h("b", null, name), h("span", null, S.me ? "Sesión iniciada · @" + S.me.usuario : "Versión local (sin cuentas)"))),
    S.me ? h("button", { class: agentConnected() ? "" : "warn", onclick: () => { menu.remove(); connectionsSheet().catch((e) => toast(e.message, { error: true })); } }, icon("plug"),
      "Conexiones", agentConnected() ? h("span", { class: "ag-mini-list" }, S.me.agente.agents.slice(0, 3).map((t) => agentLogo(agentOf(t.agent || t.kind), 18))) : h("span", { class: "alert-dot" }, "!")) : null,
    h("button", { onclick: () => { menu.remove(); settingsSheet().catch((e) => toast(e.message, { error: true })); } }, icon("gear"), "Ajustes"),
    S.me ? h("button", { onclick: () => { menu.remove(); welcomeSheet().catch((e) => toast(e.message, { error: true })); } }, icon("flag"), "Primeros pasos") : null,
    S.me ? h("button", { class: "danger", onclick: async () => { await api("POST", "/api/logout", {}); location.href = "/login"; } }, icon("out"), "Cerrar sesión") : null);
  document.body.append(menu);
  const r = $("#btn-acct").getBoundingClientRect();
  menu.style.top = r.bottom + 6 + "px"; menu.style.right = Math.max(8, window.innerWidth - r.right) + "px";
  setTimeout(() => document.addEventListener("click", function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", off); } }), 0);
}
$("#btn-acct").addEventListener("click", (e) => { e.stopPropagation(); accountMenu(); });
drawAccount();

document.addEventListener("keydown", (e) => {
  if (S.view !== "hoy" || S.sheetOpen || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowLeft") goDay(addDays(S.date, -1));
  if (e.key === "ArrowRight") goDay(addDays(S.date, 1));
});

// En modo servidor, saber quién ha iniciado sesión (en local /api/me no existe y no pasa nada)
fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(async (m) => {
  if (!m || !m.usuario) return;
  S.me = m; drawAccount(); loadPasos();
  const n = await api("GET", "/api/notes/bienvenida").catch(() => null);  // primeros pasos hasta terminarlos
  if (n && !/^hecho/.test(n.body || "")) setTimeout(() => welcomeSheet().catch(() => {}), 600);
}).catch(() => {});
route();
