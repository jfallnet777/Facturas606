"use strict";

// ---------- Estado y almacenamiento ----------
const LS_CFG = "f606_cfg";
const LS_DATA = "f606_facturas";
const $ = (s) => document.querySelector(s);

let cfg = Object.assign(
  { rnc: "", tipo: "02", pago: "01", destino: "bienes" },
  JSON.parse(localStorage.getItem(LS_CFG) || "{}")
);
let facturas = JSON.parse(localStorage.getItem(LS_DATA) || "[]");

const guardarCfg = () => localStorage.setItem(LS_CFG, JSON.stringify(cfg));
const guardarDatos = () => localStorage.setItem(LS_DATA, JSON.stringify(facturas));

const hoy = new Date();
$("#periodo").value = localStorage.getItem("f606_periodo") ||
  `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
const periodoActual = () => $("#periodo").value; // "AAAA-MM"

// ---------- Utilidades ----------
const n = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : Math.round(x * 100) / 100; };
const money = (v) => n(v).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toast(msg, ms = 2800) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms);
}

function llenarSelect(sel, obj, conCodigo = true) {
  sel.innerHTML = Object.entries(obj)
    .map(([k, v]) => `<option value="${k}">${conCodigo && k ? k + " - " : ""}${v}</option>`).join("");
}

function itbisPorAdelantar(f) {
  return Math.max(0, n(n(f.itbis) - n(f.itbisRet) - n(f.itbisProp) - n(f.itbisCosto)));
}

// ---------- Validaciones ----------
const RE_NCF = /^B(01|02|03|04|11|12|13|14|15|16|17)\d{8}$/;
const RE_ECF = /^E(31|32|33|34|41|43|44|45|46|47)\d{10}$/;

function validar(f) {
  const a = [];
  const rnc = soloDigitos(f.rnc);
  if (!(rnc.length === 9 || rnc.length === 11)) a.push("El RNC debe tener 9 dígitos o la cédula 11.");
  else if ((rnc.length === 9 && f.tipoId !== "1") || (rnc.length === 11 && f.tipoId !== "2"))
    a.push("El Tipo ID no coincide con la cantidad de dígitos.");
  const ncf = String(f.ncf || "").toUpperCase();
  if (!RE_NCF.test(ncf) && !RE_ECF.test(ncf)) a.push("NCF con formato inválido (B + 10 caracteres, o e-NCF E + 12).");
  if (/^(B02|E32)/.test(ncf)) a.push("Comprobante de consumo (B02/E32): normalmente no da crédito fiscal. Verifica si debe ir en el 606.");
  if (f.ncfMod && !RE_NCF.test(f.ncfMod.toUpperCase()) && !RE_ECF.test(f.ncfMod.toUpperCase())) a.push("NCF modificado con formato inválido.");
  if (/^(B03|B04|E33|E34)/.test(ncf) && !f.ncfMod) a.push("Las notas de débito/crédito requieren el NCF modificado.");
  if (!f.fecha) a.push("Falta la fecha del comprobante.");
  if (f.fechaPago && f.fecha && f.fechaPago < f.fecha) a.push("La fecha de pago es anterior a la del comprobante.");
  if (n(f.servicios) + n(f.bienes) <= 0) a.push("El monto facturado está en cero.");
  if (n(f.itbisRet) + n(f.itbisProp) + n(f.itbisCosto) > n(f.itbis)) a.push("Las deducciones de ITBIS superan el ITBIS facturado.");
  if ((n(f.itbisRet) > 0 || n(f.retIsr) > 0) && !f.fechaPago) a.push("Si hay retenciones, la fecha de pago es obligatoria.");
  if (n(f.retIsr) > 0 && !f.tipoRetIsr) a.push("Indica el tipo de retención ISR.");
  const base = n(f.servicios) + n(f.bienes);
  if (base > 0 && n(f.itbis) > base * 0.19) a.push("El ITBIS parece muy alto para el monto (más de 18%).");
  const sumaT = n(f.servicios) + n(f.bienes) + n(f.itbis) + n(f.propina) + n(f.isc) + n(f.otros);
  if (n(f.total) && sumaT && Math.abs(sumaT - n(f.total)) > 1) a.push(`Montos + impuestos (${money(sumaT)}) no cuadran con el total de la factura (${money(f.total)}).`);
  const dup = facturas.find((x) => x.id !== f.id && soloDigitos(x.rnc) === rnc && String(x.ncf).toUpperCase() === ncf);
  if (dup) a.push("Ya existe una factura con ese RNC y NCF (posible duplicado).");
  return a;
}

// ---------- Lectura sin IA: QR → OCR → manual ----------
function nuevaFactura(extra = {}) {
  return Object.assign({
    id: uid(), periodo: periodoActual(), origen: "Manual", suplidor: "", rnc: "", tipoId: "1",
    tipoBS: cfg.tipo, ncf: "", ncfMod: "", fecha: "", fechaPago: "", total: 0,
    servicios: 0, bienes: 0, itbis: 0, itbisRet: 0, itbisProp: 0, itbisCosto: 0, itbisPerc: 0,
    tipoRetIsr: "", retIsr: 0, isrPerc: 0, isc: 0, otros: 0, propina: 0, formaPago: cfg.pago, notas: "", qrUrl: "",
  }, extra);
}

function desdeLectura(d, archivo) {
  const rnc = soloDigitos(d.rnc);
  const f = nuevaFactura({
    origen: d.origen, suplidor: d.suplidor || "", rnc, tipoId: rnc.length === 11 ? "2" : "1",
    ncf: d.ncf || "", ncfMod: d.ncfMod || "", fecha: d.fecha || "", total: n(d.total),
    itbis: n(d.itbis), propina: n(d.propina), itbisRet: n(d.itbisRet), qrUrl: d.qrUrl || "",
  });
  if (d.subtotal) f[cfg.destino] = n(d.subtotal);
  const notas = [];
  if (d.origen === "QR") {
    notas.push("Leída del QR (e-CF). El QR no trae el desglose: completa el ITBIS o usa “Desglosar”.");
    if (d.rncComprador && cfg.rnc && d.rncComprador !== cfg.rnc) notas.push(`⚠ El RNC comprador del QR (${d.rncComprador}) no es el tuyo.`);
  } else if (d.origen === "OCR") {
    notas.push("Leída por OCR: revisa todos los datos.");
    const suma = n(d.subtotal) + n(d.itbis) + n(d.propina);
    if (d.total && suma && Math.abs(suma - d.total) > 1) notas.push(`Subtotal+ITBIS+propina (${money(suma)}) no cuadra con el total (${money(d.total)}).`);
  }
  if (archivo) notas.push(`Archivo: ${archivo}`);
  f.notas = notas.join(" ");
  return f;
}

function itemCola(texto) {
  const item = document.createElement("div");
  item.className = "item";
  item.innerHTML = `<span></span><div class="barra"><i></i></div>`;
  item.querySelector("span").textContent = texto;
  $("#cola").prepend(item);
  return {
    texto: (t) => (item.querySelector("span").textContent = t),
    progreso: (p) => (item.querySelector("i").style.width = Math.round(p * 100) + "%"),
    error: (t) => { item.className = "item err"; item.querySelector("span").textContent = t; item.onclick = () => item.remove(); },
    quitar: (ms = 5000) => setTimeout(() => item.remove(), ms),
  };
}


async function procesarArchivo(file) {
  const it = itemCola(`⏳ ${file.name}: buscando código QR…`);
  try {
    let canvas, textoPDF = "";
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      ({ canvas, texto: textoPDF } = await pdfACanvasYTexto(file));
    } else {
      canvas = await imagenACanvas(file);
    }

    // 1) Código QR
    const qr = await buscarQR(canvas);
    const datosQR = qr && interpretarQR(qr);
    if (datosQR) {
      it.texto(`✅ ${file.name}: leída del QR`); it.progreso(1); it.quitar();
      return guardarYAbrir(desdeLectura(datosQR, file.name));
    }

    // 2) Texto: del PDF directamente o con OCR
    let texto = textoPDF;
    if (texto.replace(/\s/g, "").length < 40) {
      it.texto(`⏳ ${file.name}: sin QR, leyendo el texto (OCR)…`);
      texto = await ocr(canvas, it.progreso);
    }
    const d = extraerDeTexto(texto, cfg.rnc);
    const encontrados = [d.rnc, d.ncf, d.fecha, d.total || d.subtotal].filter(Boolean).length;
    if (encontrados === 0) throw new Error("no se encontraron datos");
    it.texto(`✅ ${file.name}: ${encontrados} de 4 datos clave leídos por OCR`); it.progreso(1); it.quitar();
    const f = desdeLectura(d, file.name); f._texto = texto;
    guardarYAbrir(f);
  } catch (e) {
    // 3) Manual
    it.error(`❌ ${file.name}: ${e.message}. Introdúcela manualmente.`);
    abrirFactura(null, { notas: `No se pudo leer automáticamente (${file.name}).` });
  }
}

let pendientes = [];
function guardarYAbrir(f) {
  pendientes.push(f);
  if (!$("#dlgFactura").open) abrirSiguiente();
}
function abrirSiguiente() {
  const f = pendientes.shift();
  if (f) abrirFactura(null, f);
}

async function procesarArchivos(files) {
  for (const f of files) await procesarArchivo(f);
}

// ---------- Escáner QR en vivo ----------
let qrActivo = false;
$("#btnQR").onclick = async () => {
  qrActivo = true;
  $("#estadoQR").textContent = "Abriendo cámara…";
  $("#dlgQR").showModal();
  try {
    await escanerEnVivo($("#video"), (valor) => {
      const d = interpretarQR(valor);
      cerrarQR();
      if (d) { toast("QR leído ✅"); guardarYAbrir(desdeLectura(d)); }
      else { toast("Ese QR no es de una factura electrónica"); abrirFactura(null, { notas: "QR no reconocido: " + valor.slice(0, 120) }); }
    }, () => qrActivo);
    $("#estadoQR").textContent = "Buscando el código QR… acerca la cámara y mantenla quieta.";
  } catch (e) {
    $("#estadoQR").textContent = "No se pudo usar la cámara (" + (e.message || e.name) + "). Usa “Foto / PDF” o la opción manual.";
  }
};
function cerrarQR() { qrActivo = false; if ($("#dlgQR").open) $("#dlgQR").close(); }
$("#btnCerrarQR").onclick = cerrarQR;
$("#dlgQR").addEventListener("close", () => (qrActivo = false));
$("#fileFoto").onchange = (e) => {
  const f = e.target.files[0]; e.target.value = "";
  cerrarQR();
  if (f) procesarArchivo(f);
};

// ---------- Render ----------
function delPeriodo() { return facturas.filter((f) => f.periodo === periodoActual()); }

function render() {
  const lista = delPeriodo().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const t = lista.reduce((acc, f) => {
    acc.monto += n(f.servicios) + n(f.bienes);
    acc.itbis += n(f.itbis);
    acc.adelantar += itbisPorAdelantar(f);
    acc.ret += n(f.itbisRet) + n(f.retIsr);
    return acc;
  }, { monto: 0, itbis: 0, adelantar: 0, ret: 0 });

  $("#totales").innerHTML = `
    <div><small>Facturas</small><b>${lista.length}</b></div>
    <div><small>Monto facturado</small><b>${money(t.monto)}</b></div>
    <div><small>ITBIS facturado</small><b>${money(t.itbis)}</b></div>
    <div><small>ITBIS por adelantar</small><b>${money(t.adelantar)}</b></div>
    <div><small>Retenciones</small><b>${money(t.ret)}</b></div>`;

  if (!lista.length) {
    $("#lista").innerHTML = `<div class="vacio">No hay facturas en este período.<br>Toma una foto para empezar.</div>`;
    return;
  }
  $("#lista").innerHTML = "";
  for (const f of lista) {
    const al = validar(f);
    const c = document.createElement("div");
    c.className = "card" + (al.length ? " warn" : "");
    c.innerHTML = `
      <div><div class="t"></div><div class="s"></div></div>
      <div class="m">${money(n(f.servicios) + n(f.bienes) + n(f.itbis) + n(f.propina) + n(f.isc) + n(f.otros))}
        <div class="s">ITBIS ${money(f.itbis)}</div></div>`;
    c.querySelector(".t").textContent = (al.length ? "⚠ " : "") + (f.suplidor || f.rnc || "Sin suplidor");
    c.querySelector(".s").textContent = `${f.ncf || "sin NCF"} · ${f.fecha || "sin fecha"} · ${f.tipoBS}`;
    c.onclick = () => abrirFactura(f.id);
    $("#lista").appendChild(c);
  }
}

// ---------- Editar factura ----------
const frm = $("#frmFactura");
llenarSelect(frm.tipoBS, TIPOS_BS);
llenarSelect(frm.formaPago, FORMAS_PAGO);
llenarSelect(frm.tipoRetIsr, TIPOS_RET_ISR);
let editando = null;

function abrirFactura(id, datos) {
  editando = id ? facturas.find((f) => f.id === id) : null;
  const f = editando || (datos && datos.id ? datos : nuevaFactura(datos || {}));
  frm._base = f;
  for (const el of frm.elements) {
    if (!el.name) continue;
    const v = f[el.name];
    el.value = el.type === "number" ? (n(v) ? v : "") : (v ?? "");
  }
  $("#chkPropina").checked = n(f.propina) > 0;
  const lnk = $("#lnkDGII");
  lnk.hidden = !f.qrUrl; if (f.qrUrl) lnk.href = f.qrUrl;
  $("#detTexto").hidden = !f._texto;
  $("#txtLeido").textContent = f._texto || "";
  const origen = f.origen ? ` (${f.origen})` : "";
  $("#tituloFactura").textContent = (editando ? "Revisar factura" : "Nueva factura") + origen;
  $("#btnBorrar").style.display = editando ? "" : "none";
  frm.dataset.id = f.id;
  actualizarAvisos();
  $("#dlgFactura").showModal();
}

function leerForm() {
  const f = Object.assign({}, editando || frm._base || { id: frm.dataset.id, periodo: periodoActual() });
  for (const el of frm.elements) {
    if (!el.name) continue;
    f[el.name] = el.type === "number" ? n(el.value) : el.value.trim();
  }
  delete f._texto;
  f.rnc = soloDigitos(f.rnc);
  f.ncf = f.ncf.toUpperCase(); f.ncfMod = f.ncfMod.toUpperCase();
  return f;
}

function actualizarAvisos() {
  const f = leerForm();
  $("#alertas").innerHTML = validar(f).map((a) => `<div>⚠ ${a}</div>`).join("");
  $("#calcFactura").textContent =
    `Total facturado: ${money(n(f.servicios) + n(f.bienes))} · ITBIS por adelantar: ${money(itbisPorAdelantar(f))}`;
}
frm.addEventListener("input", (e) => {
  if (e.target.name === "rnc") {
    const d = soloDigitos(e.target.value);
    if (d.length === 11) frm.tipoId.value = "2";
    else if (d.length === 9) frm.tipoId.value = "1";
  }
  actualizarAvisos();
});

$("#dlgFactura").addEventListener("close", () => {
  const v = $("#dlgFactura").returnValue;
  if (v === "ok") {
    const f = leerForm();
    const i = facturas.findIndex((x) => x.id === f.id);
    if (i >= 0) facturas[i] = f; else facturas.push(f);
    guardarDatos(); render(); toast("Factura guardada");
  } else if (v === "del" && editando) {
    if (confirm("¿Borrar esta factura?")) {
      facturas = facturas.filter((x) => x.id !== editando.id);
      guardarDatos(); render(); toast("Factura borrada");
    }
  }
  $("#dlgFactura").returnValue = "";
  setTimeout(abrirSiguiente, 150);
});

// Desglosar desde el total: base = total / (1.18 [+ 0.10 si hay propina])
$("#btnDesglosar").onclick = () => {
  const total = n(frm.total.value);
  if (!total) { toast("Escribe primero el total de la factura"); frm.total.focus(); return; }
  const otros = n(frm.isc.value) + n(frm.otros.value);
  const conProp = $("#chkPropina").checked;
  const base = Math.round(((total - otros) / (1.18 + (conProp ? 0.10 : 0))) * 100) / 100;
  const itbis = Math.round(base * 0.18 * 100) / 100;
  const prop = conProp ? Math.round((total - otros - base - itbis) * 100) / 100 : 0;
  // Si ya había monto en servicios y no en bienes, respetarlo
  const destino = n(frm.servicios.value) && !n(frm.bienes.value) ? "servicios" :
                  n(frm.bienes.value) && !n(frm.servicios.value) ? "bienes" : cfg.destino;
  frm.bienes.value = destino === "bienes" ? base.toFixed(2) : "";
  frm.servicios.value = destino === "servicios" ? base.toFixed(2) : "";
  frm.itbis.value = itbis.toFixed(2);
  frm.propina.value = prop ? prop.toFixed(2) : "";
  actualizarAvisos();
  toast("Desglose calculado con ITBIS 18%. Si la factura tiene productos exentos o al 16%, ajústalo.");
};

// ---------- Ajustes ----------
llenarSelect($("#cfgTipo"), TIPOS_BS);
llenarSelect($("#cfgPago"), FORMAS_PAGO);
$("#btnAjustes").onclick = () => {
  $("#cfgRnc").value = cfg.rnc; $("#cfgDestino").value = cfg.destino;
  $("#cfgTipo").value = cfg.tipo; $("#cfgPago").value = cfg.pago;
  $("#dlgAjustes").showModal();
};
$("#dlgAjustes").addEventListener("close", () => {
  if ($("#dlgAjustes").returnValue !== "ok") return;
  cfg = {
    rnc: soloDigitos($("#cfgRnc").value), destino: $("#cfgDestino").value,
    tipo: $("#cfgTipo").value, pago: $("#cfgPago").value,
  };
  guardarCfg(); toast("Ajustes guardados");
});

// ---------- Exportar ----------
const yyyymmdd = (d) => (d || "").replace(/-/g, "");
const num = (v) => (n(v) ? n(v).toFixed(2) : "");
const numReq = (v) => n(v).toFixed(2);

function fila606(f) {
  return [
    soloDigitos(f.rnc), f.tipoId, f.tipoBS, f.ncf, f.ncfMod || "",
    yyyymmdd(f.fecha), yyyymmdd(f.fechaPago),
    numReq(f.servicios), numReq(f.bienes), numReq(n(f.servicios) + n(f.bienes)),
    numReq(f.itbis), num(f.itbisRet), num(f.itbisProp), num(f.itbisCosto),
    numReq(itbisPorAdelantar(f)), num(f.itbisPerc),
    n(f.retIsr) ? f.tipoRetIsr : "", num(f.retIsr), num(f.isrPerc),
    num(f.isc), num(f.otros), num(f.propina), f.formaPago,
  ];
}

const COLS = ["RNC o Cédula", "Tipo Id", "Tipo Bienes y Servicios", "NCF", "NCF Modificado",
  "Fecha Comprobante", "Fecha Pago", "Monto Servicios", "Monto Bienes", "Total Monto Facturado",
  "ITBIS Facturado", "ITBIS Retenido", "ITBIS Proporcionalidad", "ITBIS al Costo", "ITBIS por Adelantar",
  "ITBIS Percibido", "Tipo Retención ISR", "Monto Retención Renta", "ISR Percibido", "ISC",
  "Otros Impuestos", "Propina Legal", "Forma de Pago"];

function descargar(nombre, contenido, tipo) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function revisarAntesDeExportar(lista) {
  if (!lista.length) { toast("No hay facturas en este período"); return false; }
  const conErr = lista.filter((f) => validar(f).length).length;
  if (conErr && !confirm(`${conErr} factura(s) tienen avisos ⚠. ¿Exportar de todos modos?`)) return false;
  return true;
}

$("#btnTxt").onclick = () => {
  const lista = delPeriodo();
  if (!cfg.rnc) { toast("Pon tu RNC en Ajustes ⚙ primero"); return; }
  if (!revisarAntesDeExportar(lista)) return;
  const per = periodoActual().replace("-", "");
  const lineas = [`606|${cfg.rnc}|${per}|${lista.length}`, ...lista.map((f) => fila606(f).join("|"))];
  descargar(`DGII_F_606_${cfg.rnc}_${per}.TXT`, lineas.join("\r\n"), "text/plain");
};

$("#btnCsv").onclick = () => {
  const lista = delPeriodo();
  if (!revisarAntesDeExportar(lista)) return;
  const esc = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const filas = [["Suplidor", ...COLS], ...lista.map((f) => [f.suplidor || "", ...fila606(f)])];
  descargar(`606_${periodoActual()}.csv`, "﻿" + filas.map((r) => r.map(esc).join(",")).join("\r\n"), "text/csv");
};

$("#btnBackup").onclick = () =>
  descargar(`respaldo_606_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(facturas, null, 1), "application/json");

$("#fileImport").onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error();
    const ids = new Set(facturas.map((f) => f.id));
    const nuevas = data.filter((f) => f && f.id && !ids.has(f.id));
    facturas.push(...nuevas); guardarDatos(); render();
    toast(`${nuevas.length} factura(s) restauradas`);
  } catch { toast("Archivo de respaldo inválido"); }
  e.target.value = "";
};

// ---------- Eventos ----------
$("#fileAny").onchange = (e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) procesarArchivos(fs); };
$("#btnManual").onclick = () => abrirFactura(null);
$("#periodo").onchange = () => { localStorage.setItem("f606_periodo", periodoActual()); render(); };

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
if (!cfg.rnc) setTimeout(() => toast("Pon tu RNC en Ajustes ⚙ para mejores resultados", 4000), 600);
render();
