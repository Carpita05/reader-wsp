'use strict';

// ─────────────────────────────────────────────────────────────
// AI EXTRACTOR — MÓDULO CENTRAL (PATRÓN STRATEGY)
// ─────────────────────────────────────────────────────────────
//
// Este módulo actúa como punto único de entrada para la extracción
// de datos vía IA. Para cambiar de proveedor, basta con cambiar
// UNA línea: la que importa el provider.
//
// Proveedores disponibles:
//   - ./providers/gemini   → Google Gemini (activo)
//   - ./providers/ollama   → Ollama local (futuro)
//   - ./providers/openai   → OpenAI (futuro)
// ─────────────────────────────────────────────────────────────

// ⬇️  CAMBIA ESTA LÍNEA PARA CAMBIAR DE PROVEEDOR
const provider = require('./providers/gemini');

/**
 * Intenta extraer datos estructurados de un mensaje de WhatsApp usando IA.
 *
 * El proveedor debe devolver un objeto con la forma:
 *   { nombre: string|null, edad: number|null, serie: string|null }
 *
 * Si la IA falla (red, API key, JSON malformado...), esta función captura
 * el error, lo loguea y devuelve null para que el flujo principal pueda
 * enviar el mensaje de ayuda al usuario sin interrumpirse.
 *
 * @param {string} messageBody - Texto completo del mensaje de WhatsApp.
 * @returns {Promise<{ nombre: string|null, edad: number|null, serie: string|null } | null>}
 */
async function extractDataWithAI(messageBody) {
  try {
    const data = await provider.extract(messageBody);

    // Validación defensiva: el provider debe devolver un objeto no nulo
    if (!data || typeof data !== 'object') {
      console.warn('⚠️  El proveedor de IA devolvió una respuesta inesperada:', data);
      return null;
    }

    return data;
  } catch (err) {
    // Errores esperados: API key inválida, timeout, JSON malformado, red...
    console.error('❌ Error en la extracción por IA:', err.message);
    return null;
  }
}

module.exports = { extractDataWithAI };
