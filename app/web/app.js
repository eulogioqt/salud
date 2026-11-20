"use strict";
/* Salud — interfaz web. Sin dependencias ni compilación. */

// ---------------------------------------------------------------- utilidades
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  // Sin autocompletar del navegador (la barra de contraseñas/direcciones de Google tapa parte de la pantalla sobre el teclado)
  if (tag === "input" || tag === "textarea") { el.setAttribute("autocomplete", "off"); el.setAttribute("autocorrect", "off"); }
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
const kgf = (x) => x == null || Number.isNaN(x) ? "?" : Number(x).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedKg = (x) => x == null ? "—" : (x > 0 ? "+" : x < 0 ? "−" : "") + kgf(Math.abs(x));
const signed = (x, nd = 0) => x == null ? "—" : (x > 0 ? "+" : x < 0 ? "−" : "") + fmt(Math.abs(x), nd);
const parseNum = (v) => { if (v == null) return null; v = String(v).trim().replace(",", "."); if (v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const pad = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoLocal(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return isoLocal(new Date(y, m - 1, d + n)); };
const dateLabel = (iso, opts = { weekday: "long", day: "numeric", month: "short" }) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("es-ES", opts); };
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Nombre que se ve en las listas: «Cerveza (Cruzcampo)» (lo calcula el servidor); al buscar cuenta también la marca
const dname = (f) => (f && (f.display || f.name)) || "";
const foodText = (f) => norm([f.name, f.original_name, f.brand, f.notes].filter(Boolean).join(" "));  // la descripción también se busca
const FIELDS = ["kcal", "protein_g", "carbs_g", "fat_g"];
const MEALS = [["desayuno", "Desayuno"], ["almuerzo", "Almuerzo"], ["merienda", "Merienda"], ["cena", "Cena"], ["otro", "Otro"]];
// Lo que no viene de una etiqueta o del histórico es «Aprox.» (aproximado, estimación de comida fuera o sin datos oficiales)
// Los valores son de la etiqueta (a mano o de Open Food Facts) o estimados; los estados antiguos cuentan como estimados
const QUAL = { etiqueta: "Etiqueta", historico: "Estimación", provisional: "Estimación", estimacion: "Estimación", pendiente: "Estimación" };
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
const S = { view: "hoy", date: todayISO(), day: null, catalog: null, rev: null, progress: null, libFilter: null, libQuery: "", progDays: 30, energyOpen: false, sheetOpen: 0, pendingRefresh: false };

// Fotos que el servidor está descargando (de Open Food Facts): hasta que llegan, en su sitio sale un cargando
const PH_LOADING = "__cargando__";
async function loadCatalog() {
  S.catalog = await api("GET", "/api/catalog?all=1");
  for (const id of [...(S.photoPending || [])]) {
    const f = (S.catalog.foods || []).find((x) => x.id === id);
    if (f && !f.image) f.image = PH_LOADING; else S.photoPending.delete(id);
  }
}
const phLoading = (lg) => h("div", { class: "ph-load" + (lg ? " lg" : "") }, h("i", { class: "spin" }));
async function loadDay() {
  let st = await api("GET", "/api/state?date=" + S.date);
  // Al entrar sin fecha: si hoy aún no tiene nada y queda un día anterior sin cerrar, se abre ese (el de anoche, normalmente)
  if (S.autoDay) {
    const od = st.open_days || [], want = od.length && !st.today_entry_count ? od[od.length - 1] : st.today;
    if (want !== st.date) { S.date = want; st = await api("GET", "/api/state?date=" + want); }
    st.autoDate = st.date;
    // Se abre otro día: queda en la URL (#/day/…) y ya no salta solo a hoy después
    if (st.date !== st.today) { S.autoDay = false; if (/^#\/(today|hoy)\b/.test(location.hash) || !location.hash) history.replaceState(history.state, "", "#/day/" + st.date); }
  }
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
const VIEW_OF = { today: "hoy", day: "hoy", dia: "hoy", training: "entreno", food: "biblioteca", comida: "biblioteca", progress: "progreso", profile: "perfil", perfil: "perfil" };
function route() {
  [...OPEN_SHEETS].forEach((c) => c());
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  // Direcciones en inglés: #/today (hoy) · #/day/AAAA-MM-DD (otro día) · #/training · #/food · #/progress.
  // Las antiguas en español (#/hoy, #/hoy/AAAA-MM-DD, #/dia/…, #/entreno, #/comida, #/biblioteca, #/progreso) siguen valiendo.
  const alias = VIEW_OF;
  S.view = alias[parts[0]] || (["hoy", "entreno", "biblioteca", "progreso"].includes(parts[0]) ? parts[0] : "hoy");
  if (S.view === "perfil" && matchMedia("(min-width: 900px)").matches) { S.view = "hoy"; history.replaceState(history.state, "", "#/today"); }  // en el ordenador, la cuenta está en la barra lateral
  const EN = { hoy: "today", entreno: "training", biblioteca: "food", comida: "food", progreso: "progress" };
  if (EN[parts[0]] && !parts[1]) history.replaceState(history.state, "", "#/" + EN[parts[0]]);
  if (S.view === "hoy") {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || "") ? parts[1] : null;
    if (d && d >= todayISO()) { history.replaceState(history.state, "", "#/today"); S.noAuto = true; }
    else if (d && parts[0] !== "day") history.replaceState(history.state, "", "#/day/" + d);
    const exact = d && d < todayISO();
    // Al entrar en #/today a secas se puede abrir el día de anoche sin cerrar; si se llega con las flechas, es hoy
    S.autoDay = !exact && !S.noAuto; S.noAuto = false;
    S.date = exact ? d : S.autoDay && S.day && S.day.autoDate ? S.day.autoDate : todayISO();
  }
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.v === S.view));
  $("#view").classList.toggle("wide", S.view !== "hoy");
  // Cambio de pestaña al instante: lo que ya tenemos (y se actualiza detrás) o un esqueleto de carga, nunca la pestaña anterior
  const cached = S.view === "perfil" || (S.view === "hoy" && S.day && S.day.date === S.date) || (S.view === "biblioteca" && S.catalog) || (S.view === "entreno" && S.training) || (S.view === "progreso" && S.progress);
  if (cached) render(); else $("#view").replaceChildren(skeleton(S.view));
  refresh().catch((e) => { $("#view").replaceChildren(h("div", { class: "card panel" }, h("h3", null, "No se puede conectar con el servidor"), h("div", { class: "muted" }, e.message))); });
}
let lastView = null;
window.addEventListener("hashchange", () => { const v0 = VIEW_OF[location.hash.split("/")[1]] || location.hash.split("/")[1] || "hoy"; if (v0 !== lastView) window.scrollTo(0, 0); lastView = v0; route(); });
// No se puede ir a días que aún no han llegado
const goDay = (d) => { const t = (S.day && S.day.today) || todayISO(); if (d > t) return; const to = d >= t ? "#/today" : "#/day/" + d; if (d >= t) S.noAuto = true; histIdle(() => { if (location.hash === to) route(); else location.hash = to; }); };

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
  else if (S.view === "perfil") root.replaceChildren(viewProfile());
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
// Teclado del móvil: las hojas se quedan en la parte visible (encima del teclado) también donde el navegador no redimensiona
if (window.visualViewport) {
  const vv = window.visualViewport, root = document.documentElement;
  const upd = () => { root.style.setProperty("--vvh", vv.height + "px"); root.style.setProperty("--vvt", vv.offsetTop + "px"); };
  vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd); upd();
}
// Botón «atrás» del móvil o del navegador: cierra la hoja de arriba (cada hoja abierta es un paso en el historial).
// Al cerrarla con la X se quita ese paso; lo que navegue justo después espera a que el historial termine.
let POP_SKIP = 0; const POP_Q = [];
const histIdle = (fn) => { if (POP_SKIP) POP_Q.push(fn); else fn(); };
window.addEventListener("popstate", () => {
  if (POP_SKIP) { POP_SKIP--; if (!POP_SKIP) POP_Q.splice(0).forEach((f) => f()); return; }
  const top = SHEET_STACK[SHEET_STACK.length - 1];
  if (top && top.pop) top.pop();
});
// Doble toque: un botón de acción (Guardar, Añadir, Marcar…) no hace lo mismo dos veces seguidas
document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest ? e.target.closest("button.btn.primary, .sheet-f button.btn, button.rm-ok, .dlg button") : null;
  if (!b) return;
  const now = Date.now();
  if (b._tapAt && now - b._tapAt < 900) { e.stopImmediatePropagation(); e.preventDefault(); return; }
  b._tapAt = now;
}, true);
// Mientras se guarda algo, las fichas no se cierran (ni con la X, ni tocando fuera, ni con atrás)
let SAVING = 0;
function sheet(title, body, footer, opts = {}) {
  if (typeof hideTip === "function") hideTip();  // que no se quede encima el globo del dato que se tocó
  const tkey = opts.key || (typeof title === "string" ? title : null);
  if (tkey && LAST_SHEET && LAST_SHEET.key === tkey && LAST_SHEET.ctl.el.isConnected && !LAST_SHEET.ctl.el.parentNode.classList.contains("closing")
      && Date.now() - LAST_SHEET.t < 1200) return LAST_SHEET.ctl;
  // Los modales se apilan: uno nuevo se abre encima. Si se abre uno que ya estaba más abajo (mismo título o misma clave),
  // se vuelve a ese nivel: se cierran los de encima y él mismo, y se abre de nuevo en su sitio (sin escaleras infinitas).
  const skey = opts.key || tkey;
  if (skey) { const i = SHEET_STACK.findIndex((x) => x.key === skey); if (i >= 0) SHEET_STACK.slice(i).reverse().forEach((x) => x.close(true)); }
  S.sheetOpen++;
  document.body.classList.add("modal-open");
  const bd = h("div", { class: "backdrop" + (opts.center ? " center" : "") + (opts.full ? " full" : "") + (opts.cls ? " " + opts.cls : "") });
  const hid = Math.random().toString(36).slice(2);
  histIdle(() => { try { if (!bd.classList.contains("closing")) history.pushState({ sheet: hid }, ""); } catch (e) { /* sin historial */ } });
  let popped = false;
  const close = (instant) => {
    if (!bd.isConnected || bd.classList.contains("closing")) return;
    if (!popped && history.state && history.state.sheet === hid) { POP_SKIP++; history.back(); }
    OPEN_SHEETS.delete(close);
    const si = SHEET_STACK.findIndex((x) => x.close === close); if (si >= 0) SHEET_STACK.splice(si, 1);
    bd.classList.add("closing"); if (instant === true) bd.style.display = "none";
    S.sheetOpen--; document.removeEventListener("keydown", onKey);
    setTimeout(() => bd.remove(), 140);
    if (!S.sheetOpen) document.body.classList.remove("modal-open");
    if (opts.onClose) opts.onClose();
    if (!S.sheetOpen && S.pendingRefresh) { S.pendingRefresh = false; refresh(); }
  };
  // Fichas de crear o editar datos (opts.guard): si has cambiado algo y la cierras sin guardar, pregunta antes de descartar
  let dirty = false;
  const userClose = async () => {
    if (SAVING) return;
    if (opts.guard && dirty && !(await confirmDiscard())) return;
    close();
  };
  const onKey = (e) => { if (e.key === "Escape" && bd === document.querySelector("#sheet-root .backdrop:last-child")) userClose(); };
  document.addEventListener("keydown", onKey);
  OPEN_SHEETS.add(close);
  SHEET_STACK.push({ key: skey, close, pop: async () => {
    if (SAVING) { try { history.pushState({ sheet: hid }, ""); } catch (e) { /* */ } return; }
    if (opts.guard && dirty && !(await confirmDiscard())) { try { history.pushState({ sheet: hid }, ""); } catch (e) { /* */ } return; }
    popped = true; close(); } });
  const titleEl = h("h2", null, title), subEl = h("div", { class: "sheet-sub" }), descEl = h("div", { class: "sheet-desc hidden" }), extraEl = h("div", { class: "title-x" });
  const backEl = h("button", { class: "icon-btn round hidden", "aria-label": "Atrás" }, icon("back"));
  const bodyEl = h("div", { class: "sheet-b" });
  const footEl = h("div", { class: "sheet-f" });
  const sh = h("div", { class: "sheet" + (opts.wide ? " wide" : "") },
    h("div", { class: "grab" }),
    h("div", { class: "sheet-h" }, backEl, h("div", { class: "sheet-t" }, h("div", { class: "title-row" }, titleEl, extraEl), descEl, subEl),
      h("button", { class: "icon-btn round sheet-x", onclick: userClose, "aria-label": "Cerrar" }, icon("x"))),
    bodyEl, footEl);
  bd.append(sh);
  bd.addEventListener("mousedown", (e) => { if (e.target === bd) userClose(); });
  // En el móvil se cierra arrastrando hacia abajo (desde la cabecera, o desde el contenido si está arriba del todo)
  let drag = null;
  sh.addEventListener("touchstart", (e) => {
    if (!matchMedia("(max-width: 640px)").matches || e.touches.length !== 1 || e.target.closest("input, textarea, select, .sst-cal, canvas")) return;
    const inHead = !!e.target.closest(".grab, .sheet-h");
    if (!inHead && bodyEl.scrollTop > 0) return;
    drag = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: Date.now(), dy: 0, on: false, head: inHead };
  }, { passive: true });
  sh.addEventListener("touchmove", (e) => {
    if (!drag) return;
    const dy = e.touches[0].clientY - drag.y, dx = e.touches[0].clientX - drag.x;
    if (!drag.on) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || (!drag.head && bodyEl.scrollTop > 0)) { drag = null; return; }
      drag.on = true; sh.style.transition = "none";
    }
    drag.dy = Math.max(0, dy); sh.style.transform = `translateY(${drag.dy}px)`; e.preventDefault();
  }, { passive: false });
  const endDrag = async () => {
    if (!drag) return;
    const d = drag; drag = null; if (!d.on) return;
    const fast = d.dy / Math.max(1, Date.now() - d.t) > 0.6;
    sh.style.transition = "transform .18s ease";
    if (d.dy > 110 || (fast && d.dy > 40)) {
      sh.style.transform = "translateY(100%)";
      const before = bd.isConnected; await userClose();
      if (before && bd.isConnected && !bd.classList.contains("closing")) sh.style.transform = "";  // no se cerró (cambios sin guardar)
    } else sh.style.transform = "";
  };
  sh.addEventListener("touchend", endDrag); sh.addEventListener("touchcancel", endDrag);
  if (opts.guard) { const mark = (e) => { if (e.isTrusted) dirty = true; }; bodyEl.addEventListener("input", mark); bodyEl.addEventListener("change", mark); }
  $("#sheet-root").append(bd);
  const ctl = {
    close, el: sh, markDirty: () => { dirty = true; },
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

// Confirmación al salir con cambios sin guardar
function confirmDiscard() {
  return new Promise((res) => {
    const done = (v) => { bd.classList.add("closing"); setTimeout(() => bd.remove(), 140); document.removeEventListener("keydown", key, true); res(v); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
    const bd = h("div", { class: "backdrop dlg-bd", onmousedown: (e) => { if (e.target === bd) done(false); } },
      h("div", { class: "dlg", role: "alertdialog" }, h("b", null, "¿Descartar los cambios?"), h("p", null, "Lo que has cambiado no se guardará."),
        h("div", { class: "dlg-b" }, h("button", { class: "btn", onclick: () => done(false) }, "Seguir editando"), h("button", { class: "btn danger-solid", onclick: () => done(true) }, "Descartar"))));
    document.addEventListener("keydown", key, true);
    $("#sheet-root").append(bd);
  });
}
// Texto de una etiqueta con icono: recortado a la altura de las mayúsculas para que quede centrado con el icono en cualquier fuente
const tx = (s) => h("span", { class: "tx" }, s);
function icon(name) {
  const P = {
    x: "M6 6l12 12M18 6L6 18", back: "M15 18l-6-6 6-6", left: "M15 18l-6-6 6-6", right: "M9 18l6-6-6-6",
    plus: "M12 5v14M5 12h14", ok: "M5.5 12.5l4 4L18.5 7.5", key: "M7.5 15a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM11 11.5h10M18 11.5v3M15 11.5v2", edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3", lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
    star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", chev: "M6 9l6 6 6-6",
    minus: "M5 12h14", image: "M4 5h16v14H4zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM20 15l-5-5-9 9", bars: "M5 20v-7M12 20V5M19 20v-11", barcode: "M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14", camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", out: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
    phone: "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2",
    activity: "M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10",
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
  if (img === PH_LOADING) return h("div", { class: "mono" + (lg ? " lg" : "") }, phLoading(lg));
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
// Valores de la etiqueta (a mano o de Open Food Facts): una marca discreta junto al nombre
// Valores de la etiqueta (a mano o de Open Food Facts): un sello en la esquina de la foto (en las tarjetas y en las listas)
const isLbl = (f) => !!(f && f.status === "etiqueta" && f.kind !== "receta" && !isSupp(f));
const SEAL_SVG = '<svg viewBox="0 0 24 24"><path class="s1" d="M12 2.5l2.3 1.7 2.9-.3 1.1 2.7 2.6 1.4-.6 2.8 1.2 2.6-2.2 1.9-.3 2.9-2.8.6L14.5 21 12 19.6 9.5 21l-1.7-2.3-2.8-.6-.3-2.9-2.2-1.9 1.2-2.6-.6-2.8 2.6-1.4 1.1-2.7 2.9.3z"/><path class="s2" d="M8.4 12.1l2.4 2.4 4.8-5"/></svg>';
const SEAL_TIP = "Valores de la etiqueta\nVerificados: copiados de la etiqueta o de Open Food Facts";
// En las tarjetas: el sello con «Etiqueta» (se entiende sin más); en las listas, solo el sello. Mantener pulsado o pasar el ratón: qué significa
const lblSeal = (big) => h("span", { class: "lbls" + (big ? " big" : ""), "data-tip": SEAL_TIP, html: SEAL_SVG + (big ? "<b>Etiqueta</b>" : "") });
const withSeal = (el, f) => (isLbl(f) ? h("span", { class: "lblw" }, el, lblSeal()) : el);
const lblMark = () => null;
function qBadge(q) { return q && q !== "etiqueta" ? h("span", { class: "q " + q, title: QUAL[q] }, QUAL[q]) : null; }
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
    partyBtn(st),
    closed ? h("span", { class: "pill locked", title: "Día cerrado" }, icon("lock"), h("span", { class: "pl-t" }, "Cerrado")) : h("span", { class: "pill open" }, "Abierto"));
  // Días anteriores sin cerrar: aviso en el propio día (no al añadir, que suele hacerlo el agente)
  const prev = (st.open_days || []).filter((d) => d < st.date);
  const warn = prev.length ? h("div", { class: "openwarn" }, icon("lock"),
    h("span", null, prev.length === 1 ? "Sin cerrar:" : `${prev.length} días sin cerrar:`),
    prev.map((d) => h("button", { class: "ow-d", onclick: () => goDay(d) }, tx(dateLabel(d, { weekday: "short", day: "numeric", month: "short" }))))) : null;
  const wrap = h("div", { class: closed ? "locked" : "" }, head, suppReminders(st), warn, summaryCard(st), bodyStrip(st));
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
  const tg = st.target || {}, closed = st.status === "cerrado", isToday = st.date === st.today;
  const TT = isToday ? "Objetivo de hoy" : "Objetivo del día", EAT = isToday ? " kcal para comer hoy" : " kcal para comer";
  const change = async () => { sh.close(); const d = await api("GET", "/api/settings"); targetSheet(d.current_target, null); };
  const sub = dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" });
  if (!tg.dynamic) {
    const sh = sheet(TT, [h("div", { class: "goal-hero" }, h("b", { class: "num" }, tg.kcal ? fmt(tg.kcal) : "—"), h("span", null, EAT)),
      h("div", { class: "note" }, tg.mode ? `Objetivo fijo: ${fmt(tg.kcal)} kcal todos los días, te muevas lo que te muevas.` : "Aún no tienes objetivo.")],
      [h("span", { class: "grow" }), h("button", { class: "btn", onclick: change }, "Cambiar objetivo")], { sub });
    return;
  }
  // Dos pasos: lo que gastarás hoy (con la digestión de lo que vas a comer) y le quitas el déficit. Así «lo que gastarás»
  // es el mismo gasto que el de Hoy y el desglose cuando comas lo que te queda (spend = comer − déficit).
  const P = tg.base_parts || {}, off = tg.kcal_offset || 0, tef = tg.tef_pct || 0.1;
  const base = tg.base_kcal || 0, eat = tg.kcal, spend = eat - off, dig = spend - base, en = st.energy;
  const step = (n, title, op, val, desc, extra, last) => h("div", { class: "gp-step" + (last ? " last" : "") },
    h("span", { class: "gp-n" }, String(n)),
    h("div", { class: "gp-c" },
      h("div", { class: "gp-h" }, h("span", { class: "gp-t" }, title, op ? h("span", { class: "gp-op num" }, op) : null), h("b", { class: "num" }, fmt(val))),
      desc ? h("div", { class: "gp-s" }, desc) : null, extra || null));
  const sh = sheet(TT, [
    h("div", { class: "goal-hero" }, h("b", { class: "num" }, fmt(eat)), h("span", null, EAT)),
    h("div", { class: "gp" },
      step(1, isToday ? "Lo que gastarás hoy" : "Gasto previsto", null, spend, null, h("div", { class: "gp-parts" }, ...partsBlock([
        ["bmr", "Metabolismo basal", P.bmr || 0, tg.weight_kg ? `en reposo · ${kgf(tg.weight_kg)} kg` : "en reposo"],
        ["neat", "Día a día", P.neat || 0, st.day.neat_kcal == null ? "uno normal hasta que elijas al cerrar" : (st.energy && st.energy.neat_source) || "el que elegiste"],
        ["steps", "Pasos", P.steps || 0, stepsPlanTxt(st)],
        ...((P.exercise_list || []).length ? P.exercise_list.map(exPart) : [["ex", "Entrenos", 0, "ninguno apuntado (no se prevén)"]]),
        ...(P.ajuste ? [["cal", "Ajuste de calibración", P.ajuste, "según cómo cambia tu peso"]] : []),
        ["tef", "Digestión", dig, `${fmt(tef * 100)} % de lo que vas a comer (${fmt(eat)})`]]),
        en && en.total != null && !closed && isToday && (st.totals.kcal || 0) < eat ? h("div", { class: "gp-s gp-tef" },
          `El gasto de Hoy (${fmt(en.total)}) es lo que llevas: llegará a ${fmt(spend)} cuando comas lo que te queda.`)
        // Día cerrado: el previsto cuenta la digestión de lo que tocaba comer; el real, la de lo comido
        : en && en.total != null && closed && Math.round(en.total) !== Math.round(spend) ? h("div", { class: "gp-s gp-tef" },
          `Gasto real: ${fmt(en.total)} kcal, con la digestión de lo comido (${fmt(st.totals.kcal || 0)} kcal).`) : null)),
      step(2, off < 0 ? "Quitas tu déficit" : off > 0 ? "Sumas tu superávit" : "Comes lo mismo que gastas", off ? signed(off, 0) : null, eat,
        off < 0 ? "Comiendo esto, el día acaba en tu déficit." : off > 0 ? "Comiendo esto, el día acaba en tu superávit." : "Comiendo esto, el día acaba en equilibrio.", null, true)),
    !closed ? h("div", { class: "note" }, (tg.steps_pending ? "Los pasos se prevén y el día a día es uno normal" : "El día a día es uno normal")
      + " hasta que cierres el día (por eso el gasto de Hoy lleva *). Al cerrar se ajusta con lo real. Los entrenos cuentan cuando los apuntas.") : null],
    [h("span", { class: "grow" }), h("button", { class: "btn", onclick: change }, "Cambiar objetivo")], { sub });
}
// Con qué pasos cuenta el objetivo y por qué (ver step_projection en el servidor)
function stepsPlanTxt(st) {
  const tg = st.target || {}, sp = tg.steps_plan, P = tg.base_parts || {};
  if (!sp) return tg.steps_pending ? `${fmt(tg.projected_steps || 0)} previstos` : `${fmt(P.steps_n || 0)} reales`;
  const n = fmt(sp.steps || 0), isToday = st.date === st.today;
  if (sp.mode === "manual") return `${n} apuntados a mano`;
  if (sp.mode === "ritmo") {
    const src = sp.rest_label === "un día normal" ? "en un día normal (aún no hay tu historial por horas)" : sp.rest_label === "tus últimos días" ? "según tus últimos días" : sp.rest_label;
    return `${n} previstos: llevas ${fmt(sp.now)} + ~${fmt(sp.rest)} que sueles andar desde las ${sp.from} ${src}`;
  }
  if (sp.mode === "media") return `${n} previstos: ${sp.mean_label || "tu media"}` + (sp.now == null ? (isToday ? " (aún sin pasos de hoy)" : " (sin pasos apuntados)") : ` (llevas ${fmt(sp.now)}: vas por debajo de tu ritmo)`);
  // Los pasos que cuentan para el gasto: el total menos los del entreno (como en el desglose del día)
  return `${fmt(Math.max(0, (sp.steps || 0) - (P.steps_in_acts || 0)))} pasos` + (P.steps_in_acts ? ` (sin los ${fmt(P.steps_in_acts)} del entreno)` : "");
}
// Qué cuenta el gasto de hoy y qué falta (lo que explica el *), y con qué cuenta el objetivo
function gastoTip(st) {
  const en = st.energy, tg = st.target || {}, falta = [];
  if (en.steps == null) falta.push("los pasos de hoy");
  if (en.neat_pending) falta.push("el día a día: cuenta uno normal hasta que lo eliges al cerrar");
  const lines = ["Gasto de hoy hasta ahora", "Metabolismo + digestión de lo comido + pasos y entrenos apuntados."];
  if (falta.length) lines.push("## * Falta", ...falta.map((f) => "· " + f));
  lines.push("## Día a día", `Lo que te mueves sin contar pasos ni entrenos (de pie, tareas de casa…). Al cerrar eliges cómo fue; «normal» ≈ ${fmt(Math.round(150 * (en.neat_factor || 1)))} kcal para tu peso (150 para 75 kg, proporcional al peso).`);
  if (tg.dynamic) lines.push("## Cómo sale tu objetivo de comida", "(metabolismo + día a día + pasos + entrenos " + (tg.kcal_offset < 0 ? "− " : "+ ") + fmt(Math.abs(tg.kcal_offset || 0)) + ") ÷ 0,9", "El ÷ 0,9 es la digestión: comer gasta un 10 % de lo que comes.");
  if (tg.dynamic) lines.push("## Ya cuenta con", "pasos: " + stepsPlanTxt(st), "un día a día normal", "los entrenos que ya estén apuntados");
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
    goal != null ? `Tu objetivo | ${signed(goal)} kcal` : null,
    st.status !== "cerrado" && tg.dynamic && tg.kcal && (st.totals.kcal || 0) < tg.kcal && b != null
      ? `Si comes lo que te queda (${fmt(tg.kcal - (st.totals.kcal || 0))}), el gasto llega a ${fmt(tg.kcal - (tg.kcal_offset || 0))} y el balance acaba en ${signed(tg.kcal_offset || 0)}, tu objetivo.` : null].filter(Boolean).join("\n");
}
function summaryCard(st) {
  const t = st.totals, tg = st.target || {}, en = st.energy;
  const kcalT = tg.kcal || 0, rest = kcalT && t.kcal != null ? kcalT - t.kcal : null, over = rest != null && rest < 0;
  const open = () => energySheet(st);
  const big = ringSvg(232, 98, 16, kcalT ? (t.kcal || 0) / kcalT : 0, "big" + (over ? " over" : ""), over ? [
    [-34, "Consumido", "rg-l"], [14, v(t, "kcal"), "rg-v"], [40, "/ " + fmt(kcalT) + " kcal", "rg-o"], [64, "+" + fmt(-rest) + " de más", "rg-x" + (-rest / kcalT > 1 ? " hi" : "")]] : [
    ...(rest != null ? [[-34, "Consumido", "rg-l"], [14, v(t, "kcal"), "rg-v"], [40, "/ " + fmt(kcalT) + " kcal", "rg-o"], [64, "quedan " + fmt(rest), "rg-r"]]
      : [[-26, "Consumido", "rg-l"], [22, v(t, "kcal"), "rg-v"], [50, kcalT ? "/ " + fmt(kcalT) + " kcal" : "kcal · sin objetivo", "rg-o"]])], true);
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
      h("button", { class: "schip", title: "De dónde sale el gasto", onclick: () => energySheet(st, "gasto") }, "Gasto ", h("b", { class: "num" }, fmt(en.total)), en.complete && !en.neat_pending ? null : h("span", { class: "miss" }, " *")),
      tip(h("button", { class: "schip", onclick: open }, st.balance == null ? "Balance " : st.balance < 0 ? "Déficit " : st.balance > 0 ? "Superávit " : "Equilibrio ", st.balance ? h("b", { class: "num" }, fmt(Math.abs(st.balance))) : st.balance == null ? h("b", null, "?") : null),
        balTip(st))));
}
// Desglose del día (diseño B): balance arriba, lo comido (macros y comidas) y lo gastado (cada parte con su barra).
// Un entreno o actividad en el gasto: su título (o el tipo si es una actividad suelta), minutos y de dónde salen las kcal
function exPart(x) {
  const tl = (ACT_TYPES.find((a) => a[0] === x.type) || [0, x.type])[1];
  const src = x.source === "agente" ? "estimado por tu agente" : x.source.startsWith("estimado") ? "estimado" : x.source === "manual" ? "lo que apuntaste" : x.source;
  return ["ex", x.description || tl, x.kcal, [x.minutes ? fmt(x.minutes) + " min" : null, src].filter(Boolean).join(" · ")];
}
const stepsSub = (n, inActs) => n == null ? "sin apuntar" : `${fmt(n)} pasos` + (inActs ? ` (sin los ${fmt(inActs)} del entreno)` : "");
// Gasto por partes (barra + filas con su punto de color): el mismo en el desglose y en el objetivo
function partsBlock(parts, empty) {
  return [h("div", { class: "bd-stack big" }, parts.filter((p) => p[2]).map((p) => h("i", { class: "e-" + p[0], style: { flex: p[2] }, title: `${p[1]}: ${fmt(p[2])} kcal` }))),
    h("div", { class: "bd-parts" }, parts.map(([k, l, val, sub]) => h("div", { class: "bd-p" }, h("i", { class: "dot e-" + k }),
      h("div", { class: "bd-pl" }, h("span", null, l), h("small", null, sub)),
      val == null ? (empty ? empty(k) : h("span", { class: "miss" }, "falta")) : h("div", { class: "bd-pv num" }, h("b", null, fmt(val))))))];
}
function energySheet(st, focus, sh0) {
  const t = st.totals, tg = st.target || {}, c = st.closure, en = st.energy, closed = st.status === "cerrado";
  const bal = st.balance, kc = t.kcal || 0;
  // balance que marcaba el objetivo: según gasto, la diferencia elegida; fijo, objetivo − gasto
  const balGoal = tg.dynamic ? (tg.kcal_offset || 0) : tg.kcal && en.total != null ? Math.round(tg.kcal - en.total) : null;
  const pct = (x, of) => (of ? Math.max(0, Math.min(100, (100 * x) / of)) : 0);
  const hero = [h("div", { class: "bd-hero" },
    h("div", { class: "bd-n" }, h("span", null, "Consumido"), h("b", { class: "num" }, v(t, "kcal")), h("em", null, tg.kcal ? "objetivo " + fmt(tg.kcal) : "kcal")),
    h("span", { class: "bd-op" }, "−"),
    h("div", { class: "bd-n" }, h("span", null, "Gasto"), h("b", { class: "num" }, en.total == null ? "?" : fmt(en.total)), h("em", null, en.complete ? "estimado" : "faltan datos")),
    h("span", { class: "bd-op" }, "="),
    h("div", { class: "bd-n bal " + (bal == null ? "" : bal < 0 ? "def" : "sup") }, h("span", null, "Balance"), h("b", { class: "num" }, bal == null ? "?" : signed(bal)),
      h("em", null, balGoal == null ? (bal == null ? "—" : bal < 0 ? "déficit" : bal > 0 ? "superávit" : "equilibrio") : "objetivo " + signed(balGoal)))),
    // por qué «quedan» no es balance − objetivo: lo que comes de más también se digiere (10 %)
    !closed && tg.dynamic && tg.kcal && kc < tg.kcal && bal != null ? h("div", { class: "bd-why" },
      `Si comes lo que te queda (${fmt(tg.kcal - kc)}), el gasto llega a ${fmt(tg.kcal - (tg.kcal_offset || 0))} y el balance acaba en ${signed(tg.kcal_offset || 0)}, tu objetivo.`) : null];
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
      tg.kcal ? h("span", { class: "bd-left" + (kc > tg.kcal * 1.05 ? " over" : "") }, kc > tg.kcal ? `+${fmt(kc - tg.kcal)} de más` : closed ? `${fmt(tg.kcal - kc)} por debajo` : `quedan ${fmt(tg.kcal - kc)}`) : null,
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
    ["bmr", "Metabolismo basal", (en.missing_profile || []).length ? null : en.bmr, (en.missing_profile || []).length ? "completa tu perfil en Ajustes" : `en reposo · ${kgf(en.weight_used_kg)} kg`],
    ["neat", "Día a día", en.neat, en.neat_set ? en.neat_source : en.neat_pending ? "uno normal hasta que elijas al cerrar" : "normal"],
    ["steps", "Pasos", en.steps_kcal, stepsSub(en.steps == null ? null : en.steps_effective, en.steps_in_activities)],
    ...(en.exercise.length ? en.exercise.map(exPart) : [["ex", "Entrenos", 0, "ninguno apuntado"]]),
    ["tef", "Digestión", en.tef, `${fmt((st.target && st.target.tef_pct || 0.1) * 100)} % de lo que llevas comido (${fmt(kc)})`],
  ];
  const tot = en.total || parts.reduce((a, p) => a + (p[2] || 0), 0) || 1;
  const burned = h("div", { class: "bd-sec" },
    h("div", { class: "bd-st" }, h("span", { class: "grow" }, "Lo que has gastado"), h("span", { class: "num bd-tot" }, h("b", null, en.total == null ? "?" : fmt(en.total)), " kcal")),
    h("div", { class: "bd-sub" }, "Por partes"),
    ...partsBlock(parts, (k) => k === "steps" && !closed ? h("button", { class: "btn sm", onclick: () => stepsSheet(st) }, "Añadir") : k === "neat" ? h("span", { class: "faint", style: { fontSize: "12.5px" } }, "por definir") : h("span", { class: "miss" }, "falta")));
  const closedNote = closed && c ? h("span", { class: "bd-closed-x", title: c.forced ? "Cerrado con datos incompletos" : "" }, icon("lock"),
    h("span", { class: "cx-l" }, tx(`Cerrado el ${dateLabel(c.closed_at.slice(0, 10), { day: "numeric", month: "short" })} a las ${c.closed_at.slice(11, 16)}` )),
    h("span", { class: "cx-s" }, tx(`${+c.closed_at.slice(8, 10)}/${+c.closed_at.slice(5, 7)} · ${c.closed_at.slice(11, 16)}` ))) : null;
  const obs = closed && c && c.summary && (c.summary.observations || []).length
    ? h("div", { class: "bd-sec" }, h("div", { class: "bd-st" }, "Observaciones del cierre"), h("ul", { class: "bd-obs" }, c.summary.observations.map((o) => h("li", null, o)))) : null;
  const eb = [dayNav(st, (st2) => energySheet(st2, null, esh)), hero, eaten, burned, obs,
    h("div", { class: "faint bd-foot" }, "El gasto es una estimación: tu metabolismo en reposo (según peso, altura, edad y sexo) + lo que te mueves en el día + tus pasos + tus entrenos + la digestión (10 % de lo que comes).")];
  const eopts = { titleExtra: closedNote }, et = closed ? "Resumen del día" : "Desglose del día";
  const efoot = st._nav || location.hash.startsWith("#/progress") ? null : [h("span", { class: "grow" }),
    h("button", { class: "btn sm", onclick: () => { for (const c_ of [...OPEN_SHEETS]) c_(); histIdle(() => { S.openMore = "comida"; location.hash = "#/progress"; }); } }, "Ver todo en Evolución")];
  const esh = sh0 ? (sh0.set(et, eb, efoot, eopts), sh0) : sheet(et, eb, efoot, eopts);
  if (focus === "gasto") setTimeout(() => { const b = esh.el.querySelector(".sheet-b"); if (b && burned.isConnected) b.scrollTo({ top: b.scrollTop + burned.getBoundingClientRect().top - b.getBoundingClientRect().top - 8, behavior: "smooth" }); burned.classList.add("bd-focus"); }, 120);
}
function energyTable(en, balance) {
  const r = (a, b, c) => h("tr", null, h("td", null, a, c ? h("span", { class: "faint" }, " · " + c) : null), h("td", { class: "num" }, b));
  return h("div", { class: "energy" }, h("table", null,
    (en.missing_profile || []).length ? r("Metabolismo basal (BMR)", h("span", { class: "miss" }, "falta"), "completa en Ajustes: " + en.missing_profile.join(", "))
      : r("Metabolismo basal (BMR)", fmt(en.bmr), `${kgf(en.weight_used_kg)} kg, ${en.weight_source}`),
    r("Efecto térmico (TEF)", fmt(en.tef), "10 % de lo ingerido"),
    r("NEAT sin pasos", fmt(en.neat), en.neat_source),
    r("Pasos", en.steps_kcal == null ? h("span", { class: "miss" }, "falta") : fmt(en.steps_kcal),
      en.steps == null ? null : (en.steps_in_activities ? `${fmt(en.steps_effective)} pasos sin contar los ${fmt(en.steps_in_activities)} del entreno` : `${fmt(en.steps_effective)} pasos`)),
    ...en.exercise.map((x) => r("Ejercicio: " + x.type, fmt(x.kcal), x.source.startsWith("estimado") ? "neto, estimado" : x.source)),
    en.calibration && en.calibration.ajuste_kcal ? r("Calibración de la base", signed(en.calibration.ajuste_kcal), "según tus pesajes") : null,
    h("tr", { class: "tot" }, h("td", null, "Gasto total estimado"), h("td", { class: "num" }, fmt(en.total))),
    h("tr", null, h("td", null, "Balance estimado"), h("td", { class: "num" }, signed(balance)))),
    h("div", { class: "faint", style: { marginTop: "6px" } }, "Estimación, no medición. ", en.method));
}

function bodyStrip(st) {
  const day = st.day, closed = st.status === "cerrado", en = st.energy;
  const el = h("input", { class: "inline num", inputMode: "decimal", placeholder: day.weight_kg == null && st.weight_interp != null ? kgf(st.weight_interp) : "—", value: day.weight_kg == null ? "" : String(day.weight_kg).replace(".", ","), disabled: closed });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") el.blur(); });
  // «kg» pegado al número: ancho según lo escrito (las cifras miden ~1ch; la coma y el punto, mucho menos)
  const fit = () => { const t = el.value || el.placeholder || "—";
    if (!el.isConnected) { el.style.width = Math.max(1.6, [...t].reduce((a, c) => a + (/[0-9]/.test(c) ? 1 : /[,.]/.test(c) ? 0.4 : 0.9), 0) + 0.3) + "ch"; return; }
    const c = getComputedStyle(el), m = h("span", { style: { position: "absolute", visibility: "hidden", whiteSpace: "pre", fontFamily: c.fontFamily, fontSize: c.fontSize,
      fontWeight: c.fontWeight, letterSpacing: c.letterSpacing, fontVariantNumeric: c.fontVariantNumeric } }, t);
    document.body.append(m); el.style.width = Math.ceil(m.getBoundingClientRect().width + 2) + "px"; m.remove(); };
  el.addEventListener("input", fit); fit(); requestAnimationFrame(fit);
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
        ? h("div", { class: "v" }, h("span", { class: "interp", title: "Sin pesaje: estimado con tu último pesaje y lo que has comido y gastado desde entonces" }, kgf(st.weight_interp)), h("small", null, "kg"))
        : h("div", { class: "v none" }, h("small", null, "Aún sin pesaje")))
        : h("div", { class: "v" }, h("span", null, kgf(day.weight_kg)), h("small", null, "kg")))
      : h("div", { class: "v" }, el, h("small", null, "kg")),
    day.weight_kg == null ? (st.weight_interp != null ? h("div", { class: "s" }, "estimado") : null) : h("div", { class: "s" }, "báscula"));
  // Pasos: conectados al móvil → solo «Ver» (ficha con estadísticas); si no, se apuntan a mano y se ofrece conectar
  const auto = !!(S.pasos || {}).conectado && !((S.pasos || {}).off || []).includes("pasos");
  const skc = day.steps != null && en.steps_kcal != null ? kcChip(en.steps_kcal, "de los pasos") : null;
  const steps = h("div", { class: "stat clickable", onclick: auto ? () => stepsStatsSheet(st) : closed ? null : () => stepsSheet(st) },
    h("div", { class: "lbl" }, h("span", null, h("span", { class: "sic s" }, "👟"), "Pasos"),
      auto ? h("span", { class: "lnk" }, "Ver") : closed ? null : S.me ? h("button", { class: "lnk-btn", onclick: (e) => { e.stopPropagation(); stepsConnectSheet(); } }, "🔗 Conectar")
        : h("span", { class: "lnk" }, day.steps == null ? "+ Añadir" : "Editar")),
    day.steps == null ? h("div", { class: "v none" }, h("small", null, auto ? "Aún sin datos" : "Sin registrar"))
      : h("div", { class: "v sv" }, h("span", null, fmt(day.steps)), h("small", null, "pasos"), skc),
    day.steps != null && en.steps_in_activities ? h("div", { class: "s" }, `${fmt(en.steps_in_activities)} del entreno`) : null,
    st.steps_hours ? blockBars(st.steps_hours, st.date === st.today, en) : null);
  const ws = st.workouts || [];
  const pend = ws.length ? [] : (st.sessions || []).filter((x) => !x.registrada);  // entrenos que han llegado del móvil y faltan
  const trainOn = !!(S.pasos || {}).entreno_ultimo && !((S.pasos || {}).off || []).includes("entreno");
  const other = st.activities.filter((a) => !ws.some((w) => w.activity_id === a.id));
  const kc = (id) => fmt((en.exercise.find((x) => x.id === id) || {}).kcal);
  const train = h("div", { class: "stat clickable", onclick: () => trainingDaySheet(st) },
    h("div", { class: "lbl" }, h("span", null, h("span", { class: "sic e" }, "🏋"), "Entreno"),
      ws.length ? h("span", { class: "lnk" }, "Ver") : pend.length ? h("span", { class: "det-badge", title: "El móvil ha detectado un entreno y falta subirlo" }, h("span", { class: "det-i" }, "!"), h("span", { class: "det-bt" }, "Falta subirlo")) : S.me && !closed && !trainOn ? h("button", { class: "lnk-btn", title: "Que se sepa solo cuándo entrenas", onclick: (e) => { e.stopPropagation(); stepsConnectSheet("entreno"); } }, "🔗 Conectar") : null),
    h("div", { class: "acts" }, ws.length || other.length
      ? [...ws.map((w) => h("div", { class: "a wk wk-hoy" },
          // Igual que en Entreno: el nombre (hasta dos líneas), la descripción y debajo las pastillas con la duración y las series
          h("div", { class: "wk-t2" }, w.title),
          w.notes ? h("div", { class: "wk-d" }, w.notes) : null,
          h("div", { class: "wk-chips" }, upsChip(w), w.prs_count ? h("span", { class: "prc", title: "Récords batidos en este entreno" }, icon("trophy"), tx(String(w.prs_count))) : null,
            w.activity_id ? kcChip((en.exercise.find((x) => x.id === w.activity_id) || {}).kcal) : null,
            h("span", { class: "wk-x faint" }, [w.duration_min ? fmt(w.duration_min) + " min" : null, w.sets_count + " series"].filter(Boolean).join(" · "))))),
         ...other.map((a) => h("div", { class: "a" }, h("b", null, (ACT_TYPES.find((x) => x[0] === a.type) || [0, a.type])[1]), ` ${a.minutes ? fmt(a.minutes) + "′" : ""}`, h("span", { class: "faint" }, " · " + kc(a.id) + " kcal")))]
      : pend.length ? h("div", { class: "acts" }, pend.map((x) => h("div", { class: "a wk det" },
          h("div", { class: "wk-t" }, h("b", null, x.titulo || "Entreno")),
          h("div", { class: "wk-s det-s" }, `Empezó a las ${x.inicio}`, h("span", { class: "det-x" }, " · falta subirlo")))))
      : h("div", { class: "v none" }, h("small", null, day.rest_day === 1 ? "Descanso" : "Sin registrar"))));
  return h("div", { class: "strip" }, weight, steps, train);
}

// Mini gráfica del peso en Hoy: una línea gris de las 2 últimas semanas (pesajes con punto; los días sin pesaje, su estimación)
// ‹ día › en las fichas de un día (pasos, peso, desglose): el anterior o el siguiente sin salir de la ficha
// ‹ día › en las fichas del día: solo si se abrieron desde Evolución (desde Hoy ya se está en ese día)
function dayNav(st, reopen) {
  if (!st._nav) return null;
  const today = st.date >= st.today;
  const go = async (n) => { const d2 = addDays(st.date, n); if (d2 > st.today) return;
    try { const st2 = await api("GET", "/api/state?date=" + d2); st2._nav = true; reopen(st2); } catch (e) { toast(e.message, { error: true }); } };
  return h("div", { class: "dnav" }, h("button", { class: "icon-btn round", "aria-label": "Día anterior", onclick: () => go(-1) }, icon("left")),
    h("b", null, today ? "Hoy" : dateLabel(st.date, { weekday: "short", day: "numeric", month: "short" })),
    h("button", { class: "icon-btn round", "aria-label": "Día siguiente", disabled: today, onclick: () => go(1) }, icon("right")));
}
async function weightSheet(st, sh0) {
  // Ficha del peso de ESE día (pesaje, hora, composición y otros pesajes del día) + la gráfica; lo demás, en Progreso
  let days = 30;
  const sub = dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" });
  const sh = sh0 || sheet("Peso", h("div", { class: "muted" }, "Cargando…"), null, { wide: true });
  const draw = async () => {
    const P = await api("GET", `/api/progress?days=${days}&weeks=4`).catch(() => null);
    if (!P) return;
    const ws = P.weights, dayW = st.day.weight_kg, bodies = (P.body || []).filter((b) => b.date === st.date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const main = bodies.find((b) => dayW != null && b.weight_kg != null && Math.abs(b.weight_kg - dayW) < 0.05) || null;
    const others = bodies.filter((b) => b !== main && b.weight_kg != null);
    const w7 = ws.find((w) => w.date === st.date) || {}, prev = ws.find((w) => w.date === addDays(st.date, -7)) || {};
    const scale = !!(S.pasos || {}).bascula && !((S.pasos || {}).off || []).includes("bascula");
    const src = main ? ({ movil: "báscula", xiaomi: "báscula (captura)" }[main.source] || "a mano") : "a mano";
    const tiles = main ? bodyTiles(main) : [];
    sh.set("Peso", [dayNav(st, (st2) => weightSheet(st2, sh)),
      h("div", { class: "wday" },
        h("div", { class: "wday-v" }, dayW != null ? [h("b", { class: "num" }, kgf(dayW)), h("span", null, " kg")]
          : st.weight_interp != null ? [h("b", { class: "num interp" }, kgf(st.weight_interp)), h("span", null, " kg"), h("span", { class: "est-pill" }, "Estimado")] : h("span", { class: "muted" }, "Sin pesaje")),
        h("div", { class: "wday-s" }, dayW != null ? [main && main.time ? "a las " + main.time : null, src].filter(Boolean).join(" · ")
          : st.weight_interp != null ? (st.weight_est_fit ? "Sin pesaje ese día: lo comido y gastado desde el pesaje anterior, ajustado para encajar con el siguiente"
            : "Sin pesaje: tu último pesaje + lo que has comido y gastado desde entonces") : "Sin pesaje"),
        w7.avg7 != null ? h("div", { class: "wday-s" }, `Media de 7 días ${kgf(w7.avg7)} kg` + (prev.avg7 != null ? ` · ${signedKg(w7.avg7 - prev.avg7)} kg en 7 días` : "")) : null),
      tiles.length ? h("div", { class: "btiles six" }, tiles) : null,
      // Varios pesajes ese día: la lista con el que cuenta marcado (tocar el círculo lo cambia; tocar la fila, todos sus datos)
      others.length ? h("div", { class: "wlist" }, h("div", { class: "sec-t" }, "Pesajes del día", h("span", { class: "faint" }, " · el marcado cuenta para la media")),
        [main, ...others].filter(Boolean).sort((a, b) => (a.time || "").localeCompare(b.time || "")).map((b) => { const on = b === main;
          return h("div", { class: "wl-r" + (on ? " on" : "") },
            h("button", { class: "med-rd" + (on ? " on" : ""), "aria-label": "Peso del día", disabled: st.status === "cerrado" || on,
              onclick: async () => { await setDayWeight(b, true); weightSheet(await api("GET", "/api/state?date=" + st.date), sh); } }),
            h("button", { class: "wl-m", onclick: () => bodyDetailSheet(b) }, h("b", { class: "num" }, kgf(b.weight_kg) + " kg"),
              h("span", { class: "faint" }, [b.time, b.fat_pct != null ? fmt(b.fat_pct, 1) + " % grasa" : null].filter(Boolean).join(" · ")), h("span", { class: "grow" }), icon("right"))); })) : null,
      h("div", { class: "row", style: { margin: "14px 0 6px" } }, h("b", null, "Evolución"), h("span", { class: "grow" }),
        h("div", { class: "seg" }, [[7, "7 d"], [30, "30 d"], [90, "90 d"]].map(([d, l]) => h("button", { class: days === d ? "on" : "", onclick: () => { days = d; draw(); } }, l)))),
      h("div", { class: "card panel" }, weightChart(ws, P.body, st.date))],
      st._nav ? null : scale ? sheetFoot(`Último envío de la báscula: ${agoTxt(S.pasos.bascula)}`, null, undefined, undefined, "peso") : sheetFoot(null, "bascula", undefined, undefined, "peso"), { wide: true });
  };
  draw();
}

// Pasos por horas (cuando llegan del móvil): 24 barritas, la hora actual marcada
// Tarjeta pequeña: los pasos del día en 6 bloques de 4 horas
// Pasos de los entrenos repartidos por las horas del entreno, según los pasos de cada hora (la parte rayada de las barras)
function wkHours(en, hrs) {
  const wkH = Array(24).fill(0);
  for (const x of ((en && en.steps_workouts) || []).filter((x) => x.steps > 0)) {
    if (!x.start_time || !x.duration_min) continue;
    const t0 = +x.start_time.slice(0, 2) * 60 + +x.start_time.slice(3, 5), t1 = t0 + x.duration_min;
    const ov = hrs.map((v, i) => Math.max(0, Math.min(t1, (i + 1) * 60) - Math.max(t0, i * 60)) / 60 * (v || 0));
    const tot = ov.reduce((a, b) => a + b, 0);
    if (tot > 0) ov.forEach((o, i) => { wkH[i] = Math.min(hrs[i], wkH[i] + (x.steps * o) / tot); });
  }
  return wkH;
}
function blockBars(hrs, today, en) {
  const wkH = wkHours(en, hrs), sum = (a, x) => x.slice(a, a + 4).reduce((p, q) => p + q, 0);
  const now = new Date().getHours(), B = [0, 4, 8, 12, 16, 20].map((a) => ({ a, v: sum(a, hrs), w: Math.round(sum(a, wkH)) }));
  const mx = Math.max(1, ...B.map((b) => b.v));
  return h("div", { class: "bbars" }, B.map((b) => {
    const fut = today && b.a > now, cur = today && now >= b.a && now < b.a + 4;
    return h("div", { class: "bb" + (fut ? " fut" : "") + (cur ? " now" : ""), title: `${b.a}:00–${b.a + 4}:00 · ${fmt(b.v)} pasos` + (b.w > 0 ? ` (${fmt(b.w)} del entreno)` : "") },
      h("i", { style: { height: (fut ? 6 : Math.max(b.v ? 10 : 4, (100 * b.v) / mx)) + "%" } }, b.w > 0 && b.v ? h("u", { style: { height: (100 * b.w) / b.v + "%" } }) : null));
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
const agoTxt = (ts) => { if (!ts) return "—"; const m = Math.round((Date.now() - new Date(ts.replace(" ", "T"))) / 60000); if (Number.isNaN(m)) return "—"; return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : dateLabel(ts.slice(0, 10), { day: "numeric", month: "short" }); };
// Pie común de las fichas que llegan del móvil: estado del último envío + Conexiones + Ver todo en Progreso
// Conectado: estado del último envío + Conexiones + Ver todo. Sin conectar: «Sin conectar» + Conectar (verde) + Ver todo.
// «Ver todo en Evolución» lleva a Evolución y abre el «Más» de lo mismo (pasos, peso…)
function sheetFoot(status, mode = null, label = "Ver todo en Evolución", hash = "#/progress", more = null) {
  const off = !!mode, go = () => { for (const c of [...OPEN_SHEETS]) c(); histIdle(() => { S.openMore = more || mode; location.hash = hash; }); };
  return [h("div", { class: "sfoot" },
    h("span", { class: "sf-st" + (off ? " off" : "") }, h("i", { class: "sf-dot" }), off ? "Sin conectar" : status),
    h("div", { class: "sf-b" },
      !S.me ? null : off ? h("button", { class: "btn sm primary", onclick: () => stepsConnectSheet(mode) }, icon("plug"), "Conectar")
        : h("button", { class: "btn sm", onclick: () => connectionsSheet() }, icon("plug"), "Conexiones"),
      label && !location.hash.startsWith(hash) ? h("button", { class: "btn sm", onclick: go }, label) : null))];
}
function stepsFooter(d) { return sheetFoot(`Último envío del móvil: ${agoTxt(d.last_received)}`, null, undefined, undefined, "pasos"); }
// Ficha de pasos del día (desde Hoy): objetivo, gasto, distancia, racha y el día por horas frente a tu media
async function stepsStatsSheet(st, sh0) {
  const sub = dateLabel(st.date, { weekday: "long", day: "numeric", month: "long" });
  const sh = sh0 || sheet("Pasos", h("div", { class: "muted" }, "Cargando…"), null, { wide: true, sub, key: "dia:pasos" });
  let d; try { d = await stepsData(st); } catch (e) { toast(e.message, { error: true }); sh.close(); return; }
  const en = st.energy, steps = st.day.steps || 0, today = st.date === st.today, now = new Date().getHours(), goal = d.goal;
  const hrs = d.hours || Array(24).fill(0), avg = d.avg_hours;
  const km = en.stride_m ? (Math.max(0, steps - (en.steps_in_activities || 0)) * en.stride_m) / 1000 : null;
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
  // Pasos de los entrenos (lo corrido y andado): se reparten entre las horas del entreno según los pasos de cada hora y se pintan
  // rayados encima de cada barra; el contador sigue con todos, pero esos no cuentan en el gasto por pasos (ya van en el entreno)
  const wkH = wkHours(en, hrs);
  const mx = Math.max(1, ...hrs);
  const hchart = h("div", { class: "sch" }, hrs.map((v, i) => {
    const fut = today && i > now, wv = Math.round(wkH[i]);
    return tip(h("div", { class: "sc" + (fut ? " fut" : "") + (!fut && !v ? " zero" : "") + (today && i === now ? " now" : "") },
      h("i", { style: { height: (fut || !v ? 0 : Math.max(3, (100 * v) / mx)) + "%" } }, wv > 0 ? h("u", { style: { height: (100 * wv) / v + "%" } }) : null)),
      `${String(i).padStart(2, "0")}:00–${String(i + 1).padStart(2, "0")}:00\n${fut ? "—" : fmt(v) + " pasos"}` + (wv > 0 ? `\n${fmt(wv)} del entreno` : ""));
  }));
  const wkSteps = en.steps_in_activities || 0;
  const nav = dayNav(st, (st2) => stepsStatsSheet(st2, sh));
  sh.set("Pasos", [nav,
    // Total grande, barra (liso = resto del día, rayado = entreno; si pasas del objetivo, la barra llega al final y una marca indica el objetivo) y los datos debajo
    (() => {
      const rest = Math.max(0, steps - wkSteps), scale = Math.max(steps, goal, 1), pc = (v) => (100 * v) / scale, over = steps > goal && goal > 0;
      return h("div", { class: "stp" },
        h("div", { class: "stp-top" },
          h("div", { class: "stp-n" }, h("b", { class: "num" }, fmt(steps)), h("span", null, "pasos")),
          h("div", { class: "stp-goal" },
            steps >= goal ? h("b", null, "Objetivo cumplido") : h("span", null, h("b", null, fmt(goal - steps)), " para el objetivo"),
            h("button", { class: "sgoal", title: "Cambiar el objetivo de pasos", onclick: goalSheet }, `de ${fmt(goal)}`, icon("edit")))),
        h("div", { class: "stp-bar2" },
          rest > 0 ? h("i", { class: "d" + (wkSteps ? "" : " end"), style: { width: `calc(${pc(rest)}% - ${wkSteps ? 1 : 0}px)` } }) : null,
          wkSteps ? h("i", { class: "e end" + (rest > 0 ? "" : " start"), style: { width: `calc(${pc(wkSteps)}% - ${rest > 0 ? 1 : 0}px)` } }) : null,
          over ? h("span", { class: "stp-mk", style: { left: `calc(${pc(goal)}% - 1px)` } }) : null),
        h("div", { class: "stp-ml" }, over ? h("span", { style: { left: pc(goal) + "%" } }, "Objetivo") : null),
        h("div", { class: "stp-stats" },
          wkSteps ? [
            h("div", null, h("span", null, h("i", { class: "stp-dot d" }), "Resto del día"), h("b", null, fmt(rest)), h("small", null, en.steps_kcal != null ? `≈ ${fmt(en.steps_kcal)} kcal` : "")),
            h("div", null, h("span", null, h("i", { class: "stp-dot e" }), "Entreno"), h("b", null, fmt(wkSteps)), h("small", null, "Gasto en el entreno"))]
            : [h("div", null, h("span", null, "Gasto"), h("b", null, en.steps_kcal != null ? `≈ ${fmt(en.steps_kcal)} kcal` : "—")), h("div")],
          h("div", { class: "r" }, h("span", null, "Distancia"), h("b", null, km != null ? `${fmt(km, 1)} km` : "—"))));
    })(),
    h("div", { class: "card panel flat" }, h("h3", { style: { margin: 0 } }, "Por horas"), hchart,
      h("div", { class: "sch-x" }, [0, 6, 12, 18, 24].map((x) => h("span", null, x + " h"))),
      wkSteps ? h("div", { class: "sch-wk" }, h("i"), h("span", null, h("b", null, `Del entreno: ${fmt(wkSteps)} pasos`), "")) : null),
  ], st._nav ? null : stepsFooter(d, sh), { wide: true });
}
// La semana (L–D) y las rachas y récords de siempre (para el «Más» de Pasos en Evolución)
function stepsRecords(st, d) {
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
      `${dateLabel(x.date, { weekday: "short", day: "numeric", month: "short" })}\n${fmt(x.steps)} pasos`))) : h("div", { class: "muted sm" }, "Sin datos todavía.");
  const rec = (ic, l, v, sub_) => h("div", { class: "srec" }, h("span", { class: "srec-i" }, icon(ic)), h("div", null, h("div", { class: "srec-l" }, l), h("b", { class: "num" }, v), h("div", { class: "srec-s" }, sub_ || "")));
  return [
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
  ];
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
    h("p", { class: "muted wz-p" }, "Es la clave que pones en «HC Webhook» (Android) o en «Conduit» (iPhone). Una sola sirve para pasos, báscula y entrenos."),
    tok ? h("div", null, h("b", null, "Tu clave nueva"), h("div", { class: "faint sm" }, "Cópiala ahora: no se vuelve a mostrar. En Conduit va en el token; en HC Webhook, en el encabezado «Authorization»."), copyLine(tok))
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
// Móvil: una sola conexión. En Android, Health Connect + «HC Webhook»; en iPhone, Apple Salud + «Conduit».
// Las dos mandan a la misma dirección con la misma clave; dentro se elige qué llega (pasos, báscula, entrenos).
const PLAT_NAME = { ios: "Apple Salud", android: "Health Connect" };
const uaPlat = () => /iPhone|iPad/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : null;
const movilPlat = (info) => (info && info.plataforma) || uaPlat();
const stepsConnectSheet = () => mobileSheet();
async function mobileSheet(forced) {
  let info = await api("GET", "/api/movil").catch(() => ({})), tok = null, os = forced || movilPlat(info), tm = null, howOpen = false;
  const sh = sheet("Móvil", null, null, { onClose: () => { clearInterval(tm); loadPasos(); } });
  const step = (n, t, d, extra, ok) => h("div", { class: "ast" }, h("span", { class: "n" + (ok ? " ok" : "") }, ok ? "✓" : String(n)), h("div", null, h("b", null, t), d ? h("div", { class: "muted" }, d) : null, extra || null));
  const isOff = (k) => (info.off || []).includes(k);
  const toggle = async (k) => { await api("POST", "/api/movil", { off: k, desactivar: !isOff(k) }); info = await api("GET", "/api/movil").catch(() => info); draw(); };
  const reload = async () => { info = await api("GET", "/api/movil").catch(() => info); draw(); };
  const draw = () => {
    if (!os) {  // en el ordenador: primero qué móvil tiene
      return sh.set("Conectar tu móvil", [h("p", { class: "muted wz-p" }, "Para que tus pasos, pesajes y entrenos lleguen solos. ¿Qué móvil tienes?"),
        h("div", { class: "plat-pick" }, [["ios", "iPhone", "Apple Salud"], ["android", "Android", "Health Connect"]].map(([k, t, sub]) =>
          h("button", { class: "agent-btn", onclick: () => { os = k; draw(); } }, h("span", { class: "plat-ic" }, k === "ios" ? "📱" : "🤖"),
            h("span", { class: "ag-t" }, h("b", null, t), h("span", null, sub)), h("span", { class: "ag-go" }, icon("right")))))]);
    }
    const ios = os === "ios";
    // La clave, a secas (el servidor la acepta con o sin «Bearer»)
    const keyLine = tok ? copyLine(tok)
      : info.configurado ? h("div", { class: "faint sm" }, "La misma clave que ya usas. ", h("button", { class: "lnk-btn", onclick: () => mobileKeySheet(async (k) => { tok = k; await reload(); }) }, "¿La has perdido?"))
        : h("button", { class: "btn sm primary", onclick: async () => { tok = (await api("POST", "/api/movil", {})).token; await reload(); } }, "Generar mi clave");
    const url = copyLine(info.url || location.origin + "/api/hooks/salud");
    const last = ios ? info.ios_ultimo : info.ultimo || info.pasos_ultimo;
    const done = !!last && (info.plataforma ? info.plataforma === os : true);
    const ext = (href, t) => h("a", { class: "btn sm ext", style: { marginTop: "8px" }, href, target: "_blank", rel: "noopener" }, t, " ↗");
    const steps = ios ? [
      step(1, "Instala «Conduit Health Sync»", "Gratis. Al abrirla, deja que lea Salud.", ext("https://apps.apple.com/app/id6786544769", "App Store")),
      step(2, "En Conduit → Settings → Webhook", "Pega la dirección y tu clave:", h("div", { class: "mv-fields" }, url, keyLine)),
      step(3, "Activa los datos y pulsa «Test Connection»", "En Data Types: pasos, peso, grasa corporal, sueño y entrenos."),
    ] : [
      step(1, "Que tus apps guarden en Health Connect", "Pasos: el móvil o Google Fit. Báscula: su app. Entrenos: Hevy → Ajustes → Integraciones.", xiaomiGuide()),
      step(2, "Instala «HC Webhook»", "Gratis, desde GitHub.", ext("https://github.com/mcnaveen/health-connect-webhook/releases/latest", "Descargar")),
      step(3, "En Webhooks → Añadir", "Pega la dirección, y la clave en el encabezado «Authorization»:", h("div", { class: "mv-fields" }, url, keyLine)),
      step(4, "Activa los datos", "Pasos (cada 15 min, «Contar una vez»), peso, grasa, masa magra, ósea, agua, metabolismo basal y sesiones de ejercicio."),
    ];
    const status = h("div", { class: "mv-status" + (done ? " ok" : "") }, h("span", { class: "pc-dot " + (done ? "ok" : "off") }),
      h("span", null, done ? `Conectado · último envío ${agoTxt(last)}` : "Aún no ha llegado nada: aquí pondrá «Conectado» con el primer envío."));
    const types = [["pasos", "👟", "Pasos", info.pasos_ultimo], ["bascula", "⚖", "Báscula", info.bascula], ["entreno", "🏋", "Entrenos", info.entreno_ultimo]];
    const what = h("div", null, h("div", { class: "sec-t" }, "Qué llega"), h("div", { class: "mv-types" }, types.map(([k, ic, t, l]) =>
      h("label", { class: "mv-type" + (isOff(k) ? " off" : "") }, h("span", { class: "mv-ic" }, ic),
        h("span", { class: "grow" }, h("b", null, t), h("span", { class: "faint sm" }, isOff(k) ? "Apagado" : l ? "Último " + whenTxt(l) : "Aún nada")),
        h("input", { type: "checkbox", class: "mv-sw", checked: !isOff(k), onchange: () => toggle(k) })))));
    const how = h("div", { class: "agent-steps simple" }, steps);
    sh.set(PLAT_NAME[os], [
      status,
      done ? what : how,
      done ? h("details", { class: "mv-how", open: howOpen, ontoggle: (e) => { howOpen = e.target.open; } }, h("summary", null, "Cómo se configura"), how) : null,
      done ? h("div", { class: "faint sm mv-note" }, ios ? "Va solo: manda lo nuevo cuando usas el iPhone (bloqueado, Apple no deja leer Salud)." : "Va solo: cada 15 minutos.") : null,
      !done ? h("div", { class: "faint sm mv-note" }, ios ? "¿Tienes Android? " : "¿Tienes iPhone? ",
        h("button", { class: "lnk-btn", onclick: () => { os = ios ? "android" : "ios"; tok = null; draw(); } }, ios ? "Health Connect" : "Apple Salud")) : null,
    ], null);
  };
  draw();
  tm = setInterval(async () => { const r = await api("GET", "/api/movil").catch(() => null);
    if (r && (r.ultimo !== info.ultimo || r.ios_ultimo !== info.ios_ultimo || r.bascula !== info.bascula || r.entreno_ultimo !== info.entreno_ultimo)) { info = r; draw(); refresh(); } }, 4000);
}
// Hevy a través del agente: Salud no puede conectarse a Hevy (solo acepta apps dadas de alta por ellos); tu agente sí.
// Sale «Conectado» en cuanto el agente sube un entreno tal cual viene de Hevy (no con capturas).
// «Claude y ChatGPT»: los agentes que han avisado de que tienen Hevy
// Sirve para cualquier agente (Claude, ChatGPT, Codex, Gemini…): el logo de cada uno
const hevyVia = (d) => { const ks = Object.keys(d || {}).filter((k) => k !== "agente");
  if (!ks.length) return "tu agente";
  // Solo los logos (el nombre, al pasar por encima)
  return h("span", { class: "via-ag" }, ks.map((k) => h("span", { title: agentOf(k).n }, agentLogo(agentOf(k), 14)))); };
function hevyAgentSheet(ok, ags) {
  if (ok === undefined) ok = (S.pasos || {}).hevy_agente;
  if (!ags) ags = (S.pasos || {}).hevy_agentes || {};
  // Solo las instrucciones de los agentes que tiene conectados (si no hay ninguno, o no es ni Claude ni ChatGPT, las dos)
  const used = agentsUsed().map((t) => agentOf(t.agent || t.kind).k);
  let cl = used.some((k) => k.startsWith("claude")), gp = used.includes("chatgpt");
  if (!cl && !gp) cl = gp = true;
  const step = (n, t, d, done) => h("div", { class: "ast" }, h("span", { class: "n" + (done ? " ok" : "") }, done ? "✓" : String(n)), h("div", null, h("b", null, t), d ? h("div", { class: "muted" }, d) : null));
  sheet("Hevy en tu agente", [
    h("p", { class: "muted wz-p" }, "Así tu agente sube cada entreno con todas sus series y pesos, sin capturas. Si además tienes los entrenos conectados por Health Connect, lo sube él solo cuando habléis."),
    h("div", { class: "agent-steps simple" },
      step(1, "Añade Hevy a tu agente", [cl ? "En Claude: Personalizar → Conectores → busca Hevy → «Conectar»." : null, gp ? "En ChatGPT: Complementos → busca Hevy." : null,
        "Inicias sesión en hevy.com y pulsas «Permitir acceso». Gratis, no hace falta Hevy PRO."].filter(Boolean).join(" ")),
      step(2, "Abre un chat nuevo con tu agente", "Al empezar comprueba que ve tu Hevy y nos lo dice." + (gp ? (cl ? " En ChatGPT, " : " ") + (cl ? "escribe" : "Escribe") + " @Salud y @Hevy en el mensaje." : "")),
      step(3, "Listo", ok ? `Conectado · comprobado ${agoTxt(ok)}` : "Cuando lo compruebe, aquí pondrá «Conectado».", !!ok)),
    // Cada agente avisa por su cuenta: quién tiene Hevy y quién no lo ha dicho aún
    [...new Set(used)].length ? h("div", null, h("div", { class: "sec-t" }, "Tus agentes"),
      h("div", { class: "ag-list" }, [...new Set(used)].map((k) => { const ag = agentOf(k), t = ags[k] || (k.startsWith("claude") && ags["claude"]);
        return h("div", { class: "ag-item" }, agentLogo(ag, 28), h("div", { class: "grow" }, h("b", null, ag.n),
          h("div", { class: "faint" }, t ? `Tiene Hevy · avisó ${agoTxt(t)}` : "Aún no ha dicho si tiene Hevy (lo dice al empezar un chat)")),
          t ? h("span", { class: "ok-dot" }, "✓") : null); }))) : null,
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
    const isOff = (k) => (info.off || []).includes(k);
    // Todas iguales: icono con su punto de estado (verde conectado, ámbar sin datos recientes, gris sin conectar), nombre corto, detalle y botón
    const row_ = (ic, t, state, sub_, btn) => h("div", { class: "pc-row" },
      h("span", { class: "pc-iw", title: { ok: "Conectado", warn: "Sin datos recientes", off: "Sin conectar" }[state] }, h("span", { class: "pc-i " + state }, ic), h("span", { class: "pc-dot " + state })),
      h("div", { class: "grow" }, h("div", { class: "pc-t" }, h("b", null, t)), h("div", { class: "faint sm" }, sub_)), btn);
    const off_ = (txt) => [h("span", { class: "pc-off" }, "Sin conectar"), " · " + txt];
    const unhevy = h("button", { class: "btn sm ghost", onclick: async () => {
      if (!confirm("¿Desconectar Hevy? Dejarás de ver aquí que tu agente lo tiene. Para que deje de usarlo, quita también el conector de Hevy en tu agente.")) return;
      await api("POST", "/api/hevy/agente", { conectado: false }); info = await api("GET", "/api/movil").catch(() => info); draw(); } }, "Desconectar");
    sh.set("Conexiones", [
      h("p", { class: "muted wz-p" }, "Lo importante es conectar tu agente, para apuntar por chat. Lo demás es opcional: solo hace que los datos lleguen solos."),
      h("div", { class: "pc-list" },
        S.me ? row_("✦", "Agente", agentConnected() ? "ok" : "off",
          agentConnected() ? S.me.agente.agents.map((t) => agentOf(t.agent || t.kind).n).join(", ") + " · para apuntar por chat" : off_("por chat"),
          h("button", { class: "btn sm ghost", onclick: () => connectAgent() }, agentConnected() ? "Gestionar" : "Conectar")) : null,
        S.me ? (() => { const pl = movilPlat(info), last = pl === "ios" ? info.ios_ultimo : info.ultimo || info.pasos_ultimo;
          const on = ["pasos", "bascula", "entreno"].filter((k) => !isOff(k)), names = { pasos: "pasos", bascula: "báscula", entreno: "entrenos" };
          const list = on.map((k) => names[k]).join(", ").replace(/, ([^,]*)$/, " y $1");
          return row_("📱", PLAT_NAME[pl] || "Móvil", last ? (fresh(last, 48) ? "ok" : "warn") : "off",
            last ? (list ? `Último envío ${agoTxt(last)}` : "Todo apagado") : off_("pasos, báscula y entrenos"),
            h("button", { class: "btn sm ghost", onclick: () => mobileSheet() }, last ? "Gestionar" : "Conectar")); })() : null,
        S.me ? row_("📋", "Hevy", info.hevy_agente ? "ok" : "off", info.hevy_agente ? ["Series y pesos, vía ", hevyVia(info.hevy_agentes)] : off_("series y pesos"),
          info.hevy_agente ? unhevy : h("button", { class: "btn sm ghost", onclick: () => hevyAgentSheet(info.hevy_agente, info.hevy_agentes) }, "Conectar")) : null),
    ], null);
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
    h("div", { class: "note" }, `Zancada ${fmt(en.stride_m, 2)} m · ${kgf(en.weight_used_kg)} kg · ${String(en.kcal_per_kg_km).replace(".", ",")} kcal/kg/km. Si una sesión de carrera ya está en el contador, se descuenta para no contarla dos veces.`)],
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
            ? h("div", { class: "det-how" }, "Pendiente de subir desde Hevy")
            : h("div", { class: "det-how" }, "Pendiente de subir", h("button", { class: "lnk-btn", style: { marginLeft: "8px" }, onclick: () => hevyAgentSheet() }, "Conectar Hevy")))
      : h("div", { class: "card empty flat" }, icon("dumbbell"), h("h3", null, rest ? "Día de descanso" : "Sin entreno"),
        h("p", { class: "muted" }, rest ? "Sin entreno este día." : "Sin registrar."),
        !closed ? h("button", { class: "btn", onclick: async () => { await act(() => api("PUT", "/api/days/" + st.date, { rest_day: !rest }), rest ? "Descanso quitado" : "Marcado como descanso"); sh.close(); } }, rest ? "Quitar descanso" : "Día de descanso") : null),
  ], trainOn ? sheetFoot(`Último entreno detectado: ${agoTxt(S.pasos.entreno_ultimo)}`, null, "Ir a Entreno", "#/training") : sheetFoot(null, "entreno", "Ir a Entreno", "#/training"),
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
const suppPortion = (f) => { const ps = f.portions || [], du = f.default_unit || ""; return (du.startsWith("p:") && ps.find((p) => "p:" + p.id === du)) || ps.find((p) => p.is_default) || ps[0]; };
const isSupp = (f) => { const p = f && suppPortion(f); return !!(f && !f.deleted && !f.hidden && /suplement/i.test(f.category || "") && p && p.kcal != null && p.kcal < 20); };
// Día de fiesta: 🎉 en la cabecera del día (en el móvil solo el emoji). Hace que salgan los suplementos «de fiesta» ese día (se puede poner o quitar también con el día cerrado).
function partyBtn(st) {
  const on = !!(st.day && st.day.party);
  return h("button", { class: "party-btn" + (on ? " on" : ""), title: on ? "Día de fiesta" : "Marcar como día de fiesta",
    onclick: () => act(() => api("PUT", "/api/days/" + st.date, { fiesta: !on }), on ? "Ya no es día de fiesta" : "Día de fiesta 🎉") }, "🎉");
}
const nowHHMM = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
// Tocar: apunta una toma más hasta completar las del día (la B12 de fiesta son dos); con todas hechas, quita la última
async function suppToggle(st, x) {
  const ents = Object.values(st.meals).flatMap((m) => m.entries).filter((e) => e.food_id === x.id);
  const need = x.doses || 1;
  // Con todas las tomas hechas, tocar lo deja a cero (0 → 1/2 → hecha → 0…)
  if (ents.length >= need && ents.length) return act(async () => { for (const e of ents) await api("DELETE", "/api/entries/" + e.id); }, x.name + " desmarcado");
  const lab = x.dose_labels && x.dose_labels[ents.length];
  return act(() => api("POST", "/api/entries", { date: st.date, food_id: x.id, unit_key: x.portion_id ? "p:" + x.portion_id : "g", quantity: x.portion_id ? 1 : 5, meal: "otro",
    time: st.date === st.today ? nowHHMM() : null, ...(lab ? { note: lab } : {}) }), x.name + (lab ? " · " + lab : " apuntado"));
}
// Aviso arriba en Hoy: lo que tocaba a una hora que ya ha pasado y aún no está marcado
function suppReminders(st) {
  if (st.date !== st.today || st.status === "cerrado") return null;
  const taken = st.supplements_taken || {}, now = nowHHMM();
  const cnt = st.supplements_counts || {};
  const due = (st.supplements || []).filter((x) => x.due && x.supp_time && x.supp_notify && (cnt[x.id] || []).length < (x.doses || 1) && x.supp_time <= now);
  if (!due.length) return null;
  return h("div", { class: "remind-l" }, due.map((x) => h("div", { class: "remind" }, h("span", { class: "rm-ic" }, "💊"),
    h("div", { class: "grow" }, h("b", null, x.name), h("span", { class: "faint" }, `Tocaba a las ${x.supp_time} · ¿ya está?`)),
    h("button", { class: "btn sm rm-ok", onclick: () => suppToggle(st, x) }, "Marcar"))));
}
// Suplementos: solo los que tocan ese día (y los que ya has tomado); los demás, con «+ Otro»
function suppBlock(st, closed) {
  const all = st.supplements || [];
  const taken = st.supplements_taken || {};
  if (!all.length) return null;
  const sups = all.filter((x) => x.due || x.id in taken), rest = all.filter((x) => !sups.includes(x));
  const foodOf = (id) => (S.catalog && S.catalog.foods || []).find((f) => f.id === id) || {};
  const cnt = st.supplements_counts || {}, nOf = (x) => (cnt[x.id] || []).length, full = (x) => nOf(x) >= (x.doses || 1);
  const nDue = sups.filter((x) => x.due).length, nTaken = sups.filter((x) => x.due && full(x)).length;
  const other = () => { const sh = sheet("Otro suplemento", h("div", { class: "list" }, rest.map((x) => { const fo = foodOf(x.id);
    return h("div", { class: "item b supp-it", onclick: async () => { sh.close(); await suppToggle(st, x); } }, mono(x.name, fo.category, fo.image),
      h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, x.name)), h("div", { class: "sub" }, [x.dose, x.when_txt].filter(Boolean).join(" · "))),
      h("div", { class: "supp-ck" })); })), null, { sub: "No tocaban hoy" }); };
  const head = h("div", { class: "meal-h" }, h("h3", null, "Suplementos"), nDue ? h("span", { class: "mt num" }, `${nTaken} de ${nDue}`) : null,
    h("button", { class: "add-btn add sst-btn", title: "Constancia: qué días los has tomado", "aria-label": "Constancia", onclick: suppStatsSheet }, icon("bars"), h("span", null, "Constancia")),
    !closed && rest.length ? h("button", { class: "add-btn", onclick: other }, "+ Otro") : null);
  if (!sups.length) return closed ? null : h("div", { class: "meal supp-b" }, head);
  return h("div", { class: "meal supp-b" }, head, h("div", { class: "list" }, sups.map((x) => {
    const n = nOf(x), need = x.doses || 1, on = n >= need, fo = foodOf(x.id), times = cnt[x.id] || [];
    // Dos tomas (B12 de fiesta): «antes de salir ✓ 21:30 · al volver»
    const sub = on ? [x.dose, times.filter(Boolean).length ? "tomado a las " + times.filter(Boolean).join(" y ") : "tomado"]
      : x.dose_labels && x.due ? [x.dose, ...x.dose_labels.map((l, i) => i < n ? `${l} ✓${times[i] ? " " + times[i] : ""}` : l)] : [x.dose, x.when_txt];
    return h("div", { class: "item b supp-it" + (on ? " on" : "") + (n && !on ? " half" : ""), onclick: closed ? null : () => suppToggle(st, x) },
      mono(x.name, fo.category, fo.image),
      h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, x.name)), h("div", { class: "sub" }, sub.filter(Boolean).join(" · "))),
      h("div", { class: "supp-ck" + (on ? " on" : n ? " half" : "") }, on ? icon("check") : n ? h("span", { class: "ck-n" }, `${n}/${need}`) : null));
  })));
}
// Constancia de los suplementos: calendario de las últimas semanas (tomado, faltó, no tocaba), % de 30 días y rachas
const SST_TXT = { ok: "tomado", half: "le faltó una toma", miss: "no lo tomaste", extra: "tomado (no tocaba)", off: "no tocaba", hoy: "toca hoy", none: "" };
async function suppStatsSheet() {
  const sh = sheet("Constancia", h("div", { class: "muted", style: { padding: "20px 0" } }, "Cargando…"), null, { sub: "Qué días has tomado cada suplemento" });
  try { const L = await api("GET", "/api/supplements/stats?days=56"); sh.set("Constancia", L.length ? [h("div", { class: "sst-l" }, L.map((x) => suppStatsCard(x, sh))), sstLegend()] : h("div", { class: "muted" }, "Aún no tienes suplementos."), null, { sub: "Qué días has tomado cada suplemento" }); }
  catch (e) { sh.set("Constancia", h("div", { class: "note warn" }, e.message), null); }
}
function suppStatsCard(x, sh) {
  const fo = (S.catalog && S.catalog.foods || []).find((f) => f.id === x.id) || {};
  const today = todayISO(), cells = x.days.filter((c) => c.s !== "none");
  const pctCls = x.pct30 == null ? "" : x.pct30 >= 85 ? " good" : x.pct30 >= 60 ? " mid" : " low";
  const facts = [x.streak ? `racha de ${x.streak} ${x.streak === 1 ? "día" : "días"}` : null, x.best > x.streak ? `mejor ${x.best}` : null,
    x.usual_time ? `sueles a las ${x.usual_time}` : null].filter(Boolean);
  // Semanas de lunes a domingo, desde la de su primer día
  const first = cells.length ? cells[0].date : today, by = Object.fromEntries(x.days.map((c) => [c.date, c]));
  const dow = (iso) => (new Date(iso + "T12:00").getDay() + 6) % 7;
  const grid = h("div", { class: "sst-cal" }, ["L", "M", "X", "J", "V", "S", "D"].map((d) => h("span", { class: "sst-wd" }, d)));
  for (let d = addDays(first, -dow(first)); d <= addDays(today, 6 - dow(today)); d = addDays(d, 1)) {
    const c = by[d], st = d > today ? "fut" : c ? c.s : "none", n = +d.slice(8);
    grid.append(h("span", { class: "sst-d " + st, title: `${dateLabel(d)}${SST_TXT[st] ? " · " + SST_TXT[st] : ""}`,
      onclick: st === "fut" || st === "none" ? null : () => { if (sh) sh.close(); goDay(d); } }, n === 1 ? h("b", null, dateLabel(d, { month: "short" }).replace(".", "")) : String(n)));
  }
  return h("div", { class: "sst" },
    h("div", { class: "sst-h" }, mono(x.name, fo.category || "Suplemento", x.image || fo.image),
      h("div", { class: "grow" }, h("b", null, x.name), h("span", { class: "faint" }, [x.dose, facts.join(" · ")].filter(Boolean).join(" · "))),
      x.supp_when === "manual" ? h("div", { class: "sst-pct num" }, String(x.days.filter((c) => c.n && c.date > addDays(today, -30)).length), h("small", null, "días en 30"))
        : h("div", { class: "sst-pct num" + pctCls }, x.pct30 == null ? "—" : x.pct30 + " %", h("small", null, x.due30 ? `${x.ok30} de ${x.due30} días` : "aún sin días"))),
    grid);
}
const sstLegend = () => h("div", { class: "sst-leg" }, [["ok", "Tomado"], ["half", "A medias"], ["miss", "Faltó"], ["off", "No tocaba"]].map(([k, l]) => h("span", null, h("i", { class: "sst-d " + k }), l)));
function suppStatsPanel(L) {
  if (!L || !L.length) return null;
  // En Progreso, una línea por suplemento (las últimas 4 semanas); el calendario entero, en su ficha
  const rows = L.filter((x) => x.supp_when !== "manual" || x.days.some((c) => c.n));
  return h("div", { class: "card panel" }, pgHead("Suplementos", "% de los días que tocaba", suppStatsSheet),
    h("div", { class: "sst-rows" }, rows.map((x) => { const fo = (S.catalog && S.catalog.foods || []).find((f) => f.id === x.id) || {};
      const pc = x.pct30, cls = pc == null ? "" : pc >= 85 ? " good" : pc >= 60 ? " mid" : " low";
      return h("button", { class: "sst-row", onclick: suppStatsSheet }, mono(x.name, fo.category || "Suplemento", x.image || fo.image),
        h("span", { class: "grow" }, h("b", null, x.name), h("span", { class: "sst-strip" }, x.days.slice(-28).map((c) => h("i", { class: "s-" + c.s, title: dateLabel(c.date) + (SST_TXT[c.s] ? " · " + SST_TXT[c.s] : "") })))),
        h("b", { class: "sst-pc num" + cls }, x.supp_when === "manual" ? x.days.filter((c) => c.n).length + " d" : pc == null ? "—" : pc + " %")); })));
}
// Resumen de una receta apuntada: lo que suma y sus alimentos (cada uno se abre); quitarla entera
function groupSheet(name, tpl, grp, tot, closed, itemEl) {
  const e0 = grp[0];
  const body = [
    h("div", { class: "mprev mprev1" }, h("div", { class: "mp2" }, h("b", { class: "num" }, v(tot, "kcal")), h("span", null, " kcal")), chipsOf(tot)),
    h("div", { class: "list tpl-sum" }, grp.map((x) => itemEl(x, true)))];
  const sh = sheet(name, body, closed ? null : [
    h("button", { class: "btn ghost danger", onclick: (ev) => confirmDel(ev, async () => {
      await act(async () => { for (const x of grp) await api("DELETE", "/api/entries/" + x.id); }, `${name} quitada`); sh.close(); }) }, "Quitar"),
    h("span", { class: "grow" }), h("button", { class: "btn", onclick: () => sh.close() }, "Cerrar")],
    { sub: [MEALS.find((m) => m[0] === e0.meal)[1], e0.time, `${grp.length} alimentos`].filter(Boolean).join(" · "), key: "grp" });
}
function mealBlock(st, meal, closed) {
  const supIds = new Set((st.supplements || []).map((x) => x.id));
  const supHide = new Set(Object.values(st.meals).flatMap((m) => m.entries).filter((e) => supIds.has(e.food_id)).map((e) => e.id));
  const m0 = st.meals[meal], m = supHide.size ? { ...m0, entries: m0.entries.filter((e) => !supHide.has(e.id)) } : m0;
  if (meal === "otro" && !m.entries.length && closed) return null;
  // El nombre de la comida y, debajo y en pequeño, lo que suma (kcal y P/C/G)
  const head = h("div", { class: "meal-h mh2" }, h("div", { class: "mh-t" }, h("h3", null, m.label),
    m.entries.length ? h("div", { class: "mh-s" }, h("span", { class: "mt num" }, h("b", null, v(m.totals, "kcal")), " kcal"),
      h("span", { class: "mchips num" }, h("i", { class: "p" }, v(m.totals, "protein_g")), h("i", { class: "c" }, v(m.totals, "carbs_g")), h("i", { class: "g" }, v(m.totals, "fat_g")))) : null),
    closed ? null : h("button", { class: "add-btn add", onclick: () => addSheet(meal) }, "+ Añadir"));
  if (!m.entries.length) return h("div", { class: "meal" }, head, closed ? h("div", { class: "empty-meal" }, "—") : h("div", { class: "empty-meal", onclick: () => addSheet(meal) }, "Añadir " + m.label.toLowerCase()));
  const list = h("div", { class: "list" });
  const foodOf = (id) => (S.catalog && S.catalog.foods || []).find((f) => f.id === id) || {};
  const chips = (n) => h("div", { class: "mchips num" }, h("i", { class: "p" }, v(n, "protein_g")), h("i", { class: "c" }, v(n, "carbs_g")), h("i", { class: "g" }, v(n, "fat_g")));
  const itemEl = (e, child) => { const fo = foodOf(e.food_id);
    return h("div", { class: "item b" + (child ? " child" : ""), onclick: (ev) => { ev.stopPropagation(); closed ? entryInfo(e) : entrySheet(e); } },
      mono(e.name, fo.category, fo.image),
      h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, fo.id && e.name === fo.name ? dname(fo) : e.name), estTag(e)),
        h("div", { class: "sub" }, estTag(e), [e.kind === "estimacion" ? null : e.time, e.kind === "estimacion" && e.unit_label === "ración estimada" ? null : e.unit_label, e.kind === "estimacion" ? e.time : null].filter(Boolean).join(" · ")),
        chips(e)),
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
    // Tocar la fila: su resumen (lo que suma y sus alimentos); la flecha: desplegar los alimentos aquí mismo
    const tname = tpl ? tpl.name : "Receta";
    const chev = h("button", { type: "button", class: "tpl-chev", "aria-label": "Ver los alimentos", onclick: (ev) => { ev.stopPropagation(); S.openTpl[key] = !S.openTpl[key]; kids.classList.toggle("hidden"); row.classList.toggle("open"); } }, icon("right"));
    const row = h("div", { class: "item b tpl" + (S.openTpl[key] ? " open" : ""), onclick: () => groupSheet(tname, tpl, grp, tot, closed, itemEl) },
      mono(tname, "comida", tpl && tpl.image),
      h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, tname), estTag(grp)),
        h("div", { class: "sub" }, estTag(grp), [e.time, `${grp.length} ${grp.length === 1 ? "alimento" : "alimentos"}`].filter(Boolean).join(" · ")), chips(tot)),
      h("div", { class: "kc num" }, v(tot, "kcal"), h("small", null, "kcal")), chev);
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
  if (im && !im.closest(".tile, .ph-ed, .ph-big")) { e.preventDefault(); e.stopPropagation(); zoomImg(im.src); }
}, true);
document.addEventListener("dragstart", (e) => { if (e.target.tagName === "IMG") e.preventDefault(); });
// Foto en grande: una ficha más (se cierra tocando, con Esc o con el botón atrás del móvil, como todas)
function zoomImg(src) {
  const sh = sheet("", [h("img", { src, alt: "", onclick: () => sh.close() })], null, { cls: "zoom", key: "zoom" });
  sh.el.addEventListener("click", (e) => { if (e.target === sh.el || e.target.closest(".sheet-b")) sh.close(); });
}
// Favorito: una estrella (icono, no carácter) que queda centrada con el título
function favButton(on, onToggle, tipOn, tipOff) {
  const b = h("button", { type: "button", class: "fav-btn" + (on ? " on" : ""), title: on ? tipOn : tipOff, "aria-label": "Favorito" }, icon("star"));
  b.onclick = async () => { const nv = !b.classList.contains("on"); await onToggle(nv); b.classList.toggle("on", nv); b.title = nv ? tipOn : tipOff; };
  return b;
}
// Cabecera común de producto y comida habitual: foto pequeña (con cámara y quitar) y el nombre al lado, centrados
function edHead(nameIn, ph) { return h("div", { class: "ed-head" }, ph, h("div", { class: "grow" }, nameIn)); }
// Foto de un producto o comida habitual (la misma pieza en los dos editores): la miniatura abre su ficha con la foto en grande,
// «Cámara» (con linterna), «Galería» y «Eliminar». Mientras sube, un aviso en medio que no deja tocar nada.
// o: { name(), cat(), src(), credit?(), save(dataUrl), remove?(), blocked?() → texto si aún no se puede }
function photoField(o) {
  const box = h("div", { class: "ph-slot" }), fileIn = h("input", { type: "file", accept: "image/*", class: "hidden" });
  const use = async (url) => { const done = progress("Subiendo foto"); try { await o.save(url); } catch (e) { toast(e.message || "No se pudo guardar la foto", { error: true }); } finally { done(); draw(); } };
  fileIn.addEventListener("change", async () => {
    const file = fileIn.files[0]; fileIn.value = ""; if (!file) return;
    try { await use(await resizeImage(file, 800)); } catch (e) { toast(e.message || "Imagen no válida", { error: true }); }
  });
  const guard = (fn) => () => { const m = o.blocked && o.blocked(); if (m) return toast(m); fn(); };
  const draw = () => {
    const src = o.src(), alt = !src && o.fallback ? o.fallback().slice(0, 2) : [];
    const fr = alt.length ? h("div", { class: "pframe duo" + (alt.length > 1 ? " two" : "") }, alt.map((im) => h("img", { src: /^(\/|data:|https?:)/.test(im) ? im : "/" + im, alt: "" })))
      : photoFrame(o.name() || "?", o.cat(), src);
    fr.classList.add("pick");
    fr.onclick = (e) => { e.stopPropagation(); photoSheet(o.name(), o.cat(), src, guard(() => fileIn.click()), guard(() => cameraSheet(use)),
      src && src !== PH_LOADING && o.remove ? async () => { await o.remove(); draw(); } : null, o.credit && o.credit()); };
    box.replaceChildren(h("div", { class: "ph-ed" }, fr), fileIn);
  };
  draw();
  return { el: box, draw };
}
function photoSheet(name, cat, src, gallery, camera, remove, credit) {
  if (src === PH_LOADING) src = null;
  const s0 = src ? (/^(\/|data:|https?:)/.test(src) ? src : "/" + src) : null;
  const sh = sheet("Foto", [h("div", { class: "ph-big" }, s0 ? h("img", { src: s0, alt: "" }) : mono(name || "?", cat, null, true)),
    credit ? h("div", { class: "faint sm", style: { textAlign: "center", marginTop: "8px" } }, credit) : null],
    [remove ? h("button", { class: "btn ghost danger", onclick: async () => { sh.close(); await remove(); } }, "Eliminar foto") : null, h("span", { class: "grow" }),
      h("button", { class: "btn", onclick: () => { sh.close(); gallery(); } }, icon("image"), "Galería"),
      h("button", { class: "btn primary", onclick: () => { sh.close(); camera(); } }, icon("camera"), "Cámara")], { center: true, key: "foto" });
}
// Aviso en medio de la pantalla mientras se hace algo que tarda (subir una foto)
function progress(text) {
  const ov = h("div", { class: "prog-ov" }, h("div", { class: "prog-c" }, h("i", { class: "spin" }), text));
  document.body.append(ov); SAVING++;
  return () => { SAVING--; ov.remove(); };
}
// Linterna de la cámara (si el móvil la tiene)
function torchButton(getTrack) {
  let on = false;
  const b = h("button", { type: "button", class: "btn torch hidden", "aria-label": "Linterna" }, icon("bolt"), "Linterna");
  b.onclick = async () => { const tr = getTrack(); if (!tr) return; on = !on;
    try { await tr.applyConstraints({ advanced: [{ torch: on }] }); b.classList.toggle("on", on); } catch (e) { on = !on; toast("Esta cámara no tiene linterna", { error: true }); } };
  b.refresh = () => { const tr = getTrack(), cap = tr && tr.getCapabilities ? tr.getCapabilities() : null; b.classList.toggle("hidden", !(cap && cap.torch)); };
  return b;
}
// Cámara para hacer la foto de un producto (con linterna)
async function cameraSheet(onShot) {
  let stream = null;
  const video = h("video", { class: "scan-v", playsInline: true, muted: true, autoplay: true });
  const torch = torchButton(() => stream && stream.getVideoTracks()[0]);
  const shot = h("button", { class: "btn primary lg" }, icon("camera"), "Hacer foto");
  const sh = sheet("Hacer foto", [h("div", { class: "scan-w cam-w" }, video)], [torch, h("span", { class: "grow" }), shot],
    { full: true, key: "camara", onClose: () => { if (stream) stream.getTracks().forEach((t) => t.stop()); } });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
    video.srcObject = stream; await video.play(); torch.refresh();
  } catch (e) { sh.close(); toast("No se puede usar la cámara", { error: true }); return; }
  shot.onclick = () => {
    const k = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight)), c = document.createElement("canvas");
    c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.85); sh.close(); onShot(url);
  };
}
function photoFrame(name, cat, img) {
  if (img === PH_LOADING) return h("div", { class: "pframe none" }, phLoading(true));
  const src = img ? (/^(\/|data:|https?:)/.test(img) ? img : "/" + img) : null;
  const fr = h("div", { class: "pframe" + (src ? "" : " none") });
  if (src) fr.append(h("img", { src, alt: "", class: "zoomable", onerror: () => fr.replaceChildren(mono(name, cat, null, true)) }),
    h("button", { type: "button", class: "pzoom", title: "Ver en grande", onclick: () => zoomImg(src) }, "⤢"));
  else fr.append(mono(name, cat, null, true));
  return fr;
}
function tilePhoto(name, cat, img) {
  if (img === PH_LOADING) return h("div", { class: "ph none" }, phLoading(true));
  const src = img ? (/^(\/|data:|https?:)/.test(img) ? img : "/" + img) : null;
  if (src) return h("div", { class: "ph" }, h("img", { src, alt: "", loading: "lazy", onerror: (e) => { e.target.replaceWith(mono(name, cat)); } }));
  return h("div", { class: "ph none" }, mono(name, cat, null, true));
}
function foodTile(f, onclick) {
  const cat = f.kind === "receta" ? "receta" : f.category;
  const [n, lbl] = foodBasis(f);
  const ph = tilePhoto(f.name, cat, f.image); if (isLbl(f)) ph.append(lblSeal(true));
  return h("button", { class: "tile", onclick, type: "button" }, ph,
    h("div", { class: "tile-tx" }, h("div", { class: "tn" }, dname(f)), h("div", { class: "ts" }, f.kind === "receta" ? "Receta" : dname(f) !== f.name ? f.category || "" : f.brand || f.category || ""),
      macroBadges(n, lbl)));
}
function tplTile(t, onclick) {
  const imgs = t.image ? [t.image] : t.items.map((it) => (foodById(it.food_id) || {}).image).filter((x) => x && x !== PH_LOADING).slice(0, 2);
  const ph = imgs.length ? h("div", { class: "ph" + (imgs.length > 1 ? " duo" : "") }, imgs.map((im) => h("img", { src: /^(\/|https?:)/.test(im) ? im : "/" + im, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }))) : h("div", { class: "ph none" }, mono(t.name, "habitual", null, true));
  return h("button", { class: "tile", onclick, type: "button" }, ph,
    h("div", { class: "tile-tx" }, h("div", { class: "tn" }, t.name), h("div", { class: "ts" }, `${t.items.length} alimentos` + (t.servings > 1 ? ` · ${fmt(t.servings, 1)} raciones` : "")),
      macroBadges(t.servings > 1 ? scaleN(t.nutr, 1 / t.servings) : t.nutr, t.servings > 1 ? "ración" : "plato")));
}
const foodById = (id) => S.catalog.foods.find((f) => f.id === id);

function addSheet(meal) {
  const ctx = { meal, time: S.date === todayISO() ? nowHM() : "", q: "" };
  const sh = sheet("Añadir a " + MEALS.find((x) => x[0] === meal)[1].toLowerCase(), []);
  const list = h("div");
  const search = h("input", { class: "input lg", placeholder: "Buscar alimento o receta", autocomplete: "off" });
  const drawList = () => {
    const q = norm(search.value.trim());
    const foods = S.catalog.foods.filter((f) => !f.hidden && !f.deleted && f.reviewed);
    const tpls = S.catalog.templates.filter((t) => !t.hidden && !t.deleted && t.reviewed).sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name, "es"));
    if (!foods.length && !tpls.length) { list.replaceChildren(h("div", { class: "card empty flat" }, h("h3", null, "Nada aceptado todavía"), h("p", { class: "muted" }, "Revisa y acepta productos en Comida para que aparezcan aquí."))); return; }
    const secs = [];
    if (q) {
      const ws = q.split(/\s+/).filter(Boolean), has = (t) => ws.every((w) => t.includes(w));  // cada palabra, en cualquier orden
      const ft = tpls.filter((t) => has(norm(t.name)));
      const ff = foods.filter((f) => has(foodText(f)));
      if (ft.length) secs.push(["Recetas", ft.map((t) => tplTile(t, () => pickTemplate(t)))]);
      secs.push([ff.length ? "Alimentos" : "Sin resultados", ff.map((f) => foodTile(f, () => pickFood(f)))]);
    } else {
      if (tpls.length) secs.push(["Recetas", tpls.map((t) => tplTile(t, () => pickTemplate(t)))]);
      const freq = foods.filter((f) => f.uses_60d > 0).sort((a, b) => b.uses_60d - a.uses_60d).slice(0, 8);
      if (freq.length) secs.push(["Frecuentes", freq.map((f) => foodTile(f, () => pickFood(f)))]);
      const rest = foods.slice().sort((a, b) => (b.favorite - a.favorite) || dname(a).localeCompare(dname(b), "es"));
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
      await act(() => api("POST", "/api/entries", { date: S.date, food_id: f.id, ...d }), `${dname(f)} añadido`);
      sh.close();
    }
  };
  const pickTemplate = (t) => {
    // Las cantidades de la receta son para todas sus raciones; se elige cuántas raciones se come (escala todo) y,
    // si hace falta, se cambia o se quita algún alimento solo esta vez
    const nServ = t.servings > 1 ? t.servings : 1;
    const rows = t.items.map((it) => ({ it, on: true, qty: it.quantity / nServ, inp: null }));
    const food = (id) => foodById(id) || {};
    const totalEl = h("div", { class: "mprev mprev1" });
    const drawTotal = () => {
      const parts = rows.filter((r) => r.on && r.qty > 0).map((r) => { const u = (food(r.it.food_id).units || []).find((x) => x.key === r.it.unit_key); return u ? scaleN(u.per, r.qty) : { kcal: null, protein_g: null, carbs_g: null, fat_g: null }; });
      const n = sumN(parts);
      totalEl.replaceChildren(h("div", { class: "mp2" }, h("b", { class: "num" }, v(n, "kcal")), h("span", null, " kcal")), chipsOf(n));
    };
    const fq = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
    const serv = h("input", { class: "input num sm", value: "1", inputMode: "decimal" });
    serv.addEventListener("input", () => { const k = parseNum(serv.value); if (!(k > 0)) return; rows.forEach((r) => { r.qty = (r.it.quantity / nServ) * k; r.inp.value = fq(r.qty); }); drawTotal(); });
    const meal = mealChips(t.meal || ctx.meal), timeIn = h("input", { class: "input", type: "time", value: ctx.time });
    const tImg = t.image ? (/^(\/|data:|https?:)/.test(t.image) ? t.image : "/" + t.image) : null;
    const list = h("div", { class: "tpl-list" }, rows.map((r) => {
      const f = food(r.it.food_id); const u = (f.units || []).find((x) => x.key === r.it.unit_key) || { label: r.it.unit_key, key: r.it.unit_key };
      r.inp = h("input", { class: "input num sm", value: fq(r.qty), inputMode: "decimal", oninput: (e) => { r.qty = parseNum(e.target.value); drawTotal(); } });
      const row_ = h("label", { class: "tpl-row" });
      const cb = h("input", { type: "checkbox", checked: true, onchange: (e) => { r.on = e.target.checked; row_.classList.toggle("off", !r.on); drawTotal(); } });
      const ul = ["g", "ml"].includes(u.key) ? u.key : (u.label || "").replace(/\s*\([^)]*\)\s*$/, "").replace(/^1\s+/, "");
      row_.append(cb, mono(f.name || "?", f.category, f.image), h("div", { class: "nm" }, h("span", null, dname(f)), h("small", null, ul)), r.inp);
      return row_;
    }));
    const body = [
      h("div", { class: "food-head" }, tImg ? h("div", { class: "pframe sm" }, h("img", { src: tImg, alt: "" })) : mono(t.name, "habitual", null, true),
        h("div", { class: "fh-t" }, h("div", { class: "fh-n" }, t.name), h("div", { class: "fh-s" }, `Receta · ${rows.length} alimentos` + (nServ > 1 ? ` · salen ${fmt(nServ, 1)} raciones` : "")))),
      totalEl,
      h("div", { class: "tpl-serv" }, h("span", null, "Raciones"), serv),
      h("details", { class: "tpl-det" }, h("summary", null, `Alimentos (${rows.length})`), list),
      whenRow(meal, timeIn),
    ];
    drawTotal();
    sh.set("Añadir receta", body, [h("span", { class: "grow" }),
      h("button", { class: "btn primary lg", onclick: async () => {
        if (rows.some((r) => r.on && !(r.qty > 0))) return toast("Cantidad no válida", { error: true });
        await act(() => api("POST", `/api/templates/${t.id}/apply`, { date: S.date, meal: meal.value, time: timeIn.value || null,
          items: rows.map((r) => ({ id: r.it.id, quantity: r.qty, skip: !r.on })) }), `${t.name} añadida`);
        sh.close();
      } }, "Añadir")], { back: step1 });
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
  // la base «100 g» no es una medida para elegir (para eso están los gramos)
  const units = (food.units || []).filter((u, _, all) => !(/^p:/.test(u.key) && /^100 (g|ml)$/.test(u.label) && all.some((x) => x.key === "g" || x.key === "ml")))
    .sort((a, b) => ((du0 && b.key === du0.key) - (du0 && a.key === du0.key)) || (/^p:/.test(b.key) - /^p:/.test(a.key)));  // la de por defecto, luego las medidas, luego gramos
  let unit = init.unit_key, qty = init.quantity;
  // Por defecto: su medida («1 unidad») con 1; si no tiene, en gramos y vacío (lo escribes tú)
  if (!unit || !units.find((u) => u.key === unit)) {
    const du = defUnit(food);
    if (du) { unit = du.key; qty = ["g", "ml"].includes(du.key) ? null : 1; }
    else { const g = units.find((u) => u.key === "g" || u.key === "ml") || units[0]; unit = g ? g.key : null; qty = g && ["g", "ml"].includes(g.key) ? null : 1; }
  }
  // Raciones por unidad («1 barrita (23 g)»): si solo hay una, el chip dice «unidades» y abajo se explica cuánto es una
  const UNIT_RX = /^1\s+([^()]+?)\s*\(([^)]+)\)$/;
  const perUnit = units.filter((u) => u.key.startsWith("p:") && UNIT_RX.test(u.label));
  // cada medida con su nombre corto («lata», «cucharada»); los gramos, «gramos»
  const uLabel = (u) => ({ g: "gramos", ml: "ml", rac: "raciones", total: "receta entera", x: "ración" })[u.key] || u.label.replace(/\s*\([^)]*\)\s*$/, "").replace(/^1\s+/, "");
  const uHint = (u) => { const m = perUnit.length === 1 && perUnit[0] === u && u.label.match(UNIT_RX); return m ? `1 unidad = 1 ${m[1]} (${m[2]})` : null; };
  const qIn = h("input", { class: "qty-in num", value: String(qty ?? "").replace(".", ","), inputMode: "decimal", "aria-label": "Cantidad" });
  const isMass = () => ["g", "ml"].includes(unit);
  const stepBy = (dir) => {
    const q = parseNum(qIn.value) || 0, st = isMass() ? (q >= 100 ? 10 : 5) : (q < 1 || (dir < 0 && q <= 1) ? 0.5 : 1);
    let n = Math.round((q + dir * st) * 100) / 100; if (n <= 0) n = st;
    qIn.value = String(n).replace(".", ","); draw();
  };
  // La medida en un desplegable (en el móvil, el selector del sistema): «Media tortilla · 300 g», «gramos»…
  const uOpt = (u) => uLabel(u) + (u.amount && ["g", "ml"].includes(u.unit) && !["g", "ml"].includes(u.key) ? ` · ${fmt(u.amount)} ${u.unit}` : "");
  const uSel = h("select", { class: "unit-sel", "aria-label": "Medida" }, units.map((u) => h("option", { value: u.key, selected: u.key === unit }, uOpt(u))));
  uSel.addEventListener("change", () => {
    const was = isMass(); unit = uSel.value;
    if (was && !isMass()) qIn.value = "1";
    if (!was && isMass()) { qIn.value = ""; setTimeout(() => qIn.focus(), 30); }
    draw();
  });
  const unitsEl = h("label", { class: "unit-pick" + (units.length < 2 ? " one" : "") }, uSel, units.length > 1 ? icon("chev") : null);
  const drawUnits = () => { uSel.value = unit; };
  const meal = mealChips(init.meal), timeIn = h("input", { class: "input", type: "time", value: init.time || "" });
  const prev = h("div", { class: "mprev mprev1" }), note = h("div", { class: "note" });
  let qtyEst = !!init.qty_est;
  const noteIn = null;  // sin nota: el nombre y la cantidad lo dicen todo (las de antes se ven en la ficha de la entrada)
  const qeBtn = h("button", { type: "button", class: "qe-btn" + (qtyEst ? " on" : ""), title: "Márcalo si no lo has pesado ni contado", onclick: () => { qtyEst = !qtyEst; qeBtn.classList.toggle("on", qtyEst); draw(); } },
    h("i", { class: "qe-box" }, icon("check")), "Cantidad a ojo (sin pesar)");
  const draw = () => {
    const u = units.find((x) => x.key === unit), q = parseNum(qIn.value);
    qeBtn.classList.toggle("hidden", !isMass() && !init.qty_est);  // «a ojo» al escribir los gramos (o si ya estaba marcado, para poder quitarlo)
    const n = u && q > 0 ? scaleN(u.per, q) : { kcal: null, protein_g: null, carbs_g: null, fat_g: null, missing: [] };
    // Lo que suma: las kcal y los macros en una línea (y cuánto es, si es una medida: «2 × lata = 660 ml»)
    const w = u && u.amount && ["g", "ml"].includes(u.unit) && q > 0 && !isMass() ? ` · ${fmt(u.amount * q)} ${u.unit}` : "";
    prev.replaceChildren(h("div", { class: "mp2" }, h("b", { class: "num" }, v(n, "kcal")), h("span", null, " kcal" + w)), chipsOf(n));
    if (!u) { note.textContent = "Este alimento no tiene unidades registrables."; note.className = "note warn"; return; }
    const miss = u.per.missing || [];
    // abajo solo lo que hay que saber: valores a ojo o que faltan
    const warn = miss.length || ["estimacion", "provisional", "pendiente"].includes(u.quality);
    note.className = "note warn" + (warn ? "" : " hidden");
    const vq = ["estimacion", "provisional", "pendiente"].includes(u.quality) ? "Valores a ojo (no son de la etiqueta)" : "Valores de " + (u.quality === "etiqueta" ? "la etiqueta" : "tu histórico");
    note.textContent = [vq,  miss.length === 4 ? "sin datos: se registra como pendiente (no cuenta como 0)" : miss.length ? "macros incompletos: no se suman como 0" : null].filter(Boolean).join(" · ");
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
    h("div", { class: "food-head" }, food.image === PH_LOADING ? h("div", { class: "pframe sm none" }, phLoading(true)) : food.image ? h("div", { class: "pframe sm" }, h("img", { src: /^(\/|data:|https?:)/.test(food.image) ? food.image : "/" + food.image, alt: "" })) : mono(food.name, food.kind === "receta" ? "receta" : food.category, null, true),
      h("div", { class: "fh-t" }, h("div", { class: "fh-n" }, food.name), h("div", { class: "fh-s" }, foodSub(food)))),
    h("div", { class: "qty" },
      h("div", { class: "stepper" }, h("button", { type: "button", onclick: () => stepBy(-1), "aria-label": "Menos" }, icon("minus")), qIn,
        h("button", { type: "button", onclick: () => stepBy(1), "aria-label": "Más" }, icon("plus"))),
      unitsEl),
    prev, note,
    whenRow(meal, timeIn), noteIn ? field("Nota", noteIn) : null, qeBtn);
  form.value = () => {
    const q = parseNum(qIn.value);
    if (!(q > 0)) { toast(qIn.value.trim() ? "Cantidad no válida" : "Pon la cantidad", { error: true }); qIn.focus(); return null; }
    return { quantity: q, unit_key: unit, meal: meal.value, time: timeIn.value || null, qty_est: (isMass() || init.qty_est) && qtyEst, ...(noteIn ? { note: noteIn.value.trim() || null } : {}) };
  };
  setTimeout(() => { qIn.focus(); qIn.select(); }, 60);
  return form;
}

function estimateFields(init) {
  const name = h("input", { class: "input", placeholder: "Ej.: Ensaladilla rusa", value: init.name || "" });
  const qty = h("input", { class: "input", placeholder: "Ej.: 2 cañas", value: init.unit_label && init.unit_label !== "ración estimada" ? init.unit_label : "" });
  const num = (k, ph) => h("input", { class: "input num", inputMode: "decimal", placeholder: ph || "?", value: init[k] == null ? "" : String(init[k]).replace(".", ",") });
  const kc = num("kcal"), p = num("protein_g"), c = num("carbs_g"), g = num("fat_g"), mn = num("kcal_min", "mín."), mx = num("kcal_max", "máx.");
  const nota = h("input", { class: "input", placeholder: "Detalles: ingredientes, sitio, aceite…", value: init.note || "" });
  const meal = mealChips(init.meal), timeIn = h("input", { class: "input", type: "time", value: init.time || "" });
  const el = h("div", null,
    h("div", { class: "grid2" }, field("Qué es (un plato o bebida)", name), field("Cantidad", qty)),
    h("div", { class: "grid4 gap-top" }, field("kcal", kc), field("Proteína", p), field("Carbos", c), field("Grasas", g)),
    h("div", { class: "gap-top" }, field("Detalles", nota)),
    whenRow(meal, timeIn),
    h("details", { class: "fe-more" }, h("summary", null, "Rango de kcal", h("span", { class: "faint" }, " · opcional")), h("div", { class: "row" }, mn, h("span", { class: "faint" }, "–"), mx)),
    h("div", { class: "note" }, "Lo que no sepas, déjalo vacío (no cuenta como 0)."));
  setTimeout(() => name.focus(), 60);
  return { el, value: () => {
    const vals = { kcal: parseNum(kc.value), protein_g: parseNum(p.value), carbs_g: parseNum(c.value), fat_g: parseNum(g.value), kcal_min: parseNum(mn.value), kcal_max: parseNum(mx.value) };
    if (!name.value.trim()) { toast("Describe la comida", { error: true }); return null; }
    if (Object.values(vals).some(Number.isNaN)) { toast("Hay un número no válido", { error: true }); return null; }
    return { name: name.value.trim(), unit_label: qty.value.trim() || null, ...vals, note: nota.value || null, meal: meal.value, time: timeIn.value || null };
  } };
}

// Día cerrado: la entrada se puede ver entera, pero no cambiar
function entryInfo(e) {
  const fo = foodById(e.food_id) || {};
  const est = e.kind === "estimacion";
  const row = (l, val) => val == null || val === "" ? null : h("div", { class: "ei-r" }, h("span", null, l), h("b", null, val));
  sheet(fo.id && e.name === fo.name ? dname(fo) : e.name, [
    h("div", { class: "ei-top" }, mono(e.name, fo.category, fo.image, true),
      h("div", { class: "grow" }, h("div", { class: "ei-k num" }, v(e, "kcal"), h("small", null, " kcal")), chipsOf(e),
        est && e.kcal_min != null ? h("div", { class: "faint sm" }, `entre ${fmt(e.kcal_min)} y ${fmt(e.kcal_max)} kcal`) : null)),
    e.note ? h("div", { class: "ei-note" }, e.note) : null,
    h("div", { class: "ei-l" },
      row("Cantidad", est && e.unit_label === "ración estimada" ? null : e.unit_label),
      row("Comida", (MEALS.find((m) => m[0] === e.meal) || [0, e.meal])[1]), row("Hora", e.time),
      row("Tipo", est ? "Comida fuera (estimación)" : e.template_id ? "De una receta" : fo.kind === "receta" ? "Receta" : "Producto"),
      row("Valores", est ? "a ojo" : QUAL[e.quality] || e.quality)),
    h("div", { class: "note" }, icon("lock"), " Día cerrado: para cambiar algo, reábrelo.")],
    null, { big: true, sub: dateLabel(e.date, { weekday: "long", day: "numeric", month: "long" }) });
}
const chipsOf = (n) => h("div", { class: "mchips num" }, h("i", { class: "p" }, v(n, "protein_g")), h("i", { class: "c" }, v(n, "carbs_g")), h("i", { class: "g" }, v(n, "fat_g")));
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
  const form = amountForm(food, { unit_key: e.unit_key, quantity: e.quantity, meal: e.meal, time: e.time, qty_est: e.qty_est, note: e.note, editing: true });
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
  // objetivo y, al lado, la diferencia en un badge neutro
  const og = (goal, diff, ok, dec = 0) => goal == null ? "" : h("span", { class: "og" }, fmt(goal, dec),
    h("span", { class: "ogd " + (ok ? "ok" : "off") }, Math.abs(diff) < 0.5 ? "=" : signed(Math.round(diff))));
  const gap = () => h("tr", { class: "gap" }, h("td", { colspan: 3 }));
  const bal = s.balance;
  return h("div", null,
    h("table", { class: "t sumtbl v2" },
      h("tr", null, h("th", null, ""), h("th", { class: "r" }, "Día"), h("th", { class: "r" }, "Objetivo")),
      main("Calorías", v(t, "kcal") + " kcal", tg.kcal ? og(tg.kcal, d.kcal, Math.abs(d.kcal) <= 0.05 * tg.kcal) : ""),
      sub("Proteína", v(t, "protein_g") + " g", tg.protein_g != null ? og(tg.protein_g, d.protein_g, d.protein_g >= -5) : ""),
      sub("Carbohidratos", v(t, "carbs_g") + " g", tg.carbs_g != null ? og(tg.carbs_g, d.carbs_g, Math.abs(d.carbs_g) <= 0.15 * tg.carbs_g) : ""),
      sub("Grasas", v(t, "fat_g") + " g", tg.fat_mid_g != null ? og(tg.fat_mid_g, (t.fat_g || 0) - tg.fat_mid_g, (t.fat_g || 0) >= (tg.fat_min_g || 0) && (t.fat_g || 0) <= (tg.fat_max_g || 1e9)) : ""),
      gap(),
      main("Gasto estimado", fmt(en.total) + " kcal" + (en.complete ? "" : " *"), en.complete ? "" : "incompleto"),
      sub("Metabolismo basal", fmt(en.bmr), ""), sub("Digestión", fmt(en.tef), ""), sub("Día a día", fmt(en.neat), ""),
      sub("Pasos", en.steps_kcal == null ? "?" : fmt(en.steps_kcal), ""), sub("Entrenos", fmt(en.exercise_kcal), ""),
      gap(),
      (() => { // el balance frente al que buscabas: según el gasto, la diferencia elegida; fijo, objetivo − gasto
        const objB = tg.dynamic ? tg.kcal_offset : tg.kcal && en.total != null ? tg.kcal - en.total : null;
        return h("tr", { class: "main bal " + (bal == null ? "" : bal < 0 ? "neg" : "pos") }, h("td", null, "Balance estimado"), h("td", { class: "r num" }, signed(bal) + " kcal"),
          h("td", { class: "r num faint" }, bal == null ? "" : objB != null ? h("span", { class: "og" }, signed(Math.round(objB))) : bal < 0 ? "déficit" : "superávit"));
      })(),
      gap(),
      main("Peso", s.weight_kg != null ? kgf(s.weight_kg) + " kg" : "—", ""),
      main("Pasos", s.steps != null ? fmt(s.steps) : "—", ""),
      h("tr", { class: "main" }, h("td", null, "Entreno"), h("td", { class: "r wrapv" }, s.activities.length ? s.activities.map((a) => `${a.description || (ACT_TYPES.find((x) => x[0] === a.type) || [0, a.type])[1]}${a.minutes ? " · " + fmt(a.minutes) + " min" : ""}`).join(", ") : "descanso"), h("td", null))),
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
        sh.close(); await refresh(); toast("Día cerrado");
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
  const sh = sheet("Reabrir día", [h("div", { class: "muted" }, "Podrás cambiar lo que quieras y luego tendrás que volver a cerrarlo.")],
    [h("button", { class: "btn", onclick: () => sh.close() }, "Cancelar"), h("span", { class: "grow" }),
      h("button", { class: "btn primary lg", onclick: async () => { await act(() => api("POST", `/api/days/${date}/reopen`, {}), "Día reabierto"); sh.close(); } }, "Reabrir")]);
}

// ------------------------------------------------------------- biblioteca
// Fuente de los valores de un producto (la misma lista que en su ficha)
const SRC_KINDS = [["etiqueta", "Etiqueta"], ["off", "Open Food Facts"], ["estimacion", "Estimación"]];
const srcKind = (f) => /^open food facts/i.test(f.source || "") ? "off" : f.status === "etiqueta" ? "etiqueta" : "estimacion";
function viewLibrary() {
  const c = S.catalog; if (!c) return h("div");
  if (S.libFilter == null) S.libFilter = "todo";
  const filters = [["todo", "Todo"], ["producto", "Productos"], ["receta", "Recetas"], ["supl", "Suplementos"]];
  if (!["todo", "producto", "receta", "supl", "oculto"].includes(S.libFilter)) S.libFilter = "todo";
  // De dónde salen los valores de cada producto: para repasar los que no son de una etiqueta
  const srcSel = h("select", { class: "input lib-src", onchange: (e) => { S.libSrc = e.target.value; drawGrid(); } },
    [["", "Cualquier fuente"], ...SRC_KINDS].map(([k, l]) => h("option", { value: k, selected: (S.libSrc || "") === k }, l)));
  const search = h("input", { class: "input", placeholder: "Buscar", value: S.libQuery, oninput: (e) => { S.libQuery = e.target.value; drawGrid(); } });
  const grid = h("div");
  // Orden: lo último que has añadido o cambiado primero (por defecto), lo que más apuntas (60 días) o por nombre
  if (!S.libSort) { try { S.libSort = localStorage.getItem("libSort") || "reciente"; } catch (e) { S.libSort = "reciente"; } }
  const when = (x) => x.updated_at || x.created_at || "";
  const byName = (a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name, "es");
  const order = (L) => [...L].sort(S.libSort === "uso" ? (a, b) => (b.uses_60d || 0) - (a.uses_60d || 0) || when(b).localeCompare(when(a))
    : S.libSort === "nombre" ? byName : (a, b) => when(b).localeCompare(when(a)) || byName(a, b));
  const sortSeg = h("select", { class: "input lib-src lib-sort", title: "Orden", onchange: (e) => { S.libSort = e.target.value; try { localStorage.setItem("libSort", S.libSort); } catch (er) { /* sin almacenamiento */ } drawGrid(); } },
    [["reciente", "Recientes"], ["uso", "Más usados"], ["nombre", "A–Z"]].map(([k, l]) => h("option", { value: k, selected: S.libSort === k }, l)));
  const drawGrid = () => {
    const q = norm(S.libQuery), F = S.libFilter;
    const match = (n) => !q || q.split(/\s+/).filter(Boolean).every((w) => norm(n).includes(w));
    const sk = S.libSrc || "";
    const foods = c.foods.filter((f) => !f.deleted && match(f.name + " " + (f.original_name || "") + " " + (f.brand || "") + " " + (f.notes || "")) && (F === "oculto" ? f.hidden : !f.hidden) &&
      (!sk || (f.kind === "producto" && srcKind(f) === sk)) &&
      (F === "todo" || F === "oculto" || (F === "supl" && isSupp(f)) || (F === "producto" && f.kind === "producto") || (F === "oculto" && f.kind === "receta")));
    const tpls = c.templates.filter((t) => !t.deleted && match(t.name) && (F === "oculto" ? t.hidden : !t.hidden) && !sk && ["todo", "receta", "oculto"].includes(F));
    const secs = [];
    if (tpls.length) secs.push(["Recetas", order(tpls).map((t) => tplTile(t, () => templateEditor(t)))]);
    // Recetas antiguas (un solo alimento con ingredientes): ocultas; lo ya apuntado con ellas sigue igual
    const recs = order(foods.filter((f) => f.kind === "receta")), prods = order(foods.filter((f) => f.kind === "producto"));
    if (recs.length) secs.push(["Recetas antiguas", recs.map((f) => foodTile(f, () => recipeEditor(f)))]);
    const sups = prods.filter(isSupp), plain = prods.filter((f) => !isSupp(f));
    if (sups.length && ["todo", "supl", "revisar", "oculto", "pendiente"].includes(F)) secs.push(["Suplementos", sups.map((f) => foodTile(f, () => foodEditor(f)))]);
    if (plain.length && !["receta", "supl"].includes(F)) secs.push(["Productos", plain.map((f) => foodTile(f, () => foodEditor(f)))]);
    if (F === "supl" && !sups.length) secs.push(["Suplementos", [h("button", { class: "tile add-supp", onclick: () => suppCatalogSheet() }, h("b", null, "+ Añadir un suplemento"), h("span", { class: "faint" }, "creatina, vitaminas… (la dosis como ración)"))]]);
    grid.replaceChildren(...(secs.length ? secs.map(([t, tiles]) => [h("div", { class: "sec-t" }, `${t} · ${tiles.length}`), h("div", { class: "tiles" }, tiles)]).flat()
      : [h("div", { class: "muted", style: { padding: "20px 0" } }, "Nada por aquí.")]));
  };
  const chips = h("div", { class: "chips" }, filters.map(([k, l]) => h("button", { class: "chip" + (S.libFilter === k ? " on" : ""), onclick: () => { S.libFilter = k; render(); } }, l)));
  drawGrid();
  // Cabecera: buscar y «+ Nuevo»; debajo, el tipo; y a la derecha, pequeños, el orden y la fuente
  const newBtn = h("button", { class: "btn primary lib-new", onclick: (e) => { e.stopPropagation(); newMenu(e.currentTarget); } }, icon("plus"), h("span", null, "Nuevo"));
  const newMenu = (anchor) => {
    const old = document.querySelector(".lib-menu"); if (old) { old.remove(); return; }
    const m = h("div", { class: "acct-menu lib-menu" }, [["Producto", () => foodEditor(null)], ["Receta", () => templateEditor(null)], ["Suplemento", () => suppCatalogSheet()]]
      .map(([l, fn]) => h("button", { onclick: () => { m.remove(); fn(); } }, l)));
    document.body.append(m); const r = anchor.getBoundingClientRect();
    m.style.top = r.bottom + 6 + "px"; m.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    setTimeout(() => document.addEventListener("click", function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("click", off); } }), 0);
  };
  return h("div", { class: "lib" },
    h("div", { class: "lib-top" }, h("div", { class: "search grow" }, icon("search"), search), newBtn),
    h("div", { class: "lib-bar" }, chips, h("div", { class: "lib-tools" }, srcSel, sortSeg)),
    grid);
}

const numIn = (val, ph = "?") => h("input", { class: "input num", inputMode: "decimal", value: val == null ? "" : String(val).replace(".", ","), placeholder: ph });

// ---- Suplementos: cuándo se toma cada uno (cada día, algunos días, de fiesta, de entreno o cuando lo apunte), hora y aviso, y ciclo
const WD = ["L", "M", "X", "J", "V", "S", "D"];
const SUPP_OPTS = [["diario", "Cada día"], ["dias", "Algunos días de la semana"], ["fiesta", "Los días de fiesta", "Dos tomas: antes de salir y al volver"],
  ["entreno", "Los días de entreno"], ["manual", "Cuando yo lo apunte", "Sin recordatorio"]];
function suppSchedule(f) {
  let when = f.supp_when || "diario", days = new Set(String(f.supp_days || "").split(",").filter((x) => x !== "").map(Number));
  const time = h("input", { class: "input", type: "time", value: f.supp_time || "" });
  const notify = h("input", { type: "checkbox", class: "mv-sw", checked: f.supp_notify == null ? true : !!f.supp_notify });
  const cyc = /^(\d+)\+(\d+)$/.exec(f.supp_cycle || "");
  const cycOn = h("input", { type: "checkbox", class: "mv-sw", checked: !!cyc });
  const cOn = h("input", { class: "input num", inputMode: "numeric", value: cyc ? cyc[1] : "21" }), cOff = h("input", { class: "input num", inputMode: "numeric", value: cyc ? cyc[2] : "7" });
  const cStart = h("input", { class: "input", type: "date", value: f.supp_cycle_start || todayISO() });
  // Lo que se pregunta es lo fácil de saber: qué día empieza (o empezó) tu semana de descanso; el inicio del ciclo sale solo
  const restIn = h("input", { class: "input", type: "date" });
  const diffD = (a, b) => Math.round((new Date(a + "T12:00") - new Date(b + "T12:00")) / 864e5);
  const syncRest = () => { const on = parseInt(cOn.value), off = parseInt(cOff.value), st = cStart.value; if (!(on > 0 && off > 0 && st)) return;
    const L = on + off, k = Math.max(0, Math.ceil((diffD(todayISO(), st) - on - off + 1) / L)); restIn.value = addDays(st, on + k * L); };
  restIn.addEventListener("change", () => { const on = parseInt(cOn.value); if (restIn.value && on > 0) { cStart.value = addDays(restIn.value, -on); draw(); } });
  const box = h("div", { class: "supp-sched" });
  const draw = () => { syncRest(); box.replaceChildren(...[
    h("div", { class: "sec-t" }, "Cuándo se toma"),
    SUPP_OPTS.map(([k, t, d]) => h("div", { class: "opt" + (when === k ? " on" : ""), onclick: (e) => { if (e.target.closest(".wd")) return; when = k; draw(); } },
      h("span", { class: "rd" }), h("span", { class: "grow" }, h("b", null, t), d ? h("span", { class: "faint" }, d) : null,
        k === "dias" && when === "dias" ? h("span", { class: "wd" }, WD.map((x, i) => h("button", { type: "button", class: days.has(i) ? "on" : "", onclick: () => { days.has(i) ? days.delete(i) : days.add(i); draw(); } }, x))) : null))),
    when !== "manual" ? h("div", { class: "grid2", style: { marginTop: "4px" } },
      h("div", null, h("label", { class: "f" }, "Hora (opcional)"), time),
      h("label", { class: "mv-type", style: { alignSelf: "end" } }, h("span", { class: "grow" }, h("b", null, "Avisarme"), h("span", { class: "faint sm" }, "A su hora y al cerrar el día")), notify)) : null,
    when !== "manual" ? h("label", { class: "mv-type", style: { marginTop: "8px" } }, h("span", { class: "grow" }, h("b", null, "Con días de descanso"), h("span", { class: "faint sm" }, "Por ejemplo la píldora: 21 días sí y 7 no")), cycOn) : null,
    when !== "manual" && cycOn.checked ? h("div", { class: "grid3", style: { marginTop: "8px" } }, field("Días de toma", cOn), field("De descanso", cOff), field("Descanso desde", restIn)) : null,
    when !== "manual" && cycOn.checked ? cyclePreview() : null].flat().filter(Boolean)); };
  // Las próximas semanas: qué días toca y cuáles son de descanso. Tocando un día, el descanso empieza ese día.
  function cyclePreview() {
    const on = parseInt(cOn.value), off = parseInt(cOff.value), st = cStart.value;
    if (!(on > 0 && off > 0 && st)) return null;
    const t = todayISO(), dow = (iso) => (new Date(iso + "T12:00").getDay() + 6) % 7, diff = (a, b) => Math.round((new Date(a + "T12:00") - new Date(b + "T12:00")) / 864e5);
    const state = (d) => { const k = diff(d, st); if (k < 0) return "pre"; const m = k % (on + off); return m < on ? "take" : "rest"; };
    const wdOk = (d) => when !== "dias" || days.has(dow(d));
    const g = h("div", { class: "sst-cal cyc" }, ["L", "M", "X", "J", "V", "S", "D"].map((d) => h("span", { class: "sst-wd" }, d)));
    const first = addDays(t, -dow(t));
    for (let i = 0; i < 35; i++) {
      const d = addDays(first, i), s_ = state(d), n = +d.slice(8);
      g.append(h("span", { class: "sst-d " + (s_ === "take" && wdOk(d) ? "ok" : s_ === "rest" ? "rest" : "off") + (d === t ? " today" : ""), title: dateLabel(d) + (s_ === "rest" ? " · descanso" : s_ === "take" ? " · toca" : ""),
        onclick: () => { cStart.value = addDays(d, -on); draw(); } }, n === 1 ? h("b", null, dateLabel(d, { month: "short" }).replace(".", "")) : String(n)));
    }
    return h("div", { class: "cyc-prev" }, g, h("div", { class: "sst-leg" }, h("span", null, h("i", { class: "sst-d ok" }), "Toca"), h("span", null, h("i", { class: "sst-d rest" }), "Descanso"),
      h("span", { class: "faint" }, "Toca el primer día de tu descanso para colocarlo")));
  }
  cycOn.addEventListener("change", draw);
  for (const el of [cOn, cOff]) el.addEventListener("change", draw);
  draw();
  return { el: box, data: () => ({ supp_when: when, supp_days: [...days].sort().join(","), supp_time: time.value || null, supp_notify: notify.checked,
    supp_cycle: cycOn.checked && parseInt(cOn.value) > 0 && parseInt(cOff.value) > 0 ? `${parseInt(cOn.value)}+${parseInt(cOff.value)}` : null, supp_cycle_start: cycOn.checked ? cStart.value || null : null }) };
}
// Añadir un suplemento: del catálogo (con su dosis, cuándo y su dibujo) o a mano
async function suppCatalogSheet() {
  const list = await api("GET", "/api/supplements/catalog").catch((e) => { toast(e.message, { error: true }); return null; });
  if (!list) return;
  let q = "";
  const inp = h("input", { class: "input", placeholder: "Buscar: creatina, B12, hierro…", oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } });
  const box = h("div", { class: "catl" });
  const add = async (x) => { const f = await act(() => api("POST", "/api/supplements/catalog/" + x.key, {}), x.name + " añadido"); if (f) { sh.close(); } };
  const draw = () => box.replaceChildren(...list.filter((x) => !q || (x.name + " " + x.notes).toLowerCase().includes(q)).map((x) =>
    h("div", { class: "cat" }, h("img", { class: "cat-img", src: x.img, alt: "" }), h("span", { class: "grow" }, h("b", null, x.name), h("span", { class: "faint" }, `${x.dose} · ${x.when_txt}`)),
      x.added ? h("span", { class: "faint sm" }, "Ya lo tienes") : h("button", { class: "btn sm", onclick: () => add(x) }, "Añadir"))));
  draw();
  const sh = sheet("Añadir suplemento", [inp, h("div", { class: "sec-t" }, "Del catálogo"), box,
    h("button", { class: "btn ghost", style: { marginTop: "12px" }, onclick: () => { sh.close(); foodEditor(null, { supp: true }); } }, "+ Crear uno a mano")], null,
    { sub: "Con su dosis, horario e ilustración" });
  setTimeout(() => inp.focus(), 50);
}
// Valores y medidas de un producto. Los valores van por 100 g (o 100 ml), como en la etiqueta; cada medida («1 lata»,
// «1 cucharada») es solo su peso y sus valores salen solos. Lo que no se pesa (una cápsula, un plato de bar) va «por unidad».
// Una medida sin peso puede llevar sus propios valores (p. ej. «1 pico» si no sabes cuánto pesa).
const MK = ["kcal", "protein_g", "carbs_g", "fat_g"], MKL = { kcal: "kcal", protein_g: "Proteína", carbs_g: "Carbos", fat_g: "Grasas" };
const r1 = (v) => v == null ? null : Math.round(v * 10) / 10;
function measuresEditor(f, onDirty, onUnlock) {
  const P = (f.portions || []).filter((p) => !p.deleted);
  const isW = (p) => p && ["g", "ml"].includes(p.unit) && p.amount > 0;
  const base0 = P.find((p) => p.is_default && isW(p)) || P.find(isW) || null;
  let mode = base0 ? base0.unit : P.length ? "ud" : "g";
  const unit0 = base0 ? null : (P.find((p) => p.is_default) || P[0] || null);
  const per100 = (p, k) => p[k] == null ? null : r1((p[k] * 100) / p.amount);
  const vIn = {};
  for (const k of MK) { vIn[k] = numIn(base0 ? per100(base0, k) : unit0 ? unit0[k] : null); vIn[k].addEventListener("input", () => { refresh(); onDirty(); }); }
  const unitLabel = h("input", { class: "input", value: unit0 ? unit0.label : "1 unidad", placeholder: "p. ej. 1 cápsula" });
  const baseId = base0 && Math.abs(base0.amount - 100) < 1e-6 ? base0.id : null;  // la base que no era de 100 (p. ej. «1 ración (30 g)») sigue como medida
  const deleted = [], meds = [];
  let locked = false, def = null;  // def: la medida por defecto (objeto) o null
  // Cada medida se construye una vez (si se rehiciera al escribir, el móvil cerraría el teclado en cada letra)
  // Medida de antes sin peso pero con sus kcal (p. ej. «1 tortita», 25 kcal): su peso sale de las kcal por 100 (se puede cambiar)
  const guessW = (m) => { if (!m.legacy || mode === "ud" || parseNum(m.amt.value) > 0) return; const b100 = parseNum(vIn.kcal.value);
    if (b100 > 0 && m.kcal0 > 0) m.amt.value = String(Math.round((1000 * m.kcal0) / b100) / 10).replace(".", ","); };
  const addMed = (p, fresh) => {
    // se ve solo el nombre («lata»); al guardar queda «1 lata (330 ml)»
    let shown = isW(p) ? (p.label || "").replace(/\s*\(\s*[\d.,]+\s*(g|ml)\s*\)\s*$/i, "").replace(/^1\s+/, "") : (p.label || "");
    if (/^[\d.,]+\s*(g|ml)$/i.test(shown)) shown = "";
    const m = { id: p.id || null, legacy: !!p.id && !isW(p) && MK.some((k) => p[k] != null), label: h("input", { class: "input", value: shown, placeholder: "lata, cucharada…" }),
      amt: numIn(isW(p) ? p.amount : null, mode === "ml" ? "ml" : "g"), own: {} };
    for (const k of MK) m.own[k] = numIn(isW(p) ? null : p[k]);
    m.kcal0 = isW(p) ? null : p.kcal;
    guessW(m);
    m.unitTx = h("span", null, mode);
    m.wEl = h("label", { class: "med-w" }, m.amt, m.unitTx);
    m.star = h("button", { type: "button", class: "med-rd", title: "Por defecto al añadirlo", "aria-label": "Por defecto", onclick: () => { def = m; refresh(); onDirty(); } });
    m.vEl = h("div", { class: "med-v num" });
    m.ownEl = h("div", { class: "med-own" }, h("div", { class: "grid4" }, MK.map((k) => field(MKL[k], m.own[k]))));
    m.x = h("button", { type: "button", class: "icon-btn med-x", title: "Quitar esta medida", onclick: () => {
      const i = meds.indexOf(m); if (i < 0) return; if (m.id) deleted.push(m.id); meds.splice(i, 1); if (def === m) def = null; drawMeds(); onDirty(); } }, icon("x"));
    m.el = h("div", { class: "med" }, h("div", { class: "med-top" }, m.star, m.label, m.wEl, m.x), m.ownEl);
    for (const el of [m.label, m.amt, ...Object.values(m.own)]) el.addEventListener("input", () => { refresh(); onDirty(); });
    meds.push(m); if (fresh) { drawMeds(); setTimeout(() => m.label.focus(), 30); }
    return m;
  };
  for (const p of P) if (p !== unit0 && p.id !== baseId) addMed(p);
  { const k = f.default_unit || ""; def = meds.find((m) => m.id && "p:" + m.id === k) || null;
    if (!def && !k && base0 && base0.id !== baseId) def = meds.find((m) => m.id === base0.id) || null; }
  // Por defecto al añadir, sin elegir nada: la primera medida que sea una unidad (lata, barrita, rebanada…); si solo está
  // el paquete o el envase entero, los gramos
  const isWhole = (m) => /^(1\s+)?(paquete|envase|caja|bolsa entera|tarro)\b/i.test(m.label.value.trim()) && !(mode === "ml" && parseNum(m.amt.value) <= 500);
  // Con varias medidas, el círculo de la izquierda elige cuál (si no se elige, la regla de arriba)
  const defMed = () => (mode === "ud" ? null : meds.length > 1 && def && meds.includes(def) ? def : meds.find((m) => m.label.value.trim() && parseNum(m.amt.value) > 0 && !isWhole(m)) || null);
  const vals = () => Object.fromEntries(MK.map((k) => [k, parseNum(vIn[k].value)]));
  const calc = (m) => { const a = parseNum(m.amt.value), v = vals();
    return a > 0 && mode !== "ud" ? Object.fromEntries(MK.map((k) => [k, v[k] == null || Number.isNaN(v[k]) ? null : r1((v[k] * a) / 100)])) : null; };
  const modeSel = h("select", { class: "mx-mode", title: "Cómo vienen los valores en la etiqueta" },
    [["g", "por 100 g"], ["ml", "por 100 ml"], ["ud", "por unidad"]].map(([k, l]) => h("option", { value: k, selected: k === mode }, l)));
  modeSel.addEventListener("change", () => { mode = modeSel.value; drawVals(); drawMeds(); onDirty(); });
  const lockLnk = h("button", { type: "button", class: "mx-lock hidden", title: "Los valores vienen de Open Food Facts", onclick: () => onUnlock && onUnlock() }, icon("lock"), "Open Food Facts · ", h("u", null, "editar"));
  const valsBox = h("div"), medsBox = h("div", { class: "meds" }), legend = h("span", { class: "med-leg hidden" }, h("i"), "por defecto");
  const addBtn = h("button", { type: "button", class: "add-row", onclick: () => addMed({}, true) }, icon("plus"), "Añadir medida");
  function refresh() {
    const dm = defMed();
    legend.classList.add("hidden");
    meds.forEach((m) => {
      const c = calc(m), hasW = parseNum(m.amt.value) > 0;
      m.wEl.classList.toggle("hidden", mode === "ud"); m.unitTx.textContent = mode; m.amt.placeholder = mode === "ml" ? "ml" : "g";
      m.vEl.classList.add("hidden"); m.ownEl.classList.toggle("hidden", !!c || mode !== "ud");  // una medida es su nombre y lo que pesa: sus valores salen de los gramos
      if (c) m.vEl.textContent = `${c.kcal == null ? "?" : fmt(c.kcal)} kcal · P ${c.protein_g == null ? "?" : fmt(c.protein_g, 1)} · C ${c.carbs_g == null ? "?" : fmt(c.carbs_g, 1)} · G ${c.fat_g == null ? "?" : fmt(c.fat_g, 1)}`;
      m.star.classList.toggle("hidden", meds.length < 2 || mode === "ud"); m.star.classList.toggle("on", dm === m);
      m.el.classList.toggle("def", dm === m);
    });
  }
  function drawMeds() {
    medsBox.replaceChildren(...meds.map((m) => m.el));
    refresh(); lockApply();
  }
  const drawVals = () => valsBox.replaceChildren(...[mode === "ud" ? field("Una unidad es", unitLabel) : null,
    h("div", { class: "mx-vals" }, MK.map((k) => field(MKL[k], vIn[k])))].filter(Boolean));
  function lockApply() { for (const k of MK) vIn[k].disabled = locked; unitLabel.disabled = locked; modeSel.disabled = locked; lockLnk.classList.toggle("hidden", !locked); }
  drawVals(); drawMeds();
  const el = h("div", { class: "mx" },
    h("div", { class: "mx-h" }, h("b", null, "Valores"), modeSel, h("span", { class: "grow" }), lockLnk), valsBox,
    h("div", { class: "mx-h mx-h2" }, h("b", null, "Medidas")), medsBox, addBtn);
  return {
    el,
    lock(on) { locked = on; lockApply(); },
    complete: () => MK.every((k) => vIn[k].value.trim() !== ""),
    // Lo que trae Open Food Facts: valores por 100 y su ración o unidad («1 lata (500 ml)»)
    fromOff(o) {
      mode = o.unit === "ml" ? "ml" : "g"; modeSel.value = mode;
      for (const k of MK) vIn[k].value = o.per100[k] == null ? "" : String(o.per100[k]).replace(".", ",");
      meds.forEach(guessW);
      if (o.serving) {
        let m = meds.find((x) => Math.abs((parseNum(x.amt.value) || 0) - o.serving.amount) < 0.6);
        if (!m) m = addMed({ label: o.serving.label.replace(/\s*\([^)]*\)\s*$/, ""), amount: o.serving.amount, unit: mode });
        else if (!m.label.value.trim()) m.label.value = o.serving.label;
        if (o.serving.per_unit) def = m;
      }
      drawVals(); drawMeds();
    },
    data(quality) {
      const v = vals(); if (Object.values(v).some(Number.isNaN)) return { error: "Hay un número no válido" };
      if (MK.every((k) => v[k] == null)) return { error: "Faltan los valores: pon al menos las kcal" };
      // Sin kcal pero con los tres macros: las kcal salen de ellos (4 · proteína + 4 · carbohidratos + 9 · grasas)
      if (v.kcal == null && v.protein_g != null && v.carbs_g != null && v.fat_g != null) v.kcal = Math.round(4 * v.protein_g + 4 * v.carbs_g + 9 * v.fat_g);
      const out = [], dm = defMed();
      if (mode === "ud") out.push({ id: unit0 ? unit0.id : null, label: unitLabel.value.trim() || "1 unidad", amount: 1, unit: "ud", quality, is_default: true, ...v, ...(!(unit0 && unit0.id) ? { by_unit: true } : {}) });
      else out.push({ id: baseId, label: "100 " + mode, amount: 100, unit: mode, quality, is_default: true, ...v });
      if (mode !== "ud" && unit0 && unit0.id) deleted.push(unit0.id);
      if (mode === "ud" && baseId) deleted.push(baseId);
      for (const m of meds) {
        const a = parseNum(m.amt.value), c = calc(m), own = Object.fromEntries(MK.map((k) => [k, parseNum(m.own[k].value)]));
        if (Number.isNaN(a) || Object.values(own).some(Number.isNaN)) return { error: "Hay un número no válido en las medidas" };
        let label = m.label.value.trim();
        if (!label && !a) continue;  // fila vacía
        if (!label) return { error: `Ponle nombre a la medida de ${fmt(a)} ${mode}` };
        else if (c) label = `${/^\d/.test(label) ? "" : "1 "}${label.replace(/\s*\([^)]*\)\s*$/, "")} (${fmt(a)} ${mode})`;  // «lata» → «1 lata (330 ml)»
        if (!c && mode !== "ud") return { error: `Pon cuánto pesa «${label}»` };
        if (!c && MK.every((k) => own[k] == null)) return { error: `Pon los valores de «${label}»` };
        out.push({ id: m.id, label, amount: c ? a : null, unit: c ? mode : "ud", quality, is_default: false, ...(c || own), ...(dm === m && !m.id ? { by_unit: true } : {}) });
      }
      for (const id of deleted) out.push({ id, deleted: true });
      const default_unit = dm ? (dm.id ? "p:" + dm.id : undefined) : mode === "ud" ? (unit0 && unit0.id ? "p:" + unit0.id : undefined) : "";
      return { portions: out, default_unit };
    },
  };
}
function foodEditor(f, opt = {}) {
  const isNew = !f;
  f = f || (opt.supp ? { name: "", status: "etiqueta", category: "Suplemento", brand: "", source: "", notes: "", portions: [{ label: "1 dosis", amount: 5, unit: "g", kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, quality: "etiqueta", is_default: 1 }] }
    : { name: "", status: "etiqueta", category: "", brand: "", source: "", notes: "", portions: [{ label: "100 g", amount: 100, unit: "g", quality: "etiqueta", is_default: 1 }] });
  const name = h("input", { class: "input ed-name", value: f.name, placeholder: "Nombre" });
  const cats = [...new Set(S.catalog.foods.map((x) => x.category).filter(Boolean))].sort();
  const cat = h("input", { class: "input", value: f.category || "", list: "cats", placeholder: "Categoría" });
  const dl = h("datalist", { id: "cats" }, cats.map((c) => h("option", { value: c })));
  const brand = h("input", { class: "input", value: f.brand || "", placeholder: "Marca (opcional)" });
  // De dónde salen los valores: de la etiqueta (a mano), de Open Food Facts (la etiqueta, por su código) o estimados. Con eso, su estado.
  const src0 = f.source || "";
  let offCode = (src0.match(/(\d{8,14})/) || [])[1] || null;
  const srcKind0 = /^open food facts/i.test(src0) ? "off" : isNew || f.status === "etiqueta" ? "etiqueta" : "estimacion";
  const srcSel = new EventTarget(); srcSel.value = srcKind0;
  // Dos opciones (Etiqueta / Estimación) y, con Etiqueta, una casilla «De Open Food Facts»
  const srcSeg = h("div", { class: "src-box" });
  const setSrc = (k) => { if (srcSel.value === k) return; srcSel.value = k; srcSel.dispatchEvent(new Event("change")); dirtyF(); };
  const drawSrc = () => {
    const lbl = srcSel.value !== "estimacion";
    srcSeg.replaceChildren(
      h("div", { class: "seg full src-seg" }, [["etiqueta", "Etiqueta", lbl], ["estimacion", "Estimación", !lbl]].map(([k, l, on]) =>
        h("button", { type: "button", class: on ? "on" : "", onclick: () => !on && setSrc(k === "etiqueta" && offCode && /^open food facts/i.test(src0) ? "off" : k) }, l))),
      lbl ? h("label", { class: "chk src-off" }, h("input", { type: "checkbox", checked: srcSel.value === "off", onchange: (e) => setSrc(e.target.checked ? "off" : "etiqueta") }),
        h("span", null, "De Open Food Facts", offCode ? h("small", null, " · " + offCode) : null)) : null);
  };
  srcSel.addEventListener("change", drawSrc); drawSrc();
  const status = { get value() { return srcSel.value === "estimacion" ? "estimacion" : "etiqueta"; }, set value(_) {} };
  const sourceText = () => ({ etiqueta: /^cat[aá]logo/i.test(src0) ? src0 : "Etiqueta", off: "Open Food Facts" + (offCode ? " · " + offCode : ""), estimacion: /^(etiqueta|open food facts)/i.test(src0) || !src0 ? "Estimación" : src0 })[srcSel.value];
  // Descripción interna: solo en la ficha del producto (no al añadirlo al día); sirve para encontrarlo al buscar
  const notes = h("textarea", { class: "input", rows: 2, placeholder: "Aspecto, envase, dónde se compra…" }, f.notes || "");
  const dirtyF = () => { if (typeof sh !== "undefined" && sh && sh.markDirty) sh.markDirty(); };
  // Valores de Open Food Facts: bloqueados; «editar» los pasa a mano (y la fuente deja de ser Open Food Facts)
  const mx = measuresEditor(f, dirtyF, () => { srcSel.value = "etiqueta"; srcSel.dispatchEvent(new Event("change")); dirtyF(); });
  const orig = !isNew && (f.original_name || f.historical_text || f.import_note) ? h("details", { style: { marginTop: "12px" } }, h("summary", null, "Origen e historial del dato"),
    h("pre", { class: "orig" }, [f.original_name && "Nombre original: " + f.original_name, f.previous_name && "Nombre anterior: " + f.previous_name, f.code && "Código: " + f.code,
      f.import_note && "Nota de importación: " + f.import_note, f.historical_text && "Referencia histórica:\n" + f.historical_text].filter(Boolean).join("\n\n"))) : null;
  let pendingImg = null, completeBtn = null, applyLock = () => {};
  const ph = photoField({
    name: () => name.value || f.name, cat: () => cat.value || f.category, src: () => pendingImg || f.image,
    credit: () => f.image_source && !pendingImg ? "Foto: " + (/^https?:/.test(f.image_source) ? "Open Food Facts (CC BY-SA)" : f.image_source) : null,
    save: async (url) => { if (isNew) { pendingImg = url; offImg = null; return; }
      const r = await api("POST", `/api/foods/${f.id}/image`, { data_url: url }); f.image = r.image; f.image_source = null; pendingImg = null; loadCatalog().then(render).catch(() => {}); },
    remove: async () => { if (pendingImg) { pendingImg = null; offImg = null; return; }
      await act(() => api("DELETE", `/api/foods/${f.id}/image`), "Foto quitada"); f.image = null; },
  });
  const photoBox = ph.el, drawPhoto = ph.draw;
  // Código de barras o enlace de Open Food Facts: rellena nombre, marca, valores por 100 g, la ración y la foto (si no tiene)
  let offImg = null;
  const offNote = h("div", { class: "note hidden" });
  const applyOff = (o) => {
    if (typeof sh !== "undefined" && sh.markDirty) sh.markDirty();
    if (!name.value.trim() || isNew) name.value = o.name || name.value;
    if (!brand.value.trim() && o.brand) brand.value = o.brand;
    offCode = o.code; srcSel.value = "off"; drawSrc();
    if (completeBtn) completeBtn.classList.add("hidden");
    setTimeout(() => applyLock(), 0);
    mx.fromOff(o);
    const hadPhoto = !!(f.image || pendingImg);
    if (o.image_url && !hadPhoto) { offImg = o.image_url; pendingImg = o.image_url; drawPhoto(); }
    // Solo si hay algo que hacer: Open Food Facts no trae (todos) sus valores
    offNote.className = "note warn off-found" + (o.complete ? " hidden" : "");
    offNote.replaceChildren(Object.values(o.per100).every((x) => x == null) ? "Open Food Facts no tiene sus valores nutricionales" : "A Open Food Facts le faltan valores");
    if (o.image_url && hadPhoto) offNote.append(h("div", { class: "off-photo" }, h("img", { src: o.image_url, alt: "" }), h("span", null, "Foto de Open Food Facts"),
      h("button", { type: "button", class: "btn sm", onclick: (e) => { offImg = o.image_url; pendingImg = o.image_url; drawPhoto(); e.currentTarget.parentNode.remove(); toast("Se cambiará al guardar"); } }, "Usar esta foto")));
  };
  // Solo si aún no viene de Open Food Facts (al completarlo, desaparece)
  // Solo si los valores son estimados (elegido en «Valores», aunque aún no se haya guardado)
  completeBtn = !isNew && !/suplement/i.test(f.category || "") ? h("button", { type: "button", class: "off-cta", onclick: () => {
    const m = sheet("Completar producto", offChooser((o) => { m.close(); applyOff(o); }, false, null, f.id), null, { sub: "Con el código de barras o el enlace de Open Food Facts: valores, ración y foto" });
  } }, h("span", { class: "off-ic" }, icon("barcode")), h("span", null, h("b", null, "Completar con código de barras"), h("small", null, "Valores, ración y foto de Open Food Facts")), h("span", { class: "chev" }, icon("right"))) : null;
  // Sale mientras no esté marcado «De Open Food Facts» (aparece o se va al momento, sin guardar)
  if (completeBtn) { const showCta = () => completeBtn.classList.toggle("hidden", srcSel.value === "off"); srcSel.addEventListener("change", showCta); showCta(); }
  // Suplementos: «Cuándo se toma» (sale si la categoría es Suplemento)
  const sched = suppSchedule(f);
  const showSched = () => sched.el.classList.toggle("hidden", !/suplement/i.test(cat.value));
  cat.addEventListener("input", showSched); showSched();
  // Si los valores vienen de Open Food Facts, quedan bloqueados; para cambiarlos se pasa a «a mano» (y deja de ser de Open Food Facts)
  applyLock = () => mx.lock(srcSel.value === "off" && mx.complete());  // si a Open Food Facts le faltan valores, se pueden poner a mano
  srcSel.addEventListener("change", () => applyLock());
  // Lo importante a la vista (foto, nombre, valores y medidas); lo demás, en «Más datos»
  const more = h("details", { class: "fe-more" }, h("summary", null, "Más"),
    h("div", { class: "grid2" }, field("Marca", brand), field("Categoría", cat)),
    h("div", { class: "gap-top" }, field("Valores", srcSeg)),
    h("div", { class: "gap-top" }, field("Descripción", notes)), orig);
  const body = [dl, completeBtn, offNote,
    edHead(name, photoBox),
    mx.el, sched.el, more];
  const save = async (accept) => {
    const md = mx.data(status.value);
    if (md.error) return toast(md.error, { error: true });
    // ¿ya lo tienes? (mismo nombre y marca)
    const twin = isNew && !(opt.off && opt.off.allow_dup) && (S.catalog.foods || []).find((x) => !x.deleted && norm(x.name) === norm(name.value.trim()) && norm(x.brand || "") === norm(brand.value.trim()));
    if (twin && !confirm(`Ya tienes «${dname(twin)}». ¿Crear otro igualmente?`)) return;
    const portions = md.portions;
    const data = { ...(/suplement/i.test(cat.value) ? sched.data() : {}), ...((opt.off && opt.off.allow_dup) || twin ? { allow_dup: true } : {}), name: name.value.trim(), category: cat.value.trim() || null, brand: brand.value.trim() || null, status: status.value, source: sourceText(), notes: notes.value.trim() || null, portions, ...(accept === true ? { reviewed: true } : {}), ...(!isNew && md.default_unit !== undefined ? { default_unit: md.default_unit || null } : {}) };
    if (isNew) {
      const created = await act(() => api("POST", "/api/foods", data), "Producto creado");
      if (pendingImg && created) {
        if (offImg && pendingImg === offImg) offPhotoBg(created.id, offImg);  // la foto de Open Food Facts la descarga el servidor sin hacer esperar
        else await act(() => api("POST", `/api/foods/${created.id}/image`, { data_url: pendingImg }));
      }
    } else {
      await act(() => api("PUT", "/api/foods/" + f.id, { ...data, apply_open_days: true }), "Guardado");  // corregir un producto corrige lo ya apuntado
      if (offImg && pendingImg === offImg) offPhotoBg(f.id, offImg);
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
    !isNew ? h("button", { class: "btn ghost danger", onclick: () => deleteFoodSheet(f, () => sh.close()) }, "Eliminar") : null,
    h("span", { class: "grow" }), ...saveButtons(isNew, f, save)], { wide: true, guard: true, sub: reviewSub(isNew, f),
    titleExtra: isNew ? null : favButton(!!f.favorite, async (nv) => { await act(() => api("POST", `/api/foods/${f.id}/favorite`, { value: nv })); f.favorite = nv ? 1 : 0; }, "Quitar de favoritos", "Favorito: sale antes al buscar") });
  if (opt.off) applyOff(opt.off);
  applyLock();
  if (isNew) setTimeout(() => name.focus(), 40);
}

// Elegir cómo traer un producto de Open Food Facts: cámara o código/enlace escrito
// Si ese código ya es de un producto tuyo, lo dice antes de seguir (para no tenerlo dos veces): abrir el tuyo o crear otro igualmente.
// `selfId`: el producto que se está completando (ese no cuenta).
function offChooser(onFound, big, onManual, selfId) {
  const inp = h("input", { class: "input", placeholder: "Código de barras o enlace de Open Food Facts", inputMode: "text" });
  const note = h("div", { class: "note hidden" });
  const dup = h("div", { class: "off-dup hidden" });
  const find = async (q) => {
    q = (q || inp.value).trim(); if (!q) { inp.focus(); return; }
    note.className = "note"; note.textContent = "Buscando en Open Food Facts…"; dup.classList.add("hidden");
    try {
      const o = await api("GET", "/api/off?q=" + encodeURIComponent(q));
      const mine = (o.existing || []).filter((x) => x.id !== selfId);
      if (!mine.length) { if (o.missing) throw new Error("Ese código no está en Open Food Facts (" + o.code + ")"); return onFound(o); }
      note.className = "note hidden";
      const foodOf = (id) => (S.catalog && S.catalog.foods || []).find((f) => f.id === id) || {};
      const close = () => { const top = SHEET_STACK[SHEET_STACK.length - 1]; if (top) top.close(); };
      // Ya está en tu biblioteca: un aviso aparte con el producto (abrirlo o cerrar); no se crea otro igual
      const ds = sheet(mine.length === 1 ? "Ya tienes este producto" : `Ya tienes ${mine.length} productos con este código`,
        h("div", { class: "list" }, mine.map((x) => { const fo = foodOf(x.id);
          return h("div", { class: "item b", onclick: () => { ds.close(); close(); foodEditor(fo.id ? fo : null); } }, withSeal(mono(x.name, fo.category, fo.image), fo),
            h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, dname(fo.id ? fo : x)), lblMark(fo)), h("div", { class: "sub" }, fo.id ? foodSub(fo) : "")),
            h("span", { class: "chev" }, icon("right"))); })),
        [h("span", { class: "grow" }), h("button", { class: "btn", onclick: () => ds.close() }, "Cerrar")], { center: true, key: "off-dup" });
    } catch (e) { note.className = "note warn"; note.textContent = e.message + (onManual ? "." : "."); }
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") find(); });
  return h("div", { class: "offc" + (big ? " big" : "") },
    h("button", { type: "button", class: "offc-cam", onclick: () => scanBarcode((c) => { inp.value = c; find(c); }) },
      h("span", { class: "offc-i" }, icon("camera")), h("b", null, "Escanear con la cámara"), h("span", null, "Apunta al código de barras del envase")),
    h("button", { type: "button", class: "offc-photo", onclick: () => scanPhoto((c) => { inp.value = c; find(c); }) }, icon("image"), "O desde una foto del código"),
    h("div", { class: "offc-or" }, h("span", null, "o")),
    h("div", { class: "offc-man" }, h("label", { class: "f" }, "Escribe el código o pega el enlace"),
      h("div", { class: "off-row" }, h("span", { class: "off-ic" }, icon("barcode")), inp, h("button", { type: "button", class: "btn primary", onclick: () => find() }, "Buscar"))),
    note, dup);
}
// Leer el código de una foto (de la galería o hecha en el momento)
function scanPhoto(onCode) {
  const fin = h("input", { type: "file", accept: "image/*", class: "hidden" });
  fin.addEventListener("change", async () => {
    const file = fin.files[0]; fin.remove(); if (!file) return;
    toast("Buscando el código en la foto…");
    try {
      let code = null;
      if ("BarcodeDetector" in window) {
        const bmp = await createImageBitmap(file);
        const r = await new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }).detect(bmp);
        code = r.length ? r[0].rawValue : null;
      }
      if (!code) {
        const ZX = await loadZxing(), url = await new Promise((ok, ko) => { const rd = new FileReader(); rd.onload = () => ok(rd.result); rd.onerror = ko; rd.readAsDataURL(file); });
        try { code = (await new ZX.BrowserMultiFormatReader().decodeFromImageUrl(url)).getText(); } catch (e) { code = null; }
      }
      if (!code) return toast("No encuentro ningún código en la foto: que salga entero, recto y nítido", { error: true });
      scanBeeper()(); onCode(code);
    } catch (e) { toast("No se pudo leer la foto", { error: true }); }
  });
  document.body.append(fin); fin.click();
}
let ZX_LOAD = null;
const loadZxing = () => ZX_LOAD || (ZX_LOAD = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "/vendor/zxing.min.js"; s.onload = () => ok(window.ZXing); s.onerror = () => { ZX_LOAD = null; ko(new Error("No se pudo cargar el lector")); }; document.head.append(s); }));
// Escáner de códigos de barras con la cámara: nativo (Chrome en Android) o con ZXing (ordenador, iPhone)
// Pitido de lector de caja (y vibración) al leer un código. El audio se prepara al pulsar «Escanear» (los navegadores
// solo dejan sonar si sale de un toque del usuario) y suena cuando se detecta el código.
function scanBeeper() {
  let ctx = null;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume && ctx.resume(); } catch (e) { ctx = null; }
  return () => {
    try { navigator.vibrate && navigator.vibrate(60); } catch (e) { /* sin vibración */ }
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = "square"; o.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.setValueAtTime(0.25, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.16);
    setTimeout(() => ctx.close && ctx.close(), 400);
  };
}
// Cámara para códigos: algo de zoom (los códigos son pequeños y así no hay que acercar tanto el móvil, que desenfoca) y enfoque continuo
const SCAN_VIDEO = { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } };
async function tuneScanTrack(stream) {
  const tr = stream && stream.getVideoTracks()[0]; if (!tr || !tr.getCapabilities) return;
  const cap = tr.getCapabilities(), adv = {};
  if (cap.zoom) adv.zoom = Math.min(cap.zoom.max, Math.max(cap.zoom.min, 2));
  if ((cap.focusMode || []).includes("continuous")) adv.focusMode = "continuous";
  if (Object.keys(adv).length) try { await tr.applyConstraints({ advanced: [adv] }); } catch (e) { /* sin ajustes */ }
}
async function scanBarcode(onCode) {
  const beep = scanBeeper();
  const found = (c) => { beep(); onCode(c); };
  if (!("BarcodeDetector" in window)) return scanZxing(found);
  let stream = null, stop = false;
  const video = h("video", { class: "scan-v", playsInline: true, muted: true, autoplay: true });
  const msg = h("div", { class: "note" }, "Apunta al código de barras del envase");
  const torch = torchButton(() => stream && stream.getVideoTracks()[0]);
  const sh = sheet("Escanear código", [h("div", { class: "scan-w" }, video, h("i", { class: "scan-line" })), msg], [torch, h("span", { class: "grow" }), h("button", { class: "btn", onclick: () => { sh.close(); scanPhoto(found); } }, icon("image"), "Desde una foto")], { full: true, onClose: () => { stop = true; if (stream) stream.getTracks().forEach((t) => t.stop()); } });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: SCAN_VIDEO });
    video.srcObject = stream; await video.play(); tuneScanTrack(stream); torch.refresh();
    const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const tick = async () => {
      if (stop) return;
      try { const r = await det.detect(video); if (r.length) { const c = r[0].rawValue; sh.close(); found(c); return; } } catch (e) { /* sigue */ }
      setTimeout(tick, 200);
    };
    tick();
  } catch (e) { msg.className = "note warn"; msg.textContent = "No se puede usar la cámara: escribe el código o pega el enlace."; }
}
async function scanZxing(onCode) {
  let reader = null;
  const video = h("video", { class: "scan-v", playsInline: true, muted: true, autoplay: true });
  const msg = h("div", { class: "note" }, "Apunta al código de barras del envase");
  const torch = torchButton(() => video.srcObject && video.srcObject.getVideoTracks()[0]);
  const sh = sheet("Escanear código", [h("div", { class: "scan-w" }, video, h("i", { class: "scan-line" })), msg], [torch, h("span", { class: "grow" }), h("button", { class: "btn", onclick: () => { sh.close(); scanPhoto(onCode); } }, icon("image"), "Desde una foto")], { full: true, onClose: () => { if (reader) reader.reset(); } });
  try {
    const ZX = await loadZxing();
    reader = new ZX.BrowserMultiFormatReader();
    await reader.decodeFromConstraints({ video: SCAN_VIDEO }, video, (res) => { if (res) { const c = res.getText(); reader.reset(); sh.close(); onCode(c); } });
    tuneScanTrack(video.srcObject); setTimeout(() => torch.refresh(), 600);
  } catch (e) { msg.className = "note warn"; msg.textContent = "No se puede usar la cámara: escribe el código o pega el enlace."; }
}

// Guardar: un solo toque (mientras guarda queda desactivado; así no se crea dos veces lo mismo)
// Botón de guardar: mientras guarda, gira y no deja cerrar la ficha
function busyBtn(b, fn, label = "Guardando") {
  return async (...a) => {
    if (b.disabled) return; const txt = [...b.childNodes];
    b.disabled = true; b.classList.add("busy"); b.replaceChildren(h("i", { class: "spin" }), label); SAVING++;
    try { return await fn(...a); } finally { SAVING--; if (b.isConnected) { b.disabled = false; b.classList.remove("busy"); b.replaceChildren(...txt); } }
  };
}
// Foto de Open Food Facts: el servidor la descarga por su cuenta; al rato se recarga el catálogo para que aparezca
function offPhotoBg(id, url) {
  (S.photoPending = S.photoPending || new Set()).add(id);
  api("POST", `/api/foods/${id}/image-url`, { url, image_source: url, background: true }).catch(() => { S.photoPending.delete(id); });
  // se mira cada 1,5 s si ya está (como mucho 30 s; si no llega, vuelven las iniciales)
  let n = 0;
  const tick = async () => {
    try { await loadCatalog(); render(); } catch (e) { /* sin conexión: se reintenta */ }
    if (S.photoPending.has(id) && ++n < 20) setTimeout(tick, 1500);
    else if (S.photoPending.delete(id)) { await loadCatalog().catch(() => {}); render(); }
  };
  setTimeout(tick, 1200);
}
function saveButtons(isNew, item, save) {
  const b = h("button", { class: "btn primary lg" }, "Guardar");
  b.onclick = busyBtn(b, () => save(true));
  return [b];
}
function reviewSub(isNew, item) {
  return null;  // la fuente está en «Más» (y el candado de Open Food Facts en los valores)
}

function confirmDel(ev, fn) {
  const b = ev.currentTarget;
  if (b.dataset.armed) return fn();
  b.dataset.armed = "1"; b.textContent = "¿Seguro? Pulsa otra vez";
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Eliminar"; } }, 3500);
}

// Buscador de alimentos en su propia ficha (añadir ingrediente, reemplazar un producto…)
function foodPicker(title, onPick, excludeId) {
  const q = h("input", { class: "input lg", placeholder: "Buscar", type: "search" }), res = h("div", { class: "list pick-list" });
  const drawRes = () => {
    const t = norm(q.value.trim());
    const L = S.catalog.foods.filter((f) => !f.deleted && f.id !== excludeId && (!t || norm(f.name + " " + (f.brand || "")).includes(t)))
      .sort((a, b) => (b.favorite || 0) - (a.favorite || 0) || (b.uses_60d || 0) - (a.uses_60d || 0) || a.name.localeCompare(b.name)).slice(0, 60);
    res.replaceChildren(...(L.length ? L.map((f) => h("div", { class: "item b", onclick: () => { ps.close(); onPick(f); } }, withSeal(mono(f.name, f.kind === "receta" ? "receta" : f.category, f.image), f),
      h("div", { class: "it-m" }, h("div", { class: "nm" }, h("span", { class: "ell" }, dname(f)), lblMark(f)), h("div", { class: "sub" }, foodSub(f))))) : [h("div", { class: "muted", style: { padding: "18px 0", textAlign: "center" } }, "Sin resultados")]));
  };
  q.addEventListener("input", drawRes);
  const ps = sheet(title, [h("div", { class: "search lg" }, icon("search"), q), res], null, { full: true, key: "picker" });
  drawRes(); setTimeout(() => q.focus(), 60);
}
// Eliminar un producto: antes, dónde se usa; se puede reemplazar por otro (lo apuntado, las comidas habituales y las recetas pasan al otro)
async function deleteFoodSheet(f, after) {
  let u; try { u = await api("GET", `/api/foods/${f.id}/usage`); } catch (e) { return toast(e.message, { error: true }); }
  const used = u.entries || u.templates.length || u.recipes.length;
  const del = async () => { await act(() => api("POST", `/api/foods/${f.id}/deleted`, { value: true }), "Eliminado"); ds.close(); after && after(); };
  const replace = () => foodPicker("Reemplazar por", async (g) => {
    const r = await act(() => api("POST", `/api/foods/${f.id}/replace`, { by: g.id }));
    if (r) toast(r.skipped ? `Reemplazado en ${r.moved} entradas; ${r.skipped} sin peso conocido se quedan como estaban` : `Reemplazado por ${dname(g)}`);
    ds.close(); after && after();
  }, f.id);
  const li = (l, v_) => v_ ? h("div", { class: "ei-r" }, h("span", null, l), h("b", null, v_)) : null;
  const ds = sheet("Eliminar " + dname(f), [
    used ? h("div", { class: "ei-l" },
      li("Apuntado", u.entries ? `${u.entries} ${u.entries === 1 ? "vez" : "veces"} · ${u.days === 1 ? dateLabel(u.first, { day: "numeric", month: "short" }) : `del ${dateLabel(u.first, { day: "numeric", month: "short" })} al ${dateLabel(u.last, { day: "numeric", month: "short" })}`}` : null),
      li("Recetas", [...u.templates, ...u.recipes].join(", "))) : h("div", { class: "muted" }, "No se usa en ningún sitio."),
    used ? h("div", { class: "faint sm", style: { marginTop: "10px" } }, "Al reemplazarlo, todo pasa al otro producto con la misma cantidad.") : null],
    [h("button", { class: "btn ghost danger", onclick: del }, used ? "Eliminar igualmente" : "Eliminar"), h("span", { class: "grow" }),
      used ? h("button", { class: "btn primary", onclick: replace }, icon("swap"), "Reemplazar por…") : null], { center: true, key: "del-food" });
}
function itemsEditor(items, excludeId, onChange, opts = {}) {
  // items: [{food_id, unit_key, quantity}]
  const wrap = h("div"), list = h("div"), totalEl = h("div", { class: "preview" });
  const draw = () => {
    list.replaceChildren(...items.map((it, i) => {
      const f = foodById(it.food_id) || { name: "?", units: [] };
      const q = numIn(it.quantity, "");
      q.addEventListener("input", () => { it.quantity = parseNum(q.value); drawTotal(); });
      const uLbl = (x) => x.key === "g" ? "gramos" : x.key === "ml" ? "mililitros" : x.label.replace(/^1\s+/, "");
      const u = h("select", { class: opts.photos ? "ing-u" : "input" }, (f.units || []).filter((x) => x.key !== "x").map((x) => h("option", { value: x.key, selected: x.key === it.unit_key }, uLbl(x))));
      u.addEventListener("change", () => { it.unit_key = u.value; drawTotal(); });
      const x = h("button", { type: "button", class: "icon-btn ing-x", "aria-label": "Quitar", onclick: () => { items.splice(i, 1); draw(); } }, icon("x"));
      if (opts.photos) return h("div", { class: "ing2" }, mono(f.name, f.category, f.image), h("div", { class: "ing-m" }, h("div", { class: "nm", title: f.name }, dname(f)), u), q, x);
      return h("div", { class: "ing" }, h("div", { class: "nm", title: f.name }, f.name), q, u, x);
    }));
    drawTotal();
  };
  const totals = () => sumN(items.map((it) => { const f = foodById(it.food_id); const u = f && (f.units || []).find((x) => x.key === it.unit_key); return u && it.quantity > 0 ? scaleN(u.per, it.quantity) : { kcal: null, protein_g: null, carbs_g: null, fat_g: null }; }));
  const drawTotal = () => { const n = totals(); onChange && onChange(n); totalEl.replaceChildren(...[["kcal", "kcal total"], ["protein_g", "Proteína"], ["carbs_g", "Carbohidr."], ["fat_g", "Grasas"]].map(([k, l]) => h("div", null, h("div", { class: "v num" }, v(n, k)), h("div", { class: "l" }, l)))); };
  // Añadir: un botón que abre un buscador en su propia ficha (como al añadir comida)
  const add = (f) => {
    const u = (f.units || []).find((x) => x.key === "g" || x.key === "ml") || (f.units || [])[0];
    if (!u) return toast("Ese alimento no tiene unidades", { error: true });
    const du = typeof defUnit === "function" ? defUnit(f) : null, uu = du && (f.units || []).find((x) => x.key === du.key) ? du : u;
    items.push({ food_id: f.id, unit_key: uu.key, quantity: ["g", "ml"].includes(uu.key) ? 100 : 1 }); draw();
  };
  const pick = () => foodPicker(opts.addLabel || "Añadir ingrediente", add, excludeId);
  const addBtn = h("button", { type: "button", class: "add-row ie-add", onclick: pick }, icon("plus"), opts.addLabel || "Añadir ingrediente");
  wrap.append(...[list, addBtn, opts.totalsApart ? null : totalEl].filter(Boolean));
  draw();
  return { el: wrap, totals, totalEl };
}

function recipeEditor(r) {
  const isNew = !r;
  r = r || { name: "", recipe_servings: 1, recipe_cooked_weight_g: null, items: [], notes: "" };
  const items = (r.items || []).map((it) => ({ food_id: it.food_id, unit_key: it.unit_key, quantity: it.quantity }));
  const name = h("input", { class: "input", value: r.name, placeholder: "Ej.: Arroz con soja texturizada" });
  const serv = numIn(r.recipe_servings, "1"), cooked = numIn(r.recipe_cooked_weight_g, "opcional");
  const perEl = h("div", { class: "note" });
  const notes = h("textarea", { class: "input", rows: 2, placeholder: "Elaboración, aceite usado, etc." }, r.notes || "");
  const drawPer = (n) => { const s = parseNum(serv.value) || 1; perEl.textContent = `Por ración (1/${fmt(s, 2)}): ${v(scaleN(n, 1 / s), "kcal")} kcal · P ${v(scaleN(n, 1 / s), "protein_g", 1)} · C ${v(scaleN(n, 1 / s), "carbs_g", 1)} · G ${v(scaleN(n, 1 / s), "fat_g", 1)}`; };
  const ed = itemsEditor(items, r.id, drawPer);
  serv.addEventListener("input", () => drawPer(ed.totals()));
  const body = [
    h("div", { class: "grid3" }, h("div", { style: { gridColumn: "span 1" } }, h("label", { class: "f" }, "Nombre"), name), h("div", null, h("label", { class: "f" }, "Raciones que salen"), serv), h("div", null, h("label", { class: "f" }, "Peso cocinado total (g)"), cooked)),
    h("div", { class: "sec-t" }, "Ingredientes (en crudo/seco, tal como los pesas)"), ed.el, perEl,
    h("div", { style: { marginTop: "10px" } }, h("label", { class: "f" }, "Notas"), notes)];
  const save = async (accept) => {
    if (!items.length) return toast("Añade al menos un ingrediente", { error: true });
    if (items.some((i) => !(i.quantity > 0))) return toast("Cantidad no válida", { error: true });
    const s = parseNum(serv.value), cw = parseNum(cooked.value);
    if (Number.isNaN(s) || Number.isNaN(cw)) return toast("Número no válido", { error: true });
    const data = { name: name.value.trim(), recipe_servings: s || 1, recipe_cooked_weight_g: cw, items, notes: notes.value.trim() || null, ...(accept === true ? { reviewed: true } : {}) };
    if (isNew) await act(() => api("POST", "/api/recipes", data), "Receta creada");
    else await act(() => api("PUT", "/api/foods/" + r.id, { ...data, apply_open_days: true }), "Receta guardada");
    sh.close();
  };
  const sh = sheet(isNew ? "Nueva receta" : r.name, body, [
    !isNew ? h("button", { class: "btn ghost danger", onclick: (e) => confirmDel(e, () => act(() => api("POST", `/api/foods/${r.id}/deleted`, { value: true }), "Receta eliminada").then(sh.close)) }, "Eliminar") : null,
    h("span", { class: "grow" }), ...saveButtons(isNew, r, save)], { wide: true, guard: true, sub: reviewSub(isNew, r) });
  if (isNew) setTimeout(() => name.focus(), 40);
}

function templateEditor(t) {
  const isNew = !t;
  t = t || { name: "", meal: null, items: [], servings: null };
  const items = (t.items || []).map((it) => ({ food_id: it.food_id, unit_key: it.unit_key, quantity: it.quantity }));
  const name = h("input", { class: "input ed-name", value: t.name, placeholder: "Nombre" });
  const meal = h("select", { class: "input" }, h("option", { value: "" }, "—"), MEALS.map(([k, l]) => h("option", { value: k, selected: k === t.meal }, l)));
  // Arriba lo que suma la receta entera (kcal y cada macro con su color); las raciones, en su sitio, con lo que es cada una
  const sumEl = h("div", { class: "rsum" }), perEl = h("span", { class: "faint rs-per" });
  const serv = numIn(t.servings > 1 ? t.servings : null, "1");
  const drawSum = (n) => {
    const k = parseNum(serv.value) > 1 ? parseNum(serv.value) : 1;
    const mac = (cls, l, key) => h("div", { class: "rs-m " + cls }, h("b", { class: "num" }, v(n, key), h("small", null, " g")), h("span", null, h("i"), l));
    sumEl.replaceChildren(h("div", { class: "rs-k" }, h("b", { class: "num" }, v(n, "kcal")), h("span", null, k > 1 ? "kcal en total" : "kcal")),
      mac("p", "Proteína", "protein_g"), mac("c", "Carbohidratos", "carbs_g"), mac("g", "Grasas", "fat_g"));
    perEl.textContent = k > 1 && n ? `${v(scaleN(n, 1 / k), "kcal")} kcal cada una` : "";
  };
  const ed = itemsEditor(items, null, drawSum, { totalsApart: true, addLabel: "Añadir alimento", photos: true });
  serv.addEventListener("input", () => drawSum(ed.totals()));
  const tph = photoField({
    name: () => name.value || t.name, cat: () => "habitual", src: () => t.image,
    fallback: () => items.map((it) => (foodById(it.food_id) || {}).image).filter((x) => x && x !== PH_LOADING),
    blocked: () => isNew ? "Guarda primero la receta" : null,
    save: async (url) => { const r = await api("POST", `/api/templates/${t.id}/image`, { data_url: url }); t.image = r.image; t.image_source = null; loadCatalog().then(render).catch(() => {}); },
    remove: async () => { await act(() => api("PUT", "/api/templates/" + t.id, { image: null })); t.image = null; await loadCatalog(); },
  });
  drawSum(ed.totals());
  const body = [edHead(name, tph.el), sumEl,
    h("div", { class: "rs-serv" }, h("b", null, "Raciones"), perEl, h("span", { class: "grow" }), serv),
    h("div", { class: "mx-h mx-h2" }, h("b", null, "Alimentos")), ed.el,
    h("details", { class: "fe-more" }, h("summary", null, "Más"), field("Comida por defecto", meal))];
  const save = async (accept) => {
    if (!items.length) return toast("Añade al menos un alimento", { error: true });
    if (items.some((i) => !(i.quantity > 0))) return toast("Cantidad no válida", { error: true });
    const k = parseNum(serv.value); if (Number.isNaN(k) || k <= 0) return toast("Raciones no válidas", { error: true });
    const data = { name: name.value.trim(), meal: meal.value || null, servings: k || 1, items, ...(accept === true ? { reviewed: 1 } : {}) };
    if (isNew) await act(() => api("POST", "/api/templates", data), "Receta creada");
    else await act(() => api("PUT", "/api/templates/" + t.id, data), "Guardada");
    sh.close();
  };
  const sh = sheet(isNew ? "Nueva receta" : t.name, body, [
    !isNew ? h("button", { class: "btn ghost danger", onclick: (e) => confirmDel(e, () => act(() => api("PUT", "/api/templates/" + t.id, { deleted: 1 }), "Eliminada").then(sh.close)) }, "Eliminar") : null,
    h("span", { class: "grow" }), ...saveButtons(isNew, t, save)], { wide: true, guard: true, sub: reviewSub(isNew, t),
    titleExtra: isNew ? null : favButton(!!t.favorite, async (nv) => { await act(() => api("PUT", "/api/templates/" + t.id, { favorite: nv ? 1 : 0 })); t.favorite = nv ? 1 : 0; await loadCatalog(); }, "Quitar de favoritas", "Favorita: sale antes al añadir comida") });
  if (isNew) setTimeout(() => name.focus(), 40);
}


function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    // Se lee como data: (la CSP no deja cargar blob:, que era por lo que fallaba siempre)
    const img = new Image(), rd = new FileReader();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error(/hei[cf]/i.test(file.type || file.name) ? "Formato HEIC no admitido: usa JPG o PNG" : "Imagen no válida"));
    rd.onload = () => { img.src = rd.result; }; rd.onerror = () => reject(new Error("No se pudo leer la imagen"));
    rd.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------- báscula
const BODY_ROWS = [["weight_kg", "Peso", "kg", 2], ["fat_pct", "Grasa", "%", 2], ["fat_kg", "Grasa", "kg", 1], ["muscle_kg", "Masa muscular", "kg", 1],
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
  // Solo lo que hay (cada báscula y cada app manda cosas distintas); sin masa muscular, la masa magra
  let rows = withWeight ? [["weight_kg", "Peso", "kg", 2], ...BODY_TILES] : BODY_TILES;
  if (bodyVal(b, "muscle_kg") == null) rows = rows.map((r) => r[0] === "muscle_kg" ? ["lean_kg", "Masa magra", "kg", 1] : r);
  rows = rows.filter(([k]) => bodyVal(b, k) != null);
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
// Todos los datos de una medición de la báscula
const BODY_ALL = [["weight_kg", "Peso", "kg", 2], ["bmi", "IMC", "", 1], ["fat_pct", "Grasa", "%", 1], ["fat_kg", "Grasa", "kg", 1], ["muscle_kg", "Masa muscular", "kg", 1],
  ["muscle_pct", "Masa muscular", "%", 1], ["skeletal_muscle_kg", "Músculo esquelético", "kg", 1], ["lean_kg", "Masa magra", "kg", 1], ["water_pct", "Agua", "%", 1],
  ["water_kg", "Agua", "kg", 1], ["protein_pct", "Proteína", "%", 1], ["protein_kg", "Proteína", "kg", 1], ["bone_kg", "Hueso", "kg", 2], ["bone_pct", "Hueso", "%", 1],
  ["visceral_fat", "Grasa visceral", "", 0], ["bmr_kcal", "Metabolismo basal", "kcal", 0], ["body_age", "Edad corporal", "años", 0], ["whr", "Cintura-cadera", "", 2],
  ["heart_rate", "Pulso", "ppm", 0], ["body_score", "Puntuación", "", 0]];
function bodyDetailSheet(b) {
  const calc = { bmi: b.bmi_calc, lean_kg: b.lean_calc };
  const rows = BODY_ALL.filter(([k]) => bodyVal(b, k) != null).map(([k, l, u, nd]) => h("div", { class: "ei-r" }, h("span", null, l + (calc[k] || (k === "muscle_kg" && b.muscle_kg == null) ? " (calculado)" : "")),
    h("b", { class: "num" }, fmt(bodyVal(b, k), nd) + (u ? " " + u : ""))));
  sheet("Medición", [h("div", { class: "ei-l" }, rows), b.notes ? h("div", { class: "ei-note" }, b.notes) : null,
    h("div", { class: "faint sm", style: { marginTop: "10px" } }, { movil: "Llegó de la báscula", xiaomi: "De una captura de la báscula" }[b.source] || "Apuntado a mano")], null,
    { center: true, sub: dateLabel(b.date, { weekday: "long", day: "numeric", month: "long" }) + (b.time ? " · " + b.time : ""), key: "medicion" });
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
  const head = h("div", { class: "row" }, h("h3", { style: { margin: 0 } }, "Báscula"),
    h("span", { class: "grow" }), h("button", { class: "btn sm", style: { whiteSpace: "nowrap" }, onclick: () => bodySheet() }, "+ Medición"));
  if (!latest) return h("div", { class: "card panel" }, head, h("div", { class: "muted", style: { padding: "14px 0 4px" } }, "Sin mediciones."));
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
        return h("tr", { class: (on ? "" : "nc") + " click", onclick: (e) => { if (!e.target.closest("button")) bodyDetailSheet(b); } }, h("td", { class: "dtc" }, dateLabel(b.date, { weekday: "short", day: "numeric", month: "short" }), b.time ? h("span", { class: "faint" }, " · " + b.time) : null), ...["weight_kg", "fat_pct", "muscle_kg", "water_pct", "visceral_fat"].map((k) => h("td", { class: "r num" }, bodyVal(b, k) == null ? "—" : fmt(bodyVal(b, k), k === "weight_kg" ? 2 : 1))),
          h("td", { class: "c" }, b.weight_kg == null ? null : tip(h("button", { class: "cnt-btn" + (on ? " on" : ""), onclick: () => setDayWeight(b, !on) }, icon("check")), on ? "Peso del día: cuenta para la media y la tendencia" : "No cuenta para la tendencia")),
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
  } }, "Guardar")], { guard: true });
}

// --------------------------------------------------------------- progreso
function viewProgress() {
  const P = S.progress; if (!P) return h("div");
  if (S.openMore) { const m = S.openMore; S.openMore = null;
    setTimeout(() => (m === "pasos" ? stepsMore(P.history, P.steps_goal) : ["peso", "bascula"].includes(m) ? weightMore(P) : m === "comida" ? foodMore(P) : null), 0); }
  const ws = P.weights, measured = ws.filter((w) => w.weight_kg != null);
  const last = measured[measured.length - 1];
  const lastAvg = [...ws].reverse().find((w) => w.avg7 != null);
  const prevAvg = lastAvg ? ws.find((w) => w.date === addDays(lastAvg.date, -7)) : null;
  // Todo del periodo elegido: el peso (media de 7 días al final y cuánto ha cambiado), la media de lo que comes los días apuntados y el gasto real
  const firstAvg = ws.find((w) => w.avg7 != null);
  const dW = lastAvg && firstAvg && firstAvg !== lastAvg ? lastAvg.avg7 - firstAvg.avg7 : null;
  const closedD = P.history.filter((d) => d.entries > 0 && d.status === "cerrado"), logged = closedD.length ? closedD : P.history.filter((d) => d.entries > 0);
  const avgOf = (k) => logged.length ? logged.reduce((a, d) => a + (d[k] || 0), 0) / logged.length : null;
  const avgN = { kcal: avgOf("kcal"), protein_g: avgOf("protein_g"), carbs_g: avgOf("carbs_g"), fat_g: avgOf("fat_g") };
  const cal = P.calibration;
  const kpi = (l, val, s, fn) => h("div", { class: "kpi" + (fn ? " clickable" : ""), onclick: fn || null }, h("div", { class: "l" }, kpiLbl(l), fn ? h("span", { class: "kpi-go" }, "›") : null), h("div", { class: "v num" }, val), h("div", { class: "s" }, s || ""));
  const range = h("div", { class: "seg" }, [[7, "7 d"], [30, "30 d"], [90, "90 d"], [365, "1 año"]].map(([d, l]) => h("button", { class: S.progDays === d ? "on" : "", onclick: async () => { S.progDays = d; await refresh(); } }, l)));
  return h("div", null,
    h("div", { class: "row prog-head", style: { marginBottom: "12px" } }, h("h2", { class: "vt" }, "Evolución"), h("span", { class: "grow" }),
      range),
    h("div", { class: "kpis k3" },
      kpi("Peso medio", lastAvg ? kgf(lastAvg.avg7) + " kg" : "—", dW != null ? `${signedKg(dW)} kg en ${({ 7: "7 d", 30: "30 d", 90: "90 d", 365: "1 año" })[S.progDays] || "el periodo"}` : "últimos 7 días"),
      kpi("Ingesta media", avgN.kcal != null ? fmt(avgN.kcal) + " kcal" : "—", avgN.kcal != null ? chipsOf(avgN) : "sin días apuntados"),
      kpi("Gasto real", cal.observed_maintenance != null ? fmt(cal.observed_maintenance) + " kcal" : "—", cal.observed_maintenance != null ? "según tu peso" : "faltan datos", () => pgSheet("Calibración del gasto", calPanel(S.progress.calibration)))),
    // Una tarjeta por tema con el resumen del periodo; «Más» abre la ficha con todo, y desde ella se ve cada día (la misma ficha que en Hoy)
    h("div", { class: "card panel" }, pgHead("Peso", null, () => weightMore(P)), weightChart(ws, P.body, null, null, { onDay: (d) => openDay(d, weightSheet) })),
    balancePanel(P.history, P),
    stepsPanel(P.history, P.steps_goal),
    suppStatsPanel(P.supplements),
    trainPanel(P.training));
}
// Cabecera de las tarjetas de Evolución: el título y un «Más ›» discreto que abre la ficha con todo
const pgHead = (title, sub, more) => h("div", { class: "pgc-h" }, h("h3", null, title, sub ? h("span", { class: "pgc-sub" }, " · " + sub) : null),
  more ? h("button", { class: "pgc-more", onclick: more }, "Más", icon("right")) : null);
// Dentro de la ficha: el acceso a cada día (la misma ficha que al tocar la tarjeta en Hoy, con ‹ › para moverse)
const pgDays = (txt, fn) => h("button", { class: "pg-days", onclick: fn }, icon("cal"), h("span", { class: "grow" }, h("b", null, "Por días"), h("span", null, txt)), icon("right"));
async function openDay(d, fn) { try { const st = await api("GET", "/api/state?date=" + (d || todayISO())); st._nav = true; fn(st); } catch (e) { toast(e.message, { error: true }); } }
// Peso y cuerpo: la gráfica completa, el resumen del periodo, la báscula con cada pesaje y el acceso a cada día
function weightMore(P) {
  const ws = P.weights, m = ws.filter((w) => w.weight_kg != null), a = ws.filter((w) => w.avg7 != null), a0 = a[0], a1 = a[a.length - 1];
  const wks = a0 && a1 ? Math.max(1, (new Date(a1.date) - new Date(a0.date)) / 6048e5) : 1, d = a0 && a1 && a0 !== a1 ? a1.avg7 - a0.avg7 : null;
  const kpi = (l, v, s_) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v num" }, v), h("div", { class: "s" }, s_ || ""));
  const lastW = m.length ? m[m.length - 1].date : todayISO();
  pgSheet("Peso y cuerpo", [
    pgDays("el pesaje, la composición y la gráfica de cada día", () => openDay(lastW, weightSheet)),
    h("div", { class: "kpis k3" },
      kpi("Media 7 días", a1 ? kgf(a1.avg7) + " kg" : "—", d != null ? `${signedKg(d)} kg en ${S.progDays} días` : ""),
      kpi("Ritmo", d != null ? signedKg(d / wks) + " kg" : "—", "por semana"),
      kpi("Pesajes", String(m.length), m.length ? `mín ${kgf(Math.min(...m.map((w) => w.weight_kg)))} · máx ${kgf(Math.max(...m.map((w) => w.weight_kg)))}` : "")),
    h("div", { class: "card panel flat" }, weightChart(ws, P.body, null, null, { onDay: (d2) => openDay(d2, weightSheet) })),
    bodyPanel(P.body || [], ws)]);
}
// Entreno del periodo
function trainPanel(t) {
  if (!t || !t.sessions) return null;
  const kpi = (l, v, s_) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v num" }, v), h("div", { class: "s" }, s_ || ""));
  return h("div", { class: "card panel" }, pgHead("Entreno", null, () => { location.hash = "#/training"; }),
    h("div", { class: "kpis k3" }, kpi("Entrenos", String(t.sessions), `${fmt(t.per_week, 1)} por semana`), kpi("Tiempo", fmt(t.minutes / 60, 1) + " h", `${fmt(t.minutes / t.sessions)} min de media`),
      kpi("Récords", String(t.prs), t.volume ? `${fmt(t.volume / 1000, 1)} t de volumen` : "")));
}
// Comida y gasto: medias, semanas, cada día y la calibración del gasto
function foodMore(P) {
  const hist = P.history || [], ds = hist.filter((x) => x.status === "cerrado" && x.entries > 0 && x.kcal != null);
  const use = ds.length ? ds : hist.filter((x) => x.entries > 0 && x.kcal);
  const avg = (k) => use.length ? use.reduce((a, x) => a + (x[k] || 0), 0) / use.length : null, tg = P.target || {};
  const kpi = (l, v, s_) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v num" }, v), h("div", { class: "s" }, s_ || ""));
  const last = use.length ? use[use.length - 1].date : todayISO();
  const card = balancePanel(hist, null);
  if (card) card.classList.add("flat");
  pgSheet("Comida y gasto", [
    pgDays("lo que comiste y lo que gastaste cada día", () => openDay(last, (st) => energySheet(st))),
    card,
    // Lo que comes de media al día (los días cerrados), como en los productos: kcal y P/C/G; debajo, cada cosa frente a su objetivo
    (() => { const n = { kcal: avg("kcal"), protein_g: avg("protein_g"), carbs_g: avg("carbs_g"), fat_g: avg("fat_g") };
      const bar = (cls, l, val, goal, u) => h("div", { class: "mbar" }, h("div", { class: "mbar-h" }, h("i", { class: "sw " + cls }), h("span", null, l), h("span", { class: "grow" }),
        h("b", { class: "num" }, val == null ? "—" : fmt(val) + (u || "")), goal ? h("span", { class: "faint num" }, ` / ${fmt(goal)}${u || ""}`) : null),
        h("div", { class: "mbar-t " + cls }, h("i", { style: { width: goal && val != null ? Math.min(100, (100 * val) / goal) + "%" : "0" } }), goal ? h("u") : null));
      return h("div", { class: "card panel flat" }, h("h3", null, "Media al día", h("span", { class: "pgc-sub" }, ` · ${use.length} ${use.length === 1 ? "día" : "días"}${ds.length ? " cerrados" : " con comida"}`)),
        h("div", { class: "mprev mprev1" }, h("div", { class: "mp2" }, h("b", { class: "num" }, v(n, "kcal")), h("span", null, " kcal")), chipsOf(n)),
        h("div", { class: "mbars" }, bar("k", "Energía", n.kcal, tg.kcal, " kcal"), bar("p", "Proteína", n.protein_g, tg.protein_g, " g"), bar("c", "Carbohidratos", n.carbs_g, tg.carbs_g, " g"), bar("g", "Grasas", n.fat_g, tg.fat_mid_g, " g"))); })(),
    h("div", { class: "card panel flat" }, h("h3", null, "Semanas"), weeksTable(P.weeks || [])),
    calPanel(P.calibration),
    h("details", { class: "card panel flat pg-det" }, h("summary", null, "Todos los días"), daysTable(hist))]);
}
function pgSheet(title, body) { return sheet(title, [body].flat().filter(Boolean), null, { wide: true, key: "mas:" + title }); }
async function openStepsDay(d) {
  try { const st = await api("GET", "/api/state?date=" + (d || todayISO())); st._nav = true; stepsStatsSheet(st); } catch (e) { toast(e.message, { error: true }); }
}

// ----------------------------------------------------------- informe en PDF
// Se monta como una página A4 y se guarda con «Imprimir → Guardar como PDF» del navegador (sin librerías).
function reportSheet() {
  let days = 30, mode = "completo";
  const parts = { peso: true, comida: true, pasos: true, entreno: true, supl: true };
  const LBL = { peso: ["Peso y cuerpo", "pesajes, media de 7 días y báscula"], comida: ["Comida", "kcal y macros frente al objetivo"],
    pasos: ["Pasos", "cada día frente a tu meta"], entreno: ["Entreno", "entrenos, calendario y récords"], supl: ["Suplementos", "constancia"] };
  const sh = sheet("Informe PDF", []);
  const draw = () => sh.set("Informe PDF", [
    h("div", { class: "sec-t" }, "Periodo"),
    h("div", { class: "seg full" }, [[7, "7 días"], [30, "30 días"], [90, "90 días"]].map(([d, l]) => h("button", { class: days === d ? "on" : "", onclick: () => { days = d; draw(); } }, l))),
    h("div", { class: "sec-t" }, "Informe"),
    h("div", { class: "seg full" }, [["resumen", "Resumen · 2 hojas"], ["completo", "Completo"]].map(([k, l]) => h("button", { class: mode === k ? "on" : "", onclick: () => { mode = k; draw(); } }, l))),
    h("div", { class: "sec-t" }, "Qué incluir"),
    h("div", { class: "rp-opts" }, Object.entries(LBL).map(([k, [t, d]]) => h("label", { class: "mv-type" },
      h("span", { class: "grow" }, h("b", null, t), h("span", { class: "faint sm" }, d)),
      h("input", { type: "checkbox", class: "mv-sw", checked: parts[k], onchange: (e) => { parts[k] = e.target.checked; } }))))],
    [h("span", { class: "grow" }), h("button", { class: "btn primary lg", onclick: () => { sh.close(); buildReport(days, parts, mode); } }, "Crear informe")]);
  draw();
}
// Informe: dos hojas A4 de verdad (794 × 1123 px), que en pantalla se ven a escala y al imprimir salen tal cual
async function buildReport(days, parts, mode = "completo") {
  const full = mode === "completo";
  toast("Preparando el informe…");
  const to = todayISO(), from = addDays(to, -(days - 1));
  let P, W, SS, ST;
  try {
    [P, W, SS, ST] = await Promise.all([api("GET", `/api/progress?days=${days}&weeks=${Math.ceil(days / 7) + 1}`),
      parts.entreno ? api("GET", `/api/workouts?from=${from}&to=${to}&limit=500`) : null, parts.supl ? api("GET", `/api/supplements/stats?days=${days}`) : null,
      api("GET", "/api/state?date=" + to).catch(() => null)]);
    if (full && !S.catalog) await loadCatalog().catch(() => {});
  } catch (e) { toast(e.message, { error: true }); return; }
  const C = { ink: "#17181a", mut: "#85827a", faint: "#b5b1a8", line: "#ebe8e1", soft: "#f5f3ee", acc: "#1f7a5a", accS: "#e3f0ea", amber: "#d2961f", blue: "#3f6fd8", red: "#c4553d", sand: "#dcd7cc" };
  const user = S.me ? (S.me.nombre || S.me.usuario || "") : "", first = user.trim().split(/\s+/)[0] || "";
  const D = (iso, o = { day: "numeric", month: "short" }) => dateLabel(iso, o).replace(".", "");
  const mean = (xs) => { xs = xs.filter((x) => x != null && !Number.isNaN(x)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const allDays = []; for (let d = from; d <= to; d = addDays(d, 1)) allDays.push(d);
  const hist = P.history.filter((d) => d.date >= from && d.date <= to), by = Object.fromEntries(hist.map((d) => [d.date, d]));
  const withFood = hist.filter((d) => d.kcal > 0), closedD = withFood.filter((d) => d.status === "cerrado"), logged = closedD.length ? closedD : withFood, okDay = (d) => d && logged.includes(d);
  const ws = P.weights.filter((w) => w.date >= from), wm = ws.filter((w) => w.weight_kg != null), a7 = ws.filter((w) => w.avg7 != null), w0 = a7[0], w1 = a7[a7.length - 1];
  const dW = w0 && w1 && w0 !== w1 ? w1.avg7 - w0.avg7 : null, wks = w0 && w1 ? Math.max(1, (new Date(w1.date) - new Date(w0.date)) / 6048e5) : 1;
  const tg = (ST && ST.target) || P.target || {}, kcalAvg = mean(logged.map((d) => d.kcal)), tgAvg = mean(logged.map((d) => d.target_kcal)) || tg.kcal;
  const mac = (k) => mean(logged.map((d) => d[k])), inGoal = logged.filter((d) => d.target_kcal && Math.abs(d.kcal - d.target_kcal) <= 150).length;
  const goal = P.steps_goal || 8000, stepsD = hist.filter((d) => d.steps != null), stepsAvg = mean(stepsD.map((d) => d.steps)), hitD = stepsD.filter((d) => d.steps >= goal).length;
  const bestSteps = stepsD.reduce((a, d) => (!a || d.steps > a.steps ? d : a), null);
  const wos = ((W && W.workouts) || []).filter((w) => !w.deleted_at && w.date >= from);
  const prs = []; wos.forEach((w) => (w.exercises || []).forEach((e) => (e.prs || []).forEach((k) => prs.push({ date: w.date, name: e.name, k }))));
  const prBy = {}; prs.forEach((r) => { const x = prBy[r.name] = prBy[r.name] || { name: r.name, n: 0, kinds: new Set(), last: r.date }; x.n++; x.kinds.add(r.k); if (r.date > x.last) x.last = r.date; });
  const prTop = Object.values(prBy).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, 8);
  const suppL = (SS || []).filter((x) => x.supp_when !== "manual" && x.pct30 != null).slice(0, 6);
  const mins = wos.reduce((a, w) => a + (w.duration_min || 0), 0), vol = wos.reduce((a, w) => a + (w.volume_kg || 0), 0);
  // ---- SVG
  const svg = (w, hh, inner) => `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" xmlns="http://www.w3.org/2000/svg" font-family="inherit">${inner}</svg>`;
  const html = (cls, s) => { const e = h("div", { class: cls }); e.innerHTML = s; return e; };
  const spark = (vals, color) => {
    const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null); if (pts.length < 2) return "";
    const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1])), W_ = 120, H_ = 28, n = vals.length;
    const xy = (p) => `${(4 + (W_ - 8) * p[0] / Math.max(1, n - 1)).toFixed(1)},${(4 + (H_ - 8) * (1 - (p[1] - lo) / (hi - lo || 1))).toFixed(1)}`;
    return svg(W_, H_, `<polyline points="${pts.map(xy).join(" ")}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${xy(pts[pts.length - 1]).split(",")[0]}" cy="${xy(pts[pts.length - 1]).split(",")[1]}" r="2.6" fill="${color}"/>`);
  };
  const axisX = (n, x, H_, every) => allDays.map((d, i) => i % every === 0 || i === n - 1 ? `<text x="${x(i).toFixed(1)}" y="${H_ - 3}" font-size="9.5" fill="${C.mut}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(D(d))}</text>` : "").join("");
  const VW = 698;
  const weightSvg = () => {
    const H_ = 190, L = 34, R = 8, T = 10, B = 20, n = allDays.length, idx = Object.fromEntries(allDays.map((d, i) => [d, i]));
    const vs = ws.flatMap((w) => [w.weight_kg, w.avg7]).filter((v) => v != null); if (vs.length < 2) return null;
    let lo = Math.min(...vs), hi = Math.max(...vs); const pad = Math.max(0.3, (hi - lo) * 0.15); lo -= pad; hi += pad;
    const x = (i) => L + (VW - L - R) * (n === 1 ? 0.5 : i / (n - 1)), y = (v) => T + (H_ - T - B) * (1 - (v - lo) / (hi - lo));
    const step = (hi - lo) > 4 ? 1 : (hi - lo) > 2 ? 0.5 : 0.2; let g = "";
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) g += `<line x1="${L}" x2="${VW - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${C.line}"/><text x="${L - 6}" y="${(y(t) + 3).toFixed(1)}" font-size="9.5" fill="${C.mut}" text-anchor="end">${fmt(t, step < 1 ? 1 : 0)}</text>`;
    const av = a7.filter((w) => idx[w.date] != null).map((w) => [x(idx[w.date]), y(w.avg7)]);
    if (av.length > 1) {
      g += `<path d="M${av[0][0].toFixed(1)} ${H_ - B}L${av.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L")}L${av[av.length - 1][0].toFixed(1)} ${H_ - B}Z" fill="${C.acc}" opacity=".08"/>`;
      g += `<polyline points="${av.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${C.acc}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    for (const w of wm) if (idx[w.date] != null) g += `<circle cx="${x(idx[w.date]).toFixed(1)}" cy="${y(w.weight_kg).toFixed(1)}" r="2.8" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/>`;
    if (w0 && w1 && idx[w1.date] != null) { const p = [x(idx[w1.date]), y(w1.avg7)];
      g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="${C.acc}" stroke="#fff" stroke-width="2"/><text x="${(p[0] - 8).toFixed(1)}" y="${(p[1] - 10).toFixed(1)}" font-size="11" font-weight="700" fill="${C.acc}" text-anchor="end">${kgf(w1.avg7)} kg</text>`; }
    g += axisX(n, x, H_, Math.ceil(n / 7));
    return html("rx-svg", svg(VW, H_, g));
  };
  const bars = (vals, { H_ = 124, goalV = null, color, zeroBase = true, fmtv = fmt } = {}) => {
    const n = vals.length, nums = vals.filter((v) => v != null); if (!nums.length) return null;
    const L = 42, R = 8, T = 8, B = 20, hi = Math.max(...nums, ...(goalV ? [].concat(goalV).filter((v) => v != null) : [])) * 1.08, w = (VW - L - R) / n;
    const y = (v) => T + (H_ - T - B) * (1 - v / hi), x = (i) => L + w * (i + 0.5); let g = "";
    for (const t of [0, hi / 2, hi]) g += `<line x1="${L}" x2="${VW - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${C.line}"/><text x="${L - 6}" y="${(y(t) + 3).toFixed(1)}" font-size="9.5" fill="${C.mut}" text-anchor="end">${fmtv(Math.round(t / (hi > 5000 ? 1000 : 100)) * (hi > 5000 ? 1000 : 100))}</text>`;
    vals.forEach((v, i) => { if (v == null) return; const bw = Math.max(2, w * 0.62), top = y(v);
      g += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y(0) - top).toFixed(1)}" rx="${Math.min(3, bw / 2).toFixed(1)}" fill="${typeof color === "function" ? color(v, i) : color}"/>`; });
    if (goalV != null) { const gv = [].concat(goalV); const pts = (gv.length === 1 ? allDays.map(() => gv[0]) : gv).map((v, i) => v == null ? null : `${(L + w * i).toFixed(1)},${y(v).toFixed(1)} ${(L + w * (i + 1)).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean);
      g += `<polyline points="${pts.join(" ")}" fill="none" stroke="${C.ink}" stroke-width="1.2" stroke-dasharray="4 3" opacity=".7"/>`; }
    g += axisX(n, x, H_, Math.ceil(n / 7));
    return html("rx-svg", svg(VW, H_, g));
  };
  const calendar = () => {
    // Calendario de entrenos: semanas en columnas (lunes arriba); el color, según los minutos
    const byD = {}; wos.forEach((w) => { byD[w.date] = (byD[w.date] || 0) + (w.duration_min || 45); });
    const start = addDays(from, -((new Date(from + "T12:00").getDay() + 6) % 7)), cols = Math.ceil((daysBetween(start, to) + 1) / 7), cs = 13, gp = 3;
    let g = "";
    ["L", "", "X", "", "V", "", "D"].forEach((l, r) => { if (l) g += `<text x="0" y="${r * (cs + gp) + 10}" font-size="8.5" fill="${C.mut}">${l}</text>`; });
    for (let c = 0; c < cols; c++) for (let r = 0; r < 7; r++) { const d = addDays(start, c * 7 + r); if (d > to) continue;
      const inR = d >= from, m = byD[d], fill = !inR ? "transparent" : m ? (m >= 75 ? C.acc : m >= 40 ? "#4f9a7c" : "#9fcdb9") : C.soft;
      g += `<rect x="${14 + c * (cs + gp)}" y="${r * (cs + gp)}" width="${cs}" height="${cs}" rx="3.5" fill="${fill}"/>`; }
    return html("rx-cal", svg(14 + cols * (cs + gp), 7 * (cs + gp), g));
  };
  // ---- piezas
  const kpi = (lbl, val, unit, sub, tone, sp) => h("div", { class: "rx-kpi" }, h("span", { class: "rx-kl" }, lbl), h("div", { class: "rx-kv" }, h("b", null, val), unit ? h("small", null, unit) : null),
    sub ? h("span", { class: "rx-ks" + (tone ? " " + tone : "") }, sub) : null, sp ? html("rx-sp", sp) : null);
  const sec = (title, sub, ...kids) => h("section", { class: "rx-sec" }, h("div", { class: "rx-sh" }, h("h2", null, title), sub ? h("span", null, sub) : null), ...kids.flat().filter(Boolean));
  const stat = (l, v) => h("div", { class: "rx-st" }, h("span", null, l), h("b", null, v));
  const empty = (t) => h("div", { class: "rx-empty" }, t);
  const hl = [
    dW != null ? ["acc", Math.abs(dW) < 0.25 ? `Peso estable: la media de 7 días pasa de ${kgf(w0.avg7)} a ${kgf(w1.avg7)} kg.` : `El peso medio ha ${dW < 0 ? "bajado" : "subido"} ${fmt(Math.abs(dW), 1)} kg (${kgf(w0.avg7)} → ${kgf(w1.avg7)} kg), ${fmt(Math.abs(dW) / wks, 2)} kg por semana.`] : null,
    kcalAvg != null ? ["amber", `${fmt(kcalAvg)} kcal de media${tgAvg ? `, ${Math.abs(kcalAvg - tgAvg) <= 50 ? "en el objetivo" : fmt(Math.abs(kcalAvg - tgAvg)) + (kcalAvg > tgAvg ? " por encima" : " por debajo") + " del objetivo"}` : ""}; ${inGoal} de ${logged.length} días dentro de ±150 kcal.`] : null,
    mac("protein_g") != null ? ["blue", `Proteína: ${fmt(mac("protein_g"))} g al día${tg.protein_g ? ` (${Math.round(100 * mac("protein_g") / tg.protein_g)} % del objetivo de ${fmt(tg.protein_g)} g)` : ""}.`] : null,
    stepsD.length ? ["sand", `${fmt(stepsAvg)} pasos al día; meta cumplida ${hitD} de ${stepsD.length} días${bestSteps ? `. Mejor día: ${D(bestSteps.date, { day: "numeric", month: "long" })}, ${fmt(bestSteps.steps)}` : ""}.`] : null,
    wos.length ? ["red", `${wos.length} entrenos (${fmt(wos.length * 7 / days, 1)} por semana)${prs.length ? `, ${prs.length} récords${prTop[0] ? `; destacan ${prTop.slice(0, 2).map((r) => r.name).join(" y ")}` : ""}` : ""}.`] : null,
  ].filter(Boolean);
  const head = h("header", { class: "rx-head" },
    h("div", { class: "rx-brand" }, h("i", null), "Salud", h("span", null, "Informe")),
    h("div", { class: "rx-title" }, h("h1", null, first || "Tu informe"), h("p", null, `${D(from, { day: "numeric", month: "long" })} – ${D(to, { day: "numeric", month: "long", year: "numeric" })} · ${days} días`)));
  const tone = (good) => good == null ? "" : good ? "up" : "down";
  const kpis = h("div", { class: "rx-kpis" },
    kpi("Peso medio", w1 ? kgf(w1.avg7) : "—", "kg", dW != null ? `${signedKg(dW)} kg en el periodo` : "", "", parts.peso ? spark(a7.map((w) => w.avg7), C.acc) : ""),
    kpi("Comida", kcalAvg != null ? fmt(kcalAvg) : "—", "kcal/día", tgAvg ? `objetivo ${fmt(tgAvg)}` : "", "", spark(allDays.map((d) => okDay(by[d]) ? by[d].kcal : null), C.amber)),
    kpi("Pasos", stepsAvg != null ? fmt(stepsAvg) : "—", "al día", stepsD.length ? `meta ${hitD} de ${stepsD.length} días` : "", stepsD.length ? tone(hitD / stepsD.length >= 0.5) : "", spark(allDays.map((d) => by[d] ? by[d].steps : null), "#c9a24a")),
    kpi("Entreno", String(wos.length), wos.length === 1 ? "entreno" : "entrenos", wos.length ? `${fmt(mins / 60, 1)} h · ${prs.length} récords` : "", "", ""));
  const hlBox = hl.length ? h("div", { class: "rx-hl" }, h("div", { class: "rx-h3" }, "Lo más destacado"), h("ul", null, hl.map(([c, t]) => h("li", { class: "c-" + c }, t)))) : null;
  const bodyRow = (() => { const bs = (P.body || []).filter((b) => b.date >= from && b.fat_pct != null).sort((a, b) => a.date.localeCompare(b.date)); if (!bs.length) return null;
    const a = bs[0], b = bs[bs.length - 1];
    return [stat("Grasa (báscula)", fmt(b.fat_pct, 1) + " %" + (bs.length > 1 ? ` (${signed(b.fat_pct - a.fat_pct, 1)})` : "")), b.muscle_kg != null ? stat("Masa muscular", fmt(b.muscle_kg, 1) + " kg") : null]; })();
  const pesoSec = parts.peso ? sec("Peso", "pesajes y media de 7 días", weightSvg() || empty("Sin pesajes suficientes en este periodo."),
    h("div", { class: "rx-stats" }, stat("Inicio", w0 ? kgf(w0.avg7) + " kg" : "—"), stat("Final", w1 ? kgf(w1.avg7) + " kg" : "—"), stat("Ritmo", dW != null ? signedKg(dW / wks) + " kg/sem" : "—"),
      stat("Pesajes", String(wm.length)), bodyRow)) : null;
  const macroBar = (k, l, col, target) => { const v = mac(k), pc = v != null && target ? Math.min(1.25, v / target) : null;
    return h("div", { class: "rx-mb" }, h("div", { class: "rx-mbh" }, h("span", null, h("i", { style: { background: col } }), l), h("b", null, v != null ? fmt(v) + " g" : "—", target ? h("small", null, " / " + fmt(target) + " g") : null)),
      h("div", { class: "rx-mbt" }, pc != null ? h("i", { style: { width: Math.min(100, pc * 80) + "%", background: col } }) : null, target ? h("u", { style: { left: "80%" } }) : null)); };
  const comidaSec = parts.comida ? sec("Comida", "kcal de cada día · discontinua: objetivo",
    bars(allDays.map((d) => okDay(by[d]) ? by[d].kcal : null), { goalV: allDays.map((d) => by[d] && by[d].target_kcal), color: (v, i) => { const t = by[allDays[i]] && by[allDays[i]].target_kcal; return !t || Math.abs(v - t) <= 150 ? C.acc : v > t ? C.amber : C.blue; } }) || empty("Sin días con comida en este periodo."),
    h("div", { class: "rx-legend" }, h("span", null, h("i", { style: { background: C.acc } }), "En objetivo (±150)"), h("span", null, h("i", { style: { background: C.amber } }), "Por encima"), h("span", null, h("i", { style: { background: C.blue } }), "Por debajo")),
    h("div", { class: "rx-macros" }, macroBar("protein_g", "Proteína", C.blue, tg.protein_g), macroBar("carbs_g", "Carbohidratos", C.amber, tg.carbs_g), macroBar("fat_g", "Grasas", C.red, tg.fat_mid_g)),
    h("div", { class: "rx-note" }, `Medias de ${logged.length} ${logged.length === 1 ? "día" : "días"} ${closedD.length ? "cerrados" : "con comida"}` + (() => { const ap = logged.reduce((a, d) => a + (d.approx_kcal || 0), 0), t = logged.reduce((a, d) => a + (d.kcal || 0), 0); return t ? ` · ${Math.round(100 * ap / t)} % aproximado (comidas fuera o sin etiqueta)` : ""; })())) : null;
  const pasosSec = parts.pasos ? sec("Pasos", `meta ${fmt(goal)} al día`,
    bars(allDays.map((d) => by[d] ? by[d].steps : null), { H_: 112, goalV: [goal], color: (v) => v >= goal ? C.acc : C.sand }) || empty("Sin pasos en este periodo."),
    stepsD.length ? h("div", { class: "rx-stats" }, stat("Media", fmt(stepsAvg)), stat("Meta cumplida", `${hitD} de ${stepsD.length}`), stat("Mejor día", bestSteps ? `${fmt(bestSteps.steps)} · ${D(bestSteps.date)}` : "—"), stat("Total", fmt(stepsD.reduce((a, d) => a + d.steps, 0)))) : null) : null;
  const entrenoSec = parts.entreno ? sec("Entreno", wos.length ? `${wos.length} entrenos` : "",
    wos.length ? h("div", { class: "rx-tr" }, calendar(),
      h("div", { class: "rx-trs" }, stat("Por semana", fmt(wos.length * 7 / days, 1)), stat("Tiempo", fmt(mins / 60, 1) + " h"), stat("Volumen", fmt(vol / 1000, 1) + " t"), stat("Récords", String(prs.length)))) : empty("Sin entrenos en este periodo."),
    prTop.length ? h("div", { class: "rx-prs" }, h("div", { class: "rx-h3" }, "Récords"), h("ol", null, prTop.map((r) => h("li", null, h("span", null, r.name),
      h("b", null, [...r.kinds].map((k) => (typeof PR_SHORT !== "undefined" && PR_SHORT[k]) || k).join(" · ")), h("em", null, D(r.last)))))) : null) : null;
  const suplSec = parts.supl && suppL.length ? sec("Suplementos", "% de los días que tocaba",
    h("div", { class: "rx-supl" }, suppL.map((x) => h("div", { class: "rx-sp1" }, h("span", null, x.name),
      h("div", { class: "rx-strip" }, x.days.filter((c) => c.date >= from).map((c) => h("i", { class: "s-" + c.s }))),
      h("b", { class: x.pct30 >= 85 ? "good" : x.pct30 >= 60 ? "mid" : "low" }, x.pct30 + " %"))))) : null;
  const foot = (n, tot) => h("footer", { class: "rx-foot" }, h("span", null, `${first ? first + " · " : ""}Salud · ${D(to, { day: "numeric", month: "long", year: "numeric" })}`), h("span", null, `${n} / ${tot}`));
  // ---- Informe completo: lo mismo y además tablas y estadísticas
  const tbl = (cols, rows, cls) => h("table", { class: "rx-t" + (cls ? " " + cls : "") }, h("tr", null, cols.map(([l, r]) => h("th", { class: r ? "r" : "" }, l))),
    rows.map((rw) => h("tr", null, rw.map((v, i) => h("td", { class: cols[i][1] ? "r" : "" }, v == null || v === "" ? "—" : v)))));
  const xtra = [];
  if (full) {
    // Días destacados
    const maxBy = (L, k) => L.filter((d) => d[k] != null).reduce((a, d) => (!a || d[k] > a[k] ? d : a), null);
    const minBy = (L, k) => L.filter((d) => d[k] != null).reduce((a, d) => (!a || d[k] < a[k] ? d : a), null);
    const tdeeD = logged.filter((d) => d.tdee_complete);
    const card = (l, v, d_) => h("div", { class: "rx-dd" }, h("span", null, l), h("b", null, v), h("em", null, d_ ? D(d_.date, { weekday: "short", day: "numeric", month: "short" }) : ""));
    const pMax = maxBy(logged, "protein_g"), kMax = maxBy(logged, "kcal"), bMin = minBy(tdeeD, "balance"), sMax = maxBy(stepsD, "steps"), wMin = wm.length ? wm.reduce((a, w) => (!a || w.weight_kg < a.weight_kg ? w : a), null) : null;
    const dd = [kMax && card("Más kcal", fmt(kMax.kcal) + " kcal", kMax), pMax && card("Más proteína", fmt(pMax.protein_g) + " g", pMax), bMin && card("Mayor déficit", signed(Math.round(bMin.balance)) + " kcal", bMin),
      sMax && card("Más pasos", fmt(sMax.steps), sMax), wMin && card("Peso más bajo", kgf(wMin.weight_kg) + " kg", wMin)].filter(Boolean);
    if (dd.length) xtra.push(sec("Días destacados", "", h("div", { class: "rx-dds" }, dd)));
    // Semanas
    const wk = (P.weeks || []).filter((w) => addDays(w.week, 6) >= from && w.week <= to);
    if (wk.length) xtra.push(sec("Semana a semana", "medias de cada semana",
      tbl([["Semana"], ["Días", 1], ["kcal", 1], ["Prot.", 1], ["Carb.", 1], ["Grasa", 1], ["Peso", 1], ["Δ", 1], ["Pasos", 1], ["Gasto", 1], ["Balance", 1]],
        wk.map((w) => [D(w.week), `${w.days_logged}/${w.days}`, w.kcal ? fmt(w.kcal) : null, w.kcal ? fmt(w.protein_g) : null, w.kcal ? fmt(w.carbs_g) : null, w.kcal ? fmt(w.fat_g) : null,
          w.weight != null ? kgf(w.weight) : null, w.weight_delta != null ? signedKg(w.weight_delta) : null, w.steps != null ? fmt(w.steps) : null, w.tdee != null ? fmt(w.tdee) : null, w.kcal && w.balance != null ? signed(Math.round(w.balance)) : null]))));
    // Pasos por día de la semana
    if (stepsD.length >= 7) {
      const LD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"], acc = LD.map(() => []);
      stepsD.forEach((d) => acc[(new Date(d.date + "T12:00").getDay() + 6) % 7].push(d.steps));
      const av = acc.map((a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null), mx = Math.max(1, ...av.filter((v) => v != null));
      xtra.push(sec("Pasos por día de la semana", "media", h("div", { class: "rx-dow" }, LD.map((l, i) => h("div", null, h("div", { class: "rx-dowb" }, h("i", { style: { height: (av[i] ? 100 * av[i] / mx : 0) + "%", background: av[i] >= goal ? C.acc : C.sand } })),
        h("b", null, av[i] != null ? fmt(av[i] / 1000, 1) + "k" : "—"), h("span", null, l))))));
    }
    // Entreno: series por grupo y sesiones
    if (wos.length) {
      const G = {}; wos.forEach((w) => (w.exercises || []).forEach((e) => { const g = (typeof exGroup === "function" && exGroup(e.name)) || "Otros"; G[g] = (G[g] || 0) + (e.sets || []).filter((s_) => s_.type !== "calentamiento").length; }));
      const gl = Object.entries(G).filter(([, n]) => n).sort((a, b) => b[1] - a[1]), gm = Math.max(1, ...gl.map((x) => x[1]));
      const gbars = h("div", { class: "rx-gb" }, gl.map(([g, n]) => h("div", null, h("span", null, g),
        h("div", { class: "rx-gbt" }, h("i", { style: { width: 100 * n / gm + "%", background: `hsl(${(typeof GROUP_HUE !== "undefined" && GROUP_HUE[g]) || 0} 45% 52%)` } })), h("b", null, String(n)), h("em", null, fmt(n * 7 / days, 1) + "/sem"))));
      // El mapa de músculos (series por semana: verde = 10–20) al lado de las barras
      const bmap = typeof bodyMap === "function" ? bodyMap(Object.fromEntries(gl.map(([g, n]) => [g, n * 7 / days])), {}, { w: 70, static: true }) : null;
      xtra.push(sec("Músculos trabajados", "series efectivas en el periodo · por semana", h("div", { class: "rx-mu" }, bmap, gbars)));
      const L = wos.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 18).reverse();
      xtra.push(sec("Entrenos", wos.length > 18 ? `las últimas 18 de ${wos.length}` : "",
        tbl([["Día"], ["Entreno"], ["Min", 1], ["Series", 1], ["Volumen", 1], ["Récords", 1]],
          L.map((w) => [D(w.date, { weekday: "short", day: "numeric", month: "short" }), w.title || w.activity_type, w.duration_min ? fmt(w.duration_min) : null, String(w.sets_count || 0), w.volume_kg ? fmt(w.volume_kg) + " kg" : null, w.prs_count ? String(w.prs_count) : ""]))));
    }
    // Báscula
    const bs = (P.body || []).filter((b) => b.date >= from).sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))).slice(0, 10);
    if (bs.length) xtra.push(sec("Báscula", "últimas mediciones · bioimpedancia, orientativa",
      tbl([["Fecha"], ["Peso", 1], ["Grasa", 1], ["Músculo", 1], ["Agua", 1], ["Visceral", 1], ["IMC", 1]],
        bs.map((b) => [D(b.date) + (b.time ? " · " + b.time : ""), b.weight_kg != null ? kgf(b.weight_kg) : null, b.fat_pct != null ? fmt(b.fat_pct, 1) + " %" : null,
          bodyVal(b, "muscle_kg") != null ? fmt(bodyVal(b, "muscle_kg"), 1) : null, b.water_pct != null ? fmt(b.water_pct, 1) + " %" : null, b.visceral_fat != null ? fmt(b.visceral_fat) : null, b.bmi != null ? fmt(b.bmi, 1) : null]))));
    // Lo que más apuntas
    const top = ((S.catalog && S.catalog.foods) || []).filter((f) => f.uses_60d > 0 && !/suplement/i.test(f.category || "")).sort((a, b) => b.uses_60d - a.uses_60d).slice(0, 10);
    if (top.length) xtra.push(sec("Lo que más apuntas", "últimos 60 días", h("ol", { class: "rx-top" }, top.map((f) => h("li", null, h("span", null, dname(f)), h("b", null, f.uses_60d + (f.uses_60d === 1 ? " vez" : " veces")))))));
    // Calibración del gasto
    const cal = P.calibration;
    if (cal && cal.ready) { const ap = cal.applied || {};
      xtra.push(sec("Gasto", "cómo se calcula y cómo se ajusta", h("div", { class: "rx-stats" },
        stat("Mantenimiento observado", cal.observed_maintenance != null ? fmt(cal.observed_maintenance) + " kcal" : "—"), stat("Modelo", cal.model_tdee_avg != null ? fmt(cal.model_tdee_avg) + " kcal" : "—"),
        stat("Ajuste de la base", signed(ap.cal_ajuste_kcal || 0) + " kcal/día"), stat("Pasos", "× " + fmt(ap.cal_pasos_factor || 1, 2)), stat("Entrenos", "× " + fmt(ap.cal_ejercicio_factor || 1, 2))),
        )); }
  }
  // Paginación: las secciones van llenando hojas A4; la que no cabe pasa a la siguiente hoja
  const flow = [head, kpis, hlBox, pesoSec, comidaSec, pasosSec, entrenoSec, suplSec, ...xtra, h("div", { class: "rx-note rx-disc" }, "El gasto y el balance son estimaciones; la composición corporal por bioimpedancia es orientativa.")].filter(Boolean);
  const newPage = () => { const pg_ = h("div", { class: "rx-page" }, h("div", { class: "rx-body" }), foot(0, 0)); pages.append(pg_); return pg_; };
  // ---- vista previa (a escala) y descarga
  const prevTitle = document.title;
  const pages = h("div", { class: "rx-pages" });
  const fit = () => { const k = Math.min(1, (window.innerWidth - 24) / 794); pages.style.setProperty("--k", k); };
  const close = () => { ov.remove(); document.body.classList.remove("rp-on"); document.title = prevTitle; window.removeEventListener("resize", fit); };
  const ov = h("div", { id: "report-view" },
    h("div", { class: "rx-bar" }, h("button", { class: "icon-btn round", "aria-label": "Cerrar", onclick: close }, icon("x")),
      h("div", { class: "grow rx-bt" }, h("b", null, "Informe"), h("span", null, `${D(from)} – ${D(to)}`)),
      h("button", { class: "btn primary", onclick: () => { document.title = `Informe Salud${first ? " " + first : ""} ${from} a ${to}`; window.print(); } }, icon("out"), "Descargar PDF")),
    pages);
  document.body.append(ov); document.body.classList.add("rp-on");
  pages.style.setProperty("--k", 1);
  let cur = newPage();
  for (const el of flow) {
    const body = cur.querySelector(".rx-body"); body.append(el);
    if (body.scrollHeight > body.clientHeight + 1 && body.children.length > 1) { el.remove(); cur = newPage(); cur.querySelector(".rx-body").append(el); }
  }
  const all = [...pages.children]; all.forEach((pg_, i) => pg_.querySelector(".rx-foot").replaceWith(foot(i + 1, all.length)));
  fit(); window.addEventListener("resize", fit);
}

function weightChart(ws, bodies, sel, next, o = {}) {
  // o.simple: solo pesajes y media de 7 días (Evolución); o.onDay(fecha): tocar un día abre su ficha
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
  const others = o.simple ? [] : byT.filter((b) => idx[b.date] != null && b !== mainOf(ws[idx[b.date]]));
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
  // (en la versión sencilla, solo entre el primer y el último pesaje: sin estimados por delante ni por detrás)
  const wi = ws.map((w, i) => w.weight_kg != null ? i : -1).filter((i) => i >= 0), i0 = o.simple ? wi[0] : 0, i1 = o.simple ? wi[wi.length - 1] : n;
  let dc = ""; ws.forEach((w, i) => { const v = w.weight_kg ?? w.interp; if (v != null && i >= i0 && i <= i1) dc += (dc ? "L" : "M") + xw(i).toFixed(1) + " " + y(v).toFixed(1); });
  if (dc) svg.append(el("path", { d: dc, class: "wline", "vector-effect": "non-scaling-stroke" }));
  let d = ""; ws.forEach((w, i) => { if (w.avg7 != null) d += (d ? "L" : "M") + x(i).toFixed(1) + " " + y(w.avg7).toFixed(1); });
  if (d) svg.append(el("path", { d, class: "avg", "vector-effect": "non-scaling-stroke" }));
  // Lo esperado por el modelo (lo que comes − lo que gastas): se corta donde falta la comida de algún día
  let de = "", prevE = false; ws.forEach((w, i) => { if (w.expected != null && w.expected >= lo && w.expected <= hi) { de += (prevE ? "L" : "M") + x(i).toFixed(1) + " " + y(w.expected).toFixed(1); prevE = true; } else prevE = false; });
  if (de && !o.simple) svg.append(el("path", { d: de, class: "exp", "vector-effect": "non-scaling-stroke" }));
  ws.forEach((w, i) => {
    const v = w.weight_kg ?? w.interp; if (v == null || (o.simple && w.weight_kg == null)) return;
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
  box.append(o.simple ? h("div", { class: "wc-leg" }, h("span", null, h("i", { class: "sw pt" }), "Pesaje"), h("span", null, h("i", { class: "sw avg" }), "Media 7 días"), null)
    : h("div", { class: "wc-leg" }, h("span", null, h("i", { class: "sw pt" }), "Pesaje"), h("span", null, h("i", { class: "sw ipt" }), "Estimado"),
    h("span", null, h("i", { class: "sw opt" }), "No cuenta"), h("span", null, h("i", { class: "sw avg" }), "Media 7 días"), h("span", null, h("i", { class: "sw exp" }), "Esperado")));
  let hideT = null, lastDay = null;
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
      h("div", null, h("i", { class: "sw " + { main: "pt", est: "ipt", other: "opt" }[p.k] }), { main: "Peso del día ", est: "Estimado (sin pesaje) ", other: "Otro pesaje " }[p.k], h("b", { class: "num" }, kgf(p.v) + " kg")),
      p.k === "other" ? h("div", { class: "faint" }, "No cuenta para la tendencia") : null,
      p.k !== "other" && w.avg7 != null ? h("div", null, h("i", { class: "sw avg" }), "Media 7 días ", h("b", { class: "num" }, kgf(w.avg7))) : null,
      p.k !== "other" && w.expected != null && !o.simple ? h("div", null, h("i", { class: "sw exp" }), "Esperado ", h("b", { class: "num" }, fmt(w.expected, 1))) : null].filter(Boolean));
    lastDay = w.date;
    tip_.classList.remove("hidden");
    const px = (p.px / W) * r.width; tip_.style.left = Math.min(Math.max(px, 70), r.width - 70) + "px";
  };
  const leave = () => { clearTimeout(hideT); vline.classList.add("hidden"); hov.classList.add("hidden"); tip_.classList.add("hidden"); };
  // Ratón: se ve mientras está encima. Dedo: al tocar (deslizando de lado se mueve); al soltar se quita.
  svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") move(e); });
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") leave(); });
  touchHold(svg, (e) => { clearTimeout(hideT); move(e); }, leave);
  if (o.onDay) { // un toque corto (o clic) abre ese día; mantener y deslizar solo enseña los datos
    let t0 = 0, x0 = 0; svg.style.cursor = "pointer";
    svg.addEventListener("pointerdown", (e) => { t0 = Date.now(); x0 = e.clientX; move(e); });
    svg.addEventListener("pointerup", (e) => { if (Date.now() - t0 < 350 && Math.abs(e.clientX - x0) < 10 && lastDay) { leave(); o.onDay(lastDay); } });
  }
  window.addEventListener("scroll", leave, { passive: true, capture: true });
  return box;
}

// Pasos en Progreso: un día por barra (los días sin datos quedan en hueco), la línea del objetivo y lo básico
// Frente a tu objetivo (Progreso): por cada día cerrado, cuánto te pasaste (barra hacia arriba) o te quedaste corto (hacia abajo)
// Comida frente al objetivo, cada día: kcal o cada macro (se elige arriba); en objetivo = dentro del margen
const BAL_K = [["kcal", "kcal", 150, " kcal", "target_kcal"], ["protein_g", "Proteína", 10, " g", "target_protein_g"], ["carbs_g", "Carbos", 25, " g", "target_carbs_g"], ["fat_g", "Grasas", 8, " g", "target_fat_g"]];
function balancePanel(hist, P) {
  const all = (hist || []).filter((x) => x.status === "cerrado" && x.entries > 0 && x.kcal != null && x.target_kcal);
  if (!all.length) return null;
  const card = h("div", { class: "card panel" });
  const draw = () => {
    const [k, kl, tol, u, tk] = BAL_K.find((x) => x[0] === (S.balK || "kcal"));
    const ds = all.filter((x) => x[k] != null && x[tk] != null);
    const dif = (x) => x[k] - x[tk], by = Object.fromEntries(ds.map((x) => [x.date, x]));
    // Desde el primer día cerrado (mínimo 14 días, máximo el rango elegido) para que las barras no queden finísimas
    const first = all[0].date, span0 = Math.round((new Date(todayISO()) - new Date(first)) / 864e5) + 1;
    const n = Math.max(14, Math.min(S.progDays || 30, 90, span0)), end = todayISO(), days = Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
    const up = Math.max(tol, ...ds.map(dif)), dn = Math.max(tol, ...ds.map((x) => -dif(x))), span = up + dn;
    const avg = ds.length ? ds.reduce((a, x) => a + dif(x), 0) / ds.length : 0, ok = ds.filter((x) => Math.abs(dif(x)) <= tol).length, sum = ds.reduce((a, x) => a + dif(x), 0);
    const kpi = (l, v_, s_) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v num" }, v_), h("div", { class: "s" }, s_ || ""));
    const seg = h("div", { class: "seg sm bal-seg" }, BAL_K.map(([kk, l]) => h("button", { class: kk === k ? "on" : "", onclick: () => { S.balK = kk; draw(); } }, l)));
    card.className = "card panel bal-" + k.replace("_g", "");
    card.replaceChildren(P ? pgHead("Comida", "frente a tu objetivo", () => foodMore(P)) : pgHead("Frente a tu objetivo", "de más o de menos cada día"), seg,
      h("div", { class: "kpis k3" },
        kpi("Media", signed(Math.round(avg)), u.trim() + " al día"),
        kpi("En objetivo", `${ok} de ${ds.length}`, "días"),
        kpi("Acumulado", signed(Math.round(sum)), u.trim())),
      h("div", { class: "bal-bars" }, h("i", { class: "zero", style: { top: (100 * up) / span + "%" } }),
        days.map((d) => { const x = by[d], v_ = x ? dif(x) : null;
          const cls = v_ == null ? "gap" : Math.abs(v_) <= tol ? "in" : v_ > 0 ? "over" : "under";
          const hh = v_ == null ? 0 : Math.max(2, (100 * Math.abs(v_)) / span);
          return h("span", { class: "bal-b " + cls, onclick: v_ == null ? null : () => openDay(d, (st) => energySheet(st)), "data-tip": `${dateLabel(d, { weekday: "long", day: "numeric", month: "short" })}\n` + (v_ == null ? "Sin cerrar" : `${fmt(x[k])}${u} de ${fmt(x[tk])}${u} · ${signed(Math.round(v_))}${u}`) },
            v_ == null ? null : h("i", { style: v_ >= 0 ? { bottom: (100 * dn) / span + "%", height: hh + "%" } : { top: (100 * up) / span + "%", height: hh + "%" } })); })),
      h("div", { class: "pbars-x faint" }, h("span", null, dateLabel(days[0], { day: "numeric", month: "short" })), h("span", null, "hoy")),
      h("div", { class: "bal-leg faint" }, h("span", null, h("i", { class: "over" }), "Por encima"), h("span", null, h("i", { class: "in" }), `En objetivo (±${tol}${u.trim() === "g" ? " g" : ""})`), h("span", null, h("i", { class: "under" }), "Por debajo")));
  };
  draw();
  return card;
}
function stepsPanel(hist, goal) {
  const ds = (hist || []).filter((x) => x.steps != null);
  if (!ds.length) return null;
  goal = goal || 8000;
  const by = Object.fromEntries(ds.map((x) => [x.date, x.steps]));
  const byWk = Object.fromEntries(ds.map((x) => [x.date, x.steps_in_acts || 0]));
  const n = Math.max(14, Math.min(S.progDays || 30, 90)), end = todayISO(), days = Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
  const mx = Math.max(goal, ...ds.map((x) => x.steps)) * 1.08, avg = ds.reduce((a, x) => a + x.steps, 0) / ds.length;
  const best = ds.reduce((a, x) => (x.steps > a.steps ? x : a)), hit = ds.filter((x) => x.steps >= goal).length;
  const kpi = (l, v, s_) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v num" }, v), h("div", { class: "s" }, s_ || ""));
  return h("div", { class: "card panel" }, pgHead("Pasos", `objetivo ${fmt(goal)}`, () => stepsMore(hist, goal)),
    h("div", { class: "kpis k3" }, kpi("Media", fmt(avg), `${ds.length} ${ds.length === 1 ? "día" : "días"}`), kpi("Objetivo", `${hit} de ${ds.length}`, Math.round((100 * hit) / ds.length) + " % de los días"),
      kpi("Mejor día", fmt(best.steps), dateLabel(best.date, { day: "numeric", month: "short" }))),
    h("div", { class: "pbars" }, h("i", { class: "goal", style: { bottom: (100 * goal) / mx + "%" } }),
      days.map((d) => { const v = by[d], wv = byWk[d] || 0; return h("span", { class: v == null ? "gap" : v >= goal ? "ok" : "", onclick: v == null ? null : () => openStepsDay(d), style: { height: v == null ? "0" : Math.max(2, (100 * v) / mx) + "%" }, "data-tip": `${dateLabel(d, { weekday: "long", day: "numeric", month: "short" })}\n${v == null ? "Sin datos" : fmt(v) + " pasos" + (v >= goal ? " · objetivo cumplido" : "")}` + (v && wv ? `\n${fmt(wv)} del entreno` : "") },
        v && wv ? h("u", { style: { height: Math.min(100, (100 * wv) / v) + "%" } }) : null); })),
    h("div", { class: "pbars-x faint" }, h("span", null, dateLabel(days[0], { day: "numeric", month: "short" })), h("span", null, "hoy")));
}
// Pasos: arriba el acceso a cada día; las cifras del periodo, la media por día de la semana, las rachas y la gráfica
async function stepsMore(hist, goal) {
  const ds = (hist || []).filter((x) => x.steps != null);
  if (!ds.length) return openStepsDay(todayISO());
  const kpi = (l, v_, s_) => h("div", { class: "kpi" }, h("div", { class: "l" }, l), h("div", { class: "v num" }, v_), h("div", { class: "s" }, s_ || ""));
  const tot = ds.reduce((a, x) => a + x.steps, 0), avg = tot / ds.length, hit = ds.filter((x) => x.steps >= goal).length;
  const wk = ds.reduce((a, x) => a + (x.steps_in_acts || 0), 0);
  const sorted = [...ds].sort((a, b) => a.date.localeCompare(b.date)), lastD = sorted[sorted.length - 1];
  // Media por día de la semana (lunes primero)
  const wd = Array.from({ length: 7 }, () => []);
  for (const x of ds) { const [y, m, d] = x.date.split("-").map(Number); wd[(new Date(y, m - 1, d).getDay() + 6) % 7].push(x.steps); }
  const wavg = wd.map((L) => (L.length ? L.reduce((a, b) => a + b, 0) / L.length : null)), wmx = Math.max(goal, ...wavg.filter((x) => x != null)) * 1.05;
  const bestWd = wavg.indexOf(Math.max(...wavg.filter((x) => x != null)));
  const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const recBox = h("div", null, h("div", { class: "muted sm", style: { padding: "8px 0" } }, "Cargando…"));
  pgSheet("Pasos", [
    pgDays("los pasos y el gasto de cada día", () => openStepsDay(lastD ? lastD.date : todayISO())),
    h("div", { class: "kpis k3" },
      kpi("Media", fmt(avg), "pasos al día"), kpi("Objetivo cumplido", `${hit} de ${ds.length}`, Math.round((100 * hit) / ds.length) + " % de los días"),
      kpi("Total", fmt(tot), wk ? `${fmt(wk)} del entreno` : `${ds.length} días`)),
    recBox,
    h("div", { class: "card panel flat" }, h("h3", null, "Cada día"), ...[...stepsPanel(hist, goal).children].slice(2)),
    h("div", { class: "card panel flat" }, h("h3", null, "Por día de la semana"),
      h("div", { class: "wdb" }, wavg.map((x, i) => h("div", { class: "wdb-c" + (i === bestWd ? " best" : "") },
        h("b", { class: "num" }, x == null ? "—" : fmt(x / 1000, 1) + "k"),
        h("div", { class: "wdb-t" }, h("i", { class: x != null && x >= goal ? "ok" : "", style: { height: x == null ? "0" : Math.max(3, (100 * x) / wmx) + "%" } })),
        h("span", null, WD[i]))))),
  ]);
  // La semana en curso y las rachas y récords de siempre (con los datos de hoy)
  try {
    const st = await api("GET", "/api/state?date=" + todayISO()), d = await stepsData(st);
    recBox.replaceChildren(...stepsRecords(st, d));
  } catch (e) { recBox.remove(); }
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
    h("p", { class: "muted wz-p" }, "Al cambiarlos a mano, la calibración pasa a manual."),
    h("div", { class: "form" }, F.map(([k, l, d]) => h("label", { class: "fld" }, h("span", null, l, h("span", { class: "faint" }, ` · ${d} · de fábrica ${String(D[k]).replace(".", ",")}`)),
      ins[k] = h("input", { class: "input num", inputMode: "decimal", value: String(P[k]).replace(".", ",") }))))],
    [h("button", { class: "btn", onclick: () => sh.close() }, "Cancelar"), h("span", { class: "grow" }),
      h("button", { class: "btn primary", onclick: async () => {
        const body = {}; for (const [k] of F) { const n = parseNum(ins[k].value); if (n == null || Number.isNaN(n)) { toast("Valor no válido: " + k, { error: true }); return; } if (String(n) !== String(Number(P[k]))) body[k] = String(n); }
        if (Object.keys(body).length) await act(() => api("PUT", "/api/calibration", body), "Guardado");
        sh.close(); await refresh(); } }, "Guardar")], { guard: true });
}

function weeksTable(weeks) {
  if (!weeks.length) return h("div", { class: "muted" }, "Sin datos todavía.");
  return h("div", { class: "tbl-wrap" }, h("table", { class: "t" },
    h("tr", null, ...["Semana", "Días", "kcal", "Aprox.", "P", "C", "G", "Peso medio", "Δ", "Gasto est.", "Balance"].map((x, i) => h("th", { class: i > 0 ? "r" : "" }, x))),
    [...weeks].reverse().map((w) => h("tr", null, h("td", null, dateLabel(w.week, { day: "numeric", month: "short" })), h("td", { class: "r" }, `${w.days_logged}/${w.days}`),
      h("td", { class: "r num" }, !w.kcal ? "—" : fmt(w.kcal)), h("td", { class: "r num faint" }, w.approx_pct == null ? "—" : w.approx_pct + " %"), h("td", { class: "r num" }, !w.kcal ? "—" : fmt(w.protein_g)),
      h("td", { class: "r num" }, !w.kcal ? "—" : fmt(w.carbs_g)), h("td", { class: "r num" }, !w.kcal ? "—" : fmt(w.fat_g)),
      h("td", { class: "r num" }, w.weight == null ? "—" : kgf(w.weight)), h("td", { class: "r num" }, signedKg(w.weight_delta)),
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
        h("td", { class: "r num" }, d.weight_kg == null ? "—" : kgf(d.weight_kg)), h("td", { class: "r num" }, d.avg7 == null ? "—" : kgf(d.avg7)),
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
    steps: () => [["Añádelo en Claude", "«+ Añadir» → «Añadir conector personalizado» → nombre «Salud», pega la dirección y «Continuar». Lo demás, como viene (Iniciar sesión ahora · Usar la identidad publicada de Claude · sin encabezados) → Añadir.", { href: "https://claude.ai/customize/connectors", t: "Abrir conectores de Claude" }],
      ["Pulsa «Conectar» y luego «Permitir»", ""],
      ["Quita los avisos", "En ese mismo conector, cambia «Requiere aprobación» por «Permitir siempre» (en los dos grupos de herramientas). Si no, te pedirá permiso cada vez que apunte algo."]] },
  { k: "claude-code", n: "Claude Code", sub: "Terminal", logo: "claude-code.png", c: "#d97757",
    steps: (u) => [["Ejecuta en una terminal", "", `claude mcp add --transport http --scope user salud ${u}`],
      ["En Claude Code: /mcp → salud → Authenticate", "y pulsa «Permitir»."]] },
  { k: "chatgpt", n: "ChatGPT", sub: "Plus o superior · desde la web", logo: "chatgpt.png", c: "#10a37f",
    steps: () => [["Añádelo en ChatGPT", "En chatgpt.com: Complementos → «+» → «Añadir servidor MCP personalizado» → nombre «Salud», pega la dirección y deja la autenticación en OAuth → «Entiendo y quiero continuar» → «Crear como complemento».", { href: "https://chatgpt.com/plugins", t: "Abrir complementos de ChatGPT" }],
      ["Instálalo y pulsa «Permitir»", "Si no se instala solo, ábrelo en tus complementos y pulsa «+»."]] },
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
        h("div", { class: "ast" }, doneN, h("div", null, h("b", null, "Escríbele en cualquier chat"), h("div", { class: "muted" }, (ag.k === "chatgpt" ? "Con @Salud en el mensaje (y @Hevy para tus entrenos): " : "") + "«Apunta mi desayuno», «¿cuánto llevo hoy?», «cierra el día»…"), status)))],
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
          r.steps_pending ? ` Pasos: ${r.steps_plan ? stepsPlanTxt({ target: r, date: todayISO(), today: todayISO() }) : fmt(r.projected_steps || 0) + " previstos"}.` : "", ` Proteína con ${kgf(r.weight_kg)} kg.`) : null].filter(Boolean));
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
      toast("Objetivo guardado"); sh.close(); await refresh(); onSaved && onSaved(); } }, "Guardar")], { guard: true });
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
  const sh = sheet("Primeros pasos", null, null, { onClose: () => { S.onAgents = null; if (!done) setTimeout(() => api("GET", "/api/notes/bienvenida").then((n) => { if (!n.body) toast("Se mostrará hasta completar los primeros pasos"); }).catch(() => {}), 50); } });
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
  // Historial de objetivos como lista (una tabla no cabe en el móvil)
  const hist = h("div", { class: "thist" }, [...data.targets].reverse().map((t) => h("div", { class: "thist-r" },
    h("span", { class: "thist-d" }, dateLabel(t.valid_from, { day: "numeric", month: "short", year: "numeric" })),
    h("span", { class: "grow" }, t.mode === "gasto"
      ? `Según tu gasto · ${signed(t.kcal_offset || 0)} kcal · P ${fmt(t.protein_per_kg, 1)} g/kg · G ${fmt(((t.fat_min_pct || 0) + (t.fat_max_pct || 0)) / 2)} %`
      : `Fijo · ${fmt(t.kcal)} kcal · P ${fmt(t.protein_g)} g · G ${fmt(((t.fat_min_g || 0) + (t.fat_max_g || t.fat_min_g || 0)) / 2)} g`,
      t.provisional ? h("span", { class: "faint" }, " · provisional") : null))));
  const sh = sheet("Ajustes", [
    h("div", { class: "sec-t" }, "Objetivo diario"),
    targetCard(tg, () => { sh.close(); settingsSheet(); }),
    h("details", { style: { marginTop: "8px" } }, h("summary", null, "Historial de objetivos"), hist),
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
// ---- Actividad: todo lo que se cambia en la cuenta y quién lo hizo (tú en la web, cada agente con su logo, el móvil).
// Una línea por cambio (lo hecho de golpe se junta: «y 3 más»); al tocarla, el detalle y los datos tal cual.
const cap = (x) => x ? x[0].toUpperCase() + x.slice(1) : x;
const whoName = (w) => w === "tu" ? "Tú" : w === "movil" ? "Móvil" : w.startsWith("agente:") ? agentOf(w.slice(7)).n : "Tu agente";
function whoAvatar(w, size = 30) {
  if (w === "tu") return h("span", { class: "act-av me", style: { width: size + "px", height: size + "px" } }, ((S.me && (S.me.nombre || S.me.usuario)) || "T")[0].toUpperCase());
  if (w === "movil") return h("span", { class: "act-av mob", style: { width: size + "px", height: size + "px" } }, icon("phone"));
  return agentLogo(w.startsWith("agente:") ? agentOf(w.slice(7)) : { logo: null }, size);
}
async function activitySheet() {
  let who = "", items = [], next = null, whos = [], open = null, loading = false;
  const sh = sheet("Actividad", h("div", { class: "muted" }, "Cargando…"), null, { wide: true, sub: "Lo que se ha cambiado y quién lo hizo" });
  const load = async (more) => {
    if (loading) return; loading = true;
    try {
      const r = await api("GET", "/api/activity?limit=60" + (who ? "&who=" + encodeURIComponent(who) : "") + (more && next ? "&before=" + next : ""));
      items = more ? items.concat(r.items) : r.items; next = r.next; whos = r.who || whos;
    } catch (e) { toast(e.message, { error: true }); }
    loading = false; draw(more);
  };
  const dayHead = (ts) => { const d = ts.slice(0, 10), t = todayISO(); return d === t ? "Hoy" : d === addDays(t, -1) ? "Ayer" : cap(dateLabel(d, { weekday: "long", day: "numeric", month: "long" })); };
  const detail = (it) => h("div", { class: "act-det" },
    (it.sends || []).length ? h("div", { class: "act-sends" }, h("div", { class: "faint" }, it.sends.length === 1 ? "Lo que trajo:" : `Los ${it.sends.length} envíos de ese día:`),
      h("ul", null, it.sends.map(([t, x]) => h("li", null, h("b", { class: "num" }, t), h("span", null, x))))) : null,
    it.detail.length ? h("div", { class: "act-kv" }, it.detail.map(([k, v]) => [h("span", { class: "faint" }, k), h("span", null, String(v))])) : null,
    it.more.length ? h("div", { class: "act-more" }, h("div", { class: "faint" }, "También, a la vez:"), h("ul", null, it.more.map((x) => h("li", null, x)))) : null,
    it.action !== "health_sync" && it.raw && Object.keys(it.raw).length ? h("details", { class: "act-raw" }, h("summary", null, "Ver los datos"), h("pre", null, JSON.stringify(it.raw, null, 2))) : null,
    h("div", { class: "faint act-when" }, `${dateLabel(it.ts.slice(0, 10), { weekday: "long", day: "numeric", month: "long" })} · ${it.ts.slice(11, 19)}`));
  const rowOf = (it) => {
    const on = open === it.id, n = it.count - 1;
    return h("div", { class: "act-row" + (on ? " on" : "") },
      h("button", { class: "act-main", onclick: () => { open = on ? null : it.id; draw(); } },
        whoAvatar(it.who),
        h("span", { class: "act-tx" }, h("span", null, h("b", null, whoName(it.who)), " ", it.text),
          h("span", { class: "faint act-sub" }, it.ts.slice(11, 16) + (n > 0 ? (it.action === "health_sync" ? ` · ${it.count} envíos (el último)` : ` · y ${n} más`) : ""))),
        h("span", { class: "act-chev" }, icon(on ? "chev" : "right"))),
      on ? detail(it) : null);
  };
  const draw = (keep = true) => {
    const body = sh.el.querySelector(".sheet-b"), top = body ? body.scrollTop : 0;
    const chips = h("div", { class: "act-chips" }, [["", "Todo"], ...whos.map((w) => [w, whoName(w)])].map(([k, l]) =>
      h("button", { class: "chip" + (who === k ? " on" : ""), onclick: () => { who = k; open = null; load(false); } }, k && k !== "tu" && k !== "movil" ? whoAvatar(k, 16) : null, l)));
    const groups = []; let last = null;
    for (const it of items) { const d = it.ts.slice(0, 10); if (d !== last) { groups.push([it.ts, []]); last = d; } groups[groups.length - 1][1].push(it); }
    sh.set("Actividad", [chips,
      items.length ? groups.map(([ts, its]) => h("div", { class: "act-day" }, h("div", { class: "sec-t" }, dayHead(ts)), its.map(rowOf)))
        : h("div", { class: "muted", style: { padding: "24px 0", textAlign: "center" } }, "Aún no hay nada aquí."),
      next ? h("div", { style: { textAlign: "center", marginTop: "10px" } }, h("button", { class: "btn sm", onclick: () => load(true) }, "Ver más")) : null],
      null, { sub: "Lo que se ha cambiado y quién lo hizo" });
    if (keep && body) body.scrollTop = top;
  };
  await load(false);
}
// Perfil (pestaña del móvil; en el ordenador, el menú de la cuenta abajo en la barra lateral)
function viewProfile() {
  if (!S.meReady) return h("div", { class: "profile" }, h("div", { class: "pf-head" }, h("span", { class: "av xl skel" }), h("div", null, h("b", { class: "skel-t" }), h("span", { class: "skel-t sm" }))));
  const name = S.me ? (S.me.nombre || S.me.usuario) : "Este dispositivo";
  const err = (p) => p.catch((e) => toast(e.message, { error: true }));
  const row = (ic, label, fn, extra, cls) => h("button", { class: "pf-row" + (cls ? " " + cls : ""), onclick: fn }, h("span", { class: "pf-ic" }, icon(ic)), h("span", { class: "grow" }, label), extra || null, cls === "danger" ? null : h("span", { class: "chev" }, icon("right")));
  return h("div", { class: "profile" },
    h("div", { class: "pf-head" }, h("span", { class: "av xl" + (S.me ? "" : " local") }, S.me ? name[0].toUpperCase() : icon("lock")),
      h("div", null, h("b", null, name), h("span", null, S.me ? "@" + S.me.usuario : "Versión local"))),
    (() => { // Un resumen: desde cuándo, días apuntados y cerrados, entrenos y el peso
      const box = h("div", { class: "card pf-stats" });
      const stat = (v, l) => h("div", null, h("b", { class: "num" }, v), h("span", null, l));
      api("GET", "/api/summary").then((r) => { if (!r.since) return box.remove();
        box.replaceChildren(stat(fmt(r.days_logged), "días apuntados"), stat(fmt(r.days_closed), "cerrados"), stat(fmt(r.workouts), "entrenos"),
          r.weight_first != null && r.weight_last != null ? stat(signedKg(r.weight_last - r.weight_first) + " kg", "desde el " + dateLabel(r.since, { day: "numeric", month: "short" })) : null); }).catch(() => box.remove());
      return box; })(),
    h("div", { class: "card pf-list" },
      row("out", "Informe PDF", () => reportSheet()),
      S.me ? row("plug", "Conexiones", () => err(connectionsSheet()), agentConnected() ? h("span", { class: "ag-mini-list" }, S.me.agente.agents.slice(0, 3).map((t) => agentLogo(agentOf(t.agent || t.kind), 20))) : h("span", { class: "alert-dot" }, "!"), agentConnected() ? "" : "warn") : null,
      row("activity", "Actividad", () => err(activitySheet())),
      row("gear", "Ajustes", () => err(settingsSheet())),
      S.me ? row("flag", "Primeros pasos", () => err(welcomeSheet())) : null),
    S.me ? h("div", { class: "card pf-list" }, row("out", "Cerrar sesión", async () => { await api("POST", "/api/logout", {}); location.href = "/login"; }, null, "danger")) : null);
}
function drawAccount() {
  const nav = $("#nav-av"); if (nav) { nav.className = "nav-av" + (!S.meReady ? " skel" : S.me ? "" : " local"); nav.replaceChildren(!S.meReady ? "" : S.me ? (S.me.nombre || S.me.usuario)[0].toUpperCase() : icon("lock")); }
  const b = $("#btn-acct"); if (!b) return;
  if (!S.meReady) { b.replaceChildren(h("span", { class: "av skel" }), h("span", { class: "an skel-t" })); return; }
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
    h("button", { onclick: () => { menu.remove(); activitySheet().catch((e) => toast(e.message, { error: true })); } }, icon("activity"), "Actividad"),
    h("button", { onclick: () => { menu.remove(); settingsSheet().catch((e) => toast(e.message, { error: true })); } }, icon("gear"), "Ajustes"),
    S.me ? h("button", { onclick: () => { menu.remove(); welcomeSheet().catch((e) => toast(e.message, { error: true })); } }, icon("flag"), "Primeros pasos") : null,
    S.me ? h("button", { class: "danger", onclick: async () => { await api("POST", "/api/logout", {}); location.href = "/login"; } }, icon("out"), "Cerrar sesión") : null);
  document.body.append(menu);
  const r = $("#btn-acct").getBoundingClientRect();
  if (matchMedia("(min-width: 900px)").matches) { menu.style.left = r.left + "px"; menu.style.bottom = window.innerHeight - r.top + 6 + "px"; }  // barra lateral: hacia arriba
  else { menu.style.top = r.bottom + 6 + "px"; menu.style.right = Math.max(8, window.innerWidth - r.right) + "px"; }
  setTimeout(() => document.addEventListener("click", function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", off); } }), 0);
}
$("#btn-acct").addEventListener("click", (e) => { e.stopPropagation(); accountMenu(); });
// Móvil: con el teclado abierto se esconde la barra de abajo (como en Instagram)
document.addEventListener("focusin", (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName) && !/checkbox|radio|range|file|button/.test(e.target.type || "")) document.body.classList.add("kb"); });
document.addEventListener("focusout", () => setTimeout(() => { const a = document.activeElement; if (!a || !/INPUT|TEXTAREA/.test(a.tagName)) document.body.classList.remove("kb"); }, 50));
drawAccount();

document.addEventListener("keydown", (e) => {
  if (S.view !== "hoy" || S.sheetOpen || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowLeft") goDay(addDays(S.date, -1));
  if (e.key === "ArrowRight") goDay(addDays(S.date, 1));
});

// En modo servidor, saber quién ha iniciado sesión (en local /api/me no existe y no pasa nada)
// Hasta saber quién es (o que es la versión local), el perfil y el avatar salen como un hueco gris, sin «Versión local»
const meReady = () => { S.meReady = true; drawAccount(); if (S.view === "perfil") render(); };
fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(async (m) => {
  if (!m || !m.usuario) return meReady();
  S.me = m; meReady(); loadPasos();
  const n = await api("GET", "/api/notes/bienvenida").catch(() => null);  // primeros pasos hasta terminarlos
  if (n && !/^hecho/.test(n.body || "")) setTimeout(() => welcomeSheet().catch(() => {}), 600);
}).catch(() => meReady());
route();
// Service worker (para instalar la web como app). Aquí y no en el HTML: la CSP no deja scripts en línea
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
