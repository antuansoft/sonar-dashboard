# Sonar Dashboard

Dashboard interno que consume la API de [SonarCloud](https://sonarcloud.io) para visualizar el estado de calidad de los proyectos de una organización. Construido con React 19 + Vite 8.

Funcionalidades:
- Listado de proyectos con métricas (Security, Reliability, Maintainability, Hotspots, Coverage, Duplications) y badge de Quality Gate.
- Filtro por estado de QG (Todos / Passed / Failed).
- Panel desplegable por proyecto con ramas, PRs y actividad de análisis.
- Tags de SonarCloud visibles en cada tarjeta (los etiquetados con `report-exclude` se excluyen del Excel).
- Exportación a Excel con métricas, PRs y ramas analizadas (último mes vs mes anterior).
- Pantalla de carga con porcentaje de progreso durante la conexión inicial.

---

## 1. Requisitos previos

| Herramienta | Versión recomendada | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org) | ≥ 20 LTS | Ejecuta Vite y npm |
| npm | Incluido con Node | Gestor de dependencias |
| [VSCode](https://code.visualstudio.com) | última | Editor (opcional pero recomendado) |
| Cuenta SonarCloud | — | Para generar el token |

Verifica que tienes Node y npm:

```bash
node --version
npm --version
```

---

## 2. Instalación

1. Clona el repositorio:
   ```bash
   git clone <url-del-repo>
   cd sonar-dashboard
   ```

2. Instala dependencias:
   ```bash
   npm install
   ```

3. Genera tu token personal en SonarCloud:
   - Entra en [sonarcloud.io](https://sonarcloud.io) → **My Account → Security**.
   - Crea un token con permisos de lectura.
   - **Cópialo y guárdalo**: SonarCloud no lo muestra otra vez.

---

## 3. Configuración de credenciales

El dashboard necesita dos datos para conectar con SonarCloud:

- **Token personal** (`squ_xxxxxxxxxxxx`) — sensible, da acceso a tus datos.
- **Clave de organización** (ej. `abertis`) — público, identifica tu org en SonarCloud.

Hay tres formas de proveerlos. Elige la que mejor encaje con tu uso:

### Opción A — `.env.local` (recomendada para desarrollo)

Crea un fichero `.env.local` en la raíz del proyecto (junto a `package.json`):

```env
VITE_SONAR_TOKEN=squ_xxxxxxxxxxxx
VITE_SONAR_ORG=tu-organizacion
```

> 📋 Hay una plantilla en `.env.example`. Puedes copiarla:
> ```bash
> cp .env.example .env.local
> ```

**Ventajas:**
- El dashboard se autoconecta al arrancar, sin pantalla de login.
- `.env.local` **no se commitea** (ya está cubierto por `.gitignore` con la regla `*.local`), así que el token no llega al repositorio.

**Importante:** Vite lee las variables de entorno **solo al arrancar**. Si modificas `.env.local`, reinicia `npm run dev`.

### Opción B — Formulario + `localStorage` del navegador

Si no quieres usar fichero, arranca la app y al abrirla aparecerá un formulario:

1. Introduce token y organización.
2. Marca el checkbox **"Recordar en este navegador"**.
3. Pulsa **Conectar**.

Las credenciales quedan guardadas en `localStorage` del navegador. La próxima vez que abras el dashboard, autoconectará.

⚠️ **Nota de seguridad**: el token se guarda ofuscado en base64, **no cifrado**. Esto evita que aparezca en claro en capturas o pantalla compartida, pero alguien con acceso a las DevTools del navegador puede recuperarlo. Si esto te preocupa, no marques "Recordar" o usa la Opción A en una máquina segura.

Para limpiar las credenciales guardadas: pulsa el botón **Desconectar** del dashboard.

### Opción C — Introducir credenciales cada vez

Si no quieres ni `.env.local` ni `localStorage`:

1. Arranca la app.
2. Introduce token y organización **sin marcar** "Recordar en este navegador".
3. Pulsa **Conectar**.

Al cerrar el navegador o pulsar **Desconectar**, hay que volver a introducirlos.

### Orden de prioridad

1. **`.env.local`** (Opción A) — si está definido, se usa siempre.
2. **`localStorage`** (Opción B) — si no hay `.env.local`, se intenta cargar de aquí.
3. **Formulario vacío** (Opción C) — si no hay ninguno de los anteriores.

---

## 4. Arrancar la aplicación

### Método principal — VSCode Tasks (recomendado)

El proyecto incluye tareas de VSCode preconfiguradas (`.vscode/tasks.json`) para arrancar y parar el servidor sin tener que teclear comandos.

1. Abre la carpeta del proyecto en VSCode: **File → Open Folder...**
2. En el menú: **Terminal → Run Task...** (o pulsa <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> y escribe "Run Task").
3. Selecciona **Arrancar Sonar Dashboard**.
4. Se abre un terminal nuevo en VSCode con `npm run dev` ejecutándose.
5. Vite mostrará algo como:
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: ...
   ```
6. Pulsa <kbd>Ctrl</kbd> + click en la URL para abrir el dashboard.

> 💡 Atajo: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> lanza directamente la tarea por defecto (**Arrancar Sonar Dashboard**).

### Método alternativo — Terminal manual

Si no usas VSCode o prefieres el control manual:

**Desde el terminal integrado de VSCode**:
1. **Terminal → New Terminal** (o <kbd>Ctrl</kbd> + <kbd>ñ</kbd>).
2. Ejecuta:
   ```bash
   npm run dev
   ```

**Desde terminal externa**:
```bash
cd sonar-dashboard
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) en el navegador.

---

## 5. Cerrar la aplicación correctamente

### Método principal — VSCode Task (recomendado)

1. **Terminal → Run Task...**
2. Selecciona **Parar Sonar Dashboard**.

La tarea busca el proceso `node` que esté ejecutando Vite para este proyecto (`vite` + `sonar-dashboard` en su línea de comandos) y lo termina con `Stop-Process -Force`. Funciona en cualquier puerto y solo afecta a este proyecto — si tienes otros servidores Vite corriendo, no los toca.

Verás un mensaje:
- 🟢 **Verde** si paró algo: *"Sonar Dashboard parado (N proceso(s) terminado(s))."*
- 🟡 **Amarillo** si no había nada: *"No hay proceso Vite de sonar-dashboard corriendo."*

La tarea es idempotente: puedes lanzarla aunque ya no haya servidor corriendo, no falla.

> ⚠️ Requiere PowerShell (Windows). En Linux/macOS usa el método alternativo.

### Método alternativo — Ctrl+C

En el terminal donde corre `npm run dev`:

- **Windows / Linux / macOS**: pulsa <kbd>Ctrl</kbd> + <kbd>C</kbd>.
- Si Windows pregunta `¿Terminar el trabajo por lotes (S/N)?`, responde <kbd>S</kbd>.

### Si el puerto se queda ocupado

Si Vite dice que el puerto está en uso al arrancar:

1. Lanza la tarea **Parar Sonar Dashboard** (limpia el proceso huérfano).
2. Vuelve a lanzar **Arrancar Sonar Dashboard**.

Si por algún motivo la tarea no encuentra el proceso (puerto ocupado por otra cosa):

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Linux / macOS:**
```bash
pkill -f vite
```

### Desconectar del dashboard (sin parar el servidor)

Dentro de la propia aplicación, pulsa el botón **Desconectar** en la esquina superior derecha. Esto:

- Limpia los datos cargados de SonarCloud.
- Limpia el `localStorage` (si tenías "Recordar" activo).
- Restaura el formulario de login (o re-aplica `.env.local` si lo tienes).

El servidor de Vite sigue corriendo; solo se cierra la "sesión" del dashboard.

---

## 6. Otros comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con hot-reload (puerto 5173). |
| `npm run build` | Build de producción a `dist/`. |
| `npm run preview` | Sirve el build de producción para verificar. |
| `npm run lint` | Ejecuta ESLint sobre el código. |

⚠️ **Advertencia sobre `npm run build`**: si tienes `VITE_SONAR_TOKEN` en `.env.local`, el token quedará embebido en el bundle compilado en `dist/`. **No subas el `dist/` a ningún sitio público.** Para despliegue seguro habría que rediseñar la app con un backend proxy (no contemplado en esta versión).

---

## 7. Estructura del proyecto

```
sonar-dashboard/
├── src/
│   └── sonar-dashboard.jsx     # Componente principal y lógica
├── public/                     # Assets estáticos
├── .env.example                # Plantilla de variables de entorno
├── .env.local                  # Variables reales (no se commitea)
├── .gitignore
├── package.json
├── vite.config.js              # Proxy a sonarcloud.io
└── README.md
```

El proxy de Vite (en `vite.config.js`) redirige `/api/*` a `https://sonarcloud.io/api/*`, evitando problemas de CORS desde el navegador.

---

## 8. Resolución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Pantalla de login no carga | Vite no arrancó | Revisa el terminal por errores; vuelve a lanzar `npm run dev` |
| Error `HTTP 401` | Token inválido o expirado | Genera uno nuevo en SonarCloud y actualiza `.env.local` o reintroduce |
| Error `HTTP 403` | Token sin permisos | Verifica que el token tiene acceso a la organización |
| `.env.local` ignorado | Vite no recogió los cambios | Reinicia `npm run dev` |
| Puerto 5173 ocupado | Proceso anterior sin cerrar | Ver sección **Cerrar la aplicación → Si el puerto se queda ocupado** |
| Sin proyectos en el listado | Token sin acceso a esa organización | Verifica `VITE_SONAR_ORG` o introduce la org correcta en el formulario |
