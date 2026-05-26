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

## 🛠 Tecnologías Utilizadas

- **Evolution API** - Motor de conexión estable para WhatsApp.
- **Node.js (http nativo / fs)** - Servidor ultraligero y gestión de archivos (CSV/JSON).
- **@google/genai** - SDK Oficial de Gemini para extracción de entidades mediante IA generativa.
- **dotenv** - Gestión de variables de entorno seguras.

---
*Desarrollado para automatizar la captación de reservas y datos estructurados de clientes.*
