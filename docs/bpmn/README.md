# Diagramas BPMN de DevHub Técnico

Un diagrama por transacción, con tres carriles: **Front** (Angular en el navegador) ·
**Servicio** (API de Supabase: Auth, PostgREST, Storage y RPC) · **BD** (PostgreSQL: RLS,
triggers y CHECK). Las partes extensas son **subprocesos** con su propio archivo.

> Archivos generados por `scripts/bpmn/generar-bpmn.mjs` a partir de
> `scripts/bpmn/flujos.mjs`. No los edites a mano: cambia el flujo y ejecuta `npm run bpmn`.

## Abrirlos en Bizagi Modeler

1. *Archivo* (o el menú de Bizagi) → **Importar** → **BPMN** (*Importar desde XPDL/BPMN*).
2. Elige el archivo `.bpmn`. Cada archivo se importa como un diagrama con su pool y sus carriles.
3. Para enlazar un subproceso: en el diagrama principal, clic derecho sobre la caja
   **SPxx** → propiedades del subproceso → tipo **Reutilizable** → selecciona el diagrama
   del subproceso importado.

También se abren en https://demo.bpmn.io (arrastrar el archivo) o en Camunda Modeler.

## Índice

| Diagrama | Tipo |
|---|---|
| [T01 · Registro de usuario](T01-registro-de-usuario.bpmn) | Transacción |
| ↳ [SP01 · Crear perfil (trigger handle_new_user)](SP01-crear-perfil.bpmn) | Subproceso de T01 |
| [T02 · Inicio de sesión](T02-inicio-de-sesion.bpmn) | Transacción |
| [T03 · Recuperar contraseña](T03-recuperar-contrasena.bpmn) | Transacción |
| [T04 · Crear o editar recurso (script, lección o nota)](T04-crear-o-editar-recurso.bpmn) | Transacción |
| ↳ [SP02 · Cargar recurso y permisos](SP02-cargar-recurso-y-permisos.bpmn) | Subproceso de T04 |
| ↳ [SP03 · Validar y guardar en BD](SP03-validar-y-guardar-en-bd.bpmn) | Subproceso de T04 |
| [T05 · Eliminar recurso](T05-eliminar-recurso.bpmn) | Transacción |
| [T06 · Subir manual](T06-subir-manual.bpmn) | Transacción |
| ↳ [SP04 · Validar archivo en el navegador](SP04-validar-archivo-en-el-navegador.bpmn) | Subproceso de T06 |
| ↳ [SP05 · Registrar manual en BD](SP05-registrar-manual-en-bd.bpmn) | Subproceso de T06 |
| [T07 · Ver o descargar manual](T07-ver-o-descargar-manual.bpmn) | Transacción |
| [T08 · Guardar servicio (REST/SOAP) con proyecto SoapUI](T08-guardar-servicio.bpmn) | Transacción |
| ↳ [SP06 · Definir operaciones del servicio](SP06-definir-operaciones.bpmn) | Subproceso de T08 |
| ↳ [SP07 · Subir proyecto SoapUI](SP07-subir-proyecto-soapui.bpmn) | Subproceso de T08 |
| ↳ [SP08 · Validar servicio en BD](SP08-validar-servicio-en-bd.bpmn) | Subproceso de T08 |
| [T09 · Búsqueda global (Ctrl+K)](T09-busqueda-global.bpmn) | Transacción |
| [T10 · Marcar o quitar favorito](T10-marcar-favorito.bpmn) | Transacción |
| [T11 · Panel de inicio](T11-panel-de-inicio.bpmn) | Transacción |
| ↳ [SP09 · Calcular resumen del panel (dashboard_summary)](SP09-calcular-resumen-del-panel.bpmn) | Subproceso de T11 |
| [T12 · Comparar carpetas](T12-comparar-carpetas.bpmn) | Transacción |
| ↳ [SP10 · Comparar por contenido (SHA-256)](SP10-comparar-por-contenido.bpmn) | Subproceso de T12 |

## Convenciones

- Tarea con persona = acción del usuario; engranaje = llamada a un servicio; documento = lógica en BD.
- Fin con rayo = termina en error (con el código de PostgreSQL cuando aplica: 42501 sin permisos,
  23514 dato inválido, 23503 referencia inexistente).
- Los carriles vacíos se mantienen para conservar el formato de 3 carriles en todos los diagramas.
