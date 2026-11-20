/**
 * @OnlyCurrentDoc
 *
 * Agenda Yatzi — servidor (API) en Google Apps Script, vinculado a una hoja de Google Sheets.
 *
 * - La app visual vive en GitHub Pages y se comunica con este servidor.
 * - Cada persona inicia sesión con Google en la app; aquí se comprueba que su
 *   correo esté en CORREOS_PERMITIDOS.
 * - Guarda las actividades y tareas en las pestañas "Actividades" y "Tareas".
 * - Envía los recordatorios por correo (actívalos con activarRecordatorios).
 *
 * Publicación (Implementar › Nueva implementación › Aplicación web):
 *   Ejecutar como:        Yo
 *   Quién tiene acceso:   Cualquier persona
 */

// ===== Correos que pueden usar la agenda =====
var CORREOS_PERMITIDOS = [
  'cdp.av.1969@gmail.com',
  'yatziglez16@gmail.com',
  'elias.alpuche@gmail.com'
];

// ===== ID de cliente de Google (el mismo que pones en config.js) =====
var GOOGLE_CLIENT_ID = 'PEGA-AQUI-TU-ID.apps.googleusercontent.com';

// ===== Correo que recibe los recordatorios =====
var CORREO_RECORDATORIOS = 'yatziglez16@gmail.com';

// ===== Enlace de la app en GitHub Pages (para el botón de los correos) =====
var APP_URL = 'https://TU-USUARIO.github.io/agenda-yatzi/';

var NOMBRE_APP = 'Agenda Yatzi';

var HOJA_ACT = 'Actividades';
var HOJA_TAR = 'Tareas';
var COL_ACT = ['ID', 'Fecha', 'Todo el día', 'Inicio', 'Término', 'Título', 'Prioridad',
               'Ubicación o enlace', 'Notas', 'Recordatorio', 'Anticipación (min)', 'Creado', 'Actualizado'];
var COL_TAR = ['ID', 'Tipo', 'ID tarea principal', 'Título', 'Realizada', 'Realizada el', 'Orden', 'Contraída', 'Creado'];
var PRI = { r: 'Altísima', o: 'Alta', g: 'Normal', b: 'Baja' };
var FMT = 'yyyy-MM-dd HH:mm';

/* ================== API para la app ================== */

function doGet() {
  return json_({ ok: true, app: NOMBRE_APP, mensaje: 'Servidor de ' + NOMBRE_APP + ' funcionando.' });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var email = verificarToken_(req.token);
    if (req.action === 'get') {
      out = { ok: true, email: email, data: leerDatos_() };
    } else if (req.action === 'save') {
      guardarDatos_(req.data);
      out = { ok: true };
    } else {
      throw new Error('Acción no válida');
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err), code: (err && err.code) || 'ERROR', email: err && err.email };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function error_(msg, code, email) {
  var e = new Error(msg); e.code = code; if (email) e.email = email; return e;
}

/** Comprueba el token de inicio de sesión de Google y devuelve el correo. */
function verificarToken_(token) {
  if (!token || typeof token !== 'string' || token.length > 5000) throw error_('Inicia sesión de nuevo.', 'AUTH');
  var cache = CacheService.getScriptCache();
  var clave = 'tk_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var email = cache.get(clave);
  if (!email) {
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw error_('La sesión expiró. Inicia sesión de nuevo.', 'AUTH');
    var info = JSON.parse(res.getContentText());
    var vence = Number(info.exp) * 1000;
    if (info.aud !== GOOGLE_CLIENT_ID) throw error_('La app no está bien configurada (ID de cliente distinto).', 'CONFIG');
    if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') throw error_('Inicio de sesión no válido.', 'AUTH');
    if (String(info.email_verified) !== 'true' || !(vence > Date.now())) throw error_('La sesión expiró. Inicia sesión de nuevo.', 'AUTH');
    email = String(info.email || '').toLowerCase();
    var seg = Math.floor(Math.min(600, (vence - Date.now()) / 1000));
    if (seg > 30) cache.put(clave, email, seg);
  }
  var permitido = CORREOS_PERMITIDOS.some(function (c) { return String(c).trim().toLowerCase() === email; });
  if (!permitido) throw error_('La cuenta ' + email + ' no tiene acceso a esta agenda.', 'SIN_ACCESO', email);
  return email;
}

/** Lee todos los datos de la hoja. */
function leerDatos_() {
  var tz = Session.getScriptTimeZone();

  var activities = leer_(hoja_(HOJA_ACT, COL_ACT), COL_ACT.length).map(function (r) {
    return {
      id: r[0], date: r[1], allDay: r[2] === 'Sí', start: r[3], end: r[4], title: r[5],
      priority: codigoPrioridad_(r[6]), location: r[7], notes: r[8],
      reminder: { on: r[9] === 'Sí', minutes: Number(r[10]) || 30 },
      createdAt: aMs_(r[11], tz), updatedAt: aMs_(r[12], tz)
    };
  }).filter(function (a) { return /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.title; });

  var tasks = [], porId = {};
  leer_(hoja_(HOJA_TAR, COL_TAR), COL_TAR.length).forEach(function (r) {
    if (r[1] === 'Tarea') {
      var t = { id: r[0], title: r[3], done: r[4] === 'Sí', doneAt: aMs_(r[5], tz),
                collapsed: r[7] === 'Sí', subtasks: [], createdAt: aMs_(r[8], tz) };
      porId[t.id] = t; tasks.push(t);
    } else if (r[1] === 'Subtarea' && porId[r[2]]) {
      porId[r[2]].subtasks.push({ id: r[0], title: r[3], done: r[4] === 'Sí', doneAt: aMs_(r[5], tz) });
    }
  });

  return { v: 1, activities: activities, tasks: tasks };
}

/** Reescribe las dos pestañas con los datos recibidos. */
function guardarDatos_(data) {
  if (!data || typeof data !== 'object') throw error_('Datos no válidos', 'ERROR');
  var tz = Session.getScriptTimeZone();
  var filasAct = (data.activities || []).map(function (a) {
    return [
      txt_(a.id, 40), txt_(a.date, 10), a.allDay ? 'Sí' : 'No', a.allDay ? '' : txt_(a.start, 5), a.allDay ? '' : txt_(a.end, 5),
      txt_(a.title, 150), PRI[a.priority] || 'Normal', txt_(a.location, 500), txt_(a.notes, 3000),
      a.reminder && a.reminder.on ? 'Sí' : 'No', String(a.reminder ? Number(a.reminder.minutes) || 30 : 30),
      aTexto_(a.createdAt, tz), aTexto_(a.updatedAt, tz)
    ];
  });

  var filasTar = [];
  (data.tasks || []).forEach(function (t, i) {
    filasTar.push([txt_(t.id, 40), 'Tarea', '', txt_(t.title, 200), t.done ? 'Sí' : 'No',
                   t.done ? aTexto_(t.doneAt, tz) : '', String(i + 1), t.collapsed ? 'Sí' : 'No', aTexto_(t.createdAt, tz)]);
    (t.subtasks || []).forEach(function (s, j) {
      filasTar.push([txt_(s.id, 40), 'Subtarea', txt_(t.id, 40), txt_(s.title, 200), s.done ? 'Sí' : 'No',
                     s.done ? aTexto_(s.doneAt, tz) : '', String(j + 1), '', '']);
    });
  });

  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    escribir_(hoja_(HOJA_ACT, COL_ACT), COL_ACT.length, filasAct);
    escribir_(hoja_(HOJA_TAR, COL_TAR), COL_TAR.length, filasTar);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return true;
}

/* ================== configuración inicial (ejecutar una vez) ================== */

/**
 * Ejecútala una vez desde el editor (botón ▶ Ejecutar) para preparar la hoja:
 * crea las pestañas, los encabezados y una protección con advertencia para
 * evitar ediciones accidentales a mano.
 */
function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [[HOJA_ACT, COL_ACT], [HOJA_TAR, COL_TAR]].forEach(function (p) {
    var sh = hoja_(p[0], p[1]);
    sh.autoResizeColumns(1, p[1].length);
    if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      sh.protect()
        .setDescription('Datos de Agenda Yatzi: modifícalos desde la aplicación')
        .setWarningOnly(true);
    }
  });
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (n !== HOJA_ACT && n !== HOJA_TAR && sh.getLastRow() === 0 && sh.getLastColumn() === 0 && ss.getSheets().length > 2) {
      ss.deleteSheet(sh);
    }
  });
}

/* ================== recordatorios por correo ================== */

/**
 * Ejecútala UNA vez desde el editor (▶ Ejecutar) para encender los recordatorios.
 * Crea un disparador que revisa la hoja cada 5 minutos, aunque nadie tenga la app abierta.
 */
function activarRecordatorios() {
  desactivarRecordatorios();
  ScriptApp.newTrigger('revisarRecordatorios').timeBased().everyMinutes(5).create();
  revisarRecordatorios();
  Logger.log('Recordatorios activados. Se enviarán a ' + CORREO_RECORDATORIOS);
}

/** Apaga los recordatorios por correo. */
function desactivarRecordatorios() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarRecordatorios') ScriptApp.deleteTrigger(t);
  });
}

/** Envía un correo de prueba para confirmar que llegan los avisos. */
function probarCorreo() {
  MailApp.sendEmail({
    to: CORREO_RECORDATORIOS,
    subject: '✅ Prueba de recordatorios — ' + NOMBRE_APP,
    body: 'Si recibiste este correo, los recordatorios de ' + NOMBRE_APP + ' llegarán a esta dirección.',
    name: NOMBRE_APP
  });
  Logger.log('Correo de prueba enviado a ' + CORREO_RECORDATORIOS);
}

/** La llama el disparador cada 5 minutos. */
function revisarRecordatorios() {
  var tz = Session.getScriptTimeZone();
  var ahora = Date.now();
  var props = PropertiesService.getScriptProperties();
  var enviados = {};
  try { enviados = JSON.parse(props.getProperty('avisosEnviados') || '{}'); } catch (e) {}
  var cambios = false;

  leer_(hoja_(HOJA_ACT, COL_ACT), COL_ACT.length).forEach(function (r) {
    if (r[9] !== 'Sí') return;
    var fecha = r[1], todoElDia = r[2] === 'Sí', hora = todoElDia ? '09:00' : r[3];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{1,2}:\d{2}$/.test(hora)) return;
    var inicio = Utilities.parseDate(fecha + ' ' + hora, tz, FMT).getTime();
    var min = Number(r[10]) || 30;
    var clave = r[0] + '|' + fecha + '|' + hora + '|' + min; // si cambia la hora, se vuelve a avisar
    if (enviados[clave]) return;
    if (ahora >= inicio - min * 60000 && ahora < inicio) {
      try {
        enviarAviso_(r, Math.max(1, Math.round((inicio - ahora) / 60000)), todoElDia);
        enviados[clave] = ahora;
        cambios = true;
      } catch (e) {
        console.error('No se pudo enviar el aviso de "' + r[5] + '": ' + e);
      }
    }
  });

  if (cambios) {
    Object.keys(enviados).forEach(function (k) { if (ahora - enviados[k] > 40 * 86400000) delete enviados[k]; });
    props.setProperty('avisosEnviados', JSON.stringify(enviados));
  }
}

function enviarAviso_(r, faltan, todoElDia) {
  var titulo = r[5], fecha = r[1], ini = r[3], fin = r[4], prioridad = r[6], lugar = r[7], notas = r[8];
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var cuando;
  if (todoElDia) cuando = fecha === hoy ? 'Hoy' : 'Mañana';
  else if (faltan >= 1440) cuando = 'Mañana';
  else if (faltan >= 60) {
    var h = Math.floor(faltan / 60), m = faltan % 60;
    cuando = 'En ' + h + ' h' + (m ? ' ' + m + ' min' : '');
  } else cuando = 'En ' + faltan + ' min';
  var horario = todoElDia ? 'Todo el día' : ini + ' a ' + fin;
  var fechaLarga = fechaLarga_(fecha);
  var asunto = '⏰ ' + cuando + ': ' + titulo + (todoElDia ? ' (todo el día)' : ' (' + ini + ')');

  var url = /^https:\/\//.test(APP_URL) && APP_URL.indexOf('TU-USUARIO') < 0 ? APP_URL : '';
  var colores = { 'Altísima': '#B42318', 'Alta': '#A8460A', 'Normal': '#1C7341', 'Baja': '#1F57B5' };
  var esUrl = /^https?:\/\/\S+$/i.test(lugar);

  var filas = [['Fecha', escapar_(fechaLarga)], ['Horario', escapar_(horario)],
               ['Prioridad', '<b style="color:' + (colores[prioridad] || '#1A2140') + '">' + escapar_(prioridad) + '</b>']];
  if (lugar) filas.push(['Ubicación', esUrl ? '<a href="' + escapar_(lugar) + '">' + escapar_(lugar) + '</a>' : escapar_(lugar)]);
  if (notas) filas.push(['Notas', escapar_(notas).replace(/\n/g, '<br>')]);

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;color:#1A2140">' +
    '<div style="background:#1E2A5A;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-size:13px">' + escapar_(NOMBRE_APP) + ' · Recordatorio</div>' +
    '<div style="border:1px solid #E3E7F2;border-top:0;border-radius:0 0 12px 12px;padding:20px">' +
    '<div style="font-size:13px;color:#545C75">' + escapar_(cuando) + '</div>' +
    '<h2 style="margin:4px 0 16px;font-size:22px">' + escapar_(titulo) + '</h2>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
    filas.map(function (f) {
      return '<tr><td style="padding:6px 16px 6px 0;color:#545C75;vertical-align:top">' + f[0] + '</td><td style="padding:6px 0">' + f[1] + '</td></tr>';
    }).join('') + '</table>' +
    (url ? '<p style="margin:20px 0 0"><a href="' + escapar_(url) + '" style="background:#4F46E5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:bold;display:inline-block">Abrir la agenda</a></p>' : '') +
    '</div></div>';

  var texto = cuando + ': ' + titulo + '\n' + fechaLarga + '\n' + horario + '\nPrioridad: ' + prioridad +
              (lugar ? '\nUbicación: ' + lugar : '') + (notas ? '\nNotas: ' + notas : '') + (url ? '\n\nAbrir la agenda: ' + url : '');

  MailApp.sendEmail({ to: CORREO_RECORDATORIOS, subject: asunto, body: texto, htmlBody: html, name: NOMBRE_APP });
}

function fechaLarga_(ymd) {
  var p = ymd.split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var s = dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ================== utilidades ================== */

function hoja_(nombre, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  var enc = sh.getLastColumn() ? sh.getRange(1, 1, 1, cols.length).getDisplayValues()[0] : [];
  if (enc.join('|') !== cols.join('|')) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#F4F3EF');
    sh.setFrozenRows(1);
  }
  return sh;
}
function leer_(sh, n) {
  var filas = sh.getLastRow() - 1;
  if (filas < 1) return [];
  return sh.getRange(2, 1, filas, n).getDisplayValues().filter(function (r) { return r[0]; });
}
function escribir_(sh, n, filas) {
  var ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, n).clearContent();
  if (!filas.length) return;
  var rg = sh.getRange(2, 1, filas.length, n);
  rg.setNumberFormat('@'); // texto plano: evita que Sheets convierta fechas y horas
  rg.setValues(filas);
}
/** Texto seguro: recorta y evita que se interprete como fórmula. */
function txt_(v, max) {
  var s = String(v == null ? '' : v).slice(0, max || 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function aTexto_(ms, tz) {
  var n = Number(ms);
  return n ? Utilities.formatDate(new Date(n), tz, FMT) : '';
}
function aMs_(s, tz) {
  if (!s) return null;
  try { return Utilities.parseDate(s, tz, FMT).getTime(); } catch (e) { return null; }
}
function codigoPrioridad_(nombre) {
  for (var k in PRI) if (PRI[k] === nombre) return k;
  return 'g';
}
function escapar_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
