/**
 * ============================================================
 * EVOLUTION API — PROVEEDOR DE MENSAJERÍA HTTP
 * ============================================================
 * Módulo responsable de toda la comunicación con la instancia
 * de Evolution API. Reemplaza por completo a whatsapp-web.js.
 *
 * Evolution API actúa como un microservicio independiente que
 * gestiona la conexión con Baileys (y por tanto con WhatsApp).
 * Este módulo sólo necesita conocer la URL base, la API Key y
 * el nombre de instancia para operar.
 * ============================================================
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN — Leída desde variables de entorno
// ─────────────────────────────────────────────────────────────

const EVOLUTION_BASE_URL    = process.env.EVOLUTION_BASE_URL;
const EVOLUTION_API_KEY     = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE    = process.env.EVOLUTION_INSTANCE_NAME;

/**
 * Valida al arrancar que las variables de entorno críticas estén presentes.
 * Falla rápido (fail-fast) antes de recibir cualquier mensaje.
 */
function validateConfig() {
  const missing = [];
  if (!EVOLUTION_BASE_URL)  missing.push('EVOLUTION_BASE_URL');
  if (!EVOLUTION_API_KEY)   missing.push('EVOLUTION_API_KEY');
  if (!EVOLUTION_INSTANCE)  missing.push('EVOLUTION_INSTANCE_NAME');

  if (missing.length > 0) {
    throw new Error(
      `❌ Faltan variables de entorno para Evolution API: ${missing.join(', ')}\n` +
      '   Revisa tu archivo .env y asegúrate de definirlas.'
    );
  }
}

// ─────────────────────────────────────────────────────────────
// UTILIDAD — Formateo de número de teléfono
// ─────────────────────────────────────────────────────────────

/**
 * Normaliza un número de teléfono al formato requerido por Evolution API.
 *
 * Evolution API acepta el número en formato internacional sin el símbolo +
 * y sin @c.us. Ejemplos válidos: "34612345678", "15551234567".
 *
 * @param {string} rawPhone - Número recibido del webhook (puede llevar @c.us).
 * @returns {string} Número limpio listo para enviar a la API.
 */
function formatPhoneNumber(rawPhone) {
  return rawPhone
    .replace('@c.us', '')   // Quita el sufijo de WhatsApp si viene del webhook
    .replace(/\D/g, '');    // Elimina cualquier carácter no numérico (+, -, espacios)
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL — Enviar mensaje de texto
// ─────────────────────────────────────────────────────────────

/**
 * Envía un mensaje de texto plano a un contacto a través de Evolution API.
 *
 * Endpoint utilizado: POST /message/sendText/{instanceName}
 * Documentación: https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
 *
 * @param {string} to      - Número de teléfono del destinatario (se auto-formatea).
 * @param {string} text    - Cuerpo del mensaje a enviar.
 * @returns {Promise<object>} Respuesta JSON de Evolution API.
 * @throws {Error} Si la petición HTTP falla o la API devuelve un error.
 */
async function sendTextMessage(to, text) {
  const phone   = formatPhoneNumber(to);
  const endpoint = `${EVOLUTION_BASE_URL}/message/sendText/${EVOLUTION_INSTANCE}`;

  const payload = {
    number : phone,
    text   : text,
  };

  try {
    const response = await fetch(endpoint, {
      method  : 'POST',
      headers : {
        'Content-Type' : 'application/json',
        'apikey'       : EVOLUTION_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    // Intentamos leer el cuerpo incluso si es un error HTTP
    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `Evolution API respondió con ${response.status}: ${JSON.stringify(responseBody)}`
      );
    }

    return responseBody;

  } catch (err) {
    // Relanzamos con contexto adicional para que el llamador pueda loguear adecuadamente
    throw new Error(`[EvolutionAPI] sendTextMessage falló → ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN AUXILIAR — Enviar imagen / multimedia
// ─────────────────────────────────────────────────────────────

/**
 * Envía una imagen (u otro archivo multimedia) a un contacto.
 *
 * Endpoint utilizado: POST /message/sendMedia/{instanceName}
 * La imagen puede enviarse como URL pública o como Base64.
 *
 * @param {string} to          - Número de teléfono del destinatario.
 * @param {string} mediaUrl    - URL pública de la imagen a enviar.
 * @param {string} [caption]   - Pie de foto opcional.
 * @param {string} [mediaType] - Tipo MIME del medio ('image', 'video', 'audio', 'document').
 * @returns {Promise<object>} Respuesta JSON de Evolution API.
 * @throws {Error} Si la petición HTTP falla o la API devuelve un error.
 */
async function sendImageToContact(to, mediaUrl, caption = '', mediaType = 'image') {
  const phone    = formatPhoneNumber(to);
  const endpoint = `${EVOLUTION_BASE_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`;

  const payload = {
    number    : phone,
    mediatype : mediaType,  // 'image' | 'video' | 'audio' | 'document'
    mimetype  : 'image/jpeg',
    caption   : caption,
    media     : mediaUrl,   // URL pública o string Base64
  };

  try {
    const response = await fetch(endpoint, {
      method  : 'POST',
      headers : {
        'Content-Type' : 'application/json',
        'apikey'       : EVOLUTION_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `Evolution API respondió con ${response.status}: ${JSON.stringify(responseBody)}`
      );
    }

    return responseBody;

  } catch (err) {
    throw new Error(`[EvolutionAPI] sendImageToContact falló → ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTACIONES
// ─────────────────────────────────────────────────────────────

module.exports = {
  validateConfig,
  formatPhoneNumber,
  sendTextMessage,
  sendImageToContact,
};
