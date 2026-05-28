/**
 * ============================================================
 * WHATSAPP DATA COLLECTOR BOT — Evolution API Edition (v2)
 * ============================================================
 * Descripción: Bot conversacional que recoge datos de clientes
 * (Nombre, Edad, Serie Favorita, Hora de Reserva) a lo largo de
 * múltiples mensajes, manteniendo el estado de sesión por cliente.
 *
 * Arquitectura:
 *   - Evolution API (Baileys) gestiona la conexión con WhatsApp.
 *   - Este proceso recibe eventos vía Webhook HTTP (POST /webhook).
 *   - sessionStore.js mantiene el estado de conversación por usuario.
 *   - Gemini AI extrae datos en lenguaje natural de cada mensaje.
 *   - timeValidator.js valida que la hora esté en el horario de apertura.
 *
 * Flujo multi-turno:
 *   1. Llega un mensaje → se extrae lo que haya con IA.
 *   2. Se fusiona con la sesión existente del cliente.
 *   3. Si la hora está fuera de horario → se rechaza con aviso.
 *   4. Si faltan datos → se pregunta activamente el campo que falta.
 *   5. Cuando todos los campos están completos → se guarda en CSV y confirma.
 *
 * Stack: Node.js + http (nativo) + Evolution API + fs (nativo)
 * ============================================================
 */

'use strict';

// Carga las variables del archivo .env antes que cualquier otra importación
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

const { extractDataWithAI } = require('./aiExtractor');
const { validateConfig, sendTextMessage } = require('./providers/evolutionApi');
const { getSession, mergeData, isSessionComplete, clearSession, clearSessionField } = require('./sessionStore');

const { validateReservationTime, getAvailableSlotsText } = require('./timeValidator');

// ─────────────────────────────────────────────────────────────
// VALIDACIÓN TEMPRANA DE CONFIGURACIÓN (fail-fast)
// ─────────────────────────────────────────────────────────────

// Lanza una excepción y detiene el proceso si faltan variables de entorno
// críticas para comunicarse con Evolution API.
validateConfig();

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

/** Puerto en el que escuchará el servidor de webhooks. */
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT, 10) || 3000;

/** Ruta absoluta al archivo CSV de salida. */
const CSV_FILE_PATH = path.join(__dirname, 'datos_clientes.csv');

/**
 * Cabecera del CSV.
 * NOTA: Se añadió la columna HoraReserva respecto a la versión anterior.
 */
const CSV_HEADER = 'Timestamp,Telefono,Nombre,Edad,SerieFavorita,HoraReserva,ColorFavorito\r\n';

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN DEL ARCHIVO CSV
// ─────────────────────────────────────────────────────────────

/**
 * Crea el archivo CSV con la fila de cabecera si no existe.
 * Usa la flag 'wx' (write + exclusive): falla silenciosamente si el
 * archivo ya existe, evitando sobrescribir datos existentes.
 */
function initializeCsvFile() {
  fs.writeFile(CSV_FILE_PATH, CSV_HEADER, { flag: 'wx' }, (err) => {
    if (err && err.code !== 'EEXIST') {
      console.error('❌ Error al crear el archivo CSV:', err.message);
    } else if (!err) {
      console.log(`📄 Archivo CSV creado en: ${CSV_FILE_PATH}`);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN DE SANITIZACIÓN
// ─────────────────────────────────────────────────────────────

/**
 * Sanitiza un valor de texto para uso seguro en CSV.
 * Elimina comas (romperían el CSV) y saltos de línea incrustados.
 *
 * @param {string} value - Valor a sanitizar.
 * @returns {string} Valor seguro para insertar en una columna CSV.
 */
function sanitizeForCsv(value) {
  const strValue = value === null || value === undefined ? '' : String(value);
  const cleaned = strValue.replace(/[\r\n]+/g, ' ');

  if (cleaned.includes(',') || cleaned.includes('"') || cleaned.includes(' ')) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }

  return cleaned;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN DE ESCRITURA EN CSV
// ─────────────────────────────────────────────────────────────

/**
 * Construye una fila CSV y la añade al archivo de forma asíncrona.
 *
 * @param {string} telefono - Número de teléfono del remitente.
 * @param {{ nombre: string, edad: number, serie: string, hora: string }} data
 * @param {Function} callback - Se llama con (error | null) al finalizar.
 */
function appendDataToCsv(telefono, data, callback) {
  const timestamp = new Date().toISOString();

  const row = [
    sanitizeForCsv(timestamp),
    sanitizeForCsv(telefono),
    sanitizeForCsv(data.nombre),
    sanitizeForCsv(data.edad),
    sanitizeForCsv(data.serie),
    sanitizeForCsv(data.hora),
    sanitizeForCsv(data.color),
  ].join(',') + '\r\n';

  fs.appendFile(CSV_FILE_PATH, row, 'utf8', callback);
}

// ─────────────────────────────────────────────────────────────
// HELPER: GENERAR PREGUNTA SOBRE EL CAMPO QUE FALTA
// ─────────────────────────────────────────────────────────────

/**
 * Dado el estado actual de la sesión, genera el mensaje que el bot
 * debe enviar para solicitar activamente el siguiente dato que falta.
 * El orden de prioridad es: nombre → edad → hora → serie.
 *
 * @param {{ nombre, edad, serie, hora }} session
 * @param {string} [context] - Nombre del cliente si ya se conoce, para personalizar.
 * @returns {string} Mensaje de WhatsApp listo para enviar.
 */
function buildNextQuestionMessage(session) {
  const greeting = session.nombre ? `${session.nombre.split(' ')[0]}, ` : '';

  if (!session.nombre) {
    return '👋 ¡Hola! Para gestionar tu reserva necesito algunos datos.\n\n¿*Cuál es tu nombre completo?*';
  }

  if (!session.edad) {
    return `¡Perfecto, ${session.nombre.split(' ')[0]}! 😊\n\n¿*Cuántos años tienes?*`;
  }

  if (!session.hora) {
    return (
      `${greeting}¿*A qué hora quieres reservar?*\n\n` +
      `🕐 Nuestro horario de reservas:\n` +
      `   • Turno mañana: *10:30 – 14:30*\n` +
      `   • Turno tarde:  *16:30 – 20:30*`
    );
  }

  if (!session.serie) {
    return `${greeting}¡Genial! 🎉\n\n¿*Cuál es tu serie favorita?*`;
  }

  if (!session.color) {
    return `${greeting}¡Ya casi terminamos! 🎨\n\n¿*Cuál es tu color favorito?*`;
  }

  // No debería llegar aquí si isSessionComplete es correcto
  return '¿Algo más en lo que pueda ayudarte?';
}

// ─────────────────────────────────────────────────────────────
// LÓGICA PRINCIPAL DE PROCESAMIENTO DE MENSAJES (MULTI-TURNO)
// ─────────────────────────────────────────────────────────────

/**
 * Procesa un mensaje entrante de WhatsApp aplicando lógica multi-turno:
 * acumula datos parciales en la sesión del cliente y solo guarda en CSV
 * cuando todos los campos obligatorios están disponibles.
 *
 * @param {string} senderPhone  - Número del remitente (ej: "34612345678").
 * @param {string} messageBody  - Cuerpo de texto del mensaje.
 */
async function processIncomingMessage(senderPhone, messageBody) {
  console.log(`\n📨 Mensaje recibido de: ${senderPhone}`);
  console.log(`   Contenido: "${messageBody.substring(0, 100)}"`);

  // ── Paso 1: Extraer datos del mensaje actual con IA ────────
  // La IA intenta sacar cualquier dato mencionado (aunque sea parcial).
  let extractedData = null;

  try {
    console.log('🤖 Intentando extracción de datos con IA...');
    extractedData = await extractDataWithAI(messageBody);
  } catch (err) {
    console.error('❌ Error al llamar a la IA:', err.message);
  }

  // ── Paso 2: Fusionar con la sesión existente ───────────────
  // getSession crea una sesión vacía si el cliente es nuevo.
  const session = getSession(senderPhone);

  if (extractedData && typeof extractedData === 'object') {
    mergeData(senderPhone, extractedData);
    console.log('🔀 Datos fusionados en sesión:', JSON.stringify(getSession(senderPhone)));
  } else {
    console.warn('⚠️  La IA no extrajo datos útiles en este mensaje.');
  }

  // Releer sesión actualizada tras el merge
  const currentSession = getSession(senderPhone);

  // ── Paso 3: Validar hora si se acaba de establecer ─────────
  if (currentSession.hora) {
    const timeCheck = validateReservationTime(currentSession.hora);
    if (!timeCheck.valid) {
      // La hora está fuera del horario de apertura: avisar y limpiar el campo
      console.warn(`⚠️  Hora inválida detectada: ${currentSession.hora}`);
      // Eliminamos la hora inválida para que el bot vuelva a preguntar
      clearSessionField(senderPhone, 'hora');


      try {
        await sendTextMessage(senderPhone, timeCheck.reason);
      } catch (replyError) {
        console.error('❌ Error al enviar mensaje de hora inválida:', replyError.message);
      }
      return;
    }
  }

  // ── Paso 4: ¿Sesión completa? → Guardar y confirmar ───────
  if (isSessionComplete(senderPhone)) {
    const data = getSession(senderPhone);
    console.log('✅ Sesión completa. Guardando en CSV...');
    console.log(`   Nombre: ${data.nombre} | Edad: ${data.edad} | Hora: ${data.hora} | Serie: ${data.serie}`);

    appendDataToCsv(senderPhone, data, async (writeError) => {
      if (writeError) {
        console.error('❌ Error al escribir en CSV:', writeError.message);
        try {
          await sendTextMessage(
            senderPhone,
            '⚠️ Recibimos tu información pero ocurrió un error al guardarla.\n' +
            'Por favor, inténtalo de nuevo en unos minutos.'
          );
        } catch (replyError) {
          console.error('❌ Error al enviar mensaje de error al usuario:', replyError.message);
        }
        return;
      }

      // ── Limpiar sesión y confirmar ──────────────────────────
      clearSession(senderPhone);
      console.log(`💾 Datos guardados en CSV para: ${senderPhone}`);

      const confirmationMessage =
        '✅ *¡Reserva confirmada!*\n\n' +
        `📛 *Nombre:*          ${data.nombre}\n` +
        `🎂 *Edad:*            ${data.edad} años\n` +
        `🕐 *Hora reserva:*    ${data.hora}\n` +
        `📺 *Serie favorita:*  ${data.serie}\n` +
        `🎨 *Color favorito:*  ${data.color}\n\n` +
        '_¡Gracias! Nos vemos pronto. 🎉_';

      try {
        await sendTextMessage(senderPhone, confirmationMessage);
        console.log(`📤 Confirmación enviada a: ${senderPhone}`);
      } catch (replyError) {
        console.error('❌ Error al enviar confirmación:', replyError.message);
      }
    });

    return;
  }

  // ── Paso 5: Sesión incompleta → Preguntar el campo que falta
  const question = buildNextQuestionMessage(currentSession);
  console.log(`❓ Datos incompletos. Preguntando a ${senderPhone}: "${question.substring(0, 60)}..."`);

  try {
    await sendTextMessage(senderPhone, question);
  } catch (replyError) {
    console.error('❌ Error al enviar pregunta al usuario:', replyError.message);
  }
}

// ─────────────────────────────────────────────────────────────
// SERVIDOR WEBHOOK HTTP
// ─────────────────────────────────────────────────────────────

/**
 * Lee el body completo de una request HTTP como string.
 *
 * @param {http.IncomingMessage} req
 * @returns {Promise<string>}
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Handler principal del servidor HTTP.
 *
 * Evolution API enviará eventos POST a este endpoint cada vez que
 * ocurra un evento en la instancia (mensaje recibido, estado cambiado, etc.).
 *
 * Estructura del payload de Evolution API v2 (evento MESSAGES_UPSERT):
 * {
 *   "event": "messages.upsert",
 *   "instance": "nombre_instancia",
 *   "data": {
 *     "key": { "remoteJid": "34612345678@s.whatsapp.net", "fromMe": false, ... },
 *     "message": { "conversation": "Hola!" }
 *   }
 * }
 */
async function webhookHandler(req, res) {
  const requestId = Date.now().toString(36).toUpperCase();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Webhook][${requestId}] 📡 Petición entrante: ${req.method} ${req.url}`);
  console.log(`[Webhook][${requestId}]    IP: ${req.socket?.remoteAddress ?? 'desconocida'}`);

  // Endpoint de salud — útil para comprobar que el servidor está vivo
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime().toFixed(1) + 's' }));
    console.log(`[Webhook][${requestId}] ✅ /health respondido OK`);
    return;
  }

  // Solo procesamos peticiones POST a /webhook
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    console.log(`[Webhook][${requestId}] ❌ Ruta no encontrada: ${req.method} ${req.url}`);
    return;
  }

  let rawBody;
  let payload;
  try {
    rawBody = await readRequestBody(req);
    console.log(`[Webhook][${requestId}] 📦 Body crudo recibido (primeros 500 chars):`);
    console.log(rawBody.substring(0, 500));
    payload = JSON.parse(rawBody);
  } catch (_err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    console.error(`[Webhook][${requestId}] ❌ Body inválido o no es JSON:`, rawBody?.substring(0, 200));
    return;
  }

  // Respuesta 200 inmediata: Evolution API necesita un ACK rápido.
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'received' }));

  // ── Filtros de eventos ────────────────────────────────────
  const event = payload?.event;
  console.log(`[Webhook][${requestId}] 🏷️  Evento recibido: "${event}"`);

  if (event !== 'messages.upsert') {
    console.log(`[Webhook][${requestId}] ⏩ Evento ignorado (no es messages.upsert).`);
    return;
  }

  // Evolution API v2 puede enviar data como objeto directo o envuelto en array
  let data = payload?.data;
  if (Array.isArray(data)) {
    console.log(`[Webhook][${requestId}] ℹ️  data es un array con ${data.length} elemento(s). Usando el primero.`);
    data = data[0];
  }

  console.log(`[Webhook][${requestId}] 🔍 data.key:`, JSON.stringify(data?.key));
  console.log(`[Webhook][${requestId}] 🔍 data.message:`, JSON.stringify(data?.message));

  const remoteJid = data?.key?.remoteJid ?? '';
  const fromMe = data?.key?.fromMe ?? false;

  console.log(`[Webhook][${requestId}]    remoteJid: ${remoteJid}`);
  console.log(`[Webhook][${requestId}]    fromMe:    ${fromMe}`);

  // Ignorar mensajes enviados por el propio bot
  if (fromMe) {
    console.log(`[Webhook][${requestId}] ⏩ Mensaje enviado por el bot (fromMe=true). Ignorado.`);
    return;
  }

  // Ignorar mensajes de grupos (el JID de grupo termina en @g.us)
  if (remoteJid.endsWith('@g.us')) {
    console.log(`[Webhook][${requestId}] ⏩ Mensaje de grupo ignorado: ${remoteJid}`);
    return;
  }

  // Extraer el número limpio (quitando @s.whatsapp.net o @c.us)
  const senderPhone = remoteJid.replace(/@[a-z.]+$/i, '');

  // Extraer el texto del mensaje (puede venir en varias propiedades)
  const messageBody =
    data?.message?.conversation ??
    data?.message?.extendedTextMessage?.text ??
    data?.message?.imageMessage?.caption ??
    data?.message?.videoMessage?.caption ??
    '';

  console.log(`[Webhook][${requestId}]    senderPhone: ${senderPhone}`);
  console.log(`[Webhook][${requestId}]    messageBody: "${messageBody}"`);

  // Ignorar mensajes sin texto (imágenes, stickers, etc. sin caption)
  if (!messageBody.trim()) {
    console.log(`[Webhook][${requestId}] ⏩ Mensaje vacío o sin texto procesable. Ignorado.`);
    console.log(`[Webhook][${requestId}]    Claves disponibles en data.message:`, Object.keys(data?.message ?? {}));
    return;
  }

  console.log(`[Webhook][${requestId}] ➡️  Procesando mensaje de ${senderPhone}...`);

  // Procesar de forma asíncrona sin bloquear el servidor
  processIncomingMessage(senderPhone, messageBody).catch((err) => {
    console.error(`[Webhook][${requestId}] ❌ Error crítico al procesar mensaje:`, err.message);
  });
}

// ─────────────────────────────────────────────────────────────
// ARRANQUE DE LA APLICACIÓN
// ─────────────────────────────────────────────────────────────

console.log('🚀 Iniciando WhatsApp Data Collector Bot (Evolution API) v2...');
console.log('━'.repeat(55));

// 1. Preparar el archivo CSV
initializeCsvFile();

// 2. Levantar el servidor de webhooks
const server = http.createServer(webhookHandler);

server.listen(WEBHOOK_PORT, () => {
  console.log(`✅ Servidor de webhooks escuchando en: http://localhost:${WEBHOOK_PORT}/webhook`);
  console.log('');
  console.log('📋 Configuración activa:');
  console.log(`   Evolution API URL:      ${process.env.EVOLUTION_BASE_URL}`);
  console.log(`   Instancia:              ${process.env.EVOLUTION_INSTANCE_NAME}`);
  console.log(`   Puerto webhook local:   ${WEBHOOK_PORT}`);
  console.log('');
  console.log('⏳ Esperando eventos de Evolution API...');
  console.log('━'.repeat(55));
});

// Manejo limpio de errores del servidor (ej: puerto ya en uso)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ El puerto ${WEBHOOK_PORT} ya está en uso. Cambia WEBHOOK_PORT en .env.`);
  } else {
    console.error('❌ Error en el servidor HTTP:', err.message);
  }
  process.exit(1);
});
