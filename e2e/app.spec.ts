import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, login, openNavIfCollapsed, test } from './support/fixtures';
import { SCRIPTS, SERVICES } from './support/supabase-mock';

test.describe('Autenticación y rutas protegidas', () => {
  test('una ruta privada sin sesión redirige al login conservando el destino', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await page.goto('/scripts');
    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fscripts$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page).toHaveTitle('Iniciar sesión · DevHub Técnico');
  });

  test('el login valida campos y muestra credenciales incorrectas', async ({
    page,
    favorites: _mock,
    consoleErrors,
  }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Este campo es obligatorio.').first()).toBeVisible();

    await page.getByLabel('Correo electrónico').fill('qa@devhub.test');
    await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.');
    // El navegador registra el 400 de la petición fallida: es el comportamiento esperado.
    consoleErrors.splice(0);
  });

  test('el registro valida formato de usuario y confirmación de contraseña', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await page.goto('/auth/register');
    await page.getByLabel('Nombre de usuario').fill('a b');
    await page.getByLabel('Contraseña', { exact: true }).fill('Secreta123');
    await page.getByLabel('Confirmar contraseña').fill('Distinta123');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
    await expect(page.getByText(/Usa 3-30 caracteres/)).toBeVisible();
  });

  test('login correcto vuelve al destino y cerrar sesión pide confirmación', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page, '/scripts');
    await expect(page.getByRole('heading', { name: 'Scripts y plantillas' })).toBeVisible();

    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cerrar sesión' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('la sesión persiste al recargar', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Hola, Ana/ })).toBeVisible();
  });
});

test.describe('Layout, tema y navegación', () => {
  test('el tema oscuro se aplica y persiste', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await page.goto('/auth/login');
    const html = page.locator('html');
    const toggle = page.getByRole('button', { name: /^Tema / });
    // El tema se aplica tras el siguiente render: se espera a que cambie la etiqueta antes de seguir.
    for (let clicks = 0; clicks < 3; clicks++) {
      const label = (await toggle.getAttribute('aria-label')) ?? '';
      if (label.startsWith('Tema oscuro')) {
        break;
      }
      await toggle.click();
      await expect(toggle).not.toHaveAttribute('aria-label', label);
    }
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
  });

  test('el menú lateral navega entre módulos', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page);
    await openNavIfCollapsed(page);
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Herramientas' })
      .click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(page.getByRole('heading', { name: 'Herramientas', level: 1 })).toBeVisible();
  });

  test('una URL inexistente muestra la página 404', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page);
    await page.goto('/no-existe');
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  });
});

test.describe('Scripts, búsqueda y favoritos', () => {
  test('lista scripts y los filtros se reflejan en la URL', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page, '/scripts');
    for (const script of SCRIPTS) {
      await expect(page.getByRole('link', { name: script.title })).toBeVisible();
    }
    await page.getByRole('combobox', { name: 'Categoría' }).selectOption('sql');
    await expect(page).toHaveURL(/category=sql/);
    await expect(page.getByRole('link', { name: SCRIPTS[1].title })).toBeVisible();
    await expect(page.getByRole('link', { name: SCRIPTS[0].title })).toHaveCount(0);
  });

  test('el detalle muestra el código resaltado y permisos según propietario', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page, `/scripts/${SCRIPTS[1].id}`);
    await expect(page.getByRole('heading', { name: SCRIPTS[1].title })).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('select * from clientes');
    // Script de otro usuario: sin acciones de edición ni borrado.
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

    await page.goto(`/scripts/${SCRIPTS[0].id}`);
    await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible();
  });

  test('Ctrl+K abre el buscador global y Enter abre el resultado', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page);
    await page.keyboard.press('Control+k');
    const search = page.getByRole('combobox', { name: /Buscar scripts/ });
    await expect(search).toBeFocused();
    await search.fill('soap');
    await expect(page.getByRole('option', { name: /Petición SOAP/ })).toBeVisible();
    await search.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/scripts/${SCRIPTS[0].id}$`));
    await expect(page.locator('.cm-content')).toContainText('LOGIN_DE_PRUEBA');
  });

  test('marcar un favorito lo muestra en la página de favoritos y se puede quitar', async ({
    page,
    favorites,
    consoleErrors: _errors,
  }) => {
    await login(page, '/scripts');
    const star = page.getByRole('button', { name: `Añadir «${SCRIPTS[1].title}» a favoritos` });
    await star.click();
    await expect(
      page.getByRole('button', { name: `Quitar «${SCRIPTS[1].title}» de favoritos` }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(favorites.favorites).toHaveLength(1);

    await page.goto('/favorites');
    await expect(page.getByRole('link', { name: SCRIPTS[1].title })).toBeVisible();
    await page.getByRole('button', { name: `Quitar ${SCRIPTS[1].title} de favoritos` }).click();
    await expect(page.getByText('Aún no tienes favoritos')).toBeVisible();
    expect(favorites.favorites).toHaveLength(0);
  });

  test('un formulario con cambios pide confirmación al salir', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page, '/scripts/new');
    await page.getByLabel('Título').fill('Borrador sin guardar');
    await page.getByRole('link', { name: 'Cancelar' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Cambios sin guardar' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page).toHaveURL(/\/scripts\/new$/);
  });
});

test.describe('Panel de inicio', () => {
  test('muestra contadores, recientes, lecciones abiertas y uso de almacenamiento', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page);
    const scriptsCard = page.getByRole('main').getByRole('link', { name: /Scripts y plantillas/ });
    await expect(scriptsCard).toContainText(String(SCRIPTS.length));
    await expect(scriptsCard).toContainText('1 tuyo');
    await expect(page.getByRole('link', { name: /2 lecciones abiertas/ })).toHaveAttribute(
      'href',
      '/lessons?status=open',
    );
    const recent = page.getByRole('region', { name: 'Agregados recientemente' });
    await expect(recent.getByRole('link', { name: /Consulta de clientes activos/ })).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Almacenamiento de manuales' }),
    ).toHaveAttribute('aria-valuenow', '29.3');
  });

  test('una etiqueta abre el buscador con ese término', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page);
    await page.getByRole('button', { name: 'Buscar la etiqueta soap' }).click();
    await expect(page.getByRole('combobox', { name: /Buscar scripts/ })).toHaveValue('soap');
    await expect(page.getByRole('option', { name: /Petición SOAP/ })).toBeVisible();
  });

  test('el botón Nuevo lleva al formulario del recurso elegido', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page);
    await page.getByRole('button', { name: 'Nuevo recurso' }).click();
    await page.getByRole('menuitem', { name: 'Script o plantilla' }).click();
    await expect(page).toHaveURL(/\/scripts\/new$/);
  });
});

test.describe('Servicios', () => {
  test('el detalle muestra la operación y oculta las credenciales hasta pedirlas', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    const service = SERVICES[0];
    await login(page, '/services');
    await page.getByRole('link', { name: service.title }).click();
    await expect(page).toHaveURL(new RegExp(`/services/${service.id}$`));
    await expect(
      page.getByText('http://10.0.0.1/v1.0/svcProblem/ejecutaAccionMovil'),
    ).toBeVisible();
    await expect(page.getByText(service.auth_secret)).toHaveCount(0);
    await page.getByRole('button', { name: 'Mostrar secreto' }).click();
    await expect(page.getByText(service.auth_secret)).toBeVisible();
    await expect(page.locator('.cm-content').last()).toContainText('MessageResponse');
  });

  test('crea un servicio con una operación', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page, '/services/new');
    await page.getByLabel('Título').fill('Consulta de clientes QA');
    await page.getByLabel('URL base (endpoint)').fill('sin-protocolo');
    await page.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(page.getByText('Debe empezar por http:// o https://').first()).toBeVisible();
    await expect(page.getByText('El nombre es obligatorio.')).toBeVisible();

    await page.getByLabel('URL base (endpoint)').fill('https://api.qa.test');
    await page.getByLabel('Nombre de la operación').fill('consultarCliente');
    await page.getByLabel('Recurso (ruta tras la URL base)').fill('/clientes');
    await page.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(page).toHaveURL(/\/services\/cccccccc-0000-4000-8000-000000000099$/);
    await expect(page.getByText('https://api.qa.test/clientes')).toBeVisible();
  });
});

test.describe('Herramientas', () => {
  test('genera RUC válidos y valida el RUC de SUNAT', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page, '/tools/peru-ids');
    await page.getByLabel('Tipo').selectOption('ruc-juridica');
    await page.getByRole('button', { name: 'Generar' }).click();
    await expect(page.getByText('5 valores generados (ficticios)')).toBeVisible();
    await page.getByLabel(/DNI \(8 dígitos\) o RUC/).fill('20131312955');
    await expect(page.getByText('Formato y dígito verificador correctos.')).toBeVisible();
  });

  test('formatea XML y detecta XML mal formado', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    await login(page, '/tools/xml');
    await page.getByLabel('XML de entrada').fill('<a><b>1</b></a>');
    await page.getByRole('button', { name: 'Formatear' }).click();
    await expect(page.getByText('XML bien formado. Formato aplicado.')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('<b>1</b>');

    await page.getByLabel('XML de entrada').fill('<a><b></a>');
    await page.getByRole('button', { name: 'Solo validar' }).click();
    await expect(page.getByText(/XML mal formado/)).toBeVisible();
  });
});

test.describe('Comparador de carpetas', () => {
  test('lista los archivos modificados por contenido e ignora node_modules', async ({
    page,
    favorites: _mock,
    consoleErrors: _errors,
  }) => {
    const root = mkdtempSync(join(tmpdir(), 'devhub-compare-'));
    const write = (folder: string, path: string, content: string) => {
      const file = join(root, folder, ...path.split('/'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    };
    write('fuente1', 'src/app/app.ts', 'export const a = 1;');
    write('fuente1', 'src/app/igual.ts', 'sin cambios');
    write('fuente1', 'supabase/migrations/001.sql', 'select 1;');
    write('fuente1', 'node_modules/lib/index.js', 'uno');
    write('fuente2', 'src/app/app.ts', 'export const a = 2;');
    write('fuente2', 'src/app/igual.ts', 'sin cambios');
    write('fuente2', 'supabase/migrations/001.sql', 'select 2;');
    write('fuente2', 'node_modules/lib/index.js', 'dos');

    try {
      // Fuerza la alternativa <input webkitdirectory>, automatizable en Playwright.
      await page.addInitScript(() => {
        delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      });
      await login(page, '/tools/folder-compare');
      const inputs = page.locator('input[type=file][webkitdirectory]');
      await inputs.nth(0).setInputFiles(join(root, 'fuente1'));
      await inputs.nth(1).setInputFiles(join(root, 'fuente2'));
      await page.getByRole('button', { name: 'Comparar carpetas' }).click();

      await expect(page.getByTestId('modified-count')).toHaveText('2');
      const list = page.locator('#compare-list');
      await expect(list).toContainText('\\src\\app\\app.ts');
      await expect(list).toContainText('\\supabase\\migrations\\001.sql');
      await expect(list).not.toContainText('igual.ts');
      await expect(list).not.toContainText('node_modules');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
