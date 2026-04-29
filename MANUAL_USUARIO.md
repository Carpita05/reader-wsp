# Manual de Usuario: WhatsApp Data Collector Bot

Este documento explica de forma detallada cómo utilizar el sistema automatizado de recolección de datos mediante WhatsApp.

## 1. ¿Qué hace este programa?

Es un bot (programa automático) que se conecta a una cuenta de WhatsApp y se queda "escuchando" los mensajes que recibe. Cuando alguien envía un mensaje con un formato específico (Nombre, Edad y Serie Favorita), el bot hace lo siguiente:

1. **Lee y valida** que el mensaje tenga el formato correcto.
2. **Extrae** la información solicitada.
3. **Guarda** esos datos en un archivo local llamado `datos_clientes.csv`.
4. **Responde** automáticamente al usuario confirmando que la información se ha guardado, o avisando si el formato es incorrecto.

## 2. Requisitos Previos

Antes de ejecutar el programa, necesitas:

- **Node.js** instalado en tu ordenador (versión 16 o superior).
- Una **cuenta de WhatsApp** activa (se recomienda encarecidamente usar una cuenta secundaria o "de pruebas", NO tu número personal principal).
- Conexión a internet estable.

## 3. Instalación

Si es la primera vez que vas a usar el proyecto, abre una terminal en la carpeta del proyecto (`LeectorDeMensajesWhatsapp`) y ejecuta:

```bash
npm install
```
Esto descargará todas las librerías necesarias para que el bot funcione (como `whatsapp-web.js` y `qrcode-terminal`).

## 4. Cómo Iniciar el Bot

Para poner en marcha el programa, abre la terminal en la carpeta del proyecto y ejecuta:

```bash
npm start
```

### Primera vez (Vincular cuenta)

La primera vez que lo inicies, el programa generará un **Código QR** en la terminal.

1. Abre WhatsApp en el móvil que vayas a usar como bot.
2. Ve a **Ajustes** (o Configuración) > **Dispositivos vinculados**.
3. Toca en **"Vincular un dispositivo"**.
4. Escanea el código QR que aparece en la pantalla de tu ordenador.

Una vez escaneado, verás en la consola mensajes indicando:
`🔐 Sesión autenticada correctamente.`
`✅ Cliente WhatsApp listo. Esperando mensajes...`

A partir de este momento, ¡el bot ya está funcionando!

### Veces posteriores

La sesión se guarda automáticamente (en la carpeta oculta `.wwebjs_auth`). Por lo tanto, la próxima vez que ejecutes `npm start`, ya no te pedirá el código QR y se conectará directamente.

## 5. Formato de los Mensajes

Para que el bot procese la información, los usuarios **DEBEN** enviar el mensaje exactamente con esta estructura (los saltos de línea son importantes):

```
Nombre: [Su Nombre]
Edad: [Su Edad]
Serie Favorita: [Su Serie]
```

### ✅ Ejemplo válido:
```
Nombre: Juan Pérez
Edad: 32
Serie Favorita: Juego de Tronos
```

### ❌ Ejemplos inválidos:
- "Hola, me llamo Juan, tengo 32 años y me gusta Juego de Tronos" *(El bot no entenderá esto).*
- Escribir la edad con letras en vez de números: `Edad: treinta y dos` *(La edad debe ser numérica).*

**¿Qué pasa si alguien envía un formato incorrecto?**
El bot le responderá automáticamente indicándole que el formato es erróneo y le enviará un ejemplo de cómo debe hacerlo.

*Nota: El bot no hace distinción entre mayúsculas y minúsculas en las etiquetas. "Nombre:", "NOMBRE:" o "nombre:" funcionarán igual.*

## 6. Dónde se guardan los datos

Cada vez que el bot recibe un mensaje válido, añade una nueva fila a un archivo llamado **`datos_clientes.csv`** que se creará automáticamente en la misma carpeta del proyecto.

Este archivo es un documento de texto estructurado por comas que puedes abrir fácilmente con **Excel**, **Google Sheets** o cualquier programa de hojas de cálculo.

Las columnas que guarda son:
1. **Timestamp**: La fecha y hora exacta en la que se recibió el mensaje.
2. **Telefono**: El número de teléfono de la persona que envió el mensaje.
3. **Nombre**: El nombre extraído.
4. **Edad**: La edad extraída.
5. **SerieFavorita**: La serie extraída.

## 7. Cómo detener el bot

Si quieres que el programa deje de escuchar mensajes y se apague, tienes dos formas de hacerlo:

1. **Desde la terminal (Recomendado):** Ve a la ventana de la consola o terminal donde el bot está ejecutándose y presiona las teclas **`Ctrl + C`** al mismo tiempo. Te preguntará si deseas terminar el trabajo por lotes (presiona `S` o `Y` y luego Enter). Esto apagará el programa de forma segura.
2. **Cerrando la ventana:** Simplemente cierra la ventana de la terminal donde se está ejecutando el programa.

*Nota: Una vez detenido, el bot dejará de leer mensajes y de contestar automáticamente. Los mensajes que envíen los usuarios mientras el bot está apagado **no se procesarán ni se guardarán en el CSV** cuando lo vuelvas a encender.*

## 8. Precauciones y Advertencias ⚠️

- **No uses tu número personal:** El uso de bots automatizados no oficiales puede ir en contra de las políticas de Meta (WhatsApp). Si el sistema detecta un comportamiento anómalo o spam, podría banear (suspender) la cuenta de WhatsApp. Usa un número secundario.
- **Grupos:** El bot está configurado para **ignorar** automáticamente los mensajes que provengan de grupos. Solo funciona en chats privados.
