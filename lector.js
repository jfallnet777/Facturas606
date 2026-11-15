"use strict";
// Lectura de facturas SIN IA:
//   1) Código QR de la factura electrónica (e-CF)  → BarcodeDetector nativo o jsQR (código abierto)
//   2) OCR del texto impreso                       → Tesseract.js (código abierto) + reglas
//   3) PDF con texto                               → pdf.js (código abierto), sin OCR
// Las librerías se cargan desde CDN solo cuando se necesitan.

const CDN = {
  jsqr: "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  pdfworker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
};

const _scripts = {};
function cargarScript(url) {
  if (!_scripts[url]) {
    _scripts[url] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = url; s.onload = res;
      s.onerror = () => { delete _scripts[url]; rej(new Error("No se pudo descargar una librería. ¿Hay internet?")); };
      document.head.appendChild(s);
    });
  }
  return _scripts[url];
}

// ============ QR ============
let _detector;
async function detectorNativo() {
  if (_detector !== undefined) return _detector;
  _detector = null;
  try {
    if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code"))
      _detector = new BarcodeDetector({ formats: ["qr_code"] });
  } catch {}
  return _detector;
}

/** Busca un QR en un canvas. Devuelve el texto o null. */
async function buscarQR(canvas) {
  const det = await detectorNativo();
  if (det) {
    try { const r = await det.detect(canvas); if (r.length) return r[0].rawValue; } catch {}
  }
  await cargarScript(CDN.jsqr);
  // Probar varias escalas: el QR puede ser pequeño dentro de la foto
  for (const max of [1600, 2400, 1000]) {
    const c = escalar(canvas, max);
    const img = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    const r = window.jsQR(img.data, c.width, c.height, { inversionAttempts: "attemptBoth" });
    if (r && r.data) return r.data;
  }
  return null;
}

/** Interpreta el contenido del QR de un e-CF de la DGII. */
function interpretarQR(texto) {
  const p = {};
  try {
    const u = new URL(texto.trim());
    u.searchParams.forEach((v, k) => (p[k.toLowerCase()] = v));
  } catch {
    // No es URL: intentar pares clave=valor sueltos
    String(texto).replace(/([A-Za-z]+)=([^&\s|;]+)/g, (_, k, v) => (p[k.toLowerCase()] = decodeURIComponent(v)));
  }
  const encf = (p.encf || p.ncf || "").toUpperCase();
  const rnc = soloDig(p.rncemisor || p.rnc || "");
  if (!encf && !rnc) return null;
  return {
    origen: "QR",
    rnc,
    rncComprador: soloDig(p.rnccomprador || ""),
    ncf: encf,
    fecha: fechaISO(p.fechaemision || ""),
    total: aNum(p.montototal || ""),
    qrUrl: /^https?:/i.test(texto.trim()) ? texto.trim() : "",
  };
}

// ============ Imágenes / PDF → canvas ============
function escalar(src, max) {
  const w = src.width, h = src.height, k = Math.min(1, max / Math.max(w, h));
  if (k === 1 && src instanceof HTMLCanvasElement) return src;
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function imagenACanvas(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch {
    src = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No se pudo abrir la imagen (¿formato HEIC?)."));
      i.src = URL.createObjectURL(file);
    });
  }
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

async function pdfACanvasYTexto(file) {
  await cargarScript(CDN.pdfjs);
  pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfworker;
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pag = await pdf.getPage(1);
  const vp = pag.getViewport({ scale: 2.5 });
  const c = document.createElement("canvas");
  c.width = vp.width; c.height = vp.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await pag.render({ canvasContext: ctx, viewport: vp }).promise;
  // Reconstruir líneas a partir de las posiciones del texto
  const tc = await pag.getTextContent();
  const filas = [];
  for (const it of tc.items) {
    if (!it.str.trim()) continue;
    const y = it.transform[5], x = it.transform[4];
    let f = filas.find((r) => Math.abs(r.y - y) < 3);
    if (!f) filas.push((f = { y, items: [] }));
    f.items.push({ x, s: it.str });
  }
  filas.sort((a, b) => b.y - a.y);
  const texto = filas.map((f) => f.items.sort((a, b) => a.x - b.x).map((i) => i.s).join("  ")).join("\n");
  return { canvas: c, texto };
}

// ============ OCR ============
let _worker;
async function ocr(canvas, onProgreso) {
  await cargarScript(CDN.tesseract);
  if (!_worker) {
    _worker = Tesseract.createWorker("spa", 1, {
      logger: (m) => { if (m.status === "recognizing text" && _worker._cb) _worker._cb(m.progress); },
    });
  }
  const w = await _worker;
  _worker._cb = onProgreso;
  const r = await w.recognize(prepararParaOCR(canvas));
  return r.data.text;
}

function prepararParaOCR(src) {
  // Escala de grises + contraste: mejora mucho los recibos térmicos
  const c = escalar(src, 2200);
  const out = document.createElement("canvas");
  out.width = c.width; out.height = c.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(c, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 140));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ============ Reglas para sacar datos del texto ============
function soloDig(s) { return String(s || "").replace(/\D/g, ""); }

function aNum(s) {
  s = String(s).replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const ultComa = s.lastIndexOf(","), ultPunto = s.lastIndexOf(".");
  if (ultComa > ultPunto && s.length - ultComa === 3) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const x = parseFloat(s);
  return isNaN(x) ? 0 : Math.round(x * 100) / 100;
}

function fechaISO(s) {
  s = String(s).trim();
  let m = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return armarFecha(m[1], m[2], m[3]);
  m = s.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m) return armarFecha(m[3].length === 2 ? "20" + m[3] : m[3], m[2], m[1]);
  return "";
}
function armarFecha(a, me, d) {
  const mm = +me, dd = +d;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || +a < 2000 || +a > 2100) return "";
  return `${a}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

// Montos: exigimos 2 decimales para no confundir con RNC, teléfonos, etc.
function montosDeLinea(linea) {
  const limpia = linea.replace(/\d+(?:[.,]\d+)?\s*%/g, " ");
  const re = /-?\d{1,3}(?:[,. ]\d{3})*[.,]\d{2}(?!\d)|-?\d+[.,]\d{2}(?!\d)/g;
  return (limpia.match(re) || []).map((x) => aNum(x.replace(/ /g, "")));
}

function montoEtiquetado(lineas, i) {
  let m = montosDeLinea(lineas[i]);
  if (!m.length && lineas[i + 1] !== undefined) m = montosDeLinea(lineas[i + 1]);
  return m.length ? m[m.length - 1] : null;
}

function corregirNCF(tok) {
  // Corrige confusiones típicas del OCR en la parte numérica
  return tok.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/Z/g, "2");
}

function buscarNCFs(texto) {
  const res = [];
  const re = /\b([BE8])\s?-?\s?([0-9OoIl|SZ]{2})\s?-?\s?([0-9OoIl|SZ]{8,10})\b/g;
  let m;
  while ((m = re.exec(texto.toUpperCase()))) {
    let letra = m[1], tipo = corregirNCF(m[2]), sec = corregirNCF(m[3]);
    if (letra === "8") letra = "B";
    const ncf = letra + tipo + sec;
    const ok = (letra === "B" && sec.length === 8 && /^(01|02|03|04|11|12|13|14|15|16|17)$/.test(tipo)) ||
               (letra === "E" && sec.length === 10 && /^(31|32|33|34|41|43|44|45|46|47)$/.test(tipo));
    if (ok) res.push({ ncf, pos: m.index });
  }
  return res;
}

function extraerDeTexto(texto, rncPropio) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const LU = lineas.map((l) => l.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const out = { origen: "OCR", rnc: "", ncf: "", ncfMod: "", fecha: "", subtotal: 0, itbis: 0, propina: 0, total: 0, itbisRet: 0, suplidor: "" };

  // --- NCF ---
  const ncfs = [];
  lineas.forEach((l, i) => buscarNCFs(l).forEach((n) => ncfs.push({ ...n, mod: /MODIFIC|AFECTA|REFERENCIA/.test(LU[i]) })));
  const principal = ncfs.find((n) => !n.mod) || ncfs[0];
  if (principal) out.ncf = principal.ncf;
  const mod = ncfs.find((n) => n.mod && n.ncf !== out.ncf);
  if (mod) out.ncfMod = mod.ncf;

  // --- RNC / cédula del suplidor ---
  const candidatos = [];
  const reId = /\b(\d{3}[- ]?\d{7}[- ]?\d|\d[- ]?\d{2}[- ]?\d{5}[- ]?\d)\b/g;
  LU.forEach((l, i) => {
    const etiquetada = /\bRNC\b|R\.N\.C|CEDULA|\bCED\b|\bC\.?I\.?\b/.test(l);
    const cliente = /CLIENTE|COMPRADOR|ADQUIRIENTE|COMPRA DE|FACTURAR A/.test(l);
    const fuentes = [l]; if (etiquetada && !reId.test(l)) fuentes.push(LU[i + 1] || "");
    reId.lastIndex = 0;
    for (const f of fuentes) {
      let m; reId.lastIndex = 0;
      while ((m = reId.exec(f))) {
        const d = soloDig(m[1]);
        if ((d.length === 9 || d.length === 11) && d !== rncPropio)
          candidatos.push({ d, etiquetada, cliente, i });
      }
    }
  });
  const elegido = candidatos.find((c) => c.etiquetada && !c.cliente) ||
                  candidatos.find((c) => !c.cliente && c.i < lineas.length / 3);
  if (elegido) out.rnc = elegido.d;

  // --- Nombre del suplidor: primera línea con letras, arriba del todo ---
  out.suplidor = (lineas.slice(0, 5).find((l) => /[A-Za-zÁÉÍÓÚÑ]{3,}/.test(l) && !/RNC|FACTURA|NCF|TEL|FECHA/i.test(l)) || "").slice(0, 60);

  // --- Fecha (evitar "válido hasta" / vencimiento del NCF) ---
  const fechas = [];
  LU.forEach((l, i) => {
    const malas = /VENC|VALID|HASTA|EXPIRA/.test(l);
    const re = /(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})/g;
    let m;
    while ((m = re.exec(l))) { const f = fechaISO(m[1]); if (f) fechas.push({ f, conEtiqueta: /FECHA/.test(l), malas, i }); }
  });
  const hoyISO = new Date().toISOString().slice(0, 10);
  const fOk = fechas.filter((x) => !x.malas && x.f <= hoyISO);
  out.fecha = (fOk.find((x) => x.conEtiqueta) || fOk[0] || {}).f || "";

  // --- Montos ---
  let itbisTotal = null, itbisUlt = null, totales = [];
  LU.forEach((l, i) => {
    if (/DESCUENTO|CAMBIO|EFECTIVO RECIB|DEVUELTA|PAGADO CON/.test(l)) return;
    if (/ITBIS|I\.T\.B\.I\.S|\bIVA\b/.test(l)) {
      const v = montoEtiquetado(LU, i);
      if (v == null) return;
      if (/RETENID/.test(l)) out.itbisRet = v;
      else if (/TOTAL/.test(l)) itbisTotal = v;
      else itbisUlt = v;
      return;
    }
    if (/SUB\s*-?\s*TOTAL/.test(l)) { const v = montoEtiquetado(LU, i); if (v != null) out.subtotal = v; return; }
    if (/PROPINA|LEY\s*10|10\s*%\s*(DE\s*)?(LEY|SERV)|SERVICIO\s*10|CARGO\s*(POR\s*)?SERVICIO/.test(l)) {
      const v = montoEtiquetado(LU, i); if (v != null) out.propina = v; return;
    }
    if (/\bTOTAL\b|A PAGAR|NETO|MONTO TOTAL/.test(l) && !/ARTICULO|ITEMS|CANT|UNIDADES|LINEAS/.test(l)) {
      const v = montoEtiquetado(LU, i); if (v != null) totales.push(v);
    }
  });
  out.itbis = itbisTotal ?? itbisUlt ?? 0;
  out.total = totales.length ? Math.max(...totales) : 0;
  if (!out.subtotal && out.total) {
    const s = Math.round((out.total - out.itbis - out.propina) * 100) / 100;
    if (s > 0) out.subtotal = s;
  }
  return out;
}

// ============ Escáner QR en vivo con la cámara ============
async function escanerEnVivo(video, alDetectar, debeSeguir) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
  });
  video.srcObject = stream;
  await video.play();
  const det = await detectorNativo();
  if (!det) await cargarScript(CDN.jsqr);
  const c = document.createElement("canvas"), ctx = c.getContext("2d", { willReadFrequently: true });
  const parar = () => { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  const ciclo = async () => {
    if (!debeSeguir()) return parar();
    try {
      let valor = null;
      if (det) { const r = await det.detect(video); if (r.length) valor = r[0].rawValue; }
      else if (video.videoWidth) {
        const k = Math.min(1, 1000 / video.videoWidth);
        c.width = video.videoWidth * k; c.height = video.videoHeight * k;
        ctx.drawImage(video, 0, 0, c.width, c.height);
        const r = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (r && r.data) valor = r.data;
      }
      if (valor) { parar(); return alDetectar(valor); }
    } catch {}
    setTimeout(ciclo, 200);
  };
  ciclo();
  return parar;
}

if (typeof module !== "undefined") module.exports = { extraerDeTexto, interpretarQR, aNum, fechaISO, buscarNCFs };
