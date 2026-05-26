'use strict';

/**
 * ============================================================
 * TIME VALIDATOR — Validación de horarios de reserva
 * ============================================================
 * Verifica que una hora esté dentro de los turnos permitidos:
 *   - Turno mañana:  10:30 – 14:30
 *   - Turno tarde:   16:30 – 20:30
 *
 * Acepta el formato "HH:MM" en 24 horas.
 * ============================================================
 */

/**
 * Turnos de disponibilidad para reservas.
 * Cada turno tiene hora de inicio y fin en minutos desde medianoche.
 */
const RESERVATION_SLOTS = [
  { label: '10:30–14:30', startMin: 10 * 60 + 30, endMin: 14 * 60 + 30 },
  { label: '16:30–20:30', startMin: 16 * 60 + 30, endMin: 20 * 60 + 30 },
];

/**
 * Convierte una cadena "HH:MM" a minutos desde medianoche.
 *
 * @param {string} timeStr - Hora en formato "HH:MM".
 * @returns {number | null} Minutos totales, o null si el formato es inválido.
 */
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;

  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;

  const hours   = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return null;
  if (hours < 0 || hours > 23)        return null;
  if (minutes < 0 || minutes > 59)    return null;

  return hours * 60 + minutes;
}

/**
 * Valida si una hora de reserva cae dentro de los turnos disponibles.
 *
 * @param {string} hora - Hora en formato "HH:MM" (24h).
 * @returns {{ valid: boolean, normalized: string|null, reason: string|null }}
 *   - valid: true si el horario es aceptable.
 *   - normalized: la misma hora en "HH:MM" si es válida.
 *   - reason: mensaje de error legible para el usuario si no es válida.
 */
function validateReservationTime(hora) {
  const totalMinutes = timeToMinutes(hora);

  if (totalMinutes === null) {
    return {
      valid:      false,
      normalized: null,
      reason:     `El formato de hora "${hora}" no es válido. Por favor, indica la hora como "10:30", "17:00", etc.`,
    };
  }

  // Comprobar si cae en alguno de los turnos
  const isInSlot = RESERVATION_SLOTS.some(
    (slot) => totalMinutes >= slot.startMin && totalMinutes <= slot.endMin
  );

  if (!isInSlot) {
    const slotsText = RESERVATION_SLOTS.map((s) => s.label).join(' y ');
    return {
      valid:      false,
      normalized: null,
      reason:
        `Lo siento, el horario *${hora}* está fuera de nuestro horario de atención.\n` +
        `🕐 Reservas disponibles: *${slotsText}*`,
    };
  }

  return {
    valid:      true,
    normalized: hora,
    reason:     null,
  };
}

/**
 * Devuelve un string legible con los horarios disponibles.
 * Útil para incluir en mensajes de ayuda.
 *
 * @returns {string}
 */
function getAvailableSlotsText() {
  return RESERVATION_SLOTS.map((s) => `*${s.label}*`).join(' y ');
}

module.exports = {
  validateReservationTime,
  getAvailableSlotsText,
};
