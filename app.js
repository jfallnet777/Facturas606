"use strict";
// Factura 606 — versión para contadores con varios clientes.

// =====================================================================
//  Versión y protección contra archivos mezclados
// =====================================================================
const VERSION_APP = "2026.11.18-4";

async function limpiarYRecargar() {
  try {
    if ("serviceWorker" in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch {}
  location.replace(location.pathname + "?act=" + Date.now() + location.hash);
}

// Si algo falla al iniciar, mostrar qué pasó en vez de dejar la pantalla vacía
let _errorMostrado = false;
function pantallaError(detalle) {
  if (_errorMostrado || String(detalle).includes("__recargando__")) return;
  _errorMostrado = true;
  const d = document.createElement("div");
  d.setAttribute("role", "alert");
  d.style.cssText = "position:fixed;inset:0;z-index:9999;background:#EEF3FB;color:#0F1B3D;font:16px/1.45 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px";
  d.innerHTML = `<div style="max-width:420px;background:#fff;border-radius:20px;padding:24px;box-shadow:0 8px 30px rgba(15,27,61,.15)">
    <h2 style="margin:0 0 8px;font-size:1.25rem">La app no terminó de cargar</h2>
    <p style="margin:0 0 14px;color:#46536E">Casi siempre es porque el celular mezcló archivos viejos con nuevos después de una actualización. Toca <b>Actualizar ahora</b>. Tus clientes y facturas no se borran.</p>
    <button id="errAct" style="width:100%;padding:14px;border:0;border-radius:12px;background:#1A56DB;color:#fff;font-weight:700;font-size:1rem;margin-bottom:8px">Actualizar ahora</button>
    <button id="errResp" style="width:100%;padding:12px;border:1.5px solid #1A56DB;border-radius:12px;background:#fff;color:#1A56DB;font-weight:700">Guardar un respaldo de mis datos</button>
    <p style="margin:14px 0 0;font-size:.8rem;color:#66728C">Detalle: <span id="errDet"></span><br>Versión del código: ${VERSION_APP}, de la página: ${document.documentElement.dataset.version || "anterior"}</p>
  </div>`;
  document.body.appendChild(d);
  d.querySelector("#errDet").textContent = String(detalle).slice(0, 200);
  d.querySelector("#errAct").onclick = limpiarYRecargar;
  d.querySelector("#errResp").onclick = () => {
    const datos = {};
    try { for (const k of Object.keys(localStorage)) if (k.startsWith("f606_")) datos[k] = localStorage.getItem(k); } catch {}
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "factura606-crudo", datos }, null, 1)], { type: "application/json" }));
    a.download = "respaldo_factura606_emergencia.json"; document.body.appendChild(a); a.click(); a.remove();
  };
}
window.addEventListener("error", (e) => pantallaError(e.message || e.error || "error desconocido"));

// La página (index.html) y el código deben ser de la misma versión
(() => {
  const vPagina = document.documentElement.dataset.version;
  if (vPagina === VERSION_APP) { try { sessionStorage.removeItem("f606_rep"); } catch {} return; }
  let yaIntento = false;
  try { yaIntento = !!sessionStorage.getItem("f606_rep"); sessionStorage.setItem("f606_rep", "1"); } catch {}
  if (!yaIntento) { limpiarYRecargar(); throw new Error("__recargando__"); }
  pantallaError(`El index.html que entrega GitHub es de otra versión (${vPagina || "anterior"}). Sube de nuevo todos los archivos, incluido index.html.`);
  throw new Error("__recargando__");
})();

// =====================================================================
//  Estado y almacenamiento
// =====================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const almacen = {
  leer(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast("No se pudo guardar: el almacenamiento está lleno o bloqueado"); } },
};

let cfg = Object.assign({ tema: "auto", bienvenida: false, casillas: null }, almacen.leer("f606_cfg", {}));
let clientes = almacen.leer("f606_clientes", []);
let facturas = almacen.leer("f606_facturas", []);
let sup = almacen.leer("f606_suplidores", {});      // rnc → nombre (compartido entre clientes)
let clienteId = almacen.leer("f606_cliente", null);

const hoy = new Date();
// Por defecto: hasta el día 15 se trabaja el mes anterior (el que vence); después, el mes en curso.
const perDefecto = (() => { const d = new Date(hoy.getFullYear(), hoy.getMonth() - (hoy.getDate() <= 15 ? 1 : 0), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
let periodo = almacen.leer("f606_periodo", null) || perDefecto;
let filtro = "todas", busqueda = "", busquedaCli = "";
let rango = null; // período de exportación {d, h}; null = el mes del panel

// Migración desde la versión de un solo usuario
if (!clientes.length && facturas.length) {
  const id = uid();
  clientes.push(nuevoCliente({ id, nombre: "Mi empresa", rnc: cfg.rnc || "" }));
  facturas.forEach((f) => (f.clienteId = id));
  clienteId = id;
}

function guardarTodo() {
  almacen.guardar("f606_clientes", clientes);
  almacen.guardar("f606_facturas", facturas);
  almacen.guardar("f606_suplidores", sup);
  almacen.guardar("f606_cliente", clienteId);
  almacen.guardar("f606_cfg", cfg);
}

// =====================================================================
//  Utilidades
// =====================================================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const n = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : Math.round(x * 100) / 100; };
const r2 = (x) => Math.round(x * 100) / 100;
const money = (v) => n(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mesNombre = (p) => { const [a, m] = p.split("-"); return `${MESES[+m - 1].toLowerCase()} ${a}`; };
const iniciales = (s) => (String(s || "?").replace(/\b(SRL|SAS|SA|EIRL|DE|DEL|LA|EL|LOS|LAS)\b/gi, "").match(/[A-Za-zÁÉÍÓÚÑ0-9]+/g) || ["?"]).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const totalFactura = (f) => n(f.servicios) + n(f.bienes) + n(f.itbis) + n(f.propina) + n(f.isc) + n(f.otros);
const itbisPorAdelantar = (f) => Math.max(0, n(n(f.itbis) - n(f.itbisRet) - n(f.itbisProp) - n(f.itbisCosto)));
const cliente = () => clientes.find((c) => c.id === clienteId) || null;
const facturasDe = (cid, per = periodo) => facturas.filter((f) => f.clienteId === cid && f.periodo === per);

// Colores de carpeta (fondo y texto con buen contraste)
const COLORES = [
  { c: "#F6C344", t: "#2B2000" }, { c: "#3B5BDB", t: "#FFFFFF" }, { c: "#2AA772", t: "#062A1B" }, { c: "#FF8A65", t: "#2B1007" },
  { c: "#7DD3FC", t: "#062033" }, { c: "#B197FC", t: "#1E1240" }, { c: "#F783AC", t: "#2D0A18" }, { c: "#A3B1C2", t: "#141A22" },
];
const colorDe = (c) => COLORES[(c && Number.isInteger(c.color) ? c.color : Math.max(0, clientes.indexOf(c))) % COLORES.length];
const vars = (c) => { const k = colorDe(c); return `--c:${k.c};--t:${k.t}`; };

function nuevoCliente(extra = {}) {
  return Object.assign({ id: uid(), nombre: "", rnc: "", tipo: "02", pago: "01", destino: "bienes", memo: {}, enviados: {}, color: clientes.length % COLORES.length }, extra);
}

function fechaCorta(iso) {
  if (!iso) return "Sin fecha";
  const [, m, d] = iso.split("-");
  return `${+d} ${MESES[+m - 1].slice(0, 3).toLowerCase()}`;
}

let _toastT;
function toast(msg, accion) {
  $("#toastTxt").textContent = msg;
  const b = $("#toastBtn");
  b.hidden = !accion;
  if (accion) { b.textContent = accion.texto; b.onclick = () => { $("#toast").classList.remove("on"); accion.fn(); }; }
  $("#toast").classList.add("on");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => $("#toast").classList.remove("on"), accion ? 7000 : 3000);
}

function confirmar(texto, ok = "Aceptar", peligro = false) {
  return new Promise((res) => {
    const d = $("#dlgConfirmar");
    let hecho = false;
    const fin = (v) => { if (hecho) return; hecho = true; if (d.open) d.close(); res(v); };
    $("#confTexto").textContent = texto;
    $("#confSi").textContent = ok;
    $("#confSi").style.background = peligro ? "var(--rojo)" : "";
    $("#confSi").onclick = () => fin(true);
    $("#confNo").onclick = () => fin(false);
    d.onclose = () => fin(false);
    d.showModal();
  });
}

function llenarSelect(sel, obj) {
  sel.innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${k ? k + " · " : ""}${esc(v)}</option>`).join("");
}

function aplicarTema() {
  if (cfg.tema === "auto") document.documentElement.removeAttribute("data-tema");
  else document.documentElement.setAttribute("data-tema", cfg.tema);
  $$("#segTema button").forEach((b) => b.classList.toggle("on", b.dataset.t === cfg.tema));
}

// Calcula el desglose a partir del total
function desglose(total, modo, destino, otros = 0) {
  const t = n(total) - n(otros);
  let base, itbis = 0, propina = 0;
  if (modo === "ex") base = t;
  else if (modo === "18p") { base = r2(t / 1.28); itbis = r2(base * 0.18); propina = r2(t - base - itbis); }
  else { base = r2(t / 1.18); itbis = r2(t - base); }
  return { bienes: destino === "bienes" ? base : 0, servicios: destino === "servicios" ? base : 0, itbis, propina };
}

// =====================================================================
//  Memoria de suplidores
// =====================================================================
function aplicarMemoria(f, cl = cliente()) {
  const rnc = soloDigitos(f.rnc);
  if (!rnc) return f;
  if (!f.suplidor && sup[rnc]) f.suplidor = sup[rnc];
  const m = cl?.memo?.[rnc];
  if (m) { f.tipoBS = m.tipoBS || f.tipoBS; f.formaPago = m.formaPago || f.formaPago; f._destino = m.destino; f._calc = m.calc; }
  return f;
}
function recordar(f, cl) {
  const rnc = soloDigitos(f.rnc);
  if (!rnc || !cl) return;
  if (f.suplidor) sup[rnc] = f.suplidor;
  cl.memo ||= {};
  cl.memo[rnc] = {
    tipoBS: f.tipoBS, formaPago: f.formaPago,
    destino: n(f.servicios) > n(f.bienes) ? "servicios" : "bienes",
    calc: n(f.propina) ? "18p" : n(f.itbis) ? "18" : "ex",
  };
}

// =====================================================================
//  Validaciones
// =====================================================================
const RE_NCF = /^B(01|02|03|04|11|12|13|14|15|17)\d{8}$/;   // series que acepta la herramienta de la DGII
const RE_ECF = /^E(31|32|33|34|41|42|43|44|45|47)\d{10}$/;

function validar(f) {
  const a = [], add = (campo, msg) => a.push({ campo, msg });
  const cl = clientes.find((c) => c.id === f.clienteId);
  const rnc = soloDigitos(f.rnc);
  if (!rnc) add("rnc", "Falta el RNC o la cédula del suplidor.");
  else if (!(rnc.length === 9 || rnc.length === 11)) add("rnc", "El RNC lleva 9 dígitos y la cédula 11.");
  else if ((rnc.length === 9 && f.tipoId !== "1") || (rnc.length === 11 && f.tipoId !== "2")) add("rnc", "El tipo de ID no coincide con la cantidad de dígitos.");
  if (rnc && cl && rnc === cl.rnc) add("rnc", "Es el RNC del cliente. Pon el del suplidor.");

  const ncf = String(f.ncf || "").toUpperCase();
  if (!ncf) add("ncf", "Falta el NCF.");
  else if (!RE_NCF.test(ncf) && !RE_ECF.test(ncf)) add("ncf", "Formato inválido: B + 10 caracteres o E + 12.");
  else if (/^(B02|E32)/.test(ncf)) add("general", "Comprobante de consumo (B02/E32): normalmente no da crédito fiscal.");
  const mod = String(f.ncfMod || "").toUpperCase();
  if (mod && !RE_NCF.test(mod) && !RE_ECF.test(mod)) add("ncfMod", "Formato inválido.");
  if (/^(B03|B04|E33|E34)/.test(ncf) && !mod) add("ncfMod", "Las notas de crédito y débito necesitan el NCF que modifican.");

  if (!f.fecha) add("fecha", "Falta la fecha.");
  else if (f.fecha.slice(0, 7) > f.periodo) add("fecha", "Es posterior al período del reporte.");
  if (f.fechaPago && f.fecha && f.fechaPago < f.fecha) add("fechaPago", "Es anterior a la fecha de la factura.");
  if ((n(f.itbisRet) > 0 || n(f.retIsr) > 0) && !f.fechaPago) add("fechaPago", "Con retenciones, la fecha de pago es obligatoria.");

  const base = n(f.servicios) + n(f.bienes);
  if (base <= 0) add("montos", "Pon el monto en bienes, en servicios o en ambos.");
  if (base > 0 && n(f.itbis) > base * 0.185) add("itbis", "Es más del 18% del monto.");
  if (n(f.itbisRet) + n(f.itbisProp) + n(f.itbisCosto) > n(f.itbis)) add("general", "Las deducciones de ITBIS superan el ITBIS facturado.");
  if (n(f.retIsr) > 0 && !f.tipoRetIsr) add("tipoRetIsr", "Elige el tipo de retención.");
  if (n(f.total) && Math.abs(n(f.total) - totalFactura(f)) > 1) add("cuadre", "Los montos no cuadran con el total de la factura.");
  if (ncf && facturas.some((x) => x.id !== f.id && x.clienteId === f.clienteId && soloDigitos(x.rnc) === rnc && String(x.ncf).toUpperCase() === ncf))
    add("general", "Este cliente ya tiene una factura con este RNC y NCF.");
  return a;
}
const necesitaRevision = (f) => validar(f).length > 0;

function estadoCliente(c, per = periodo) {
  const fs = facturasDe(c.id, per);
  const rev = fs.filter(necesitaRevision).length;
  if (c.enviados?.[per]) return { k: "enviado", t: "Enviado", fs, rev };
  if (!fs.length) return { k: "vacio-e", t: "Sin facturas", fs, rev };
  if (rev) return { k: "revisar", t: `${rev} por revisar`, fs, rev };
  return { k: "listo", t: "Listo para exportar", fs, rev };
}

// =====================================================================
//  Navegación
// =====================================================================
const VISTAS = ["inicio", "clientes", "capturar", "facturas", "exportar", "ajustes"];
const CON_CLIENTE = ["capturar", "facturas"];
let vista = "inicio";

function irA() {
  let v = location.hash.slice(1);
  if (!VISTAS.includes(v)) v = "inicio";
  if (CON_CLIENTE.includes(v) && !cliente()) { v = "clientes"; if (clientes.length) toast("Primero elige un cliente"); history.replaceState(null, "", "#clientes"); }
  vista = v;
  VISTAS.forEach((x) => ($("#v-" + x).hidden = x !== v));
  $$(".nav a").forEach((a) => {
    a.classList.toggle("on", a.dataset.v === v);
    a.classList.toggle("off", CON_CLIENTE.includes(a.dataset.v) && !cliente());
  });
  document.body.classList.toggle("sin-cliente", !CON_CLIENTE.includes(v) && !(v === "exportar" && cliente()));
  $("#topTitulo").textContent = { inicio: "Inicio", ajustes: "Ajustes", clientes: "Clientes", exportar: "Exportar" }[v] || "";
  render();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", irA);

function elegirCliente(id, destino = "capturar") {
  clienteId = id;
  const c = cliente(); if (c) { c.ultimo = Date.now(); almacen.guardar("f606_clientes", clientes); } filtro = "todas"; busqueda = ""; $("#buscar").value = "";
  almacen.guardar("f606_cliente", clienteId);
  if ($("#dlgClientes").open) $("#dlgClientes").close();
  if (location.hash === "#" + destino) irA(); else location.hash = destino;
}

// Período
function pintarPeriodo() {
  const [a, m] = periodo.split("-");
  $("#perMes").textContent = MESES[+m - 1].slice(0, 3);
  $("#perAnio").textContent = a;
  $("#perInput").value = periodo;
}
function setPeriodo(p) { periodo = p; rango = null; almacen.guardar("f606_periodo", periodo); pintarPeriodo(); render(); }
function moverPeriodo(d) {
  const [a, m] = periodo.split("-").map(Number);
  const f = new Date(a, m - 1 + d, 1);
  setPeriodo(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`);
}
$("#perPrev").onclick = () => moverPeriodo(-1);
$("#perNext").onclick = () => moverPeriodo(1);
$("#perLabel").onclick = () => { try { $("#perInput").showPicker(); } catch { $("#perInput").focus(); } };
$("#perInput").onchange = (e) => e.target.value && setPeriodo(e.target.value);

// =====================================================================
//  Render
// =====================================================================
function render() {
  const cl = cliente();
  $("#clAv").textContent = cl ? iniciales(cl.nombre) : "?";
  $("#clAv").style.cssText = cl ? vars(cl) : "";
  $("#clNombre").textContent = cl ? cl.nombre : "Elige un cliente";
  $("#clRnc").textContent = cl ? cl.rnc : "";
  const rev = cl ? facturasDe(cl.id).filter(necesitaRevision).length : 0;
  $("#navBadge").hidden = !rev; $("#navBadge").textContent = rev;
  if (vista === "inicio") renderInicio();
  if (vista === "clientes") renderClientes();
  if (vista === "capturar") renderCapturar();
  if (vista === "facturas") renderFacturas();
  if (vista === "exportar") renderExportar();
  if (vista === "ajustes") renderAjustes();
}

const IC = {
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"/><path d="M8 12h8"/></svg>',
  baja: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  alerta: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  gente: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.3c2.3.1 4 1.6 4.5 4.2"/></svg>',
  recibo: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
  barras: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  carrito: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h10.2L20 7H6.3"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
  pct: '<svg viewBox="0 0 24 24"><path d="M6 18L18 6"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/></svg>',
};
const ESTADO_CORTO = { enviado: "Enviado", listo: "Listo", revisar: "Por revisar", "vacio-e": "Sin facturas" };

function renderInicio() {
  const h = hoy.getHours();
  const [a, m] = periodo.split("-").map(Number);
  $("#saludo").textContent = `606 de ${mesNombre(periodo)}`;
  const limite = new Date(a, m, 15);
  const dias = Math.round((new Date(limite.getFullYear(), limite.getMonth(), limite.getDate()) - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 864e5);
  const est = clientes.map((c) => ({ c, e: estadoCliente(c) }));
  const env = est.filter((x) => x.e.k === "enviado").length;
  const vence = `15 de ${MESES[limite.getMonth()].toLowerCase()}`;
  const plazo = dias < 0 ? `Venció el ${vence}` : dias === 0 ? "Vence hoy" : `Vence el ${vence}, faltan ${dias} día${dias === 1 ? "" : "s"}`;
  $("#pills").innerHTML = `<span class="pill ${dias <= 3 ? "alerta" : "fuerte"}">${plazo}</span>` + (clientes.length ? `<span class="pill">${env} de ${clientes.length} enviados</span>` : "");

  const todas = clientes.flatMap((c) => facturasDe(c.id));
  const adel = todas.reduce((s, f) => s + itbisPorAdelantar(f), 0);
  const pct = clientes.length ? Math.round((env / clientes.length) * 100) : 0;
  $("#cifras").innerHTML = `
    <div class="stat azul">${IC.gente}<b>${clientes.length}</b><small>Clientes</small></div>
    <div class="stat verde">${IC.recibo}<b>${todas.length}</b><small>Facturas del mes</small></div>
    <div class="stat naranja">${IC.ok}<b>${pct}%</b><small>Enviados</small></div>
    <div class="stat morado">${IC.barras}<b title="RD$ ${money(adel)}"><small class="mon">RD$</small>${money(adel)}</b><small>ITBIS por adelantar</small></div>`;

  if (!clientes.length) {
    $("#pila").innerHTML = `<div class="vacio">${IC.gente}<h3>Agrega tu primer cliente</h3><p>Cada cliente lleva su propio 606, con sus facturas y sus suplidores.</p><button class="btn" data-accion="nuevo-cliente">Agregar cliente</button></div>`;
    return;
  }
  const orden = { revisar: 0, listo: 1, "vacio-e": 2, enviado: 3 };
  const lista = [...est].sort((x, y) => orden[x.e.k] - orden[y.e.k] || (y.c.ultimo || 0) - (x.c.ultimo || 0));
  const max = 6;
  $("#pila").innerHTML = cabClientes() + lista.slice(0, max).map((x) => filaCliente(x.c, x.e)).join("") +
    (clientes.length > max ? `<a class="ver-todos" href="#clientes">Ver los ${clientes.length} clientes</a>` : "");
}

function cabClientes() {
  return `<div class="tr-cab" aria-hidden="true"><span>Cliente</span><span>Facturas</span><span>ITBIS por adelantar</span><span>Estado</span><span>Acciones</span></div>`;
}
function filaCliente(c, e) {
  const itbis = e.fs.reduce((s, f) => s + itbisPorAdelantar(f), 0);
  const acc = e.k === "revisar" ? `<button class="ac rev" data-pend="${c.id}" data-tipo="revisar" aria-label="Revisar facturas de ${esc(c.nombre)}">${IC.alerta}<span>${e.rev}</span></button>`
    : e.k === "listo" ? `<button class="ac exp" data-pend="${c.id}" data-tipo="listo" aria-label="Exportar ${esc(c.nombre)}">${IC.baja}</button>` : "";
  return `<div class="tr-cli">
    <button class="td-nom" data-cliente="${c.id}"><span class="cl-av" style="${vars(c)}">${esc(iniciales(c.nombre))}</span><span class="x-txt"><b>${esc(c.nombre)}</b><small class="mono">${esc(c.rnc)}</small></span></button>
    <span class="td-info"><span><b>${e.fs.length}</b><small> facturas</small></span><span><small>ITBIS </small><b>${e.fs.length ? money(itbis) : "—"}</b></span></span>
    <span class="estado ${e.k}">${e.k === "revisar" ? `${e.rev} por revisar` : ESTADO_CORTO[e.k]}</span>
    <span class="td-acc">${acc}<button class="ac" data-cliente="${c.id}" aria-label="Escanear facturas de ${esc(c.nombre)}">${IC.scan}</button></span>
  </div>`;
}

function renderClientes() {

  const est = clientes.map((c) => ({ c, e: estadoCliente(c) }));
  const cuenta = { enviado: 0, listo: 0, revisar: 0, "vacio-e": 0 };
  est.forEach(({ e }) => cuenta[e.k]++);
  const tot = clientes.length || 1;
  const colores = { enviado: "var(--palma)", listo: "var(--azul)", revisar: "var(--ambar)" };
  $("#progreso").innerHTML = clientes.length ? `
    <div class="pr-txt"><span>${cuenta.enviado} de ${clientes.length} enviados</span><span>${cuenta.listo} listos</span></div>
    <div class="pr-barra">${["enviado", "listo", "revisar"].map((k) => cuenta[k] ? `<i style="width:${(cuenta[k] / tot) * 100}%;background:${colores[k]}"></i>` : "").join("")}</div>
    <div class="pr-leyenda"><span style="--c:var(--palma)">Enviados</span><span style="--c:var(--azul)">Listos</span><span style="--c:var(--ambar)">Por revisar</span><span style="--c:var(--linea)">Sin facturas</span></div>` : "";

  const q = busquedaCli.toLowerCase();
  const orden = { revisar: 0, listo: 1, "vacio-e": 2, enviado: 3 };
  const vis = est.filter(({ c }) => !q || `${c.nombre} ${c.rnc}`.toLowerCase().includes(q))
    .sort((x, y) => orden[x.e.k] - orden[y.e.k] || x.c.nombre.localeCompare(y.c.nombre));

  if (!clientes.length) {
    $("#listaClientes").innerHTML = `<div class="vacio">
      <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><path d="M18 8v6M15 11h6"/></svg>
      <h3 style="margin:0">Agrega tu primer cliente</h3><p>Cada cliente lleva su propio 606, con sus facturas y sus suplidores frecuentes.</p>
      <button class="btn" data-accion="nuevo-cliente">Agregar cliente</button></div>`;
    return;
  }
  $("#listaClientes").innerHTML = vis.length ? cabClientes() + vis.map(({ c, e }) => filaCliente(c, e)).join("")
    : `<div class="vacio"><p>Ningún cliente coincide con “${esc(busquedaCli)}”.</p></div>`;
}

function cliHTML(c, e, marcado) {
  const itbis = e.fs.reduce((s, f) => s + itbisPorAdelantar(f), 0);
  return `<button class="cli${marcado ? " on" : ""}" data-cliente="${c.id}">
    <span class="cl-av" style="${vars(c)}">${esc(iniciales(c.nombre))}</span>
    <span style="min-width:0"><span class="nom">${esc(c.nombre)}</span><span class="sub">${esc(c.rnc)}${e.fs.length ? `, ${e.fs.length} factura${e.fs.length === 1 ? "" : "s"}` : ""}</span></span>
    <span class="der"><b>${e.fs.length ? money(itbis) : ""}</b><span class="estado ${e.k}">${e.t}</span></span>
  </button>`;
}

function renderCapturar() {
  const cl = cliente(); const fs = facturasDe(cl.id);
  const t = fs.reduce((a, f) => { a.m += n(f.servicios) + n(f.bienes); a.i += n(f.itbis); a.r += n(f.itbisRet) + n(f.retIsr); a.ad += itbisPorAdelantar(f); return a; }, { m: 0, i: 0, r: 0, ad: 0 });
  const e = estadoCliente(cl);
  $("#capCab").innerHTML = `<span class="cl-av" style="${vars(cl)}">${esc(iniciales(cl.nombre))}</span>
    <span class="x-txt"><b>${esc(cl.nombre)}</b><small class="mono">RNC ${esc(cl.rnc)}</small></span>
    <span class="estado ${e.k}">${e.k === "revisar" ? `${e.rev} por revisar` : ESTADO_CORTO[e.k]}</span>`;
  $("#capCifras").innerHTML = `
    <div class="cifra"><span class="ic azul">${IC.carrito}</span><span><small>Total compras (${fs.length} factura${fs.length === 1 ? "" : "s"})</small><b>RD$ ${money(t.m)}</b></span></div>
    <div class="cifra"><span class="ic naranja">${IC.recibo}</span><span><small>ITBIS facturado</small><b>RD$ ${money(t.i)}</b></span></div>
    <div class="cifra"><span class="ic verde">${IC.pct}</span><span><small>ITBIS por adelantar</small><b>RD$ ${money(t.ad)}</b></span></div>`;

  const rev = fs.filter(necesitaRevision);
  const ult = [...fs].sort((a, b) => (b.creada || 0) - (a.creada || 0)).slice(0, 5);
  $("#bandeja").innerHTML = rev.length ? `
    <button class="aviso-rev" data-accion="revisar-todo">
      <span class="punto">${rev.length}</span>
      <span><b>Revisar ${rev.length === 1 ? "la factura marcada" : `las ${rev.length} facturas marcadas`}</b><small>Una tras otra, con “Guardar y siguiente”.</small></span>
    </button>` : "";
  $("#ultimas").innerHTML = ult.length ? `<div class="bloque"><div class="bloque-cab"><h2>Últimas agregadas</h2><a href="#facturas" class="mini-link">Ver todas</a></div><div class="filas">${ult.map(filaHTML).join("")}</div></div>` : "";
}

const TINTES = ["#FDF0C4", "#DCE4FF", "#D5F2E3", "#FFE0D5", "#D8F0FD", "#E8E0FF", "#FDDDEA", "#E3E8EE"];
const TINTA_TINTE = ["#5A4300", "#23397F", "#145234", "#7A2E12", "#0F4766", "#3F2C85", "#7A1E45", "#36404D"];
function tinte(s) { let h = 0; for (const ch of String(s || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const i = h % TINTES.length; return `background:${TINTES[i]};color:${TINTA_TINTE[i]}`; }
function filaHTML(f) {
  const av = validar(f).length;
  return `<button class="fila" data-id="${f.id}">
    <span class="av${av ? " warn" : ""}" style="${tinte(f.rnc || f.suplidor)}">${esc(iniciales(f.suplidor || "?"))}</span>
    <span style="min-width:0">
      <span class="nom">${esc(f.suplidor || (f.rnc ? "RNC " + f.rnc : "Sin suplidor"))}</span>
      <span class="det"><code>${esc(f.ncf || "sin NCF")}</code><span class="etq ${esc(f.origen)}">${esc(f.origen)}</span></span>
    </span>
    <span class="col-fecha">${fechaCorta(f.fecha)}</span>
    <span class="col-tipo">${esc(f.tipoBS)} ${esc(TIPOS_BS[f.tipoBS] || "")}</span>
    <span class="col-itbis">${money(f.itbis)}</span>
    <span class="mto">${money(totalFactura(f))}<small>ITBIS ${money(f.itbis)}</small></span>
  </button>`;
}

function renderFacturas() {
  const fs = facturasDe(clienteId);
  const cuenta = { todas: fs.length, avisos: 0, QR: 0, OCR: 0, Manual: 0 };
  fs.forEach((f) => { cuenta[f.origen]++; if (necesitaRevision(f)) cuenta.avisos++; });
  $$("#chips .chip").forEach((c) => {
    const base = { todas: "Todas", avisos: "Por revisar", QR: "QR", OCR: "OCR", Manual: "Manual" }[c.dataset.f];
    c.innerHTML = `${base}<span class="n"> ${cuenta[c.dataset.f]}</span>`;
    c.classList.toggle("on", c.dataset.f === filtro);
  });
  const q = busqueda.toLowerCase();
  const vis = fs.filter((f) => {
    if (filtro === "avisos" && !necesitaRevision(f)) return false;
    if (["QR", "OCR", "Manual"].includes(filtro) && f.origen !== filtro) return false;
    return !q || `${f.suplidor} ${f.rnc} ${f.ncf}`.toLowerCase().includes(q);
  }).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  $(".tabla-cab").style.visibility = vis.length ? "" : "hidden";
  if (!fs.length) {
    $("#listaFacturas").innerHTML = `<div class="vacio"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h4"/></svg>
      <h3 style="margin:0">Sin facturas en ${mesNombre(periodo)}</h3><p>Escanéalas o súbelas desde Capturar.</p><a class="btn" href="#capturar">Ir a Capturar</a></div>`;
    $("#pieLista").innerHTML = ""; return;
  }
  if (!vis.length) { $("#listaFacturas").innerHTML = `<div class="vacio"><p>Nada coincide con la búsqueda o el filtro.</p></div>`; $("#pieLista").innerHTML = ""; return; }

  const grupos = {};
  vis.forEach((f) => (grupos[f.fecha || ""] ||= []).push(f));
  $("#listaFacturas").innerHTML = `<div class="filas">${Object.entries(grupos).map(([fe, g]) =>
    `<div class="sep-fecha">${fe ? fechaCorta(fe) : "Sin fecha"}</div>${g.map(filaHTML).join("")}`).join("")}</div>`;
  const sum = vis.reduce((a, f) => { a.i += n(f.itbis); a.t += totalFactura(f); return a; }, { i: 0, t: 0 });
  $("#pieLista").innerHTML = `<div><small>Facturas</small><b>${vis.length}</b></div><div><small>ITBIS</small><b>${money(sum.i)}</b></div><div><small>Total</small><b>${money(sum.t)}</b></div>`;
}

// ---------- Período de exportación ----------
const sumarMes = (p, d) => { const [a, m] = p.split("-").map(Number); const f = new Date(a, m - 1 + d, 1); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`; };
const rangoAct = () => rango || { d: periodo, h: periodo };
function mesesRango() { const { d, h } = rangoAct(); const out = []; for (let p = d; p <= h && out.length < 60; p = sumarMes(p, 1)) out.push(p); return out; }
const unMes = () => { const { d, h } = rangoAct(); return d === h; };
const mesCorto = (p) => { const [a, m] = p.split("-"); return `${MESES[+m - 1].slice(0, 3).toLowerCase()} ${a}`; };
function facturasRango(cid) {
  const meses = new Set(mesesRango());
  return facturas.filter((f) => f.clienteId === cid && meses.has(f.periodo)).sort((a, b) => a.periodo.localeCompare(b.periodo) || (a.fecha || "").localeCompare(b.fecha || ""));
}
function pintarRango() {
  const { d, h } = rangoAct();
  const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const usados = facturas.map((f) => f.periodo).filter(Boolean).sort();
  let ini = sumarMes(mesHoy, -24); if (usados[0] && usados[0] < ini) ini = usados[0];
  let fin = mesHoy; [periodo, h].forEach((p) => { if (p > fin) fin = p; });
  const opciones = []; for (let p = fin; p >= ini; p = sumarMes(p, -1)) opciones.push(p);
  const html = opciones.map((p) => `<option value="${p}">${MESES[+p.slice(5) - 1].slice(0, 3)} ${p.slice(0, 4)}</option>`).join("");
  $("#expDesde").innerHTML = html; $("#expHasta").innerHTML = html;
  $("#expDesde").value = d; $("#expHasta").value = h;
}
function setRango(d, h) {
  if (d > h) [d, h] = [h, d];
  rango = d === periodo && h === periodo ? null : { d, h };
  renderExportar();
}
$("#expDesde").onchange = () => setRango($("#expDesde").value, $("#expHasta").value);
$("#expHasta").onchange = () => setRango($("#expDesde").value, $("#expHasta").value);
$("#rangoRapido").onclick = (e) => {
  const b = e.target.closest("[data-r]"); if (!b) return;
  const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`, anio = hoy.getFullYear();
  const r = { actual: [periodo, periodo], anterior: [sumarMes(mesHoy, -1), sumarMes(mesHoy, -1)], tres: [sumarMes(mesHoy, -2), mesHoy],
    anio: [`${anio}-01`, mesHoy], pasado: [`${anio - 1}-01`, `${anio - 1}-12`] }[b.dataset.r];
  setRango(r[0], r[1]);
};

function renderExportar() {
  const { d, h } = rangoAct(), uno = unMes();
  pintarRango();
  $("#expTitulo").textContent = uno ? `606 de ${mesNombre(d)}` : `Del ${mesCorto(d)} al ${mesCorto(h)}`;
  // Excel por cliente (todos)
  const conFact = clientes.filter((c) => facturasRango(c.id).length);
  $("#expTodosTxt").textContent = clientes.length ? `Un archivo para cada cliente con sus facturas de ${mesNombre(periodo)}.` : "Todavía no tienes clientes.";
  $("#listaExcel").innerHTML = `<div class="tr-cab tr-exp" aria-hidden="true"><span>Cliente</span><span>Facturas</span><span>Compras</span><span>ITBIS</span><span></span></div>` + clientes.map((c) => {
    const fsR = facturasRango(c.id), revR = fsR.filter(necesitaRevision).length;
    const e = uno ? estadoCliente(c, d) : { fs: fsR, rev: revR, k: !fsR.length ? "vacio-e" : revR ? "revisar" : "listo" };
    const etiqueta = e.rev ? `${e.rev} por revisar` : uno ? ESTADO_CORTO[e.k] : e.fs.length ? (() => { const k = new Set(e.fs.map((f) => f.periodo)).size; return `Completo, ${k} ${k === 1 ? "mes" : "meses"}`; })() : "Sin facturas";
    const compras = e.fs.reduce((s, f) => s + n(f.servicios) + n(f.bienes), 0), itb = e.fs.reduce((s, f) => s + n(f.itbis), 0);
    return `<div class="tr-exp">
      <span class="td-nom"><span class="cl-av" style="${vars(c)}">${esc(iniciales(c.nombre))}</span><span class="x-txt"><b>${esc(c.nombre)}</b><small>${etiqueta}</small></span></span>
      <span class="td-info"><span><b>${e.fs.length}</b><small> fact.</small></span><span><small>Compras </small><b>${money(compras)}</b></span><span><small>ITBIS </small><b>${money(itb)}</b></span></span>
      <button class="btn excel chico" data-xlsx="${c.id}" ${e.fs.length ? "" : "disabled"} aria-label="Descargar Excel de ${esc(c.nombre)}">${IC.baja}Excel</button>
    </div>`;
  }).join("");
  $("#listaExcel").hidden = !clientes.length;
  $("#btnXlsxTodos").hidden = conFact.length < 2;
  $("#btnXlsxTodos").innerHTML = `${IC.baja}Descargar los ${conFact.length} Excel`;

  const cl = cliente();
  $("#expCliente").hidden = !cl;
  if (!cl) return;
  const fsC = facturasRango(cl.id);
  const e = { fs: fsC, rev: fsC.filter(necesitaRevision).length };
  $("#expClienteNombre").textContent = `Más opciones para ${cl.nombre}`;
  const items = [
    cl.rnc ? { ok: true, t: `${cl.nombre}, RNC ${cl.rnc}` } : { ok: false, t: "Falta el RNC del cliente", s: `<a href="#" data-accion="editar-cliente">Agregarlo</a>` },
    e.fs.length ? { ok: true, t: `${e.fs.length} factura${e.fs.length === 1 ? "" : "s"} en el período` } : { ok: false, t: "No hay facturas en este período" },
    e.rev ? { ok: false, t: `${e.rev} factura${e.rev === 1 ? "" : "s"} por revisar`, s: `<a href="#" data-accion="revisar-todo">Revisarlas ahora</a>` }
      : e.fs.length ? { ok: true, t: "Todas las facturas están completas" } : null,
  ].filter(Boolean);
  $("#checklist").innerHTML = items.map((i) => `<li class="${i.ok ? "ok" : "mal"}"><span class="ic">${i.ok ? "✓" : "!"}</span><span>${esc(i.t)}${i.s ? `<small>${i.s}</small>` : ""}</span></li>`).join("");
  pintarCasillas();
  $("#expCuenta").textContent = `${e.fs.length} factura${e.fs.length === 1 ? "" : "s"}`;
  // Con varios meses: la herramienta de la DGII es de un mes a la vez
  const meses = new Set(fsC.map((f) => f.periodo)).size;
  $("#notaRango").hidden = uno;
  $("#notaRango").textContent = `Elegiste varios meses: el Excel trae una hoja por mes (${meses} con facturas), cada una lista para su herramienta. Copiar, TXT y “Marcar como enviado” funcionan con un solo mes.`;
  ["#btnCopiarCab", "#btnCopiar", "#btnTxt", "#btnEnviado"].forEach((id) => ($(id).disabled = !uno));
  $("#btnXlsx").innerHTML = `${IC.baja}${uno ? "Descargar Excel" : "Descargar Excel (una hoja por mes)"}`;
  const env = cl.enviados?.[d];
  $("#estadoTxt").textContent = env ? `Enviado el ${new Date(env).toLocaleDateString("es-DO")}` : "Para llevar el control en el panel de clientes";
  $("#btnEnviadoTxt").textContent = env ? "Quitar marca de enviado" : "Marcar como enviado";
}

function renderAjustes() {
  aplicarTema();
  const cl = cliente();
  $("#btnEditarCliente").hidden = !cl;
  $("#ajCliente").textContent = cl ? `${cl.nombre} (${cl.rnc})` : "";
  $("#ajSuplidores").textContent = `${Object.keys(sup).length} suplidores con nombre guardado`;
}

// Delegación de clics
document.addEventListener("click", (e) => {
  const cli = e.target.closest("[data-cliente]");
  if (cli) { const d = destinoSelector || ($("#dlgClientes").open && CON_CLIENTE.includes(vista) ? vista : "capturar"); destinoSelector = null; return elegirCliente(cli.dataset.cliente, d); }
  const pend = e.target.closest("[data-pend]");
  if (pend) {
    const id = pend.dataset.pend;
    if (pend.dataset.tipo === "revisar") { elegirCliente(id); iniciarRevision(facturasDe(id).filter(necesitaRevision).map((f) => f.id)); }
    else elegirCliente(id, "exportar");
    return;
  }
  const fila = e.target.closest(".fila[data-id]");
  if (fila) return abrirFactura(fila.dataset.id);
  const acc = e.target.closest("[data-accion]")?.dataset.accion;
  if (!acc) return;
  e.preventDefault();
  if (acc === "nuevo-cliente") abrirCliente(null);
  if (acc === "escanear") { if (cliente()) location.hash = "capturar"; else { destinoSelector = "capturar"; $("#clienteBtn").click(); } }
  if (acc === "ir-revisar") {
    const r = clientes.filter((c) => estadoCliente(c).k === "revisar");
    if (r.length === 1) { elegirCliente(r[0].id); iniciarRevision(facturasDe(r[0].id).filter(necesitaRevision).map((f) => f.id)); }
    else if (r.length) document.getElementById("pendientes").scrollIntoView({ behavior: "smooth", block: "center" });
    else toast("No hay facturas por revisar");
  }
  if (acc === "ir-exportar") {
    const l = clientes.filter((c) => estadoCliente(c).k === "listo");
    if (l.length === 1) elegirCliente(l[0].id, "exportar");
    else if (l.length) document.getElementById("pendientes").scrollIntoView({ behavior: "smooth", block: "center" });
    else toast("Ningún cliente está listo para exportar");
  }
  if (acc === "editar-cliente") abrirCliente(clienteId);
  if (acc === "revisar-todo") iniciarRevision(facturasDe(clienteId).filter(necesitaRevision).map((f) => f.id));
});
$("#chips").onclick = (e) => { const c = e.target.closest(".chip"); if (c) { filtro = c.dataset.f; renderFacturas(); } };
$("#buscar").oninput = (e) => { busqueda = e.target.value; renderFacturas(); };
$("#buscarCliente").oninput = (e) => { busquedaCli = e.target.value; renderClientes(); };

// =====================================================================
//  Clientes: selector, crear, editar
// =====================================================================
function pintarSelector() {
  const q = $("#buscarSel").value.toLowerCase();
  $("#selClientes").innerHTML = clientes.filter((c) => !q || `${c.nombre} ${c.rnc}`.toLowerCase().includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => cliHTML(c, estadoCliente(c), c.id === clienteId)).join("")
    || `<p class="nota">No hay clientes que coincidan.</p>`;
}
$("#dlgClientes").addEventListener("close", () => setTimeout(() => (destinoSelector = null), 0));
$("#clienteBtn").onclick = () => { $("#buscarSel").value = ""; pintarSelector(); $("#dlgClientes").showModal(); };
$("#buscarSel").oninput = pintarSelector;
$("#verTodos").onclick = () => $("#dlgClientes").close();
$("#dlgClientes").addEventListener("click", (e) => { if (e.target === $("#dlgClientes")) $("#dlgClientes").close(); });

const frmC = $("#frmCliente");
llenarSelect(frmC.tipo, TIPOS_BS); llenarSelect(frmC.pago, FORMAS_PAGO);
let editCliente = null, destinoSelector = null;
$("#swatches").innerHTML = COLORES.map((k, i) => `<label><input type="radio" name="color" value="${i}" aria-label="Color ${i + 1}"><span style="--c:${k.c}"></span></label>`).join("");
function abrirCliente(id) {
  editCliente = id ? clientes.find((c) => c.id === id) : null;
  const c = editCliente || nuevoCliente();
  $$("#swatches input").forEach((r) => (r.checked = +r.value === (c.color ?? 0) % COLORES.length));
  ["nombre", "rnc", "tipo", "pago", "destino"].forEach((k) => (frmC[k].value = c[k] || ""));
  $("#tituloCliente").textContent = editCliente ? "Editar cliente" : "Nuevo cliente";
  $("#btnBorrarCliente").hidden = !editCliente;
  $("[data-ce=rnc]").textContent = "";
  $("#dlgCliente").showModal();
  setTimeout(() => frmC.nombre.focus(), 50);
}
$("#btnNuevoCliente").onclick = () => abrirCliente(null);
$("#btnCancelarCliente").onclick = () => $("#dlgCliente").close();
frmC.onsubmit = (e) => {
  e.preventDefault();
  const rnc = soloDigitos(frmC.rnc.value);
  if (!(rnc.length === 9 || rnc.length === 11)) { $("[data-ce=rnc]").textContent = "El RNC lleva 9 dígitos y la cédula 11."; return; }
  if (clientes.some((c) => c.rnc === rnc && c !== editCliente)) { $("[data-ce=rnc]").textContent = "Ya tienes un cliente con ese RNC."; return; }
  const datos = { nombre: frmC.nombre.value.trim(), rnc, tipo: frmC.tipo.value, pago: frmC.pago.value, destino: frmC.destino.value, color: +(($("#swatches input:checked") || {}).value || 0) };
  if (editCliente) Object.assign(editCliente, datos);
  else { const c = nuevoCliente(datos); clientes.push(c); clienteId = c.id; }
  guardarTodo(); $("#dlgCliente").close();
  toast(editCliente ? "Cliente actualizado" : "Cliente agregado");
  if (!editCliente) elegirCliente(clienteId); else render();
};
$("#btnBorrarCliente").onclick = async () => {
  const c = editCliente; if (!c) return;
  const nf = facturas.filter((f) => f.clienteId === c.id).length;
  if (!(await confirmar(`¿Borrar a ${c.nombre}${nf ? ` y sus ${nf} facturas` : ""}? Esto no se puede deshacer.`, "Borrar cliente", true))) return;
  clientes = clientes.filter((x) => x !== c);
  facturas = facturas.filter((f) => f.clienteId !== c.id);
  if (clienteId === c.id) clienteId = null;
  guardarTodo(); $("#dlgCliente").close(); location.hash = "inicio"; irA();
  toast("Cliente borrado");
};

// =====================================================================
//  Captura: lectura de archivos (QR → texto → manual)
// =====================================================================
function nuevaFactura(extra = {}) {
  const cl = cliente();
  return Object.assign({
    id: uid(), clienteId, periodo, creada: Date.now(), origen: "Manual", suplidor: "", rnc: "", tipoId: "1",
    tipoBS: cl?.tipo || "02", ncf: "", ncfMod: "", fecha: "", fechaPago: "", total: 0,
    servicios: 0, bienes: 0, itbis: 0, itbisRet: 0, itbisProp: 0, itbisCosto: 0, itbisPerc: 0,
    tipoRetIsr: "", retIsr: 0, isrPerc: 0, isc: 0, otros: 0, propina: 0, formaPago: cl?.pago || "01", notas: "", qrUrl: "",
  }, extra);
}

function desdeLectura(d, archivo) {
  const cl = cliente();
  const rnc = soloDigitos(d.rnc);
  const f = aplicarMemoria(nuevaFactura({
    origen: d.origen, suplidor: d.suplidor || "", rnc, tipoId: rnc.length === 11 ? "2" : "1",
    ncf: d.ncf || "", ncfMod: d.ncfMod || "", fecha: d.fecha || "", total: n(d.total),
    itbis: n(d.itbis), propina: n(d.propina), itbisRet: n(d.itbisRet), qrUrl: d.qrUrl || "",
  }), cl);
  const destino = f._destino || cl.destino;
  if (d.origen === "QR" && f.total) Object.assign(f, desglose(f.total, f._calc || "18", destino));
  else if (d.subtotal) f[destino] = n(d.subtotal);
  f._comprador = d.rncComprador || "";
  if (archivo) f.notas = `Archivo: ${archivo}`;
  return f;
}
const limpiar = (f) => { const c = { ...f }; delete c._destino; delete c._calc; delete c._comprador; delete c._texto; return c; };

function itemCola(texto) {
  const item = document.createElement("div");
  item.className = "item";
  item.innerHTML = `<span></span><div class="barra"><i></i></div>`;
  item.querySelector("span").textContent = texto;
  $("#cola").appendChild(item);
  return {
    texto: (t) => (item.querySelector("span").textContent = t),
    progreso: (p) => (item.querySelector("i").style.width = Math.round(p * 100) + "%"),
    quitar: () => item.remove(),
  };
}

async function leerArchivo(file, it) {
  let canvas, textoPDF = "";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) ({ canvas, texto: textoPDF } = await pdfACanvasYTexto(file));
  else canvas = await imagenACanvas(file);
  const qr = await buscarQR(canvas);
  const dq = qr && interpretarQR(qr);
  if (dq) return desdeLectura(dq, file.name);
  let texto = textoPDF;
  if (texto.replace(/\s/g, "").length < 40) { it.texto(`Leyendo el texto de ${file.name}…`); texto = await ocr(canvas, it.progreso); }
  const d = extraerDeTexto(texto, cliente()?.rnc);
  if (![d.rnc, d.ncf, d.fecha, d.total || d.subtotal].some(Boolean)) throw new Error("sin datos");
  const f = desdeLectura(d, file.name); f._texto = texto;
  return f;
}

async function procesarLote(files) {
  const ids = [], res = { QR: 0, OCR: 0, Manual: 0 };
  const it = itemCola(`Leyendo 0 de ${files.length}…`);
  for (let i = 0; i < files.length; i++) {
    it.texto(`Leyendo ${i + 1} de ${files.length}: ${files[i].name}`); it.progreso(i / files.length);
    let f;
    try { f = await leerArchivo(files[i], it); }
    catch { f = nuevaFactura({ notas: `No se pudo leer: ${files[i].name}` }); }
    res[f.origen]++;
    const textos = f._texto;
    const limpio = limpiar(f); if (textos) textosLeidos[limpio.id] = textos;
    facturas.push(limpio); ids.push(limpio.id);
    guardarTodo(); render();
  }
  it.quitar();
  const partes = [res.QR && `${res.QR} por QR`, res.OCR && `${res.OCR} por texto`, res.Manual && `${res.Manual} sin leer`].filter(Boolean).join(", ");
  toast(`${files.length} factura${files.length === 1 ? "" : "s"}: ${partes}`, { texto: "Revisar", fn: () => iniciarRevision(ids) });
  if (files.length === 1) iniciarRevision(ids);
}
const textosLeidos = {}; // texto del OCR por factura, solo durante la sesión

$("#fileLote").onchange = (e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) procesarLote(fs); };
$("#mManual").onclick = () => abrirFactura(null);

// =====================================================================
//  Ráfaga QR
// =====================================================================
const rp = $("#rapido");
llenarSelect(rp.tipoBS, TIPOS_BS); llenarSelect(rp.formaPago, FORMAS_PAGO);
let rafaga = false, escaneando = false, rfCuenta = 0, rfF = null, rfCalc = "18", rfDestinoCliente = null;

$("#mRafaga").onclick = () => {
  rafaga = true; rfCuenta = 0; $("#rfContador").textContent = "0 guardadas";
  $("#dlgQR").showModal(); escanear();
};
async function escanear() {
  rp.hidden = true; escaneando = true;
  $("#estadoQR").textContent = "Pon el código QR dentro del cuadro";
  try { await escanerEnVivo($("#video"), alLeerQR, () => rafaga && escaneando); }
  catch { $("#estadoQR").textContent = "No se pudo abrir la cámara. Permite el acceso, o usa “Sin QR” para tomar una foto."; }
}
function alLeerQR(valor) {
  escaneando = false;
  if (navigator.vibrate) navigator.vibrate(50);
  const d = interpretarQR(valor);
  if (!d) { $("#estadoQR").textContent = "Ese QR no es de una factura electrónica"; setTimeout(() => rafaga && escanear(), 1400); return; }
  rfF = desdeLectura(d); rfDestinoCliente = null;
  rfCalc = rfF._calc || "18";
  pintarRapido();
}
function pintarRapido() {
  const f = rfF;
  rp.suplidor.value = f.suplidor; rp.tipoBS.value = f.tipoBS; rp.formaPago.value = f.formaPago;
  $("#rpMeta").textContent = `RNC ${f.rnc}   ${f.ncf}   ${fechaCorta(f.fecha)}`;
  recalcularRapido();
  // Avisos: duplicada / es de otro cliente
  const cl = cliente(); const al = $("#rpAlerta"); al.hidden = true; al.innerHTML = "";
  const dup = facturas.some((x) => x.clienteId === cl.id && soloDigitos(x.rnc) === f.rnc && x.ncf === f.ncf);
  if (dup) { al.hidden = false; al.innerHTML = `<b>Ya está registrada</b> en ${esc(cl.nombre)}.`; }
  else if (f._comprador && cl.rnc && f._comprador !== cl.rnc) {
    const otro = clientes.find((c) => c.rnc === f._comprador);
    al.hidden = false;
    al.innerHTML = otro ? `Esta factura es de <b>${esc(otro.nombre)}</b> (RNC ${otro.rnc}), no de ${esc(cl.nombre)}.<br><button type="button" class="btn chico" id="rpMover">Guardarla en ${esc(otro.nombre)}</button>`
      : `Esta factura está a nombre del RNC ${esc(f._comprador)}, no de ${esc(cl.nombre)}.`;
    if (otro) $("#rpMover").onclick = () => { rfDestinoCliente = otro; al.innerHTML = `Se guardará en <b>${esc(otro.nombre)}</b>.`; };
  }
  $("#rpGuardar").textContent = dup ? "Guardar de todos modos" : "Guardar y seguir";
  rp.hidden = false;
}
function recalcularRapido() {
  const destino = rfF._destino || cliente().destino;
  Object.assign(rfF, desglose(rfF.total, rfCalc, destino));
  $("#rpTotal").textContent = money(rfF.total);
  $("#rpItbis").textContent = money(rfF.itbis);
  $("#rpBaseLbl").textContent = destino === "bienes" ? "Bienes" : "Servicios";
  $("#rpBase").textContent = money(rfF.bienes + rfF.servicios);
  $$("#rpCalculo button").forEach((b) => b.classList.toggle("on", b.dataset.c === rfCalc));
}
$("#rpCalculo").onclick = (e) => { const b = e.target.closest("button"); if (b) { rfCalc = b.dataset.c; recalcularRapido(); } };
function leerRapido() {
  rfF.suplidor = rp.suplidor.value.trim(); rfF.tipoBS = rp.tipoBS.value; rfF.formaPago = rp.formaPago.value;
  if (rfDestinoCliente) rfF.clienteId = rfDestinoCliente.id;
  return rfF;
}
rp.onsubmit = (e) => {
  e.preventDefault();
  const f = leerRapido();
  const cl = clientes.find((c) => c.id === f.clienteId);
  recordar(f, cl); facturas.push(limpiar(f)); guardarTodo();
  rfCuenta++; $("#rfContador").textContent = `${rfCuenta} guardada${rfCuenta === 1 ? "" : "s"}`;
  escanear();
};
$("#rpSaltar").onclick = () => escanear();
$("#rpCompleta").onclick = () => { const f = leerRapido(); terminarRafaga(); abrirFactura(null, f); };
function terminarRafaga() { rafaga = false; escaneando = false; if ($("#dlgQR").open) $("#dlgQR").close(); render(); }
$("#btnTerminar").onclick = () => { terminarRafaga(); if (rfCuenta) toast(`${rfCuenta} factura${rfCuenta === 1 ? "" : "s"} guardada${rfCuenta === 1 ? "" : "s"} por QR`); };
$("#dlgQR").addEventListener("close", () => { rafaga = false; escaneando = false; });
$("#fileFoto").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; terminarRafaga(); if (f) procesarLote([f]); };

// =====================================================================
//  Formulario completo y cola de revisión
// =====================================================================
const frm = $("#frmFactura");
llenarSelect(frm.tipoBS, TIPOS_BS); llenarSelect(frm.tipoRetIsr, TIPOS_RET_ISR);
$("#pagos").innerHTML = Object.entries(FORMAS_PAGO).map(([k, v]) => `<button type="button" data-p="${k}">${esc(v.split(" / ")[0])}</button>`).join("");
$("#pagos").onclick = (e) => { const b = e.target.closest("button"); if (b) { frm.formaPago.value = b.dataset.p; pintarPago(); } };
const pintarPago = () => $$("#pagos button").forEach((b) => b.classList.toggle("on", b.dataset.p === frm.formaPago.value));

let editando = null, base = null, revCola = [], revIdx = -1;
const tocados = new Set();

function iniciarRevision(ids) {
  revCola = ids.filter((id) => facturas.some((f) => f.id === id));
  if (!revCola.length) return toast("No hay facturas para revisar");
  revIdx = 0; abrirFactura(revCola[0]);
}
const enRevision = () => revIdx >= 0 && revIdx < revCola.length;

function abrirFactura(id, datos) {
  editando = id ? facturas.find((f) => f.id === id) : null;
  if (id && !editando) return;
  base = editando || (datos && datos.id ? datos : nuevaFactura(datos || {}));
  tocados.clear();
  for (const el of frm.elements) {
    if (!el.name) continue;
    const v = base[el.name];
    el.value = el.type === "number" ? (n(v) ? v : "") : (v ?? "");
  }
  pintarPago();
  $$("#segCalc button").forEach((b) => b.classList.remove("on"));
  $("#dlSuplidores").innerHTML = Object.values(sup).map((s) => `<option value="${esc(s)}">`).join("");
  $("#lnkDGII").hidden = !base.qrUrl; if (base.qrUrl) $("#lnkDGII").href = base.qrUrl;
  const texto = base._texto || textosLeidos[base.id];
  $("#detTexto").hidden = !texto; $("#txtLeido").textContent = texto || "";
  const clF = clientes.find((c) => c.id === base.clienteId) || cliente();
  $("#dlgFactura").style.cssText = vars(clF);
  $("#formTab").textContent = clF ? clF.nombre : "";
  $("#origenFactura").className = "origen " + base.origen;
  $("#origenFactura").textContent = { QR: "Leída del QR · ITBIS calculado del total", OCR: "Leída por OCR · revisa cada dato", Manual: editando ? "Escrita a mano" : "Nueva, a mano" }[base.origen];
  pintarTituloForm();
  $("#btnBorrar").style.visibility = editando ? "visible" : "hidden";
  $("#detAvanzado").open = [base.itbisRet, base.retIsr, base.itbisCosto, base.itbisProp, base.isc, base.otros].some((x) => n(x));

  const rev = enRevision();
  $("#colaRev").innerHTML = !rev ? "" : revCola.length <= 10
    ? `<span class="segs" aria-hidden="true">${revCola.map((_, i) => `<i class="${i <= revIdx ? "on" : ""}"></i>`).join("")}</span><span>${revIdx + 1}/${revCola.length}</span>`
    : `<span>Revisando ${revIdx + 1} de ${revCola.length}</span>`;
  $("#btnGuardar").textContent = rev ? (revIdx === revCola.length - 1 ? "Guardar y terminar" : "Guardar y siguiente") : "Guardar";
  $("#btnGuardarOtra").textContent = rev ? "Saltar" : "Guardar y otra";
  $("#btnGuardarOtra").hidden = !rev && !!editando;

  actualizarAvisos();
  if (!$("#dlgFactura").open) $("#dlgFactura").showModal();
  $(".form-cuerpo").scrollTop = 0;
  if (!editando && !base.rnc) setTimeout(() => frm.rnc.focus(), 80);
}

function leerForm() {
  const f = Object.assign({}, base);
  for (const el of frm.elements) { if (el.name) f[el.name] = el.type === "number" ? n(el.value) : el.value.trim(); }
  f.rnc = soloDigitos(f.rnc); f.ncf = f.ncf.toUpperCase(); f.ncfMod = f.ncfMod.toUpperCase();
  return f;
}

function pintarTituloForm() {
  $("#tituloFactura").textContent = frm.suplidor.value.trim() || (editando ? "Factura" : "Nueva factura");
  const rnc = soloDigitos(frm.rnc.value);
  $("#metaFactura").textContent = [rnc && "RNC " + rnc, frm.fecha.value && fechaCorta(frm.fecha.value)].filter(Boolean).join("  ·  ");
}

// Sugiere un NCF corregido: confusiones del OCR (O→0, I→1…) y ceros que faltan en la secuencia
function sugerirNCF(v) {
  let s = String(v || "").toUpperCase().replace(/[\s-]/g, "");
  if (!s || RE_NCF.test(s) || RE_ECF.test(s)) return "";
  if (s[0] === "8") s = "B" + s.slice(1);
  s = s[0] + s.slice(1).replace(/[OQD]/g, "0").replace(/[IL|]/g, "1").replace(/S/g, "5").replace(/Z/g, "2").replace(/B/g, "8");
  const m = s.match(/^([BE])(\d{2})(\d+)$/);
  if (!m) return "";
  const largo = m[1] === "B" ? 8 : 10;
  let sec = m[3];
  if (sec.length < largo) sec = sec.padStart(largo, "0");
  else if (sec.length > largo && /^0+/.test(sec)) sec = sec.slice(sec.length - largo);
  const r = m[1] + m[2] + sec;
  return RE_NCF.test(r) || RE_ECF.test(r) ? r : "";
}

function actualizarAvisos(todo = false) {
  const f = leerForm(), avisos = validar(f);
  $$("small.err[data-e]", frm).forEach((s) => {
    const a = avisos.find((x) => x.campo === s.dataset.e);
    const ver = a && (todo || tocados.has(s.dataset.e) || editando);
    s.textContent = ver ? a.msg : "";
    s.closest(".campo")?.classList.toggle("invalido", !!ver);
  });
  const sug = avisos.some((a) => a.campo === "ncf") ? sugerirNCF(frm.ncf.value) : "";
  $("#sugNcf").hidden = !sug;
  if (sug) $("#sugNcf").innerHTML = `¿Quisiste decir? <button type="button" data-ncf="${sug}">${sug}</button>`;
  pintarTituloForm();
  $("#avisosGen").innerHTML = avisos.filter((a) => a.campo === "general").map((a) => `<div>${esc(a.msg)}</div>`).join("");
  const cu = $("#cuadre");
  if (!n(f.total)) { cu.className = "cuadre"; cu.textContent = ""; }
  else {
    const dif = r2(n(f.total) - totalFactura(f));
    if (Math.abs(dif) <= 1) { cu.className = "cuadre ok"; cu.textContent = "✓ Los montos cuadran con el total de la factura"; }
    else { cu.className = "cuadre mal"; cu.textContent = `Diferencia de ${money(Math.abs(dif))} con el total: ${dif > 0 ? "falta" : "sobra"} un monto.`; }
  }
  $("#pieAdelantar").textContent = money(itbisPorAdelantar(f));
  $("#campoNcfMod").hidden = !(/^(B03|B04|E33|E34)/.test(f.ncf) || f.ncfMod);
  return avisos;
}

frm.addEventListener("input", (e) => {
  const nm = e.target.name;
  if (nm === "rnc") {
    const d = soloDigitos(e.target.value);
    if (d.length === 11) frm.tipoId.value = "2"; else if (d.length === 9) frm.tipoId.value = "1";
    if ((d.length === 9 || d.length === 11) && !frm.suplidor.value) {
      const m = aplicarMemoria({ rnc: d, suplidor: "", tipoBS: frm.tipoBS.value, formaPago: frm.formaPago.value });
      if (m.suplidor) { frm.suplidor.value = m.suplidor; frm.tipoBS.value = m.tipoBS; frm.formaPago.value = m.formaPago; pintarPago(); }
    }
  }
  if (nm === "suplidor" && !frm.rnc.value) {
    const rnc = Object.keys(sup).find((k) => sup[k] === e.target.value);
    if (rnc) { frm.rnc.value = rnc; frm.tipoId.value = rnc.length === 11 ? "2" : "1"; }
  }
  actualizarAvisos();
});
frm.addEventListener("focusout", (e) => {
  const nm = e.target.name; if (!nm) return;
  tocados.add(["bienes", "servicios"].includes(nm) ? "montos" : nm);
  actualizarAvisos();
});
$("#sugNcf").onclick = (e) => {
  const b = e.target.closest("button[data-ncf]"); if (!b) return;
  e.preventDefault(); frm.ncf.value = b.dataset.ncf; tocados.add("ncf"); actualizarAvisos();
};
$("#segCalc").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (!n(frm.total.value)) { toast("Escribe primero el total de la factura"); frm.total.focus(); return; }
  const destino = n(frm.servicios.value) && !n(frm.bienes.value) ? "servicios" : n(frm.bienes.value) && !n(frm.servicios.value) ? "bienes" : (base._destino || cliente()?.destino || "bienes");
  const d = desglose(frm.total.value, b.dataset.c, destino, n(frm.isc.value) + n(frm.otros.value));
  ["bienes", "servicios", "itbis", "propina"].forEach((k) => (frm[k].value = d[k] ? d[k].toFixed(2) : ""));
  $$("#segCalc button").forEach((x) => x.classList.toggle("on", x === b));
  actualizarAvisos();
};

async function guardarForm(siguiente) {
  const f = leerForm();
  const av = actualizarAvisos(true);
  if (av.length && !(await confirmar(`Tiene ${av.length} dato${av.length === 1 ? "" : "s"} por revisar. ¿Guardarla así?`, "Guardar así"))) return;
  const cl = clientes.find((c) => c.id === f.clienteId);
  recordar(f, cl);
  const limpio = limpiar(f);
  const i = facturas.findIndex((x) => x.id === f.id);
  if (i >= 0) facturas[i] = limpio; else facturas.push(limpio);
  guardarTodo(); render();
  if (enRevision()) return avanzarRevision();
  if (siguiente) { toast("Guardada"); abrirFactura(null, { fecha: f.fecha, formaPago: f.formaPago }); return; }
  cerrarForm(); toast(editando ? "Factura actualizada" : "Factura guardada");
}
function avanzarRevision() {
  revIdx++;
  if (revIdx < revCola.length) abrirFactura(revCola[revIdx]);
  else { const t = revCola.length; revCola = []; revIdx = -1; cerrarForm(); toast(`Revisión terminada: ${t} factura${t === 1 ? "" : "s"}`); }
}
frm.addEventListener("submit", (e) => { e.preventDefault(); guardarForm(false); });
$("#btnGuardarOtra").onclick = () => (enRevision() ? avanzarRevision() : guardarForm(true));
frm.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); guardarForm(!editando && !enRevision()); } });

function cerrarForm() { revCola = []; revIdx = -1; if ($("#dlgFactura").open) $("#dlgFactura").close(); render(); }
$("#btnCerrarForm").onclick = async () => {
  if (!editando && (frm.rnc.value || frm.ncf.value) && !(await confirmar("¿Descartar esta factura sin guardarla?", "Descartar", true))) return;
  cerrarForm();
};
$("#dlgFactura").addEventListener("cancel", (e) => { e.preventDefault(); $("#btnCerrarForm").click(); });
$("#btnBorrar").onclick = () => {
  if (!editando) return;
  const b = editando, idx = facturas.indexOf(b);
  facturas.splice(idx, 1); guardarTodo();
  if (enRevision()) { revCola.splice(revIdx, 1); revIdx--; avanzarRevision(); } else cerrarForm();
  toast("Factura borrada", { texto: "Deshacer", fn: () => { facturas.splice(idx, 0, b); guardarTodo(); render(); } });
};

// =====================================================================
//  Exportar
// =====================================================================
const yyyymmdd = (d) => (d || "").replace(/-/g, "");
// Columnas B a Z de la herramienta 606 de la DGII. "cas" es el número de casilla (fila 10 de la herramienta).
const CASILLAS_DEF = [1, 2, 3, 4, 6, 8, 9, 11, 13, 23];
const CASILLAS_CALC = [10, 15]; // las calcula la herramienta al pulsar Validar
const dd = (iso) => { const d = yyyymmdd(iso).slice(6, 8); return d ? +d : ""; };
const COLS_DGII = [
  { col: "B", cas: 1, h: "RNC o Cédula", v: (f) => soloDigitos(f.rnc) },
  { col: "C", cas: 2, h: "Tipo Id", v: (f) => +f.tipoId || 1 },
  { col: "D", cas: 3, h: "Tipo Bienes y Servicios Comprados", v: (f) => DGII_TIPOS[f.tipoBS] || f.tipoBS },
  { col: "E", cas: 4, h: "NCF", v: (f) => f.ncf },
  { col: "F", cas: 5, h: "NCF ó Documento Modificado", v: (f) => f.ncfMod || "" },
  { col: "G", cas: 6, h: "Fecha Comprobante", h2: "Fecha Comprobante (AAAAMM)", v: (f) => yyyymmdd(f.fecha).slice(0, 6) },
  { col: "H", cas: 6, h: "", h2: "Fecha Comprobante (DD)", v: (f) => dd(f.fecha) },
  { col: "I", cas: 7, h: "Fecha Pago", h2: "Fecha Pago (AAAAMM)", v: (f) => yyyymmdd(f.fechaPago).slice(0, 6) },
  { col: "J", cas: 7, h: "", h2: "Fecha Pago (DD)", v: (f) => dd(f.fechaPago) },
  { col: "K", cas: 8, h: "Monto Facturado en Servicios", num: true, cero: true, v: (f) => n(f.servicios) },
  { col: "L", cas: 9, h: "Monto Facturado en Bienes", num: true, cero: true, v: (f) => n(f.bienes) },
  { col: "M", cas: 10, h: "Total Monto Facturado", num: true, cero: true, v: (f) => n(f.servicios) + n(f.bienes) },
  { col: "N", cas: 11, h: "ITBIS Facturado", num: true, cero: true, v: (f) => n(f.itbis) },
  { col: "O", cas: 12, h: "ITBIS Retenido", num: true, v: (f) => n(f.itbisRet) },
  { col: "P", cas: 13, h: "ITBIS sujeto a Proporcionalidad (Art. 349)", num: true, v: (f) => n(f.itbisProp) },
  { col: "Q", cas: 14, h: "ITBIS llevado al Costo", num: true, v: (f) => n(f.itbisCosto) },
  { col: "R", cas: 15, h: "ITBIS por Adelantar", num: true, cero: true, v: (f) => itbisPorAdelantar(f) },
  { col: "S", cas: 16, h: "ITBIS percibido en compras", num: true, v: (f) => n(f.itbisPerc) },
  { col: "T", cas: 17, h: "Tipo de Retención en ISR", v: (f) => (n(f.retIsr) ? DGII_RET[f.tipoRetIsr] || f.tipoRetIsr || "" : "") },
  { col: "U", cas: 18, h: "Monto Retención Renta", num: true, v: (f) => n(f.retIsr) },
  { col: "V", cas: 19, h: "ISR Percibido en compras", num: true, v: (f) => n(f.isrPerc) },
  { col: "W", cas: 20, h: "Impuesto Selectivo al Consumo", num: true, v: (f) => n(f.isc) },
  { col: "X", cas: 21, h: "Otros Impuesto/Tasas", num: true, v: (f) => n(f.otros) },
  { col: "Y", cas: 22, h: "Monto Propina Legal", num: true, v: (f) => n(f.propina) },
  { col: "Z", cas: 23, h: "Forma de Pago", v: (f) => DGII_PAGOS[f.formaPago] || f.formaPago },
];
const casillasActivas = () => new Set(cfg.casillas || CASILLAS_DEF);
function valorDGII(c, f, act) {
  if (act && !act.has(c.cas)) return "";
  const v = c.v(f);
  if (c.num) return v || c.cero ? n(v) : "";
  return v ?? "";
}
const textoCelda = (v, c) => (typeof v === "number" ? (c.num ? v.toFixed(2) : String(v)) : String(v));

function pintarCasillas() {
  const act = casillasActivas();
  const vistas = new Set();
  $("#casillas").innerHTML = COLS_DGII.filter((c) => !vistas.has(c.cas) && vistas.add(c.cas)).map((c) => {
    const calc = CASILLAS_CALC.includes(c.cas);
    return `<label class="casilla${calc ? " calc" : ""}"><input type="checkbox" value="${c.cas}" ${act.has(c.cas) && !calc ? "checked" : ""} ${calc ? "disabled" : ""}>
      <b>${c.cas}</b><span>${esc(c.h)}${calc ? " (la calcula la herramienta)" : ""}</span></label>`;
  }).join("");
}
$("#casillas").onchange = () => {
  cfg.casillas = $$("#casillas input:checked").map((i) => +i.value).sort((a, b) => a - b);
  guardarTodo();
};
$("#btnCasillasDef").onclick = () => { cfg.casillas = null; guardarTodo(); pintarCasillas(); toast("Casillas restablecidas"); };

const ordenadas = (cid = clienteId) => facturasDe(cid).sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

async function listoParaExportar(lista) {
  if (!lista.length) { toast("No hay facturas en este período"); return false; }
  const c = lista.filter(necesitaRevision).length;
  return !c || confirmar(`${c} factura${c === 1 ? " tiene" : "s tienen"} datos por revisar. ¿Exportar de todos modos?`, "Exportar");
}
function nombreArchivo(ext, cl = cliente()) {
  const { d, h } = rangoAct(), id = cl.rnc || cl.nombre.replace(/\W+/g, "_");
  return `606_${id}_${d.replace("-", "")}${d === h ? "" : "-" + h.replace("-", "")}.${ext}`;
}

function descargar(nombre, contenido, tipo) {
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo }));
    a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Descargado: ${nombre}`);
  } catch { toast("Este navegador no permitió la descarga. Usa “Copiar filas”."); }
}

// Excel con la misma distribución de la herramienta: encabezado en C4:C5 y detalle desde B12
function hojaDGII(cl, per, lista, nombre) {
  const act = casillasActivas();
  const filas = [
    [`Factura 606: ${cl.nombre}`], ["", "", "", "", "Formato de Envío de Compras de Bienes y Servicios"], [],
    ["RNC o Cédula", "", cl.rnc], ["Periodo", "", per.replace("-", "")], ["Cantidad Registros", "", ""],
    [], [], ["", "Detalle"],
    ["", ...COLS_DGII.map((c, i) => (i && COLS_DGII[i - 1].cas === c.cas ? "" : c.cas))],
    ["Líneas", ...COLS_DGII.map((c) => c.h)],
    ...lista.map((f, i) => [i + 1, ...COLS_DGII.map((c) => valorDGII(c, f, act))]),
  ];
  const tipos = ["s", ...COLS_DGII.map((c) => (c.num ? "n" : "s"))];
  const anchos = [12, 13, 8, 34, 16, 16, 11, 5, 11, 5, ...COLS_DGII.slice(9).map((c) => (c.num ? 14 : 30))];
  return { nombre, filas, tipos, anchos, negritas: [0, 3, 4, 5, 9, 10], congelar: 11 };
}
// Un libro por cliente: una hoja en formato de la herramienta por cada mes con facturas, y una de detalle
function excelDe(cl, lista) {
  const porMes = {};
  lista.forEach((f) => (porMes[f.periodo] ||= []).push(f));
  const meses = Object.keys(porMes).sort();
  const hojas = meses.map((p) => hojaDGII(cl, p, porMes[p], meses.length === 1 ? "Pegar en DGII" : `606 ${MESES[+p.slice(5) - 1].slice(0, 3)} ${p.slice(0, 4)}`));
  const tipos = ["s", "s", ...COLS_DGII.map((c) => (c.num ? "n" : "s"))];
  const det = [["Período", "Suplidor", ...COLS_DGII.map((c) => c.h2 || c.h)], ...lista.map((f) => [f.periodo.replace("-", ""), f.suplidor || "", ...COLS_DGII.map((c) => valorDGII(c, f, null))])];
  hojas.push({ nombre: "Detalle con suplidor", filas: det, tipos, anchos: [10, 30, ...hojas[0].anchos.slice(1)] });
  return XLSX_MIN.crear(hojas);
}
async function descargarExcel(cl, preguntar = true) {
  const lista = facturasRango(cl.id);
  if (preguntar && !(await listoParaExportar(lista))) return false;
  if (!lista.length) return false;
  descargar(nombreArchivo("xlsx", cl), excelDe(cl, lista));
  return true;
}
$("#btnXlsx").onclick = () => descargarExcel(cliente());
$("#listaExcel").onclick = (e) => {
  const b = e.target.closest("[data-xlsx]"); if (!b) return;
  const cl = clientes.find((c) => c.id === b.dataset.xlsx); if (cl) descargarExcel(cl);
};
$("#btnXlsxTodos").onclick = async () => {
  const lista = clientes.filter((c) => facturasRango(c.id).length);
  const rev = lista.filter((c) => facturasRango(c.id).some(necesitaRevision)).length;
  if (rev && !(await confirmar(`${rev} cliente${rev === 1 ? " tiene" : "s tienen"} facturas por revisar. ¿Descargar todos de todos modos?`, "Descargar"))) return;
  for (const cl of lista) { await descargarExcel(cl, false); await new Promise((r) => setTimeout(r, 450)); }
  toast(`${lista.length} archivos de Excel descargados`);
};

async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); toast(msg); }
  catch { toast("No se pudo copiar en este navegador"); }
}
$("#btnCopiarCab").onclick = () => {
  const cl = cliente();
  if (!cl.rnc) { toast("Falta el RNC del cliente"); return abrirCliente(cl.id); }
  copiar(`${cl.rnc}\n${rangoAct().d.replace("-", "")}`, "Encabezado copiado. Pégalo en la celda C4 de la herramienta.");
};
$("#btnCopiar").onclick = () => {
  const lista = facturasRango(clienteId);
  if (!lista.length) return toast("No hay facturas en este período");
  const act = casillasActivas();
  const tsv = lista.map((f) => COLS_DGII.map((c) => textoCelda(valorDGII(c, f, act), c)).join("\t")).join("\n");
  copiar(tsv, `${lista.length} filas copiadas. Pégalas en la celda B12 con Pegado especial → Valores.`);
};

function fila606TXT(f) {
  const num = (v) => (n(v) ? n(v).toFixed(2) : ""), req = (v) => n(v).toFixed(2);
  return [soloDigitos(f.rnc), f.tipoId, f.tipoBS, f.ncf, f.ncfMod || "", yyyymmdd(f.fecha), yyyymmdd(f.fechaPago),
    req(f.servicios), req(f.bienes), req(n(f.servicios) + n(f.bienes)), req(f.itbis), num(f.itbisRet), num(f.itbisProp), num(f.itbisCosto),
    req(itbisPorAdelantar(f)), num(f.itbisPerc), n(f.retIsr) ? f.tipoRetIsr : "", num(f.retIsr), num(f.isrPerc), num(f.isc), num(f.otros), num(f.propina), f.formaPago].join("|");
}
$("#btnTxt").onclick = async () => {
  const cl = cliente(), lista = facturasRango(cl.id);
  if (!cl.rnc) { toast("Falta el RNC del cliente"); return abrirCliente(cl.id); }
  if (!(await listoParaExportar(lista))) return;
  const per = rangoAct().d.replace("-", "");
  descargar(`DGII_F_606_${cl.rnc}_${per}.TXT`, [`606|${cl.rnc}|${per}|${lista.length}`, ...lista.map(fila606TXT)].join("\r\n"), "text/plain");
};
$("#btnCsv").onclick = async () => {
  const lista = facturasRango(clienteId);
  if (!(await listoParaExportar(lista))) return;
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const filas = [["Período", "Suplidor", ...COLS_DGII.map((c) => c.h2 || c.h)], ...lista.map((f) => [f.periodo.replace("-", ""), f.suplidor || "", ...COLS_DGII.map((c) => textoCelda(valorDGII(c, f, null), c))])];
  descargar(nombreArchivo("csv"), "﻿" + filas.map((r) => r.map(q).join(",")).join("\r\n"), "text/csv");
};
$("#btnEnviado").onclick = () => {
  const cl = cliente(), p = rangoAct().d; cl.enviados ||= {};
  if (cl.enviados[p]) delete cl.enviados[p]; else cl.enviados[p] = Date.now();
  guardarTodo(); render(); toast(cl.enviados[p] ? `Marcado como enviado (${mesNombre(p)})` : "Marca quitada");
};

// =====================================================================
//  Ajustes, respaldo y ejemplos
// =====================================================================
$("#segTema").onclick = (e) => { const b = e.target.closest("button"); if (b) { cfg.tema = b.dataset.t; guardarTodo(); aplicarTema(); } };
$("#btnEditarCliente").onclick = () => abrirCliente(clienteId);
$("#btnOlvidarSup").onclick = async () => {
  if (!(await confirmar("¿Olvidar todos los suplidores recordados? Las facturas no se borran.", "Olvidar", true))) return;
  sup = {}; clientes.forEach((c) => (c.memo = {})); guardarTodo(); render(); toast("Suplidores olvidados");
};
$("#btnBackup").onclick = () => descargar(`respaldo_factura606_${new Date().toISOString().slice(0, 10)}.json`,
  JSON.stringify({ app: "factura606", v: 2, clientes, facturas, sup }, null, 1), "application/json");
$("#fileImport").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (Array.isArray(d)) { // respaldo de la versión anterior
      if (!cliente()) return toast("Elige primero el cliente al que van esas facturas");
      const ids = new Set(facturas.map((f) => f.id));
      const nuevas = d.filter((f) => f?.id && !ids.has(f.id)).map((f) => ({ origen: "Manual", ...f, clienteId }));
      facturas.push(...nuevas); guardarTodo(); render(); return toast(`${nuevas.length} facturas restauradas en ${cliente().nombre}`);
    }
    if (d.app === "factura606-crudo" && d.datos) { // respaldo de emergencia de la pantalla de error
      const leer = (k, def) => { try { return JSON.parse(d.datos[k]) ?? def; } catch { return def; } };
      d.app = "factura606"; d.clientes = leer("f606_clientes", []); d.facturas = leer("f606_facturas", []); d.sup = leer("f606_suplidores", {});
    }
    if (d.app !== "factura606") throw 0;
    const idsC = new Set(clientes.map((c) => c.id)), idsF = new Set(facturas.map((f) => f.id));
    const nc = d.clientes.filter((c) => !idsC.has(c.id)), nf = d.facturas.filter((f) => !idsF.has(f.id));
    clientes.push(...nc); facturas.push(...nf); sup = Object.assign({}, d.sup, sup);
    guardarTodo(); render(); toast(`Restaurado: ${nc.length} clientes y ${nf.length} facturas`);
  } catch { toast("Ese archivo no es un respaldo de Factura 606"); }
};

function cargarEjemplos() {
  const p = periodo, d = (x) => `${p}-${String(x).padStart(2, "0")}`;
  const mk = (datos) => { const c = nuevoCliente(datos); clientes.push(c); return c; };
  const a = mk({ nombre: "Colmado Don Pedro SRL", rnc: "131558877", tipo: "09", pago: "02" });
  const b = mk({ nombre: "Dra. Carmen Rosario", rnc: "00114567890", tipo: "02", pago: "03", destino: "servicios" });
  const c = mk({ nombre: "Taller Hermanos Díaz", rnc: "130998812", tipo: "02", pago: "01" });
  const e = mk({ nombre: "Inversiones Peralta SAS", rnc: "132004455", tipo: "02", pago: "02" });
  e.enviados[p] = Date.now();
  const add = (cl, x) => { const f = Object.assign({ id: uid(), clienteId: cl.id, periodo: p, creada: Date.now() + Math.random() * 1000, tipoId: x.rnc.length === 11 ? "2" : "1",
    ncfMod: "", fechaPago: "", servicios: 0, bienes: 0, itbisRet: 0, itbisProp: 0, itbisCosto: 0, itbisPerc: 0, tipoRetIsr: "", retIsr: 0, isrPerc: 0, isc: 0, otros: 0, propina: 0, notas: "", qrUrl: "" }, x);
    facturas.push(f); sup[x.rnc] = x.suplidor; };
  add(a, { origen: "QR", suplidor: "Distribuidora Corripio", rnc: "101001234", ncf: "E310000045210", fecha: d(2), bienes: 42372.88, itbis: 7627.12, total: 50000, tipoBS: "09", formaPago: "02" });
  add(a, { origen: "QR", suplidor: "Cervecería Nacional Dominicana", rnc: "101002345", ncf: "E310001288331", fecha: d(4), bienes: 25423.73, itbis: 4576.27, total: 30000, tipoBS: "09", formaPago: "04" });
  add(a, { origen: "OCR", suplidor: "Edenorte Dominicana", rnc: "101820001", ncf: "B0100458812", fecha: d(9), servicios: 6380, itbis: 0, total: 6380, tipoBS: "02", formaPago: "02" });
  add(a, { origen: "OCR", suplidor: "Papelería La Moderna", rnc: "131234567", ncf: "B01OOO1234", fecha: d(11), bienes: 1525, itbis: 274.5, total: 1799.5, tipoBS: "02", formaPago: "01" });
  add(a, { origen: "Manual", suplidor: "Lic. Ana Pérez", rnc: "00112345678", ncf: "B1100000451", fecha: d(14), servicios: 15000, itbis: 2700, itbisRet: 2700, retIsr: 1500, tipoRetIsr: "02", fechaPago: "", total: 17700, tipoBS: "02", formaPago: "02" });
  add(b, { origen: "QR", suplidor: "Claro Dominicana", rnc: "101001577", ncf: "E310000873310", fecha: d(8), servicios: 2541.53, itbis: 457.47, total: 2999, tipoBS: "02", formaPago: "03" });
  add(b, { origen: "QR", suplidor: "Farmacia Carol", rnc: "101011299", ncf: "E310000220145", fecha: d(12), bienes: 3389.83, itbis: 610.17, total: 4000, tipoBS: "02", formaPago: "03" });
  add(b, { origen: "Manual", suplidor: "Inmobiliaria Bella Vista", rnc: "130567123", ncf: "B0100000981", fecha: d(1), servicios: 35000, itbis: 6300, total: 41300, tipoBS: "03", formaPago: "02" });
  add(e, { origen: "QR", suplidor: "Altice Dominicana", rnc: "101010632", ncf: "E310004410023", fecha: d(6), servicios: 4237.29, itbis: 762.71, total: 5000, tipoBS: "02", formaPago: "03" });
  add(e, { origen: "QR", suplidor: "Shell Dominicana", rnc: "101005511", ncf: "E310000930087", fecha: d(10), bienes: 6000, itbis: 0, total: 6000, tipoBS: "02", formaPago: "03" });
  a.ultimo = Date.now(); b.ultimo = Date.now() - 1000; e.ultimo = Date.now() - 2000;
  clienteId = a.id; guardarTodo();
  location.hash = "inicio"; irA();
  toast("4 clientes de ejemplo agregados");
}
$("#btnEjemplo").onclick = cargarEjemplos;

// Bienvenida
$("#bvEmpezar").onclick = () => { cfg.bienvenida = true; guardarTodo(); $("#dlgBienvenida").close(); abrirCliente(null); };
$("#bvEjemplo").onclick = () => { cfg.bienvenida = true; guardarTodo(); $("#dlgBienvenida").close(); cargarEjemplos(); };
$("#dlgBienvenida").addEventListener("cancel", (e) => e.preventDefault());

// Inicio
// ---------- Actualizaciones ----------
try {
  if ("serviceWorker" in navigator) {
    const habiaSW = !!navigator.serviceWorker.controller;
    let recargando = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!habiaSW || recargando) return;
      recargando = true; location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      reg.update();
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update(); });
    }).catch(() => {});
  }
} catch {}
$("#ajVersion").textContent = VERSION_APP;
$("#btnActualizar").onclick = () => { toast("Buscando la última versión…"); limpiarYRecargar(); };
guardarTodo();
aplicarTema();
pintarPeriodo();
irA();
if (!cfg.bienvenida && !clientes.length) $("#dlgBienvenida").showModal();
