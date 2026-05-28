'use strict';

const { GoogleGenAI } = require('@google/genai');

// ─────────────────────────────────────────────────────────────
// PROMPT DEL SISTEMA
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Rol: Eres un asistente experto en extracción de datos estructurados. Tu única tarea es analizar el mensaje que proporciona el usuario y extraer los datos clave requeridos.

Objetivo: Extraer el "Nombre", la "Edad" (como número entero), la "Serie Favorita", la "Hora de Reserva" y el "Color Favorito" del texto proporcionado.

Reglas para la Hora de Reserva:
- El negocio solo abre en dos turnos: 10:30–14:30 (mañana) y 16:30–20:30 (tarde).
- Si el usuario menciona una hora sin indicar AM/PM (ej: "a las 5", "para las 6", "a las 7"):
  * Si el número está entre 1 y 9: interpretar como tarde (sumar 12h). Ej: "las 5" → "17:00", "las 6" → "18:00".
  * Si el número está entre 10 y 14: interpretar como mañana. Ej: "las 11" → "11:00".
  * Si el usuario dice explícitamente "de la mañana" o "AM", usar horario AM.
  * Si el usuario dice explícitamente "de la tarde", "de la noche" o "PM", usar horario PM.
- Normaliza siempre al formato "HH:MM" en 24 horas. Ej: "17:00", "10:30", "20:00".
- Si la hora mencionada está claramente fuera de ambos turnos (ej: "a las 3 de la mañana"), devuelve null para hora_reserva.
- Si no se menciona ninguna hora, devuelve null.
- Si el usuario cambia la hora (ej: "mejor a las 6"), extrae la nueva hora.

Reglas estrictas de salida:
- Debes responder ÚNICA Y EXCLUSIVAMENTE con un objeto JSON válido.
- No incluyas saludos, ni explicaciones, ni texto introductorio o de despedida.
- No envuelvas el resultado en bloques de código Markdown (no uses \`\`\`json ni \`\`\`). Devuelve solo el texto plano del JSON.
- Si el usuario no menciona alguno de los datos, el valor para esa clave debe ser obligatoriamente null.
- No inventes ni deduzcas información que no esté explícitamente en el texto.

Estructura exacta del JSON que debes devolver:
{"nombre": "string o null", "edad": numero o null, "serie": "string o null", "hora_reserva": "HH:MM o null", "color_favorito": "string o null"}`;

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL DE EXTRACCIÓN
// ─────────────────────────────────────────────────────────────

/**
 * Envía el cuerpo del mensaje a Gemini 2.5 Flash y devuelve los datos extraídos.
 * Usa responseMimeType 'application/json' para forzar salida JSON nativa.
 *
 * @param {string} messageBody - Texto del mensaje de WhatsApp a analizar.
 * @returns {Promise<{ nombre: string|null, edad: number|null, serie: string|null, hora: string|null, color: string|null }>}
 * @throws {Error} Si la API falla o la respuesta no es JSON válido.
 */
async function extract(messageBody) {
  console.log('[Gemini] 🔑 Verificando GEMINI_API_KEY...');
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está definida en las variables de entorno.');
  }
  console.log('[Gemini] ✅ API Key presente (primeros 8 chars):', process.env.GEMINI_API_KEY.substring(0, 8) + '...');

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  console.log('[Gemini] 📤 Enviando mensaje a Gemini 2.5 Flash...');
  console.log('[Gemini]    Mensaje a analizar:', JSON.stringify(messageBody));

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: messageBody,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      // Fuerza al modelo a devolver JSON plano, sin envoltorios Markdown
      responseMimeType: 'application/json',
      // Temperatura 0: respuestas deterministas y precisas (sin "creatividad")
      temperature: 0,
    },
  });

  console.log('[Gemini] 📥 Respuesta recibida. Tipo de response.text:', typeof response.text);

  // El SDK @google/genai puede devolver `text` como propiedad string O como método.
  // Normalizamos aquí para cubrir ambos casos.
  let rawText;
  if (typeof response.text === 'function') {
    rawText = response.text();
    console.log('[Gemini] ℹ️  response.text era una función, se llamó como método.');
  } else {
    rawText = response.text;
  }

  console.log('[Gemini] 📄 Texto raw devuelto por Gemini:', rawText);

  if (!rawText || rawText.trim() === '') {
    throw new Error('Gemini devolvió una respuesta vacía.');
  }

  // Limpiamos posibles envoltorios ```json ``` por si el modelo los añade igualmente
  const cleanedText = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Parseamos y validamos que sea un objeto con las claves esperadas
  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (parseErr) {
    console.error('[Gemini] ❌ Error al parsear JSON. Texto recibido:', cleanedText);
    throw new Error(`JSON inválido recibido de Gemini: ${parseErr.message}`);
  }

  console.log('[Gemini] ✅ Datos extraídos por IA:', JSON.stringify(parsed));

  return {
    nombre: parsed.nombre ?? null,
    edad: typeof parsed.edad === 'number' ? parsed.edad : null,
    serie: parsed.serie ?? null,
    // hora_reserva viene del JSON del modelo; lo mapeamos a "hora" para consistencia interna
    hora: parsed.hora_reserva ?? null,
    color: parsed.color_favorito ?? null,
  };
}

module.exports = { extract };
