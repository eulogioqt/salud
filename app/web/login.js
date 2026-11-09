const $ = (id) => document.getElementById(id);
const u = $("u"), p = $("p");
const pick = (name) => {
  u.value = name;
  document.querySelectorAll(".acc").forEach((b) => b.classList.toggle("on", b.dataset.u === name));
  $("uf").classList.add("hidden");
  p.focus();
};
fetch("/api/cuentas").then((r) => (r.ok ? r.json() : [])).then((xs) => {
  if (!xs.length) return;
  $("who").append(...xs.map((a) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "acc"; b.dataset.u = a.usuario;
    b.innerHTML = `<span class="av"></span><span></span>`;
    b.firstChild.textContent = (a.nombre || a.usuario)[0].toUpperCase();
    b.lastChild.textContent = a.nombre || a.usuario;
    b.onclick = () => pick(a.usuario);
    return b;
  }));
  let last = null; try { last = localStorage.getItem("salud_last"); } catch (e) {}
  if (last && xs.some((a) => a.usuario === last)) pick(last); else $("uf").classList.add("hidden");
}).catch(() => {});
$("f").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const e = $("e"); e.textContent = "";
  if (!u.value) { e.textContent = "Elige tu cuenta"; return; }
  $("go").disabled = true;
  try {
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: u.value, password: p.value }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { e.textContent = d.error || "No se pudo entrar"; $("go").disabled = false; p.select(); return; }
    try { localStorage.setItem("salud_last", u.value); } catch (x) {}
    location.href = "/";
  } catch (x) { e.textContent = "Sin conexión con el servidor"; $("go").disabled = false; }
});
