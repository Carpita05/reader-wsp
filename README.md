# 📱 WhatsApp Data Collector Bot (Evolution API v2)

Un bot conversacional para WhatsApp construido con **Node.js** que actúa como un agente de reservas y recopilación de datos. Extrae información de los clientes de manera progresiva a través de múltiples mensajes, validando los datos en tiempo real y persistiendo la información de manera segura en un archivo CSV local.

## ✨ Características Principales

- 🔄 **Conversación Multi-Turno**: El bot no exige que el cliente envíe todos los datos en un solo mensaje. Acumula la información a lo largo de varios mensajes.
- 🗣️ **Asistente Proactivo**: Si faltan datos, el bot pregunta automáticamente por la información faltante siguiendo un flujo lógico (Nombre → Edad → Hora → Serie → Color).
- 🧠 **Inteligencia Artificial Integrada**: Usa **Google Gemini 2.5 Flash** para extraer datos estructurados a partir del lenguaje natural, permitiendo al usuario hablar con total libertad y corregir sus respuestas (ej: "mejor resérvame a las 6").
- ⏱️ **Validación de Horarios**: Verifica que la hora solicitada por el cliente se encuentre dentro del horario comercial establecido (Mañanas: 10:30-14:30 | Tardes: 16:30-20:30).
- 💾 **Memoria Persistente**: Mantiene el estado de cada usuario en `sessions.json` para que las conversaciones a medias no se pierdan si el servidor se reinicia, limpiando las sesiones inactivas tras 15 minutos.
- 🔗 **Arquitectura Robusta (Evolution API)**: Desacoplado de librerías locales inestables. Utiliza webhooks HTTP estándar para recibir eventos de [Evolution API](https://evolution-api.com/).

---

## 🚀 Instalación y Configuración

### 1. Requisitos previos
- **Node.js** v18 o superior instalado en tu sistema.
- Instancia activa de **Evolution API** v2 vinculada a tu número de WhatsApp.
- Cuenta gratuita de [Google AI Studio](https://aistudio.google.com/app/apikey) para la API Key de Gemini.

### 2. Clonar el repositorio e instalar dependencias
```bash
git clone <url_de_tu_repositorio>
cd LectorDeMensajesWhatsapp
npm install
```

### 3. Configurar Variables de Entorno
Copia el archivo de plantilla `.env.example` y renómbralo a `.env`:
```bash
cp .env.example .env
```
Edita el archivo `.env` con tus credenciales reales:
```env
# Configuración de Inteligencia Artificial
AI_PROVIDER=gemini
GEMINI_API_KEY=tu_clave_api_gemini_aqui

# Configuración de Evolution API
EVOLUTION_BASE_URL=http://tu-evolution-api.com:8080
EVOLUTION_API_KEY=tu_global_api_key_de_evolution
EVOLUTION_INSTANCE_NAME=tu_nombre_de_instancia

# Puerto local donde el bot recibirá los Webhooks
WEBHOOK_PORT=3000
```

### 4. Configurar el Webhook en Evolution API
Debes indicarle a tu instancia de Evolution API que envíe los eventos de los mensajes a este bot. Esto se hace mediante una petición a tu servidor de Evolution API configurando la URL de webhook:
`http://<tu-ip-o-dominio>:<WEBHOOK_PORT>/webhook` (Escuchando el evento `MESSAGES_UPSERT`).

---

## 🏃 Uso

Para iniciar el bot, ejecuta en la terminal:
```bash
npm start
```
Verás un mensaje indicando que el servidor HTTP está escuchando y esperando eventos.

### Ejemplo de Flujo Conversacional
El bot captura progresivamente **Nombre, Edad, Hora de Reserva, Serie Favorita y Color Favorito**.

1. **Cliente:** "Hola soy Juan"
   *Bot detecta:* `Nombre: Juan`.
   *Bot responde:* "¡Perfecto, Juan! 😊 ¿Cuántos años tienes?"
2. **Cliente:** "Tengo 65 años"
   *Bot detecta:* `Edad: 65`.
   *Bot responde:* "¿A qué hora quieres reservar? 🕐 ..."
3. **Cliente:** "Quería reservar para las 5"
   *Bot normaliza a:* `17:00` (Valida turno de tarde).
   *Bot responde:* "¡Genial! 🎉 ¿Cuál es tu serie favorita?"
4. **Cliente:** "Me gusta La vida es bella"
   *Bot responde:* "¡Ya casi terminamos! 🎨 ¿Cuál es tu color favorito?"
5. **Cliente:** "El rojo"
   *Bot guarda el CSV, limpia la sesión y responde:* "✅ ¡Reserva confirmada!..."

---

## 📂 Estructura del Proyecto

```text
LectorDeMensajesWhatsapp/
├── index.js               # Servidor Webhook principal y orquestador del flujo
├── sessionStore.js        # Gestión de memoria y persistencia (sessions.json)
├── timeValidator.js       # Lógica de validación de rangos horarios para reservas
├── aiExtractor.js         # Módulo central Strategy para IA (recoge datos parciales)
├── providers/
│   ├── gemini.js          # Adaptador de la API de Google Gemini y Prompts
│   └── evolutionApi.js    # Cliente HTTP para responder mensajes vía Evolution API
├── datos_clientes.csv     # Base de datos final generada automáticamente
├── package.json           # Dependencias del proyecto
└── .env                   # Variables de entorno y secretos (ignorado en git)
```

## 🔍 Solución de Problemas y Diagnóstico

Si el bot no responde o los mensajes no se indexan en el CSV, sigue estos pasos de diagnóstico en tu consola de Node.js para identificar el origen del problema:

### 1. El bot recibe el mensaje (se ve en la consola) pero no responde
**Síntoma:** En la consola del bot aparece el mensaje recibido, la IA de Gemini extrae los datos correctamente, pero al final se muestra un error similar a:
`❌ Error al enviar pregunta al usuario: [EvolutionAPI] sendTextMessage falló → fetch failed`

* **Causa:** El bot procesa la información pero no puede comunicarse de vuelta con la instancia de Evolution API para enviar el mensaje de WhatsApp.
* **Soluciones:**
  1. **Verificar la URL base:** Asegúrate de que `EVOLUTION_BASE_URL` en tu archivo `.env` sea correcta y accesible (ej. `http://localhost:8080` si corre localmente).
  2. **Verificar estado de Evolution API:** Abre la URL de tu instancia de Evolution API en el navegador o hazle un ping/curl para comprobar que está activa.
  3. **Comprobar la API Key:** Confirma que la variable `EVOLUTION_API_KEY` en tu `.env` coincide exactamente con la clave de API global de tu Evolution API.
  4. **Instancia activa:** Verifica que la instancia especificada en `EVOLUTION_INSTANCE_NAME` esté conectada a WhatsApp (código QR escaneado y estado "CONNECTED").

### 2. No se registra ninguna actividad en la consola cuando alguien escribe
**Síntoma:** El bot está encendido, pero al escribir al número de WhatsApp no se muestra ningún log de `📡 Petición entrante` o `📨 Mensaje recibido`.

* **Causa:** Los eventos/webhooks enviados por Evolution API no están llegando al puerto de tu bot.
* **Soluciones:**
  1. **Probar el Webhook localmente:** Haz una petición GET en tu navegador a `http://localhost:3000/health`. Debería responder `{"status":"ok"}`. Si no responde, el bot no está corriendo o el puerto `3000` está ocupado.
  2. **Configuración del Webhook en Evolution API:** Asegúrate de haber configurado el webhook en Evolution API apuntando a la dirección IP/URL correcta del bot con el path `/webhook` (ej: `http://localhost:3000/webhook`) y que esté activo para el evento `MESSAGES_UPSERT`.
  3. **Exposición pública (si Evolution API está en la nube):** Si tu Evolution API está corriendo en un servidor en la nube y tu bot está corriendo en tu máquina local, Evolution API no podrá acceder a tu `localhost`. Debes usar una herramienta de túnel como **ngrok** para exponer tu puerto local:
     ```bash
     ngrok http 3000
     ```
     Luego, copia la URL HTTPS pública provista por ngrok (ej: `https://abcd-123.ngrok-free.app/webhook`) y configúrala como la URL de Webhook en la configuración de la instancia dentro de Evolution API.

### 3. Error en la conexión con la Inteligencia Artificial (Gemini)
**Síntoma:** Se registra un error `❌ Error en la extracción por IA: ...` o problemas con el API Key de Gemini.

* **Causa:** La API Key de Gemini es inválida, expiró o no hay conexión hacia los servidores de Google.
* **Soluciones:**
  1. **Verificar API Key:** Asegúrate de que la variable `GEMINI_API_KEY` en tu `.env` no tenga espacios ni comillas adicionales y que corresponda a una clave válida de Google AI Studio.
  2. **Conectividad a Google:** Asegúrate de que el entorno donde corre el bot tiene salida a internet sin restricciones para contactar con la API de Gemini.

---

## 🛠 Tecnologías Utilizadas

- **Evolution API** - Motor de conexión estable para WhatsApp.
- **Node.js (http nativo / fs)** - Servidor ultraligero y gestión de archivos (CSV/JSON).
- **@google/genai** - SDK Oficial de Gemini para extracción de entidades mediante IA generativa.
- **dotenv** - Gestión de variables de entorno seguras.

---
*Desarrollado para automatizar la captación de reservas y datos estructurados de clientes.*
