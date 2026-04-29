'use strict';

const { GoogleGenAI } = require('@google/genai');

// ─────────────────────────────────────────────────────────────
// PROMPT DEL SISTEMA
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Rol: Eres un asistente experto en extracción de datos estructurados. Tu única tarea es analizar el mensaje que proporciona el usuario y extraer los datos clave requeridos.

Objetivo: Extraer el "Nombre", la "Edad" (como número entero) y la "Serie Favorita" del texto proporcionado.

Reglas estrictas de salida:
- Debes responder ÚNICA Y EXCLUSIVAMENTE con un objeto JSON válido.
- No incluyas saludos, ni explicaciones, ni texto introductorio o de despedida.
- No envuelvas el resultado en bloques de código Markdown (no uses \`\`\`json ni \`\`\`). Devuelve solo el texto plano del JSON.
- Si el usuario no menciona alguno de los datos, el valor para esa clave debe ser obligatoriamente null.
- No inventes ni deduzcas información que no esté explícitamente en el texto.

Estructura exacta del JSON que debes devolver:
{"nombre": "string o null", "edad": numero o null, "serie": "string o null"}`;

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL DE EXTRACCIÓN
// ─────────────────────────────────────────────────────────────

/**
 * Envía el cuerpo del mensaje a Gemini 2.5 Flash y devuelve los datos extraídos.
 * Usa responseMimeType 'application/json' para forzar salida JSON nativa.
 *
 * @param {string} messageBody - Texto del mensaje de WhatsApp a analizar.
 * @returns {Promise<{ nombre: string|null, edad: number|null, serie: string|null }>}
 * @throws {Error} Si la API falla o la respuesta no es JSON válido.
 */
async function extract(messageBody) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está definida en las variables de entorno.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

  const rawText = response.text;

  // Parseamos y validamos que sea un objeto con las claves esperadas
  const parsed = JSON.parse(rawText);

  return {
    nombre: parsed.nombre ?? null,
    edad:   typeof parsed.edad === 'number' ? parsed.edad : null,
    serie:  parsed.serie ?? null,
  };
}

module.exports = { extract };
