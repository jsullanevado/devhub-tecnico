# DevHub Técnico

Base de conocimiento técnico del equipo: scripts y plantillas, lecciones aprendidas, notas tipo wiki,
manuales y documentos, y un catálogo de **servicios REST/SOAP/DataPower** con sus operaciones.

- **Producción:** https://devhub-tecnico.netlify.app
- **Código:** https://github.com/jsullanevado/devhub-tecnico
- **Manual de usuario:** [docs/manual-usuario.md](docs/manual-usuario.md)

Este documento es para quien instala, despliega o mantiene la aplicación.

---

## 1. Arquitectura

| Capa | Tecnología |
|---|---|
| Frontend | Angular 22 (standalone, zoneless, signals), Tailwind CSS v4, CodeMirror 6 |
| Backend | Supabase: PostgreSQL + Auth + Storage + API REST (PostgREST) |
| Seguridad | Row Level Security (RLS) en todas las tablas, privilegios por columna, bucket privado |
| Hosting | Netlify (SPA estática), despliegue automático desde la rama `main` de GitHub |
| Pruebas | Vitest (unitarias), Playwright (E2E con Supabase simulado) |

La aplicación es una SPA que habla directamente con Supabase usando la clave **publishable**
(pública por diseño). Toda la autorización la aplica la base de datos (RLS); el frontend no
tiene lógica de seguridad propia más allá de ocultar botones.

### Modelo de datos

| Tabla | Contenido |
|---|---|
| `profiles` | Perfil de cada usuario (creado por trigger al registrarse). `role`: `user`, `admin` o `superadmin`. |
| `scripts` | Scripts y plantillas (código con lenguaje y categoría). |
| `lessons_learned` | Incidencias: problema, causa raíz, solución, severidad, estado. |
| `notes` | Notas en Markdown (artículos, wiki, guías). |
| `manuals` | Metadatos de documentos; el archivo vive en Storage. |
| `services` | Servicios REST/SOAP: URL base, DataPower, autenticación, notas, proyecto SoapUI y operaciones (`jsonb`). |
| `user_favorites` | Favoritos de cada usuario (una FK por tipo de recurso). |

Reglas comunes de los recursos:

- `visibility = 'private'` → solo el propietario; `'public'` → todos los usuarios autenticados.
- Roles:
  - **user**: crea contenido; ve lo público y lo propio; edita y elimina **solo lo propio**.
  - **admin**: como user, y además puede eliminar recursos **públicos** ajenos (moderación).
  - **superadmin**: ve, edita y elimina **todo**, de cualquier autor, incluidos los recursos
    privados ajenos. Al sustituir el archivo de un recurso ajeno, se guarda en la carpeta del autor.
- Nadie puede cambiar su rol ni el de otros desde la app: solo por SQL.
- Los usuarios anónimos no tienen acceso a ninguna tabla ni función.
- Bucket `devhub-documents` **privado**: archivos en `{userId}/{uuid}.{ext}`, descarga con URL firmada de 60 s.

Funciones expuestas a la API: `search_resources` (búsqueda global), `register_manual_download`
(contador de descargas) y `dashboard_summary` (panel de inicio).

---

## 2. Puesta en marcha local

Requisitos: **Node 22** (`node -v` ≥ 22.22), npm y un proyecto de Supabase.

```bash
npm install
npm start            # http://localhost:4200
```

Configuración en [src/environments/environment.development.ts](src/environments/environment.development.ts)
(desarrollo) y [src/environments/environment.ts](src/environments/environment.ts) (producción):

```ts
supabase: {
  url: 'https://<ref>.supabase.co',
  publishableKey: 'sb_publishable_…',   // NUNCA la secret / service_role
},
```

La aplicación se niega a arrancar si detecta una clave privilegiada (`sb_secret_…` o `service_role`).

> **Windows:** si `node -v` muestra una versión antigua dentro de VS Code, cierra **todas** las
> ventanas de VS Code y vuelve a abrirlo para que tome el PATH actualizado.

---

## 3. Base de datos: migraciones

Se ejecutan **en este orden** en *Supabase → SQL Editor* (o con `supabase db push`). Todas son
idempotentes y transaccionales: si algo falla no queda nada a medias.

| # | Archivo | Qué hace |
|---|---|---|
| 1 | [20261008000000_etapa1_esquema_seguridad.sql](supabase/migrations/20261008000000_etapa1_esquema_seguridad.sql) | Esquema base, RLS, búsqueda en español sin tildes, Storage |
| 2 | [20261009000000_manuals_limite_50mb.sql](supabase/migrations/20261009000000_manuals_limite_50mb.sql) | Límite de manuales de 20 MB a 50 MB |
| 3 | [20261010000000_dashboard_resumen.sql](supabase/migrations/20261010000000_dashboard_resumen.sql) | Función `dashboard_summary` del panel de inicio |
| 4 | [20261011000000_servicios.sql](supabase/migrations/20261011000000_servicios.sql) | Módulo Servicios, SoapUI, favoritos/búsqueda/panel con servicios |
| 5 | [20261012000000_superadmin.sql](supabase/migrations/20261012000000_superadmin.sql) | Rol `superadmin` (ve, edita y elimina todo) |

### Verificación

1. [supabase/tests/etapa1_validacion_resumen.sql](supabase/tests/etapa1_validacion_resumen.sql):
   una tabla con `ok = true` en todas las filas.
2. [supabase/tests/superadmin_pruebas.sql](supabase/tests/superadmin_pruebas.sql): permisos del superadmin;
   debe terminar sin error.
3. [supabase/tests/etapa1_pruebas_rls.sql](supabase/tests/etapa1_pruebas_rls.sql): debe terminar
   sin error (crea usuarios ficticios, prueba los permisos y lo revierte todo).
4. *Advisors → Security Advisor*: 0 errores. Avisos conocidos y aceptados:
   - `register_manual_download` es SECURITY DEFINER a propósito (incrementa un contador que el
     cliente no puede escribir; valida sesión y visibilidad).
   - *Leaked Password Protection* solo existe en el plan Pro.

### Ajustes del panel de Supabase

- *Authentication → URL Configuration*: Site URL `https://devhub-tecnico.netlify.app`;
  Redirect URLs `https://devhub-tecnico.netlify.app/**` y `http://localhost:4200/**`.
- *Authentication → Sign In / Providers → Email*: confirmación de correo activada, contraseña mínima 8.
- *Storage → Settings*: límite global de subida ≥ 50 MB.
- *Data API*: solo el esquema `public` expuesto (nunca `private`).

---

## 4. Pruebas

```bash
npx ng test --watch=false   # unitarias (Vitest)
npm run e2e                 # E2E (Playwright, Supabase simulado en e2e/support/supabase-mock.ts)
npm run build               # build de producción
```

Las E2E usan el Chrome instalado y levantan su propio servidor en el puerto 4300; no tocan la base
de datos real.

---

## 5. Despliegue

Cada `git push` a `main` publica automáticamente en Netlify (≈2 min). La configuración está en
[netlify.toml](netlify.toml): build con Node 22, publicación de `dist/devhub-tecnico/browser`,
redirección SPA y cabeceras de seguridad.

**Orden obligatorio** cuando un cambio incluye una migración: primero ejecutar la migración en
Supabase, después hacer el `push`. Si se publica antes, las pantallas que dependen de ella
mostrarán un error.

Las etiquetas Open Graph (vista previa en WhatsApp/Teams) apuntan a
`https://devhub-tecnico.netlify.app/og-image.png`: si cambia el dominio, actualizar
[src/index.html](src/index.html).

---

## 6. Administración

| Tarea | Dónde |
|---|---|
| Ver, invitar o eliminar usuarios | Supabase → *Authentication → Users* |
| Nombrar administrador | SQL: `update public.profiles set role = 'admin' where id = '<uuid>';` |
| Nombrar superadministrador | SQL: `update public.profiles set role = 'superadmin' where id = '<uuid>';` (el uuid está en *Table Editor → profiles*) |
| Quitar un rol | SQL: `update public.profiles set role = 'user' where id = '<uuid>';` |
| Vigilar cuotas del plan Free (1 GB Storage, 5 GB/mes de transferencia, 500 MB BD) | Supabase → organización → *Usage*; también la barra del panel de inicio |
| Revisar seguridad | Supabase → *Advisors → Security Advisor* |

Notas del plan gratuito:

- El proyecto de Supabase se **pausa tras 7 días sin uso**; se reactiva desde el panel sin perder datos.
- El correo integrado de Supabase solo envía a los miembros del equipo de Supabase y muy pocos
  por hora: para invitar a otras personas o recuperar contraseñas hay que configurar un **SMTP
  propio** (*Authentication → Emails → SMTP Settings*).

### Credenciales en el módulo Servicios

Por decisión del equipo, las credenciales de un servicio son visibles para quien pueda ver el
servicio (privado → solo su autor; público → todo el equipo). Se guardan en la base de datos
(cifrada en disco por Supabase) y son legibles para quien tenga acceso al panel de Supabase.
Recomendación: no guardar credenciales de producción.

---

## 7. Estructura del código

```
src/app/
  core/        auth, acceso a datos (services de Supabase), modelos, errores, rutas
  shared/      componentes reutilizables (formularios, editor de código, listados, UI)
  layout/      shell, barra superior, menú lateral, buscador global, menú "Nuevo"
  features/    una carpeta por módulo: dashboard, scripts, lessons, notes, manuals,
               services, favorites, tools, auth
supabase/
  migrations/  SQL en orden de ejecución
  tests/       validación y pruebas de RLS
e2e/           pruebas Playwright y Supabase simulado
docs/          manual de usuario
```

Para añadir un módulo de contenido: tabla + RLS + rama en `private.resource_before_write`
(migración), tipo en `ResourceType`, ruta en `RESOURCE_PATHS` y `app.routes.ts`, entrada en
`layout/navigation.ts` e icono en `shared/resources/resource-type-icons.ts`.

---

## 8. Pendientes conocidos

- Cerrar el registro abierto: desactivar *Allow new users to sign up*, configurar SMTP e invitar
  usuarios; adaptar la app (quitar "Regístrate" y añadir "Crea tu contraseña" para invitados).
- Admitir archivos `.bpm` / `.bpmn` en Manuales (opcionalmente con visor BPMN).
