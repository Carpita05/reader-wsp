/**
 * ============================================================
 * WHATSAPP DATA COLLECTOR BOT — Evolution API Edition
 * ============================================================
 * Descripción: Bot que recoge datos (Nombre, Edad, Serie Favorita)
 * enviados por clientes vía WhatsApp y los persiste en un CSV local.
 *
 * Arquitectura:
 *   - Evolution API (Baileys) gestiona la conexión con WhatsApp.
 *   - Este proceso recibe eventos vía Webhook HTTP (POST /webhook).
 *   - La lógica de extracción (Regex + IA fallback) se mantiene intacta.
 *
 * Stack: Node.js + http (nativo) + Evolution API + fs (nativo)
 * ============================================================
 */

'use strict';

// Carga las variables del archivo .env antes que cualquier otra importación
require('dotenv').config();

const http = require('http');
const fs   = require('fs');
const path = require('path');

const { extractDataWithAI }                       = require('./aiExtractor');
const { validateConfig, sendTextMessage }         = require('./providers/evolutionApi');

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

/** Cabecera del CSV. Se escribe SOLO si el archivo no existe aún. */
const CSV_HEADER = 'Timestamp,Telefono,Nombre,Edad,SerieFavorita\r\n';

/**
 * Expresión Regular principal para validar y capturar los tres campos.
 *
 * Desglose del patrón:
 *   Nombre:\s*          → Literal "Nombre:" seguido de cero o más espacios
 *   (.+?)               → Grupo 1 (Nombre): captura uno o más caracteres de forma no greedy
 *   [\r\n]+             → Uno o más saltos de línea (compatible \r\n, \n, \r)
 *   Edad:\s*            → Literal "Edad:" seguido de cero o más espacios
 *   (\d+)               → Grupo 2 (Edad): captura solo dígitos numéricos
 *   [\r\n]+             → Uno o más saltos de línea
 *   Serie Favorita:\s*  → Literal "Serie Favorita:" seguido de cero o más espacios
 *   (.+)                → Grupo 3 (Serie): captura el resto de la línea
 *
 * Flags: 'i' → case-insensitive (acepta "nombre:", "NOMBRE:", etc.)
 */
const DATA_REGEX = /Nombre:\s*(.+?)[\r\n]+Edad:\s*(\d+)[\r\n]+Serie Favorita:\s*(.+)/i;

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
      // Solo registra error si NO es el error esperado "archivo ya existe"
      console.error('❌ Error al crear el archivo CSV:', err.message);
    } else if (!err) {
      console.log(`📄 Archivo CSV creado en: ${CSV_FILE_PATH}`);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN DE EXTRACCIÓN DE DATOS (REGEX)
// ─────────────────────────────────────────────────────────────

/**
 * Aplica la expresión regular al texto del mensaje e intenta extraer
 * los tres campos de datos.
 *
 * @param {string} messageBody - Cuerpo completo del mensaje de WhatsApp.
 * @returns {{ nombre: string, edad: string, serie: string } | null}
 *   Objeto con los datos extraídos, o null si el formato no coincide.
 */
function extractDataFromMessage(messageBody) {
  const match = messageBody.match(DATA_REGEX);

  // Si no hay coincidencia, el mensaje no tiene el formato esperado
  if (!match) {
    return null;
  }

  // match[0] → cadena completa que coincidió
  // match[1] → Grupo 1: Nombre
  // match[2] → Grupo 2: Edad
  // match[3] → Grupo 3: Serie Favorita
  return {
    nombre: match[1].trim(),
    edad:   match[2].trim(),
    serie:  match[3].trim(),
  };
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN DE SANITIZACIÓN
// ─────────────────────────────────────────────────────────────

/**
 * Sanitiza un valor de texto para uso seguro en CSV.
 * Elimina comas (romperían el CSV) y saltos de línea incrustados.
 * Si el valor contiene espacios u otros caracteres especiales,
 * lo envuelve en comillas dobles según el estándar RFC 4180.
 *
 * @param {string} value - Valor a sanitizar.
 * @returns {string} Valor seguro para insertar en una columna CSV.
 */
function sanitizeForCsv(value) {
  // Asegura que el valor sea un string (la IA devuelve la edad como número)
  // Si es null o undefined, lo deja en blanco
  const strValue = value === null || value === undefined ? '' : String(value);

  // Elimina saltos de línea incrustados en el valor
  const cleaned = strValue.replace(/[\r\n]+/g, ' ');

  // Si el valor contiene comas, comillas o espacios, se cita
  if (cleaned.includes(',') || cleaned.includes('"') || cleaned.includes(' ')) {
    // Escapa las comillas dobles internas duplicándolas (estándar CSV)
    return `"${cleaned.replace(/"/g, '""')}"`;
  }

  return cleaned;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN DE ESCRITURA EN CSV
// ─────────────────────────────────────────────────────────────

/**
 * Construye una fila CSV y la añade al archivo de forma asíncrona.
 * Usa appendFile para NO sobrescribir datos preexistentes.
 *
 * @param {string} telefono - Número de teléfono del remitente.
 * @param {{ nombre: string, edad: string, serie: string }} data - Datos extraídos.
 * @param {Function} callback - Se llama con (error | null) al finalizar.
 */
function appendDataToCsv(telefono, data, callback) {
  const timestamp = new Date().toISOString(); // Ej: "2025-07-15T10:30:05.123Z"

  // Construir fila: cada campo pasa por sanitizeForCsv
  const row = [
    sanitizeForCsv(timestamp),
    sanitizeForCsv(telefono),
    sanitizeForCsv(data.nombre),
    sanitizeForCsv(data.edad),
    sanitizeForCsv(data.serie),
  ].join(',') + '\r\n';

  fs.appendFile(CSV_FILE_PATH, row, 'utf8', callback);
}

// ─────────────────────────────────────────────────────────────
// LÓGICA DE PROCESAMIENTO DE MENSAJES
// ─────────────────────────────────────────────────────────────

/**
 * Procesa un mensaje entrante de WhatsApp recibido vía webhook de Evolution API.
 * Replica exactamente el flujo que antes gestionaba el evento 'message' de whatsapp-web.js.
 *
 * @param {string} senderPhone  - Número del remitente (formato: "34612345678").
 * @param {string} messageBody  - Cuerpo de texto del mensaje.
 */
async function processIncomingMessage(senderPhone, messageBody) {
  console.log(`\n📨 Mensaje recibido de: ${senderPhone}`);
  console.log(`   Contenido: "${messageBody.substring(0, 80)}..."`);

  // ── Paso 1: Intentar extraer datos con Regex ──────────────
  // Camino rápido, gratuito e instantáneo para el formato estándar.
  let extractedData = extractDataFromMessage(messageBody);

  // ── Paso 2: Fallback → Extracción con IA ──────────────────
  // Si la Regex falla (lenguaje natural libre, campos desordenados...),
  // se delega en el modelo de IA como segundo intento.
  if (!extractedData) {
    console.log('🤖 Regex sin coincidencia. Intentando extracción con IA...');
    const aiData = await extractDataWithAI(messageBody);

    // Solo se acepta si la IA extrajo los 3 campos obligatorios
    if (aiData && aiData.nombre && aiData.edad !== null && aiData.serie) {
      extractedData = aiData;
      console.log('✅ Datos extraídos por IA (fallback).');
    } else {
      console.warn('⚠️  La IA tampoco pudo extraer los 3 campos. Enviando ayuda.');
    }
  }

  // ── Paso 3: Ningún método pudo extraer datos → Pedir formato ──
  if (!extractedData) {
    console.warn(`⚠️  Formato no reconocido. Enviando instrucciones a ${senderPhone}`);

    const helpMessage =
      '❌ *No pude entender tu mensaje.*\n\n' +
      'Por favor, envía tu información con el siguiente formato:\n\n' +
      '```\n' +
      'Nombre: Tu Nombre Completo\n' +
      'Edad: Tu Edad\n' +
      'Serie Favorita: Nombre de la Serie\n' +
      '```\n\n' +
      '📝 *Ejemplo:*\n' +
      '```\n' +
      'Nombre: Laura García\n' +
      'Edad: 29\n' +
      'Serie Favorita: Breaking Bad\n' +
      '```';

    try {
      await sendTextMessage(senderPhone, helpMessage);
    } catch (replyError) {
      console.error('❌ Error al enviar mensaje de ayuda:', replyError.message);
    }
    return;
  }

  // ── Datos extraídos correctamente → Loguear ──────────────
  console.log('✅ Datos extraídos:');
  console.log(`   Nombre:         ${extractedData.nombre}`);
  console.log(`   Edad:           ${extractedData.edad}`);
  console.log(`   Serie Favorita: ${extractedData.serie}`);

  // ── Paso 4: Persistir en CSV ──────────────────────────────
  appendDataToCsv(senderPhone, extractedData, async (writeError) => {
    if (writeError) {
      console.error('❌ Error al escribir en CSV:', writeError.message);

      // Notificar al usuario que algo falló (sin exponer detalles técnicos)
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

    // ── Paso 5: Confirmación al usuario ──────────────────────
    console.log(`💾 Datos guardados en CSV para el número: ${senderPhone}`);

    const confirmationMessage =
      '✅ *¡Datos recibidos correctamente!*\n\n' +
      `📛 *Nombre:* ${extractedData.nombre}\n` +
      `🎂 *Edad:* ${extractedData.edad}\n` +
      `📺 *Serie Favorita:* ${extractedData.serie}\n\n` +
      '_Gracias por enviarnos tu información. Nos pondremos en contacto contigo pronto._';

    try {
      await sendTextMessage(senderPhone, confirmationMessage);
      console.log(`📤 Confirmación enviada a: ${senderPhone}`);
    } catch (replyError) {
      console.error('❌ Error al enviar confirmación:', replyError.message);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// SERVIDOR WEBHOOK HTTP
// ─────────────────────────────────────────────────────────────

/**
 * Lee el body completo de una request HTTP como string.
 * Necesario porque http nativo no parsea el body automáticamente.
 *
 * @param {http.IncomingMessage} req
 * @returns {Promise<string>}
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end',  () => resolve(body));
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
  // Solo procesamos peticiones POST a /webhook
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  let payload;
  try {
    const rawBody = await readRequestBody(req);
    payload = JSON.parse(rawBody);
  } catch (_err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  // Respuesta 200 inmediata: Evolution API necesita un ACK rápido.
  // El procesamiento real ocurre de forma asíncrona después del reply.
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'received' }));

  // ── Filtros de eventos ────────────────────────────────────

  // Solo nos interesan los eventos de mensajes nuevos
  const event = payload?.event;
  if (event !== 'messages.upsert') {
    return;
  }

  const data       = payload?.data;
  const remoteJid  = data?.key?.remoteJid ?? '';
  const fromMe     = data?.key?.fromMe ?? false;

  // Ignorar mensajes enviados por el propio bot
  if (fromMe) return;

  // Ignorar mensajes de grupos (el JID de grupo termina en @g.us)
  if (remoteJid.endsWith('@g.us')) {
    console.log(`[IGNORADO] Mensaje de grupo: ${remoteJid}`);
    return;
  }

  // Extraer el número limpio (quitando @s.whatsapp.net o @c.us)
  const senderPhone = remoteJid.replace(/@[a-z.]+$/i, '');

  // Extraer el texto del mensaje (puede venir en varias propiedades según el tipo)
  const messageBody =
    data?.message?.conversation               ?? // Texto plano
    data?.message?.extendedTextMessage?.text  ?? // Respuesta con cita
    '';

  // Ignorar mensajes sin texto (imágenes, stickers, etc. sin caption)
  if (!messageBody.trim()) {
    return;
  }

  // Procesar de forma asíncrona sin bloquear el servidor
  processIncomingMessage(senderPhone, messageBody).catch((err) => {
    console.error('❌ Error crítico al procesar mensaje:', err.message);
  });
}

// ─────────────────────────────────────────────────────────────
// ARRANQUE DE LA APLICACIÓN
// ─────────────────────────────────────────────────────────────

console.log('🚀 Iniciando WhatsApp Data Collector Bot (Evolution API)...');
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
