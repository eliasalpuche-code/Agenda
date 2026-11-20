# Agenda Yatzi

App personal con calendario, agenda del día y lista de tareas con subtareas. Se instala en el celular y en la computadora como una app.

- **Calendario mensual limpio**: muestra solo el número del día y una barra por cada prioridad presente: rojo = Altísima, naranja = Alta, verde = Normal, azul = Baja.
- **Agenda del día** debajo del calendario, con los horarios ocupados.
- **Actividades**: se pueden crear, consultar, editar y eliminar. Cada una tiene título, fecha, horario o "todo el día", prioridad, ubicación o enlace, recordatorio y notas.
- **Tareas y subtareas**: al marcarlas pasan a *Realizadas*; ahí se pueden recuperar o borrar.
- **Recordatorios por correo**, aunque la app esté cerrada.
- **Ajustes ⚙**: instalar la app, cerrar sesión y borrar todo.

## Cómo funciona

```
Celular / PC  ──>  App en GitHub Pages  ──>  Servidor en Apps Script  ──>  Hoja de Google Sheets
                    (lo que se ve)            (revisa quién entra,           (los datos)
                                               guarda y manda correos)
```

- La app se abre desde `https://TU-USUARIO.github.io/agenda-yatzi/` y se puede **instalar**.
- Para entrar se usa **Iniciar sesión con Google**. Solo pasan los correos de `CORREOS_PERMITIDOS` (en `Code.gs`).
- Los datos **no** se guardan en GitHub. Viven en la hoja de cálculo, en tu Drive.

## Archivos

```
index.html               La app
config.js                Tus datos de conexión (enlace del servidor e ID de Google)
manifest.webmanifest     Nombre e íconos para instalarla
sw.js                    Permite instalarla y abrirla rápido
icons/                   Ícono de la app
apps-script/Code.gs      Servidor (se pega en Apps Script; no hace nada en GitHub)
apps-script/appsscript.json
```

---

## Instalación paso a paso

### Paso 1. Actualizar el servidor en Apps Script
Usa el mismo proyecto que ya tienes, el que está vinculado a tu hoja.

1. Reemplaza todo `Código.gs` por `apps-script/Code.gs` y `appsscript.json` por `apps-script/appsscript.json`. Guarda.
2. El archivo `index.html` de Apps Script ya no se usa. Puedes borrarlo (⋮ › Eliminar) o dejarlo.
3. Elige la función **`probarCorreo`** y pulsa **▶ Ejecutar**. Autoriza los permisos nuevos; ahora la app se conecta con Google para verificar el inicio de sesión.
4. Ve a **Implementar › Administrar implementaciones › ✏ Editar**:
   - *Versión*: **Nueva versión**
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona**
5. Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

> "Cualquier persona" es seguro: el servidor solo responde si quien entra inició sesión con un correo autorizado. Con esta configuración ya **no** hace falta compartir la hoja con nadie.

### Paso 2. Subir la app a GitHub
1. En GitHub crea un repositorio **público** llamado `agenda-yatzi`. GitHub Pages es gratis en repositorios públicos.
2. Pulsa **Add file › Upload files** y arrastra **todo el contenido** de esta carpeta, incluida la carpeta `icons`. Pulsa **Commit changes**.
3. Ve a **Settings › Pages**. En *Build and deployment* elige **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`. Guarda.
4. En uno o dos minutos tendrás tu enlace: `https://TU-USUARIO.github.io/agenda-yatzi/`

### Paso 3. Crear el ID de cliente de Google (para el botón "Iniciar sesión con Google")
1. Entra a <https://console.cloud.google.com> con tu cuenta y crea un proyecto nuevo llamado **Agenda Yatzi**.
2. En el menú, ve a **APIs y servicios › Pantalla de consentimiento de OAuth** (puede aparecer como *Google Auth Platform*):
   - *Nombre de la app*: Agenda Yatzi. *Correo de asistencia*: el tuyo.
   - *Público*: **Externo**.
   - *Información de contacto*: tu correo. Acepta y crea.
3. En **Público** (o *Usuarios de prueba*), deja la app **en modo de prueba** y agrega como usuarios de prueba los correos que podrán entrar: `cdp.av.1969@gmail.com`, `yatziglez16@gmail.com`, `elias.alpuche@gmail.com`.
4. Ve a **Clientes** (o *Credenciales*) › **Crear cliente** (*ID de cliente de OAuth*):
   - *Tipo de aplicación*: **Aplicación web**
   - *Orígenes autorizados de JavaScript*: `https://TU-USUARIO.github.io`, sin la parte `/agenda-yatzi` y sin `/` al final.
5. Pulsa **Crear** y copia el **ID de cliente**. Termina en `.apps.googleusercontent.com`.

### Paso 4. Conectar todo
1. **En GitHub**, abre `config.js`, pulsa el lápiz ✏ y pega los dos datos:
   ```js
   API_URL: 'https://script.google.com/macros/s/....../exec',
   GOOGLE_CLIENT_ID: '1234567890-abc.apps.googleusercontent.com'
   ```
   Pulsa **Commit changes**.
2. **En Apps Script**, al inicio de `Código.gs`:
   - En `GOOGLE_CLIENT_ID`, pega el **mismo** ID de cliente.
   - En `APP_URL`, pon tu enlace de GitHub Pages (se usa en el botón de los correos).
   - Guarda y publica una versión nueva: **Implementar › Administrar implementaciones › ✏ › Nueva versión**.

### Paso 5. Abrir e instalar
- Abre `https://TU-USUARIO.github.io/agenda-yatzi/` e inicia sesión con Google.
- **Android (Chrome):** en el menú ⋮ elige **Instalar app** o *Agregar a la pantalla principal*. También está en ⚙ Ajustes › Instalar.
- **iPhone (Safari):** toca **Compartir › Agregar a pantalla de inicio**.
- **Computadora (Chrome o Edge):** en la barra de direcciones aparece un ícono para **Instalar**.

### Recordatorios por correo (una sola vez)
En Apps Script ejecuta **`activarRecordatorios`**. La hoja se revisa cada 5 minutos y los avisos llegan a `CORREO_RECORDATORIOS`. Para apagarlos, ejecuta `desactivarRecordatorios`.

---

## Mantenimiento

- **Dar o quitar acceso a una persona:** hay que cambiarlo en dos lugares.
  1. Edita `CORREOS_PERMITIDOS` en `Código.gs` y publica una nueva versión.
  2. Agrega o quita ese correo en los usuarios de prueba de Google Cloud (Paso 3.3).
- **Cambiar la app:** sube el nuevo `index.html` a GitHub. Puede tardar un par de minutos y quizá haga falta cerrar y abrir la app.
- **Cambiar el servidor:** pega el nuevo `Code.gs` y publica una **Nueva versión**. Nunca uses "Nueva implementación", porque cambia el enlace `/exec`.
- **Respaldos:** la hoja guarda historial (Archivo › Historial de versiones) y se puede descargar a Excel.
- **¿Es seguro que el repositorio sea público?** Sí. En GitHub solo está el código, el ID de cliente y el enlace del servidor, que no son secretos. Los datos siguen en tu hoja privada, y el servidor rechaza a quien no inicie sesión con un correo autorizado.

## Problemas comunes

- **"La cuenta … no tiene acceso":** ese correo no está en `CORREOS_PERMITIDOS`, o falta publicar una nueva versión del servidor.
- **"La app no está bien configurada (ID de cliente distinto)":** el ID de `config.js` y el de `Código.gs` no son iguales.
- **El botón de Google no aparece o marca error:** revisa que el origen autorizado del Paso 3.4 sea exactamente `https://TU-USUARIO.github.io` y que el correo esté en los usuarios de prueba.
- **No guarda:** abre en el navegador el enlace `/exec`. Debe mostrar `{"ok":true,...}`. Si pide iniciar sesión o marca error, revisa el Paso 1.4.
