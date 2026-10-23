import { type BrowserContext, expect, test } from '@playwright/test';

/**
 * Playwright corta la red de la página pero no la del service worker (un celular sin señal corta las dos).
 * Para que la prueba sea fiel, también se le hace fallar el `fetch` al worker, desde afuera: el código de producción no cambia.
 */
async function sinRedParaElWorker(context: BrowserContext, sinRed: boolean) {
  for (const worker of context.serviceWorkers())
    await worker.evaluate((cortar) => {
      const g = globalThis as unknown as { fetch: typeof fetch; __fetchOriginal?: typeof fetch };
      if (cortar) {
        g.__fetchOriginal ??= g.fetch;
        g.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      } else if (g.__fetchOriginal) {
        g.fetch = g.__fetchOriginal;
      }
    }, sinRed);
}

// Recorrido de la demo pública (ADR-019, E37-09). Requiere el entorno de demo: `pnpm demo --publica`,
// y se corre con `pnpm --filter @potrero/web test:e2e:publica`.

test('de la landing a mi sandbox: panel, sitio público, reinicio y sin registro abierto', async ({
  page,
}) => {
  // La landing ofrece la demo y, al lado, el ingreso a la liga real.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Ingresar' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Probá la demo' }).first().click();
  await expect(page).toHaveURL(/\/demo$/);

  // Una persona crea su sandbox con un toque y cae en su panel con datos cargados.
  await page.getByRole('button', { name: 'Entrar a la demo' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('status')).toContainText('Estás en la demo de Potrero');

  // Su sitio público tiene la tabla de la plantilla, sin datos personales.
  const primera = (await (await page.request.get('/api/auth/yo')).json()).organizacion;
  await page.goto(`/t/${primera.slug}/apertura-2026`);
  await expect(page.getByText('Tabla de posiciones')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(8);

  // Reiniciar descarta la sandbox y entrega otra, igual de completa.
  await page.goto('/panel');
  const reinicio = page.waitForResponse((r) => r.url().endsWith('/api/demo/reiniciar'), { timeout: 60_000 });
  await page.getByRole('button', { name: 'Reiniciar demo' }).click();
  expect((await reinicio).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();
  const segunda = (await (await page.request.get('/api/auth/yo')).json()).organizacion;
  expect(segunda.id).not.toBe(primera.id);
  // La sandbox anterior ya no existe y la nueva tiene sus datos completos.
  expect((await page.request.get(`/api/publico/${primera.slug}/apertura-2026`)).status()).toBe(404);
  await page.goto(`/t/${segunda.slug}/apertura-2026`);
  await expect(page.locator('tbody tr')).toHaveCount(8);

  // En la demo no se crean cuentas permanentes.
  await page.context().clearCookies();
  await page.goto('/registro');
  await page.getByLabel('Nombre de la liga').fill('Liga Eterna');
  await page.getByLabel('Tu nombre').fill('Intruso');
  await page.getByLabel('Email').fill(`intruso${Date.now()}@test.com`);
  await page.getByLabel('Contraseña').fill('clave-segura-1');
  await page.getByRole('button', { name: /Crear/ }).click();
  await expect(page.getByText('En la demo no se crean cuentas')).toBeVisible();
});

test('copa: se ve el cuadro y la final empatada se define por penales', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Entrar a la demo' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible({ timeout: 60_000 });
  const torneos = await (await page.request.get('/api/torneos')).json();
  const copa = torneos.find((t: { nombre: string }) => t.nombre === 'Copa Relámpago');

  // El cuadro muestra cuartos y semifinales jugadas (con penales en uno) y la final lista.
  await page.goto(`/panel/torneos/${copa.id}?tab=llaves`);
  await expect(page.getByText('Cuartos de final')).toBeVisible();
  await expect(page.getByText('Semifinales')).toBeVisible();
  await expect(page.getByText('(4)')).toBeVisible();
  await expect(page.getByText('A definir')).toBeVisible();

  // Se juega la final desde el acta: 1-1 y, como es llave, el cierre pide los penales.
  const finalCard = page
    .locator('div.rounded-2xl', { hasText: 'Deportivo Sur' })
    .filter({ hasText: 'Juventud Unida' })
    .last();
  await finalCard.getByRole('link', { name: 'Acta' }).click();
  await page.getByRole('button', { name: 'Iniciar partido' }).click();
  await page.getByRole('button', { name: 'Gol', exact: true }).first().click();
  await page.locator('.seg').getByRole('button', { name: 'Juventud Unida' }).click();
  await page.getByRole('button', { name: 'Gol', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cerrar acta' }).click();
  await page.getByLabel(/Firma del capitán de Deportivo Sur/).check();
  await page.getByLabel(/Firma del capitán de Juventud Unida/).check();
  await expect(page.getByText('terminó empatado: cargá los penales')).toBeVisible();
  await page.getByLabel('Deportivo Sur', { exact: true }).fill('3');
  await page.getByLabel('Juventud Unida', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Confirmar cierre' }).click();
  await expect(page.getByText('Definido por penales: 3-5')).toBeVisible();

  // El campeón queda definido y el torneo finaliza.
  const llave = await (await page.request.get(`/api/torneos/${copa.id}/llave`)).json();
  expect(llave.campeon.nombre).toBe('Juventud Unida');
  await page.goto(`/panel/torneos/${copa.id}?tab=llaves`);
  await expect(page.getByText('Juventud Unida').last()).toBeVisible();
  await expect(page.getByText('Finalizado')).toBeVisible();
});

// Sin servidor, la pantalla solo se vuelve a abrir desde el service worker con el build de producción: en `next dev` no se
// hidrata. Correr con WEB_PRODUCCION=1 contra `pnpm build` + `next start` (ver apps/web/CLAUDE.md).
test('acta sin conexión: se carga sin señal, nada se pierde y al volver se sincroniza', async ({
  page,
  context,
}) => {
  test.skip(!process.env.WEB_PRODUCCION, 'Requiere el build de producción (WEB_PRODUCCION=1).');
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Entrar a la demo' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible({ timeout: 60_000 });
  const torneos = await (await page.request.get('/api/torneos')).json();
  const apertura = torneos.find((t: { nombre: string }) => t.nombre === 'Apertura 2026');
  const partidos = await (await page.request.get(`/api/torneos/${apertura.id}/partidos`)).json();
  const p = partidos.find((x: { estado: string }) => x.estado === 'PROGRAMADO');

  // Con señal: se abre el acta una vez y el navegador guarda la pantalla.
  await page.goto(`/panel/partidos/${p.id}`);
  await expect(page.getByTestId('estado-sync')).toContainText('En línea');
  // El navegador guarda la pantalla y sus archivos (el worker lo hace en segundo plano).
  await expect
    .poll(() =>
      page.evaluate(async (ruta) => {
        const cache = await caches.open('potrero-acta-v2');
        return !!(await cache.match(ruta)) && (await cache.keys()).length > 5;
      }, `/panel/partidos/${p.id}`),
    )
    .toBe(true);

  // Sin señal: la pantalla vuelve a abrir y el partido se juega igual.
  await context.setOffline(true);
  await sinRedParaElWorker(context, true);
  await page.reload();
  await expect(page.getByTestId('estado-sync')).toContainText('Sin conexión');
  await page.getByRole('button', { name: 'Iniciar partido' }).click();
  await page.getByRole('button', { name: 'Gol', exact: true }).first().click();
  await page.getByRole('button', { name: 'Gol', exact: true }).nth(1).click();
  await page.locator('.seg').getByRole('button').nth(1).click();
  await page.getByRole('button', { name: 'Gol', exact: true }).first().click();
  await expect(page.getByTestId('marcador')).toHaveText('2-1');
  await expect(page.getByTestId('estado-sync')).toContainText('4 cambios sin enviar');
  await expect(page.getByText('sin enviar', { exact: true })).toHaveCount(3);

  // Se anula un gol sin señal: el marcador se corrige al instante.
  await page.getByRole('button', { name: 'Anular' }).last().click();
  await expect(page.getByTestId('marcador')).toHaveText('2-0');
  await expect(page.getByTestId('estado-sync')).toContainText('5 cambios sin enviar');

  // El servidor todavía no sabe nada.
  const antes = await (await page.request.get(`/api/partidos/${p.id}`)).json();
  expect(antes.estado).toBe('PROGRAMADO');

  // Si se recarga sin señal, lo cargado sigue ahí (está guardado en el dispositivo).
  await page.reload();
  await expect(page.getByTestId('marcador')).toHaveText('2-0');
  await expect(page.getByTestId('estado-sync')).toContainText('5 cambios sin enviar');

  // Vuelve la señal: se envía todo en orden y queda sincronizado.
  await sinRedParaElWorker(context, false);
  await context.setOffline(false);
  await expect(page.getByTestId('estado-sync')).toContainText('todo sincronizado', { timeout: 30_000 });
  const despues = await (await page.request.get(`/api/partidos/${p.id}`)).json();
  expect(despues.estado).toBe('EN_JUEGO');
  expect(despues.marcador).toEqual({ local: 2, visitante: 0 });
  expect(despues.eventos).toHaveLength(2);

  // Recargar con señal no duplica nada.
  await page.reload();
  await expect(page.getByTestId('marcador')).toHaveText('2-0');
  expect((await (await page.request.get(`/api/partidos/${p.id}`)).json()).eventos).toHaveLength(2);
});

test('un solo dueño del acta: el segundo dispositivo recibe el aviso y puede tomarla', async ({
  browser,
  page,
  context,
}) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Entrar a la demo' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible({ timeout: 60_000 });
  const torneos = await (await page.request.get('/api/torneos')).json();
  const apertura = torneos.find((t: { nombre: string }) => t.nombre === 'Apertura 2026');
  const partidos = await (await page.request.get(`/api/torneos/${apertura.id}/partidos`)).json();
  const p = partidos.find((x: { estado: string }) => x.estado === 'PROGRAMADO');

  // El primer dispositivo abre el acta y se queda con ella.
  await page.goto(`/panel/partidos/${p.id}`);
  await expect(page.getByTestId('estado-sync')).toContainText('En línea');
  await expect
    .poll(async () => (await (await page.request.get(`/api/partidos/${p.id}`)).json()).dueno?.dispositivoId)
    .toBeTruthy();

  // El segundo dispositivo (otra sesión del navegador, con la misma cuenta) ve el aviso y no puede cargar.
  // Solo se copia la sesión (cookies): el identificador del dispositivo vive en el almacenamiento local y es propio.
  const sesion = await context.storageState();
  const segundo = await browser.newContext({ storageState: { cookies: sesion.cookies, origins: [] } });
  const celular = await segundo.newPage();
  await celular.goto(`/panel/partidos/${p.id}`);
  await expect(celular.getByTestId('otro-dueno')).toContainText('Otro dispositivo tiene esta acta');
  await expect(celular.getByRole('button', { name: 'Iniciar partido' })).toBeDisabled();

  // Lo toma a propósito: ahora el aviso lo ve el primero y su botón queda bloqueado.
  await celular.getByRole('button', { name: 'Tomar el acta en este dispositivo' }).click();
  await expect(celular.getByTestId('otro-dueno')).toHaveCount(0);
  await expect(celular.getByRole('button', { name: 'Iniciar partido' })).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId('otro-dueno')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar partido' })).toBeDisabled();
  await segundo.close();
});

async function entrarALaDemo(page: import('@playwright/test').Page) {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Entrar a la demo' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible({ timeout: 60_000 });
}

test('comunicación: recordatorio a los morosos con su link de pago, costo a la vista y automatizaciones', async ({
  page,
}) => {
  await entrarALaDemo(page);
  await page.goto('/panel/comunicacion');

  // Las automatizaciones vienen encendidas y se pueden apagar.
  const cobro = page.getByRole('switch', { name: 'Cobro escalonado' });
  await expect(cobro).toHaveAttribute('aria-checked', 'true');
  await cobro.click();
  await expect(cobro).toHaveAttribute('aria-checked', 'false');

  // Solo morosos, con la plantilla de recordatorio de pago: cada uno recibe su monto y su link.
  const historial = page.getByTestId('historial-envios').locator('li');
  const antes = await historial.count();
  await page.getByRole('button', { name: 'Solo morosos' }).click();
  await page.getByLabel('Plantilla').selectOption('RECORDATORIO_PAGO');
  await expect(page.getByTestId('ejemplo-mensaje')).toContainText('Sportivo Barrio');
  await expect(page.getByTestId('ejemplo-mensaje')).toContainText('/pago/');
  await page.getByRole('group', { name: 'Canal' }).getByRole('button', { name: 'Email' }).click();
  await expect(page.getByTestId('costo-envio')).toContainText('sin costo');
  await page.getByRole('button', { name: /Enviar a 1 equipo/ }).click();
  await expect(page.getByText('Listo: enviamos 1 mensaje')).toBeVisible();
  await expect(historial).toHaveCount(antes + 1);

  // Un mensaje libre por WhatsApp muestra cuántos van por cada canal y cuánto cuesta.
  await page.getByRole('button', { name: 'Todos los capitanes' }).click();
  await page.getByLabel('Plantilla').selectOption('LIBRE');
  await page.getByRole('group', { name: 'Canal' }).getByRole('button', { name: 'WhatsApp' }).click();
  await page.getByLabel('Mensaje', { exact: true }).fill('Hola {capitán}! Este sábado hay asado.');
  await expect(page.getByTestId('ejemplo-mensaje')).toContainText('Este sábado hay asado');
  await expect(page.getByTestId('costo-envio')).toContainText('US$');
  // Una variable que no existe no deja enviar.
  await page.getByLabel('Mensaje', { exact: true }).fill('Pagá en {link_pago}');
  await expect(page.getByRole('button', { name: /Enviar/ })).toBeDisabled();
});

test('lluvia: se mueven los partidos, se avisa y los capitanes confirman con su link', async ({
  page,
  browser,
}) => {
  await entrarALaDemo(page);
  await page.goto('/panel/reprogramaciones');

  // Alerta de clima con lo que afecta, y la propuesta de mover al día siguiente sin conflictos.
  await expect(page.getByTestId('alerta-clima')).toContainText('Lluvia fuerte');
  await expect(page.getByTestId('alerta-clima')).toContainText('4 partidos');
  await expect(page.getByTestId('propuesta')).toContainText('Sin conflictos');
  await expect(page.getByTestId('propuesta')).toContainText('Por pronóstico de lluvia');

  // Se aplica: los partidos se mueven y se avisa a los capitanes.
  await page.getByRole('button', { name: 'Confirmar y avisar' }).click();
  await expect(page.getByTestId('resultado-reprogramacion')).toContainText('movimos 4 partidos');
  await page.getByRole('link', { name: 'Ver quién respondió' }).click();
  await expect(page.getByTestId('resumen-respuestas')).toContainText('Sin responder');

  // Dos capitanes abren su mensaje (acá se ve lo que recibieron) y responden desde el link, sin sesión.
  const links: string[] = [];
  for (const i of [0, 1]) {
    await page.getByText('Ver el mensaje que recibió').nth(i).click();
    links.push((await page.locator('details[open] a').nth(i).getAttribute('href'))!);
  }
  const capitanes = await browser.newContext();
  const c = await capitanes.newPage();
  await c.goto(links[0]!);
  await expect(c.getByTestId('mensaje-confirmacion')).toContainText('Por pronóstico de lluvia');
  await c.getByRole('button', { name: 'Confirmo' }).click();
  await expect(c.getByTestId('respuesta-registrada')).toContainText('Quedó confirmado');
  await c.goto(links[1]!);
  await c.getByRole('button', { name: 'No puedo' }).click();
  await expect(c.getByTestId('respuesta-registrada')).toContainText('no podés');
  await capitanes.close();

  // El organizador ve las respuestas y el "No puedo" le queda como alerta en el panel.
  await page.reload();
  await expect(page.getByText('Confirmó', { exact: true })).toHaveCount(1);
  await expect(page.getByText('No puede', { exact: true })).toHaveCount(1);
  await page.goto('/panel');
  await expect(page.getByText('respondieron "No puedo" a una reprogramación')).toBeVisible();
});

test('caja: cobros asentados, gastos automáticos del acta, movimientos propios, retiro, anulación y exportación', async ({
  page,
}) => {
  await entrarALaDemo(page);
  await page.goto('/panel/caja');

  // El resumen sale del libro: plata disponible, resultado y egresos por rubro.
  await expect(page.getByTestId('disponible-mp')).toContainText('$');
  await expect(page.getByTestId('resultado')).toContainText('Ingresos');
  await expect(page.getByTestId('rubros')).toContainText('Árbitros');
  await expect(page.getByTestId('rubros')).toContainText('Canchas');
  await expect(page.getByTestId('rubros')).toContainText('Premios y trofeos');

  // Los movimientos (los últimos) incluyen lo que se asentó solo: cobros y gastos de los partidos jugados.
  const movs = page.getByTestId('movimientos');
  await expect(movs).toContainText('Pago a árbitro');
  await expect(movs).toContainText('Alquiler de cancha');
  await expect(movs).toContainText('Kiosco Don Pepe');

  // Cargar un egreso propio y anularlo: el original queda a la vista como anulado.
  await page.getByLabel('Descripción').fill('Hielo para el partido');
  await page.getByLabel('Monto ($)').fill('5000');
  await page.getByRole('button', { name: 'Registrar egreso' }).click();
  const fila = movs.locator('li', { hasText: 'Hielo para el partido' }).first();
  await expect(fila).toBeVisible();
  await fila.getByRole('button', { name: 'Anular' }).click();
  await fila.getByRole('button', { name: 'Sí' }).click();
  // El original sigue ahí, marcado como anulado (la fila de la anulación lleva otro texto).
  await expect(
    movs.locator('li').filter({ has: page.getByText('Hielo para el partido', { exact: true }) }),
  ).toContainText('anulado');
  await expect(movs).toContainText('Anulación: Hielo para el partido');

  // Retiro: el formulario no deja pedir más que lo disponible (el servidor también lo rechaza: lo prueba la API).
  await page.getByRole('button', { name: 'Retirar a mi cuenta' }).click();
  const monto = page.getByLabel(/Monto a retirar/);
  await monto.fill('999999999');
  expect(await monto.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(false);
  await page.getByLabel(/Monto a retirar/).fill('1000');
  await page.getByRole('button', { name: 'Registrar retiro' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Retiro de' })).toContainText('registrado');
  await expect(movs).toContainText('Retiro a la cuenta bancaria');

  // Filtro por egresos y exportación a CSV.
  await page.getByRole('link', { name: 'Egresos', exact: true }).click();
  await expect(page).toHaveURL(/tipo=EGRESOS/);
  await expect(movs).not.toContainText('Kiosco Don Pepe');
  const csv = await page.request.get('/api/caja/movimientos.csv');
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(await csv.text()).toContain('Kiosco Don Pepe');
  await expect(page.getByTestId('exportar-csv')).toHaveAttribute('href', /movimientos\.csv/);
});

test('árbitros y canchas: un partido sin árbitro, designación, confirmación, alta de árbitro y bloqueo de cancha', async ({
  page,
}) => {
  await entrarALaDemo(page);

  // El panel avisa de los partidos de la semana sin árbitro y lleva a la pantalla.
  await expect(page.getByText(/partido\(s\) de la semana sin árbitro/)).toBeVisible();
  await page.goto('/panel/arbitros');
  const lista = page.getByTestId('designaciones');
  await expect(lista).toContainText('1 sin árbitro');

  // Se designa a mano: queda pendiente y después se confirma.
  const selector = lista
    .locator('select')
    .filter({ has: page.locator('option[value=""]:checked') })
    .first();
  await selector.selectOption({ index: 1 });
  await expect(lista).toContainText('Todos cubiertos');
  await lista
    .getByRole('button', { name: /Pendiente · confirmar/ })
    .first()
    .click();
  await expect(lista.getByText('Confirmado').first()).toBeVisible();

  // Ya no hay nada que designar y el panel no avisa más.
  await expect(page.getByRole('button', { name: 'Designar automático' })).toBeDisabled();
  await page.goto('/panel');
  await expect(page.getByText(/partido\(s\) de la semana sin árbitro/)).toHaveCount(0);

  // Alta de un árbitro: una disponibilidad que no se entiende se explica; una válida queda guardada.
  await page.goto('/panel/arbitros');
  await page.getByLabel('Nombre', { exact: true }).fill('Nora');
  await page.getByLabel('Apellido').fill('Paz');
  await page.getByLabel('Tarifa por partido ($)').first().fill('9500');
  await page.getByLabel('Disponibilidad (opcional)').fill('cuando pueda');
  await page.getByRole('button', { name: 'Agregar árbitro' }).click();
  await expect(page.getByText(/No entendimos "cuando pueda"/)).toBeVisible();
  await page.getByLabel('Disponibilidad (opcional)').fill('sáb 14:00-22:00');
  await page.getByRole('button', { name: 'Agregar árbitro' }).click();
  const nora = page.getByTestId('arbitro-Paz');
  await expect(nora).toContainText('Nora Paz');
  await expect(nora).toContainText('sáb 14:00-22:00');

  // Una cancha bloqueada se ve bloqueada, con su motivo.
  const canchas = page.getByTestId('canchas');
  const cancha2 = canchas.locator('li', { hasText: 'Cancha 2' });
  await cancha2.getByRole('button', { name: 'Editar' }).click();
  await cancha2.getByLabel(/Bloqueada/).check();
  await cancha2.getByLabel('Motivo del bloqueo').fill('Mantenimiento del césped');
  await cancha2.getByRole('button', { name: 'Guardar cancha' }).click();
  await expect(canchas).toContainText('Bloqueada · Mantenimiento del césped');
});

test('sanciones: expediente por roja, descargo, resolución que amplía con multa, historial y nuevo expediente', async ({
  page,
}) => {
  await entrarALaDemo(page);
  await page.goto('/panel/sanciones');
  const contadores = page.getByTestId('contadores');
  await expect(contadores).toContainText('Para resolver');
  // La roja de la fecha 3 y el incidente de la hinchada esperan al tribunal; la agresión ya está resuelta.
  const lista = page.getByTestId('lista-expedientes');
  await expect(lista.getByTestId('expediente')).toHaveCount(2);
  await expect(lista).toContainText('Roja directa');
  await expect(lista).toContainText('Sugerido por reglamento: 1 fecha');
  await expect(page.getByTestId('suspendidos')).toContainText('1 fecha');

  // Se carga el descargo del capitán y se resuelve ampliando a 3 fechas con multa.
  const roja = lista.getByTestId('expediente').filter({ hasText: 'Roja directa' });
  await roja.getByRole('button', { name: 'Cargar descargo' }).click();
  await roja.getByLabel('Descargo del capitán').fill('Fue una pelota dividida.');
  await roja.getByRole('button', { name: 'Guardar' }).click();
  await expect(roja).toContainText('Fue una pelota dividida.');
  await roja.getByRole('button', { name: 'Resolver' }).click();
  await roja.getByLabel('Partidos de suspensión').fill('3');
  await roja.getByLabel('Multa al equipo ($)').fill('5000');
  await roja.getByLabel('Fundamento').fill('Juego peligroso con antecedentes.');
  await roja.getByRole('button', { name: 'Confirmar resolución' }).click();
  await expect(lista.getByTestId('expediente')).toHaveCount(1);

  await page.getByRole('link', { name: 'Resueltos' }).click();
  await expect(page.getByTestId('lista-expedientes')).toContainText('Ampliada por el tribunal: 3 fechas');
  await expect(page.getByTestId('lista-expedientes')).toContainText('Multa $ 5.000');
  await expect(page.getByTestId('suspendidos')).toContainText('3 fechas');

  // Historial por jugador y por equipo.
  await page.getByRole('link', { name: 'Historial' }).click();
  await expect(page.getByText('Por jugador')).toBeVisible();
  await expect(page.getByText('Por equipo')).toBeVisible();

  // Abrir un expediente a mano.
  await page.getByRole('link', { name: /Abiertos/ }).click();
  await page.getByRole('button', { name: 'Abrir expediente' }).click();
  await page.getByLabel('Motivo').fill('Bengalas en la tribuna');
  await page.getByTestId('form-expediente').getByRole('button', { name: 'Abrir' }).click();
  await expect(page.getByTestId('lista-expedientes')).toContainText('Bengalas en la tribuna');
});

test('documentación: alertas, revisión de documentos, autorización del tutor, duplicado y pedido de faltantes', async ({
  page,
}) => {
  await entrarALaDemo(page);
  await page.goto('/panel/documentacion');

  // Resumen del torneo en curso (uno de los no habilitados está suspendido por la roja de la fecha 3): 73 de 81 habilitados, con sus alertas, y la selfie todavía apagada.
  await expect(page.getByTestId('habilitados')).toContainText('73');
  await expect(page.getByTestId('habilitados')).toContainText('/ 81');
  const alertas = page.getByTestId('alertas-documentacion');
  await expect(alertas).toContainText('Posible duplicado1');
  await expect(alertas).toContainText('Apto vencido1');
  await expect(alertas).toContainText('Apto por vencer1');
  await expect(alertas).toContainText('Menor sin autorización1');
  await expect(alertas).toContainText('Documentos por revisar2');
  await expect(page.getByTestId('selfie')).toContainText('No disponible todavía');
  await expect(page.getByRole('tab', { name: /Con observaciones 8/ })).toBeVisible();

  // Revisión humana: se abre la ficha de quien subió sus documentos, se ve un archivo y se aprueban.
  const tabla = page.getByTestId('tabla-documentacion');
  await tabla
    .getByRole('row')
    .filter({ hasText: 'DNI pendiente de revisión' })
    .first()
    .getByRole('button', { name: 'Revisar' })
    .click();
  const ficha = page.getByTestId('ficha');
  await expect(ficha.getByTestId('habilitacion')).toHaveText('No habilitado');
  const [archivo] = await Promise.all([
    page.waitForEvent('popup'),
    ficha.getByTestId('documentos').getByRole('button', { name: 'Ver' }).first().click(),
  ]);
  await archivo.waitForLoadState();
  expect(archivo.url()).toContain('/api/documentos/archivo/');
  await expect(archivo.getByText('Documento de muestra de la demo')).toBeVisible();
  await archivo.close();
  for (let i = 0; i < 2; i++) await ficha.getByRole('button', { name: 'Aprobar' }).first().click();
  await expect(ficha.getByTestId('habilitacion')).toHaveText('Habilitado');
  await expect(ficha.getByTestId('documentos')).toContainText('2 accesos');
  await ficha.getByRole('button', { name: 'Cerrar ficha' }).click();
  await expect(page.getByRole('tab', { name: /Con observaciones 7/ })).toBeVisible();

  // Un rechazo pide el motivo.
  await tabla
    .getByRole('row')
    .filter({ hasText: 'Apto físico vencido' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await expect(page.getByTestId('ficha').getByTestId('habilitacion')).toHaveText('No habilitado');
  await page.getByTestId('ficha').getByRole('button', { name: 'Cerrar ficha' }).click();

  // Menor de edad: la liga genera el link y el tutor autoriza desde su celular, sin cuenta.
  await tabla
    .getByRole('row')
    .filter({ hasText: 'Menor sin autorización' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.getByTestId('ficha').getByRole('button', { name: 'Pedir autorización al tutor' }).click();
  const texto = (await page.getByTestId('link-tutor').innerText()).match(/https?:\/\/\S+\/tutor\/\S+/)![0];
  const tutor = await page.context().newPage();
  await tutor.goto(new URL(texto).pathname);
  await tutor.getByLabel('Tu nombre y apellido').fill('Marta Gómez');
  await tutor.getByLabel('Tu DNI').fill('20111222');
  await tutor.getByRole('button', { name: 'Autorizo' }).click();
  await expect(tutor.getByTestId('autorizacion-lista')).toBeVisible();
  await tutor.reload();
  await expect(tutor.getByText('Este link no sirve')).toBeVisible(); // el link es de un solo uso
  await tutor.close();
  await page.reload();
  await expect(page.getByRole('tab', { name: /Con observaciones 6/ })).toBeVisible();

  // Duplicado: dos jugadores con el mismo DNI; se descarta el DNI mal cargado y los dos quedan libres.
  const duplicados = page.getByTestId('duplicados');
  await expect(duplicados).toContainText('cargado dos veces');
  await duplicados.getByRole('button', { name: 'Su DNI está mal cargado' }).first().click();
  await expect(duplicados).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Con observaciones 4/ })).toBeVisible();
  await expect(alertas).toContainText('Posible duplicado0');

  // Se le pide la documentación faltante a los capitanes de los equipos con observaciones.
  await page.getByRole('button', { name: 'Pedir faltantes' }).click();
  await expect(page.getByTestId('aviso-documentacion')).toContainText('Les avisamos a 3 capitanes');
});
