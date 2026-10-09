# DevHub Técnico · Manual de usuario

**Dirección:** https://devhub-tecnico.netlify.app

DevHub Técnico es la base de conocimiento del equipo: un solo lugar para guardar y encontrar
scripts, incidencias resueltas, notas, manuales y la documentación de los servicios que
consumimos (REST, SOAP, DataPower).

---

## 1. Acceso

1. Entra en la dirección de arriba e inicia sesión con tu correo y contraseña.
2. Si es tu primera vez, sigue el enlace del correo de invitación o confirmación.
3. ¿Olvidaste la contraseña? Pulsa **«¿Olvidaste tu contraseña?»** en la pantalla de inicio de
   sesión y sigue el enlace que te llega por correo.

> Consejo: en Chrome o Edge puedes pulsar **Instalar** en la barra de direcciones para abrir
> DevHub como una aplicación, con su propio icono.

---

## 2. La pantalla de inicio

| Bloque | Para qué sirve |
|---|---|
| Aviso de **lecciones abiertas** | Te avisa si hay incidencias sin resolver (en rojo si alguna es crítica). Al pulsarlo ves la lista. |
| **Tarjetas de módulos** | Cuántos recursos hay en cada módulo y cuántos son tuyos. |
| **Agregados recientemente** | Lo último que ha publicado el equipo. |
| **Continuar donde lo dejaste** | Tus últimos recursos creados o editados. |
| **Tus favoritos** | Acceso rápido a lo que marcaste con la estrella. |
| **Manuales más descargados** | Los documentos más usados. |
| **Etiquetas más usadas** | Pulsa una para buscarla. |
| **Almacenamiento de manuales** | Espacio usado del plan gratuito (1 GB, compartido por todos). |

---

## 3. Lo esencial

### Crear contenido

Usa el botón **+ Nuevo** de la barra superior desde cualquier pantalla y elige qué crear, o el
botón *Nuevo…* dentro de cada módulo.

### Público o privado

Todo recurso tiene una visibilidad:

- **Privado (solo yo):** nadie más lo ve. Es la opción por defecto.
- **Público (todo el equipo):** lo ve cualquier usuario de DevHub.

Solo el autor puede editar o eliminar su contenido. La excepción es el **superadministrador**
(su menú de usuario muestra «Superadministrador»): puede ver, editar y eliminar cualquier
recurso, también los privados, para mantener ordenada la base de conocimiento.

### Buscar

- Pulsa **Ctrl + K** (o **/**) desde cualquier pantalla para abrir el buscador global.
- No hace falta escribir tildes: `configuracion` encuentra «configuración».
- Frase exacta: `"error 500"` · Excluir una palabra: `soap -wsdl`.
- Dentro de cada módulo también puedes filtrar por texto, etiquetas, ámbito (*Todos los
  visibles*, *Solo míos*, *Solo públicos*) y criterios propios del módulo. Los filtros quedan en
  la dirección de la página, así que puedes compartir una búsqueda copiando el enlace.

### Etiquetas

Añade etiquetas para clasificar (por ejemplo `oracle`, `siac`, `datapower`). Escribe y pulsa
**Enter**. Se guardan en minúsculas y sin repetidos.

### Favoritos

Pulsa la **estrella ☆** en cualquier tarjeta o ficha. Los encontrarás en **Favoritos** (menú
lateral) y en la pantalla de inicio. Si un recurso favorito deja de estar disponible (su autor
lo hace privado o lo elimina), lo verás como «Recurso no disponible».

### Tema claro u oscuro

El icono de pantalla 🖥️ de la barra superior cambia entre *Sistema*, *Claro* y *Oscuro*.

---

## 4. Módulos

### 4.1 Scripts y plantillas

Fragmentos de código listos para copiar: SOAP, REST, SQL, Bash, PowerShell, Python, etc.

- Elige la **categoría** y el **lenguaje** (define el resaltado de colores y la extensión al descargar).
- Marca **«Es una plantilla reutilizable»** si es un punto de partida para otros.
- En la ficha: **Copiar código** y **Descargar** (con la extensión correcta: `.xml`, `.sql`, `.sh`…).

### 4.2 Lecciones aprendidas

Incidencias documentadas para que nadie tropiece dos veces con lo mismo.

- Campos: problema, causa raíz, solución, conclusión, severidad (*Baja, Media, Alta, Crítica*),
  categoría, tecnología y fecha en que ocurrió.
- Estados: **Abierta → Resuelta → Archivada**. Para marcarla como *Resuelta* hay que escribir la solución.
- Filtra por severidad, estado, categoría y tecnología.

### 4.3 Notas técnicas

Artículos, guías y contenido tipo wiki escrito en **Markdown** (títulos, listas, tablas, bloques
de código).

- Usa la vista previa del editor para ver cómo quedará.
- **Copiar enlace wiki** en una nota y pégalo en otra para enlazarlas.
- Al final de cada nota aparecen las **notas relacionadas** (las que comparten etiquetas).

### 4.4 Manuales

Documentos y diagramas: **PDF, Word, Excel, PowerPoint, texto, Markdown, PNG, JPG y WebP**,
hasta **50 MB** por archivo.

- **Vista previa** en el navegador para PDF, imágenes, texto y Markdown. La vista previa no
  cuenta como descarga.
- **Descargar** guarda el archivo con su nombre original y suma 1 al contador de descargas.
- **Antes de subir, comprime:** en Word, *Formato de imagen → Comprimir imágenes* (150 ppp);
  en PDF, *Reducir tamaño / Optimizar*. Un documento de 37 MB suele quedarse en 3–8 MB y el
  espacio es compartido por todo el equipo.
- Para cambiar el archivo, edita el manual y sube el nuevo; el anterior se borra.

### 4.5 Servicios

Catálogo de servicios REST y SOAP (incluidos los expuestos por DataPower), con todo lo necesario
para invocarlos. Una ficha por servicio, con una o varias **operaciones**.

**Datos del servicio**

| Campo | Ejemplo |
|---|---|
| Protocolo | REST o SOAP |
| Sistema | SIAC, OM, TCRM… |
| URL base (endpoint) | `http://172.19.172.21` |
| WSDL | `https://…/Servicio?wsdl` |
| Dominio / servicio DataPower | `MIG1_postventa` / `mpgw_svcProblem` |
| Autenticación | Basic (usuario y contraseña), Bearer token, API key (nombre del header + valor) u otra |
| Proyecto SoapUI | El archivo `*-soapui-project.xml` (máx. 50 MB) |
| Notas | Markdown: ambientes, contactos, errores frecuentes… |

**Cada operación**

- Nombre (p. ej. `ejecutaAccionMovil`) y método (GET, POST, PUT, PATCH, DELETE…).
- **Recurso**: la ruta que se añade a la URL base (`/v1.0/MIG1_postventa/…`).
- **SOAPAction** (solo SOAP) y **media type** (`application/json`, `text/xml; charset=utf-8`…).
- **Headers** y **query params** como pares nombre/valor.
- **Request** y **response de ejemplo**, con código HTTP. El botón **Formatear** ordena un JSON
  o XML pegado en una sola línea.
- Botones para subir, bajar, **duplicar** (útil para variantes de la misma operación) o eliminar.

**En la ficha del servicio**

- La credencial aparece oculta (••••); pulsa 👁 para verla o el botón de copiar.
- Cada operación muestra la URL completa y los botones **Copiar URL**, **Copiar request**,
  **Copiar response** y **Copiar cURL**.
- **Copiar cURL** genera el comando listo para pegar en **Git Bash, WSL o Linux** (no en
  PowerShell ni en CMD). Marca **«Incluir credenciales en cURL»** si quieres que lleve el usuario
  y la contraseña o el token.
- **Proyecto SoapUI** descarga el proyecto adjunto para abrirlo en SoapUI.

> ⚠️ **Credenciales:** si el servicio es **público**, todo el equipo verá sus credenciales.
> No guardes credenciales de producción y elimina datos reales de clientes de los ejemplos.
> Recuerda que `Authorization: Basic …` no está cifrado: es el usuario y la contraseña en Base64.

### 4.6 Herramientas

Utilidades que funcionan en tu navegador, sin enviar ni guardar nada:

| Herramienta | Uso |
|---|---|
| DNI y RUC sintéticos | Genera DNI y RUC peruanos ficticios válidos y valida un RUC. |
| Generador de UUID v4 | Genera UUID y comprueba su formato. |
| Tarjetas de prueba | Números de tarjetas de sandbox de pasarelas de pago y validador Luhn. |
| Formateador XML | Formatea, minifica y comprueba que un XML esté bien formado. |
| Formateador SOAP | Formatea un sobre SOAP 1.1/1.2 y muestra operación, cabecera y Fault. |
| Comparador de carpetas | Lista los archivos cuyo contenido cambió entre dos carpetas (ver abajo). |

#### Comparador de carpetas

Sirve para saber qué archivos cambiaron entre dos versiones de un proyecto (por ejemplo, la
fuente original y la modificada antes de un pase).

1. Ve a **Herramientas → Comparador de carpetas**.
2. En **Ruta Fuente 1 (Origen)** pulsa **Seleccionar carpeta** y elige la carpeta original;
   el navegador te pedirá permiso para leerla.
3. Haz lo mismo con **Ruta Fuente 2 (Destino)**. El botón ⟳ intercambia origen y destino.
4. Pulsa **Comparar carpetas**.

El resultado muestra el **total de archivos modificados** y la lista de rutas en el formato
`\src\app\app.component.ts`, repartida en pestañas:

| Pestaña | Contenido |
|---|---|
| **Nuevos y modificados** (por defecto) | Todo lo que cambió en el destino, mezclado y ordenado por ruta, con la etiqueta **Modificado** o **Nuevo** en cada archivo. |
| Modificados | Archivos que están en ambas carpetas con contenido distinto. |
| Solo en origen | Archivos que ya no están en el destino. |
| Solo en destino | Archivos nuevos en el destino. |

Puedes filtrar la lista, **copiarla** o **descargarla como .txt**. Se copian solo las rutas, una
por línea (sin las etiquetas), listas para pegar en un pase.

- La comparación es por **contenido** (hash SHA-256), no por fechas: un archivo copiado sin
  cambios no aparece como modificado.
- Se ignoran siempre las carpetas `node_modules`, `.angular`, `dist`, `.vscode`, `coverage`,
  `.git`, `.idea`, `docs` y las de compilación de .NET / Visual Studio: `bin`, `obj`, `Debug`,
  `.vs` y `packages` (paquetes NuGet).
- En **Ignorar también estas carpetas** puedes añadir otras, separadas por comas (por ejemplo
  `Release, TestResults`). Se aplican en cualquier nivel, sin volver a elegir las
  carpetas, y el navegador las recuerda para la próxima vez.
- Los archivos **no se suben a ningún servidor**: se leen y comparan en tu navegador.
- Funciona mejor en **Chrome o Edge**. En otros navegadores, el cuadro para elegir la carpeta
  puede decir «subir»; aun así, nada sale de tu equipo.

---

## 5. Buenas prácticas

- **Nunca** pegues contraseñas, tokens ni datos reales de clientes en scripts, notas o ejemplos
  públicos. Las únicas credenciales admitidas van en el apartado *Autenticación* de un servicio.
- Pon un **título claro** y **etiquetas**: es lo que más pesa en la búsqueda.
- Prefiere una **nota** a un documento cuando el contenido sea texto: ocupa casi nada y su
  contenido se puede buscar (de los manuales solo se buscan el título, la descripción, las
  etiquetas y el nombre del archivo).
- Comprime los documentos antes de subirlos.

---

## 6. Preguntas frecuentes

**No veo un recurso que un compañero dice haber creado.**
Probablemente es privado. Pídele que lo marque como *Público*.

**No puedo editar un recurso.**
Solo su autor (o un superadministrador) puede editarlo.

**El archivo no se sube.**
Revisa el formato admitido y que no supere 50 MB. Si el contenido no coincide con la extensión
(por ejemplo, un HTML renombrado a `.pdf`), se rechaza por seguridad.

**La pantalla de inicio dice «No se pudo cargar el resumen».**
Pulsa *Reintentar*. Si persiste, avisa al administrador.

**La aplicación no carga tras varios días sin uso.**
El plan gratuito pausa la base de datos tras 7 días sin actividad; el administrador la reactiva
desde Supabase.
