# Factura 606

Para contadores: varios clientes de iguala, escaneo en ráfaga, revisión en cola y Excel en el orden de la herramienta 606 de la DGII.

PWA para leer facturas dominicanas **sin IA** y preparar el **Formato 606** de la DGII. Es gratis y no necesita claves API.

## Cómo lee las facturas (en este orden)
1. **Código QR del e-CF** con la cámara en vivo o desde una foto/PDF. Usa el lector nativo del navegador o **jsQR** (código abierto). Del QR salen el RNC del emisor, el e-NCF, la fecha y el monto total.
2. **OCR** con **Tesseract.js** (código abierto) si la factura no tiene QR. Busca el RNC, el NCF, la fecha, el subtotal, el ITBIS, la propina y el total con reglas. Si es un PDF con texto, lo lee directo con **pdf.js**, sin OCR.
3. **Manual** si las dos fallan: se abre el formulario vacío para escribirla.

El botón **Desglosar ITBIS 18%** calcula la base, el ITBIS y la propina a partir del total. Es útil para las facturas leídas por QR, que no traen el desglose.

## Publicar en GitHub Pages
1. Crea un repositorio nuevo en GitHub (por ejemplo `factura606`).
2. Sube todos los archivos de esta carpeta (**Add file → Upload files**).
3. Ve a **Settings → Pages**, en *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. En 1–2 minutos estará en `https://TU-USUARIO.github.io/factura606/`. GitHub Pages usa HTTPS, que la cámara necesita.
5. En el celular, abre el menú del navegador → **Agregar a pantalla de inicio / Instalar app**.
6. Toca ⚙ y pon tu RNC. Así el lector no lo confunde con el del suplidor.

## Notas
- Necesita internet: las librerías se descargan de jsDelivr la primera vez. El OCR descarga unos 2 MB de datos del idioma español.
- Para mejor OCR: buena luz, la factura plana y la foto derecha y cerca.
- Revisa siempre los datos antes de exportar.
- Valida el TXT con la herramienta de pre-validación de la DGII antes de enviarlo. Si la DGII cambia el formato, ajusta `fila606()` en `app.js`.
- Las reglas del OCR están en `extraerDeTexto()` en `lector.js`, por si quieres adaptarlas a tus suplidores frecuentes.
- Los datos se guardan en el navegador del dispositivo. Usa **Respaldo** a menudo.
- Cuando actualices archivos, cambia `CACHE = "f606-v2"` en `sw.js` (v3, v4…).
