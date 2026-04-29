# 📱 WhatsApp Data Collector Bot

Un bot automatizado de WhatsApp construido con **Node.js** que extrae datos de clientes (Nombre, Edad, Serie Favorita) a través de los mensajes recibidos y los almacena de forma segura en un archivo CSV local.

## ✨ Características

- ⚡ **Extracción Instantánea (Regex)**: Procesa mensajes con el formato exacto sin latencia.
- 🧠 **Fallback con Inteligencia Artificial**: Si el usuario envía los datos en lenguaje natural o con formato libre, el bot utiliza **Google Gemini 2.5 Flash** para procesar el mensaje, entender el contexto y extraer los datos correctamente.
- 💾 **Persistencia Segura**: Guarda toda la información de forma incremental en `datos_clientes.csv` cumpliendo con el estándar RFC 4180.
- 🔒 **Sesión Persistente**: Inicias sesión escaneando un código QR una vez y el bot guarda la sesión (`.wwebjs_auth`) para no pedirte el móvil cada vez que lo arrancas.
- 🛡️ **Prevención de Spam**: Ignora automáticamente mensajes de grupos (`@g.us`) y mensajes propios.

---

## 🚀 Instalación y Configuración

### 1. Requisitos previos
- **Node.js** v18 o superior instalado en tu sistema.
- Una cuenta gratuita de Google AI Studio para la clave de API.

### 2. Clonar el repositorio e instalar dependencias
```bash
git clone <url_de_tu_repositorio>
cd LeectorDeMensajesWhatsapp
npm install
```

### 3. Configurar Variables de Entorno
Copia el archivo de plantilla `.env.example` y renómbralo a `.env`:
```bash
cp .env.example .env
```
Abre `.env` y añade tu clave de API de Gemini:
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=tu_clave_api_aqui
```
> **Nota**: Puedes obtener tu API Key gratis en [Google AI Studio](https://aistudio.google.com/app/apikey).

---

## 🏃 Uso

Para iniciar el bot, simplemente ejecuta:
```bash
npm start
```

1. La primera vez, el bot imprimirá un **Código QR** en la consola.
2. Abre WhatsApp en tu teléfono, ve a **Dispositivos Vinculados** y escanea el QR.
3. ¡Listo! El bot mostrará `✅ Cliente WhatsApp listo. Esperando mensajes...` y empezará a trabajar.

### Formato esperado de los usuarios
Para la ruta más rápida (Regex), el usuario debe enviar:
```text
Nombre: Laura García
Edad: 29
Serie Favorita: Breaking Bad
```

**Si envían texto libre:**
```text
Hola soy Pepe tengo 24 años y me gusta The Office...
```
El bot delegará automáticamente en la **Inteligencia Artificial** para deducir el formato y guardará igualmente los campos de forma correcta.

---

## 📂 Estructura del Proyecto

\`\`\`text
LeectorDeMensajesWhatsapp/
├── index.js               # Archivo principal y eventos de WhatsApp
├── aiExtractor.js         # Módulo central Strategy para IA
├── providers/
│   └── gemini.js          # Adaptador de la API de Google Gemini (SDK actual v1)
├── package.json           # Dependencias del proyecto
├── .env.example           # Plantilla pública de variables de entorno
└── .gitignore             # Archivos excluidos de Git (sesiones, claves, DB local)
\`\`\`

## 🛠 Tecnologías Utilizadas

- [whatsapp-web.js](https://wwebjs.dev/) - Cliente de WhatsApp no oficial
- [@google/genai](https://www.npmjs.com/package/@google/genai) - SDK Oficial de Gemini
- [qrcode-terminal](https://www.npmjs.com/package/qrcode-terminal) - Dibujo del código QR en terminal
- [dotenv](https://www.npmjs.com/package/dotenv) - Gestión de variables de entorno seguras

---
*Desarrollado para automatizar la captación de leads de forma local y 100% privada.*
