/**
 * ============================================================
 * WHATSAPP DATA COLLECTOR BOT
 * ============================================================
 * Descripción: Bot que recoge datos (Nombre, Edad, Serie Favorita)
 * enviados por clientes vía WhatsApp y los persiste en un CSV local.
 *
 * Stack: Node.js + whatsapp-web.js + qrcode-terminal + fs (nativo)
 * ============================================================
 */

'use strict';

// Carga las variables del archivo .env antes que cualquier otra importación
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { extractDataWithAI } = require('./aiExtractor');

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

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
// INICIALIZACIÓN DEL CLIENTE DE WHATSAPP
// ─────────────────────────────────────────────────────────────

/**
 * Crea el cliente de whatsapp-web.js.
 *
 * LocalAuth: estrategia de autenticación que guarda la sesión en disco
 * (carpeta .wwebjs_auth). Permite que el bot se reconecte automáticamente
 * sin re-escanear el QR en futuros arranques.
 *
 * puppeteer.args: optimizaciones para entornos sin GUI (headless).
 */
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '.wwebjs_auth'), // Directorio donde se almacena la sesión
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',              // Requerido en muchos entornos Linux/CI
      '--disable-setuid-sandbox',  // Seguridad de sandbox en Linux
      '--disable-dev-shm-usage',   // Evita problemas de memoria compartida
      '--disable-gpu',             // Innecesario en modo headless
    ],
  },
});

// ─────────────────────────────────────────────────────────────
// EVENTOS DEL CLIENTE
// ─────────────────────────────────────────────────────────────

/**
 * EVENTO: 'qr'
 * Se dispara cuando WhatsApp Web genera un nuevo código QR.
 * Ocurre en la primera ejecución o cuando la sesión ha expirado.
 * qrcode-terminal dibuja el QR directamente en la consola.
 */
client.on('qr', (qr) => {
  console.log('\n════════════════════════════════════════════');
  console.log('  📱 Escanea el QR con tu app de WhatsApp:');
  console.log('  (WhatsApp → Ajustes → Dispositivos vinculados)');
  console.log('════════════════════════════════════════════\n');
  qrcode.generate(qr, { small: true });
});

/**
 * EVENTO: 'ready'
 * Se dispara cuando la sesión de WhatsApp está completamente establecida
 * y el cliente está listo para enviar/recibir mensajes.
 */
client.on('ready', () => {
  console.log('\n✅ Cliente WhatsApp listo. Esperando mensajes...\n');
});

/**
 * EVENTO: 'authenticated'
 * Se dispara cuando la autenticación se completa con éxito
 * (tanto en primera autenticación como en reconexiones).
 */
client.on('authenticated', () => {
  console.log('🔐 Sesión autenticada correctamente.');
});

/**
 * EVENTO: 'auth_failure'
 * Se dispara cuando la autenticación falla (sesión inválida o expirada).
 * En este caso, se debe borrar la carpeta .wwebjs_auth y reiniciar.
 */
client.on('auth_failure', (msg) => {
  console.error('❌ Fallo de autenticación:', msg);
  console.error('💡 Solución: Borra la carpeta .wwebjs_auth y reinicia.');
  process.exit(1);
});

/**
 * EVENTO: 'disconnected'
 * Se dispara cuando la sesión se desconecta (ej: cierre desde el móvil).
 */
client.on('disconnected', (reason) => {
  console.warn('⚠️  Cliente desconectado. Razón:', reason);
});

// ─────────────────────────────────────────────────────────────
// EVENTO PRINCIPAL: PROCESAMIENTO DE MENSAJES ENTRANTES
// ─────────────────────────────────────────────────────────────

/**
 * EVENTO: 'message'
 * Se dispara por CADA mensaje que recibe el número de WhatsApp vinculado.
 * Aquí reside la lógica central del bot.
 *
 * @param {import('whatsapp-web.js').Message} msg - Objeto mensaje de whatsapp-web.js
 */
client.on('message', async (msg) => {
  // ── Guardia 1: Ignorar mensajes de grupos ─────────────────
  // msg.from en un grupo tiene formato: "XXXXXXXXXXX@g.us"
  // msg.from en chat individual tiene formato: "XXXXXXXXXXX@c.us"
  if (msg.from.endsWith('@g.us')) {
    console.log(`[IGNORADO] Mensaje de grupo: ${msg.from}`);
    return;
  }

  // ── Guardia 2: Ignorar mensajes del propio bot ────────────
  if (msg.fromMe) {
    return;
  }

  const senderPhone = msg.from.replace('@c.us', ''); // Ej: "34612345678"
  const messageBody = msg.body || '';

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
      await msg.reply(helpMessage);
    } catch (replyError) {
      console.error('❌ Error al enviar mensaje de ayuda:', replyError.message);
    }
    return;
  }

  // ── Paso 3: Datos extraídos correctamente → Loguear ──────
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
        await msg.reply(
          '⚠️ Recibimos tu información pero ocurrió un error al guardarla.\n' +
          'Por favor, inténtalo de nuevo en unos minutos.'
        );
      } catch (replyError) {
        console.error('❌ Error al enviar mensaje de error al usuario:', replyError.message);
      }
      return;
    }

    // ── Paso 5: Confirmación al usuario ──────────────────
    console.log(`💾 Datos guardados en CSV para el número: ${senderPhone}`);

    const confirmationMessage =
      '✅ *¡Datos recibidos correctamente!*\n\n' +
      `📛 *Nombre:* ${extractedData.nombre}\n` +
      `🎂 *Edad:* ${extractedData.edad}\n` +
      `📺 *Serie Favorita:* ${extractedData.serie}\n\n` +
      '_Gracias por enviarnos tu información. Nos pondremos en contacto contigo pronto._';

    try {
      await msg.reply(confirmationMessage);
      console.log(`📤 Confirmación enviada a: ${senderPhone}`);
    } catch (replyError) {
      console.error('❌ Error al enviar confirmación:', replyError.message);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// ARRANQUE DE LA APLICACIÓN
// ─────────────────────────────────────────────────────────────

console.log('🚀 Iniciando WhatsApp Data Collector Bot...');
console.log('━'.repeat(50));

// 1. Preparar el archivo CSV
initializeCsvFile();

// 2. Lanzar el cliente de WhatsApp (inicia Puppeteer + carga WA Web)
client.initialize();
