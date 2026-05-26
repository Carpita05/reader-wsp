'use strict';

/**
 * ============================================================
 * SESSION STORE — Gestión de sesiones de conversación
 * ============================================================
 * Mantiene el estado parcial de cada cliente mientras recopila
 * sus datos a lo largo de múltiples mensajes.
 *
 * Características:
 *  - Persistencia en sessions.json (sobrevive al reinicio del bot)
 *  - Timeout configurable (limpieza de sesiones inactivas)
 *  - mergeData: actualiza solo los campos con nuevo valor
 *    (permite al usuario corregir un dato enviando un nuevo mensaje)
 * ============================================================
 */

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

/** Ruta del archivo de persistencia de sesiones. */
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');

/** Tiempo de inactividad en ms antes de descartar una sesión incompleta. */
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos

/** Intervalo de limpieza de sesiones expiradas. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // cada 5 minutos

// ─────────────────────────────────────────────────────────────
// CARGA INICIAL DESDE DISCO
// ─────────────────────────────────────────────────────────────

/**
 * Mapa en memoria: telefono (string) → objeto de sesión.
 *
 * Estructura de cada sesión:
 * {
 *   nombre:       string | null,
 *   edad:         number | null,
 *   serie:        string | null,
 *   hora:         string | null,   → "HH:MM" en formato 24h
 *   lastActivity: number           → timestamp ms (Date.now())
 * }
 */
let sessions = new Map();

/**
 * Carga las sesiones guardadas desde el archivo JSON.
 * Si el archivo no existe o está corrupto, arranca con sesiones vacías.
 */
function loadSessionsFromDisk() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw  = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const data = JSON.parse(raw);
      // El JSON guarda un objeto plano; lo convertimos de vuelta a Map
      sessions = new Map(Object.entries(data));
      console.log(`📂 Sesiones cargadas desde disco: ${sessions.size} sesión(es) activa(s).`);
    }
  } catch (err) {
    console.error('⚠️  No se pudieron cargar las sesiones previas:', err.message);
    sessions = new Map();
  }
}

// ─────────────────────────────────────────────────────────────
// PERSISTENCIA EN DISCO
// ─────────────────────────────────────────────────────────────

/**
 * Serializa el Map de sesiones a JSON y lo guarda en disco.
 * Se llama después de cada modificación relevante.
 */
function persistSessionsToDisk() {
  try {
    // Convertir Map → objeto plano para JSON.stringify
    const data = Object.fromEntries(sessions);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Error al persistir sesiones en disco:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene la sesión de un cliente. Si no existe, la crea vacía.
 *
 * @param {string} phone - Número de teléfono del cliente.
 * @returns {{ nombre: string|null, edad: number|null, serie: string|null, hora: string|null }}
 */
function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      nombre:       null,
      edad:         null,
      serie:        null,
      hora:         null,
      color:        null,
      lastActivity: Date.now(),
    });
    persistSessionsToDisk();
  }
  return sessions.get(phone);
}

/**
 * Fusiona los nuevos datos extraídos en la sesión existente.
 * Solo actualiza los campos que tengan un valor no-nulo en `newData`,
 * permitiendo así que el usuario corrija un dato en un mensaje posterior.
 *
 * @param {string} phone   - Número de teléfono del cliente.
 * @param {object} newData - Datos parciales recién extraídos.
 */
function mergeData(phone, newData) {
  const session = getSession(phone);

  if (newData.nombre !== null && newData.nombre !== undefined) {
    session.nombre = String(newData.nombre).trim();
  }
  if (newData.edad !== null && newData.edad !== undefined) {
    session.edad = Number(newData.edad);
  }
  if (newData.serie !== null && newData.serie !== undefined) {
    session.serie = String(newData.serie).trim();
  }
  if (newData.hora !== null && newData.hora !== undefined) {
    session.hora = String(newData.hora).trim();
  }
  if (newData.color !== null && newData.color !== undefined) {
    session.color = String(newData.color).trim();
  }

  session.lastActivity = Date.now();
  persistSessionsToDisk();
}

/**
 * Comprueba si la sesión de un cliente tiene TODOS los campos obligatorios.
 *
 * @param {string} phone - Número de teléfono del cliente.
 * @returns {boolean}
 */
function isSessionComplete(phone) {
  const s = getSession(phone);
  return (
    s.nombre !== null &&
    s.edad   !== null &&
    s.serie  !== null &&
    s.hora   !== null &&
    s.color  !== null
  );
}

/**
 * Elimina la sesión de un cliente (tras guardar correctamente en CSV).
 *
 * @param {string} phone - Número de teléfono del cliente.
 */
function clearSession(phone) {
  sessions.delete(phone);
  persistSessionsToDisk();
  console.log(`🗑️  Sesión eliminada para: ${phone}`);
}

// ─────────────────────────────────────────────────────────────
// LIMPIEZA PERIÓDICA DE SESIONES EXPIRADAS
// ─────────────────────────────────────────────────────────────

/**
 * Elimina las sesiones que llevan más de SESSION_TIMEOUT_MS sin actividad.
 * Se ejecuta periódicamente para evitar acumulación de sesiones fantasma.
 */
function cleanupExpiredSessions() {
  const now     = Date.now();
  let   removed = 0;

  for (const [phone, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      sessions.delete(phone);
      removed++;
      console.log(`⏰ Sesión expirada eliminada: ${phone}`);
    }
  }

  if (removed > 0) {
    persistSessionsToDisk();
    console.log(`🧹 Limpieza completada: ${removed} sesión(es) expirada(s) eliminada(s).`);
  }
}

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

// Carga las sesiones al arrancar el módulo
loadSessionsFromDisk();

// Programa la limpieza periódica (no bloquea el event loop)
setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS).unref();

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  getSession,
  mergeData,
  isSessionComplete,
  clearSession,
};
