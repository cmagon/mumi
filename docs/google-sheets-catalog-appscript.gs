/**
 * Apps Script — feed Meta / Facebook (hoja CATALOGO_SINCRONIZADO).
 *
 * Escribe por los encabezados de la FILA 2 (no los sobrescribe).
 * Si en AF pusiste "additional_image_link", recibirá las URLs extra separadas por coma.
 *
 * INSTALACIÓN:
 * 1. https://docs.google.com/spreadsheets/d/1L-Wj2A-uKw5d8ocdbce1s_3YRgYDvGd8FMpaPJBuzs0/edit
 * 2. Extensiones → Apps Script → pegar este archivo
 * 3. Implementar → Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona)
 * 4. npx supabase secrets set GOOGLE_SHEETS_WEBAPP_URL="https://script.google.com/macros/s/.../exec"
 * 5. npx supabase functions deploy sheets-sync-catalog
 */

/** Extrae el nombre del campo Meta del encabezado (ej. "... image_link" → image_link). */
function normHeader(h) {
  var s = String(h || '').trim();
  if (!s) return '';
  var low = s.toLowerCase();
  if (/^[a-z][a-z0-9_\[\].0-]+$/i.test(s)) return low;
  var m = s.match(/([a-z][a-z0-9_\[\].0-]+)\s*$/i);
  if (m) return m[1].toLowerCase();
  return low;
}

function headersFromSheet(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var raw = sh.getRange(2, 1, 1, lastCol).getValues()[0];
  var keys = [];
  for (var i = 0; i < raw.length; i++) {
    keys.push(normHeader(raw[i]));
  }
  while (keys.length && !keys[keys.length - 1]) keys.pop();
  return keys;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var sheetId = body.sheetId || SpreadsheetApp.getActiveSpreadsheet().getId();
    var rows = body.rows || [];
    var ss = SpreadsheetApp.openById(sheetId);
    var sh = ss.getSheets()[0];
    var colKeys = headersFromSheet(sh);

    if (!colKeys.length || colKeys[0] !== 'id') {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        error: 'Fila 2 debe tener encabezados Meta (columna A = id). No se sobrescriben automáticamente.',
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var lastRow = sh.getLastRow();
    if (lastRow >= 3) {
      sh.getRange(3, 1, lastRow - 2, colKeys.length).clearContent();
    }

    if (rows.length) {
      var values = rows.map(function (r) {
        return colKeys.map(function (key) {
          if (!key) return '';
          var v = r[key];
          if (v == null && key.indexOf('[') !== -1) {
            v = r[key.replace(/\./g, '')];
          }
          return v == null ? '' : String(v);
        });
      });
      sh.getRange(3, 1, values.length, colKeys.length).setValues(values);
    }

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      written: rows.length,
      columns: colKeys,
      syncedAt: body.syncedAt || new Date().toISOString(),
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function testSync() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        rows: [{
          id: 'test-1',
          title: 'Producto prueba',
          description: 'Descripción completa actualizada',
          availability: 'in stock',
          condition: 'new',
          price: '10000.00 COP',
          link: 'https://example.com/producto/prueba',
          image_link: 'https://example.com/img1.jpg',
          additional_image_link: 'https://example.com/img2.jpg,https://example.com/img3.jpg',
          brand: 'Mumi Amazonia',
          sale_price: '9000.00 COP',
          'product_tags[0]': 'infusiones',
        }],
      }),
    },
  };
  Logger.log(doPost(fake).getContent());
}
