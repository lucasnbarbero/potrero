import { expect, type Page, test } from '@playwright/test';

// Recorrido de la demo de punta a punta. Si CAPTURAS está definida, guarda capturas de cada pantalla ahí.
const capturas = process.env.CAPTURAS;
const foto = async (page: Page, nombre: string) => {
  if (capturas)
    await page.screenshot({ path: `${capturas}/${nombre}.png`, fullPage: true, animations: 'disabled' });
};

test('landing con los precios vigentes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu torneo');
  const precios = page.locator('#precios');
  await expect(precios).toContainText('3,5%');
  await expect(precios).toContainText('2,5%');
  await expect(precios).toContainText('24.900');
  await expect(page.getByText('Premium')).toHaveCount(0);
  await foto(page, '01-landing');
});

test('sitio público del torneo', async ({ page }) => {
  await page.goto('/t/liga-barrial-sur/apertura-2026');
  await expect(page.getByText('Tabla de posiciones')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await foto(page, '02-sitio-publico');
});

test('inscripción pública con pago simulado', async ({ page }) => {
  await page.goto('/t/liga-barrial-sur/clausura-2026');
  await page.getByRole('link', { name: 'Inscribir mi equipo' }).click();
  await page.getByLabel('Nombre del equipo').fill(`Los Demo ${Date.now() % 100000}`);
  await page.getByLabel('Nombre del capitán').fill('Capitán Demo');
  await page.getByLabel('Email').fill('capitan@demo.com');
  await page.getByLabel('WhatsApp').fill('3564 555111');
  await foto(page, '03-inscripcion');
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(page.getByText('Modo demo')).toBeVisible();
  await foto(page, '04-checkout');
  await page.getByRole('button', { name: 'Pagar (aprobar)' }).click();
  await expect(page.getByText('¡Pago aprobado!')).toBeVisible();
});

test('organizador: panel, torneo, tabla y acta con jugador suspendido', async ({ page }) => {
  await page.goto('/panel');
  await expect(page).toHaveURL(/ingresar/);
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();
  await foto(page, '05-panel');

  await page.getByRole('link', { name: 'Torneos' }).first().click();
  await page.getByRole('link', { name: /Apertura 2026/ }).click();
  await foto(page, '06-fixture');
  await page.getByRole('link', { name: 'Tabla' }).click();
  await expect(page.getByText('Calculada automáticamente')).toBeVisible();
  await foto(page, '07-tabla');
  await page.getByRole('link', { name: 'Inscripciones y pagos' }).click();
  await foto(page, '08-inscripciones');
  await page.getByRole('navigation').getByRole('link', { name: 'Sanciones' }).click();
  await expect(page.getByText('Roja directa')).toBeVisible();

  // El expulsado de la fecha 3 aparece no habilitado en la planilla de su próximo partido, antes de empezar.
  const detalle = await page
    .locator('li', { hasText: 'Roja directa' })
    .first()
    .locator('.text-mute')
    .first()
    .innerText();
  const equipoSancionado = detalle.split(' · ')[0]!;
  await page.getByRole('link', { name: 'Fixture' }).click();
  await page.getByRole('tab', { name: 'Fecha 4', exact: true }).click();
  await page.locator('[data-partido]', { hasText: equipoSancionado }).click();
  await page.getByRole('link', { name: 'Ver acta' }).click();
  await expect(page.getByText(/Suspendido \(roja directa\)/)).toBeVisible();
  await expect(page.getByText('No habilitado').first()).toBeVisible();
  await foto(page, '09-acta');
});

// Fixture a mano (E09-07): intercambiar dos partidos de una fecha arrastrando, y en el celular tocando, con los
// conflictos a la vista antes de confirmar.
const ingresarAlFixture = async (page: Page) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();
  // En el celular el menú lateral está cerrado: se va directo a la lista de torneos.
  await page.goto('/panel/torneos');
  await page.getByRole('link', { name: /Apertura 2026/ }).click();
  await page.getByRole('tab', { name: 'Fecha 5', exact: true }).click();
};

test('fixture: intercambiar dos partidos arrastrando', async ({ page }) => {
  await ingresarAlFixture(page);
  const cartas = page.locator('[data-partido]');
  await expect(cartas).toHaveCount(4);
  const primero = (await cartas.nth(0).innerText()).split('\n')[0]!;
  await cartas.nth(0).dragTo(cartas.nth(1));
  const propuesta = page.getByTestId('propuesta-fixture');
  await expect(propuesta).toBeVisible();
  await expect(propuesta.locator('li')).toHaveCount(2);
  await foto(page, '10-fixture-intercambio');
  const aceptar = propuesta.getByLabel('Los vi y quiero seguir igual');
  if (await aceptar.count()) await aceptar.check();
  await page.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(page.getByRole('status')).toContainText('se intercambiaron los dos partidos');
  // El que estaba primero quedó en el lugar del segundo.
  await expect(cartas.nth(1)).toContainText(primero.split(' · ')[0]!);
});

test.describe('en el celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('fixture: mover avisa el choque de cancha y ordenar tocando dos partidos', async ({ page }) => {
    await ingresarAlFixture(page);
    const cartas = page.locator('[data-partido]');
    await expect(cartas).toHaveCount(4);
    // La página no se desborda a lo ancho: la grilla se desplaza dentro de su caja.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Mover el primero a la hora del segundo en su misma cancha: conflicto explicado y hay que confirmar.
    await cartas.nth(0).tap();
    const panel = page.getByRole('complementary', { name: 'Mover partido' });
    await panel.getByRole('tab', { name: 'Mover' }).tap();
    const otro = await cartas.nth(1).getAttribute('data-partido');
    const celda = page.locator('[data-franja]', { has: page.locator(`[data-partido="${otro}"]`) });
    const franja = (await celda.getAttribute('data-franja'))!;
    await panel.getByLabel('Horario').fill(franja.split('|')[1]!);
    await panel.getByLabel('Cancha').selectOption((await celda.getAttribute('data-cancha'))!);
    await expect(panel.getByRole('alert')).toContainText('La cancha ya está ocupada a esa hora.');
    const confirmar = panel.getByRole('button', { name: 'Confirmar cambio' });
    await expect(confirmar).toBeDisabled();
    await panel.getByLabel('Los vi y quiero seguir igual').check();
    await expect(confirmar).toBeEnabled();
    await foto(page, '11-fixture-celular-conflicto');

    // En cambio, intercambiar tocando el otro partido.
    await cartas.nth(1).tap();
    await expect(panel.getByTestId('propuesta-fixture').locator('li')).toHaveCount(2);
    const aceptar = panel.getByLabel('Los vi y quiero seguir igual');
    if (await aceptar.count()) await aceptar.check();
    await confirmar.tap();
    await expect(page.getByRole('status')).toContainText('se intercambiaron');
  });
});

test('sanciones: levantar una suspensión pagando (opción del reglamento) y el jugador queda habilitado', async ({
  page,
}) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();

  // Torneo propio, con umbral de 1 amarilla: una amarilla en la fecha 1 suspende para la fecha 2.
  const api = async <T>(metodo: 'GET' | 'POST', ruta: string, data?: unknown): Promise<T> => {
    const r = await page.request.fetch(`/api${ruta}`, { method: metodo, data });
    expect(r.ok(), `${metodo} ${ruta}: ${await r.text()}`).toBe(true);
    return (await r.json()) as T;
  };
  const n = Date.now() % 100000;
  const sedes = await api<{ canchas: { id: string; bloqueada: boolean }[] }[]>('GET', '/canchas');
  const cancha = sedes.flatMap((s) => s.canchas).find((c) => !c.bloqueada)!.id;
  const torneo = await api<{ id: string }>('POST', '/torneos', {
    nombre: `Torneo E2E levantar ${n}`,
    modalidad: 'F5',
    formato: 'LIGA',
    idaYVuelta: true,
    cupo: 2,
    inscripcion: 0,
    umbralAmarillas: 1,
  });
  for (const nombre of ['Rayo', 'Trueno']) {
    const e = await api<{ id: string }>('POST', '/equipos', { nombre: `${nombre} ${n}` });
    await api('POST', `/equipos/${e.id}/jugadores`, {
      nombre: 'Juan',
      apellido: `${nombre} ${n}`,
      numero: 10,
    });
    await api('POST', `/torneos/${torneo.id}/inscripciones`, { equipoId: e.id });
  }
  await api('POST', `/torneos/${torneo.id}/fixture`, {
    primerDia: '2027-03-06',
    horarios: ['19:00'],
    canchaIds: [cancha],
  });
  const partidos = await api<{ id: string; fecha: number }[]>('GET', `/torneos/${torneo.id}/partidos`);
  const [fecha1, fecha2] = [1, 2].map((f) => partidos.find((p) => p.fecha === f)!.id);
  const acta = await api<{ local: { id: string; jugadores: { id: string }[] } }>(
    'GET',
    `/partidos/${fecha1}`,
  );
  await api('POST', `/partidos/${fecha1}/iniciar`, {});
  await api('POST', `/partidos/${fecha1}/eventos`, {
    tipo: 'AMARILLA',
    equipoId: acta.local.id,
    jugadorId: acta.local.jugadores[0]!.id,
    minuto: 12,
    clientUuid: crypto.randomUUID(),
  });
  await api('POST', `/partidos/${fecha1}/cerrar`, { firmaLocal: true, firmaVisitante: true });

  // Con el reglamento apagado (por defecto) no hay opción de levantar.
  await page.goto(`/panel/sanciones?torneoId=${torneo.id}`);
  const suspendidos = page.getByTestId('suspendidos');
  await expect(suspendidos).toContainText(`Juan Rayo ${n}`);
  await expect(page.getByRole('button', { name: /Levantar pagando/ })).toHaveCount(0);
  const reglamento = page.getByTestId('reglamento-levantar');
  await expect(reglamento).toContainText('Apagado');

  // Se enciende en el reglamento del torneo con un monto por partido.
  await reglamento.getByRole('button', { name: 'Editar' }).click();
  await reglamento.getByLabel('Permitir levantar una suspensión pagando').check();
  await reglamento.getByLabel('Monto por partido ($)').fill('15000');
  await reglamento.getByRole('button', { name: 'Guardar' }).click();
  await expect(reglamento).toContainText('por partido');
  await foto(page, '20-sanciones-reglamento-levantar');

  // Levantar pagando: genera el cargo; sin el pago acreditado sigue suspendido en el acta.
  await suspendidos.getByRole('button', { name: /Levantar pagando/ }).click();
  await foto(page, '21-sanciones-levantar-confirmar');
  await suspendidos.getByRole('button', { name: 'Confirmar' }).click();
  await expect(suspendidos).toContainText('Pago pendiente');
  await foto(page, '22-sanciones-pago-pendiente');
  await page.goto(`/panel/partidos/${fecha2}`);
  await expect(page.getByText('No habilitado')).toBeVisible();

  // Con el pago acreditado queda habilitado para la fecha 2.
  await page.goto(`/panel/sanciones?torneoId=${torneo.id}`);
  await suspendidos.getByRole('button', { name: 'Registrar pago en efectivo' }).click();
  await expect(suspendidos).toContainText('Nadie está suspendido.');
  await page.goto(`/panel/partidos/${fecha2}`);
  await expect(page.getByText(`Juan Rayo ${n}`).first()).toBeVisible();
  await expect(page.getByText('No habilitado')).toHaveCount(0);
  await foto(page, '23-acta-habilitado');

  // El historial muestra la fecha levantada.
  await page.goto(`/panel/sanciones?torneoId=${torneo.id}&tab=historial`);
  await expect(page.getByRole('columnheader', { name: 'Levantadas' }).first()).toBeVisible();
  await expect(page.locator('tr', { hasText: `Juan Rayo ${n}` })).toContainText('1');
  await foto(page, '24-sanciones-historial');
});

test('métricas: retención, cobro por medio, canchas y horarios con filtro por período y torneo', async ({
  page,
}) => {
  await page.goto('/panel/metricas');
  await expect(page).toHaveURL(/ingresar/);
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('complementary').getByRole('link', { name: 'Métricas' }).click();
  await expect(page.getByRole('heading', { name: 'Métricas', level: 1 })).toBeVisible();

  // Temporada: de Clausura 2025 a Apertura 2026 volvieron 5 de 7 equipos y del Apertura al Torneo Primavera (por
  // fases) los 9. La cifra exacta depende de los torneos que crean los otros recorridos (sobre la semilla sola, 88%).
  await expect(page.getByTestId('kpi-retencion')).toHaveText(/^\d+%$/);
  await expect(page.getByTestId('retencion')).toContainText('Torneo Primavera 2026');
  await expect(page.getByTestId('kpi-cobro')).toHaveText(/\d+%/);
  await expect(page.getByTestId('medio-EFECTIVO')).toContainText('%');
  // Los domingos a la mañana del Torneo Primavera (por fases) son la franja más pedida.
  await expect(page.getByTestId('insight-horarios')).toContainText('los domingos');
  await expect(page.getByTestId('cobro-por-torneo')).toContainText('Apertura 2026');
  await expect(page.getByTestId('canchas')).toContainText('Cancha 1');
  await foto(page, '40-metricas');

  // Histórico: entran los torneos del año pasado y el efectivo pasa a ser el medio principal.
  await page.getByRole('link', { name: 'Histórico' }).click();
  await expect(page).toHaveURL(/periodo=HISTORICO/);
  await expect(page.getByTestId('kpi-retencion')).toHaveText(/^\d+%$/);
  await expect(page.getByTestId('cobro-por-torneo')).toContainText('Apertura 2025');
  await expect(page.getByTestId('kpi-ocupacion')).not.toHaveText('—');

  // Un torneo puntual: Clausura 2025 y quiénes no volvieron.
  await page.getByRole('navigation', { name: 'Torneo' }).getByRole('link', { name: 'Clausura 2025' }).click();
  await expect(page).toHaveURL(/torneo=/);
  await expect(page.getByTestId('cobro-por-torneo').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByTestId('retencion')).toContainText('Los Halcones');
  await foto(page, '41-metricas-torneo');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/panel/metricas');
  await expect(page.getByTestId('kpi-retencion')).toBeVisible();
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(ancho).toBeLessThanOrEqual(390);
  await foto(page, '42-metricas-celular');
});

test('configuración inicial: asistente de 5 pasos e importación desde Excel (E25)', async ({ page }) => {
  // El usuario demo abre el asistente desde el menú aunque su liga ya esté configurada.
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/panel/);
  await page.getByRole('link', { name: 'Configuración' }).click();
  await expect(page.getByRole('heading', { name: 'Tu liga lista en menos de 30 minutos.' })).toBeVisible();
  await expect(page.getByTestId('paso-mercadoPago')).toContainText('Conectado');
  await foto(page, '40-configuracion-demo');

  // Un archivo con errores muestra fila, columna y motivo, y no deja importar.
  await page.goto('/panel/configuracion?paso=importacion');
  await page
    .getByTestId('archivo-importacion')
    .setInputFiles('public/plantillas/potrero-ejemplo-con-errores.xlsx');
  const errores = page.getByTestId('errores-importacion');
  await expect(errores).toContainText('Hay 5 errores');
  await expect(errores).toContainText('Jugadores · fila 6 · DNI: El DNI se repite con la fila 3.');
  await expect(page.getByTestId('confirmar-importacion')).toBeDisabled();
  await foto(page, '41-importacion-errores');

  // Una liga recién creada arranca por el asistente.
  await page.context().clearCookies();
  const n = Date.now() % 1_000_000;
  await page.goto('/registro');
  await page.getByLabel('Nombre de la liga').fill(`Liga Nueva ${n}`);
  await page.getByLabel('Tu nombre').fill('Organizador Demo');
  await page.getByLabel('Email').fill(`nueva-${n}@potrero.app`);
  await page.getByLabel('Contraseña').fill('clave-segura-2026');
  await page.getByRole('button', { name: 'Crear mi liga' }).click();
  await page.waitForURL(/\/panel\/configuracion/);
  await expect(page.getByTestId('progreso')).toHaveText('0%');

  // 1 · Organización
  const paso1 = page.getByTestId('paso-organizacion');
  await paso1.getByLabel('Localidad').fill('Lanús');
  await paso1.getByLabel('Provincia').fill('Buenos Aires');
  await paso1.getByRole('button', { name: 'Guardar y continuar' }).click();
  // 2 · Mercado Pago (informativo)
  await page.getByTestId('paso-mercadoPago').getByRole('button', { name: 'Conectar después' }).click();
  // 3 · Marca
  const paso3 = page.getByTestId('paso-marca');
  await paso3.getByRole('button', { name: 'Color #38bdf8' }).click();
  await foto(page, '42-configuracion-marca');
  await paso3.getByRole('button', { name: 'Guardar y continuar' }).click();
  // 4 · Reglamento
  await page.getByTestId('paso-reglamento').getByRole('button', { name: 'Usar este reglamento' }).click();
  await expect(page.getByTestId('progreso')).toHaveText('80%');

  // 5 · Importación del ejemplo: vista previa y confirmación.
  await page.getByTestId('archivo-importacion').setInputFiles('public/plantillas/potrero-ejemplo.xlsx');
  await expect(page.getByTestId('vista-previa')).toBeVisible();
  await page.getByRole('button', { name: /Jugadores \(80\)/ }).click();
  await foto(page, '43-importacion-vista-previa');
  await page.getByRole('button', { name: 'Importar 8 equipos, 80 jugadores y 4 canchas' }).click();
  await expect(page.getByTestId('importacion-lista')).toContainText('8 equipos, 80 jugadores y 4 canchas');
  await expect(page.getByTestId('progreso')).toHaveText('100%');
  await foto(page, '44-importacion-lista');
  await page.getByRole('link', { name: 'Ver equipos' }).click();
  await expect(page.getByText('Defensores de Lanús')).toBeVisible();
});

test('sponsors: sitio público con "Publicidad", medición, panel, regla de menores y reporte', async ({
  page,
}) => {
  // Sitio público: el banner de cabecera se señaliza como publicidad y suma una impresión sin cookies.
  const impresion = page.waitForRequest(
    (r) => r.url().includes('/api/sponsors-publico/liga-barrial-sur/impresiones') && r.method() === 'POST',
  );
  await page.goto('/t/liga-barrial-sur/apertura-2026');
  const cabecera = page.getByTestId('sponsors-CABECERA');
  await expect(cabecera).toContainText('Publicidad');
  await expect(cabecera).toContainText('Kiosco Don Pepe');
  await expect(page.getByTestId('sponsors-GOLEADORES')).toContainText('Gimnasio Movimiento');
  await expect(page.getByTestId('sponsors-TARJETA_RESULTADO')).toContainText('Pizzería Roma');
  expect((await impresion).headers()['cookie']).toBeUndefined();
  await foto(page, '30-sitio-sponsors');
  // El clic pasa por un redirect que lo cuenta y lleva al link del sponsor.
  const href = await cabecera.getByRole('link').first().getAttribute('href');
  expect(href).toMatch(/\/api\/sponsors-publico\/liga-barrial-sur\/clic\//);
  const clic = await page.request.get(href!, { maxRedirects: 0 });
  expect(clic.status()).toBe(302);
  expect(clic.headers()['location']).toBe('https://example.com/kiosco-don-pepe');

  // Panel del organizador.
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();
  await page.getByRole('link', { name: 'Sponsors' }).first().click();
  await expect(page.getByRole('heading', { name: 'Sponsors', level: 1 })).toBeVisible();
  const lista = page.getByTestId('auspiciantes');
  for (const n of ['Kiosco Don Pepe', 'Gimnasio Movimiento', 'Pizzería Roma', 'Seguros La Cancha'])
    await expect(lista).toContainText(n);
  await expect(lista).toContainText('Vence en 5 días');
  await expect(page.getByTestId('impresiones')).toContainText('mil');
  await expect(page.getByTestId('espacios').getByRole('button', { name: 'Ofrecer' })).toHaveCount(1);
  await foto(page, '31-sponsors');

  // Regla: en un torneo con menores no se vende alcohol.
  const n = Date.now() % 100000;
  await page.getByRole('button', { name: 'Nuevo sponsor' }).click();
  await page.getByLabel('Nombre').fill(`Cervecería E2E ${n}`);
  await page.getByLabel('Rubro').selectOption('ALCOHOL');
  await page.getByRole('button', { name: 'Guardar sponsor' }).click();
  await expect(lista).toContainText(`Cervecería E2E ${n}`);
  await page.getByTestId('espacios').getByRole('button', { name: 'Ofrecer' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Vender un espacio' });
  await dialogo
    .locator('select')
    .nth(0)
    .selectOption({ label: `Cervecería E2E ${n}` });
  await dialogo.locator('select').nth(1).selectOption({ label: 'Apertura 2026 · con menores' });
  await dialogo.getByLabel(/Monto acordado/).fill('50000');
  await expect(dialogo).toContainText('no se aceptan sponsors de apuestas, alcohol ni tabaco');
  await dialogo.getByRole('button', { name: 'Vender espacio' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('menores');
  await foto(page, '32-sponsors-menores');
  await dialogo.getByRole('button', { name: 'Cerrar' }).click();

  // Reporte imprimible y descargable.
  await page.getByTestId('generar-reporte').click();
  await expect(page.getByTestId('reporte-sponsor')).toContainText('Reporte de alcance');
  await expect(page.getByTestId('reporte-impresiones')).not.toHaveText('0');
  await expect(page.getByRole('cell', { name: 'Banner del sitio' })).toBeVisible();
  await foto(page, '33-reporte-sponsor');
  const csv = await page.request.get((await page.getByTestId('descargar-csv').getAttribute('href'))!);
  expect(csv.headers()['content-type']).toMatch(/text\/csv/);
  expect(await csv.text()).toMatch(/Impresiones;\d+/);

  // En el celular.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/panel/sponsors');
  await expect(page.getByRole('heading', { name: 'Sponsors', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await foto(page, '34-sponsors-celular');
});

test('usuarios con rol, invitación y panel del capitán (E04-09, E19)', async ({ page, browser }) => {
  // El organizador ve a los miembros, la invitación pendiente e invita a un capitán: el link queda para compartir.
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  await expect(page.getByTestId('miembros')).toContainText('Matías Gómez');
  await expect(page.getByTestId('miembros')).toContainText('Tesorero');
  await expect(page.getByTestId('invitacion').filter({ hasText: 'Marcos Costa' })).toBeVisible();
  await foto(page, '40-usuarios');
  const email = `capitan-${Date.now() % 1_000_000}@ejemplo.com.ar`;
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Rol').selectOption('CAPITAN');
  await page.getByLabel('Equipo').selectOption({ label: 'Real Barrio' });
  await page.getByRole('button', { name: 'Crear invitación' }).click();
  const link = await page.getByLabel('Link de la invitación').inputValue();
  expect(link).toContain('/invitacion/');
  await expect(page.getByRole('link', { name: 'Mandar por WhatsApp' })).toBeVisible();
  await foto(page, '41-usuarios-link');

  // El invitado abre el link, crea su cuenta y entra directo a su equipo.
  const invitado = await (await browser.newContext()).newPage();
  await invitado.goto(new URL(link).pathname);
  await expect(invitado.getByRole('heading', { name: /capitán de Real Barrio/ })).toBeVisible();
  await foto(invitado, '42-invitacion');
  await invitado.getByLabel('Tu nombre y apellido').fill('Capitán Invitado');
  await invitado.getByLabel('Elegí una contraseña').fill('clave-de-prueba-1');
  await invitado.getByRole('button', { name: 'Crear cuenta y aceptar' }).click();
  await expect(invitado).toHaveURL(/\/capitan/);
  await expect(invitado.getByRole('heading', { level: 1 })).toHaveText('Real Barrio');
  // Al panel del organizador no entra.
  await invitado.goto('/panel/caja');
  await expect(invitado).toHaveURL(/\/capitan/);
  await invitado.context().close();

  // El capitán de demo: próximo partido, convocatoria, documentación, sanciones, descargo y plantel.
  const cap = await (await browser.newContext()).newPage();
  await cap.goto('/ingresar');
  await cap.getByLabel('Email').fill('capitan@potrero.app');
  await cap.getByLabel('Contraseña').fill('potrero-demo-2026');
  await cap.getByRole('button', { name: 'Ingresar' }).click();
  await expect(cap).toHaveURL(/\/capitan/);
  await expect(cap.getByText('Capitán · Matías Gómez')).toBeVisible();
  await expect(cap.getByTestId('proximo')).toContainText('confirmaron');
  await expect(cap.getByTestId('documentacion')).toContainText('Apto físico');
  await expect(cap.getByTestId('sanciones')).toContainText('Roja directa');
  await expect(cap.getByTestId('tabla').locator('tbody tr')).toHaveCount(8);
  await foto(cap, '43-capitan');

  const convocatoria = cap.getByTestId('convocatoria');
  await convocatoria.getByRole('button', { name: 'Pendientes' }).click();
  const primero = convocatoria.getByTestId('convocado').first();
  const nombre = (await primero.locator('b').first().textContent())!;
  await primero.getByRole('button', { name: `${nombre} va` }).click();
  await convocatoria.getByRole('button', { name: 'Todos' }).click();
  await expect(convocatoria.getByTestId('convocado').filter({ hasText: nombre })).toContainText('Va');

  const expediente = cap.getByTestId('expediente-capitan').filter({ hasText: 'Roja directa' });
  const editar = expediente.getByRole('button', { name: 'Editar descargo' });
  if (await editar.isVisible()) await editar.click();
  await expediente
    .getByLabel('Tu descargo para el tribunal')
    .fill('Fue una pelota dividida, no hubo intención.');
  await expediente.getByRole('button', { name: 'Enviar descargo' }).click();
  await expect(expediente).toContainText('Descargo enviado');

  const nuevo = `Prueba${Date.now() % 100000}`;
  await cap.getByRole('button', { name: 'Sumar jugador' }).click();
  await cap.getByLabel('Nombre', { exact: true }).fill(nuevo);
  await cap.getByLabel('Apellido').fill('Capitán');
  await cap.getByRole('button', { name: 'Sumar', exact: true }).click();
  const fila = cap.getByTestId('jugador-plantel').filter({ hasText: nuevo });
  await expect(fila).toBeVisible();
  await foto(cap, '44-capitan-plantel');
  cap.once('dialog', (d) => d.accept());
  await fila.getByRole('button', { name: `Dar de baja a ${nuevo} Capitán` }).click();
  await expect(fila).toHaveCount(0);
  await cap.context().close();
});

test('sitio público: página del partido y perfil del jugador (E20, E21)', async ({ page, request }) => {
  // Del sitio del torneo a un resultado: marcador, crónica, línea de tiempo y tarjeta para compartir.
  await page.goto('/t/liga-barrial-sur/apertura-2026');
  const ultimos = page.locator('section', { hasText: 'Últimos resultados' });
  await ultimos.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/partido\//);
  await expect(page.getByTestId('marcador')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Crónica' })).toBeVisible();
  await expect(page.getByText('Generada automáticamente')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planteles' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enviar por WhatsApp' })).toHaveAttribute('href', /wa\.me/);
  // Open Graph: la vista previa de WhatsApp usa la tarjeta de resultado.
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toMatch(/\/tarjeta$/);
  const imagen = await request.get(new URL(og!).pathname + '?formato=historia');
  expect(imagen.headers()['content-type']).toBe('image/png');
  await foto(page, '30-partido-publico');

  // Del goleador del torneo a su perfil: estadísticas, trayectoria en varios torneos y sin datos personales.
  await page.goto('/t/liga-barrial-sur/apertura-2026');
  const goleadores = page.locator('section', { hasText: 'Goleadores' });
  await goleadores.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/jugador\//);
  await expect(page.getByRole('heading', { name: 'Trayectoria' })).toBeVisible();
  await expect(page.getByTestId('trayectoria').locator('.ev')).not.toHaveCount(1);
  await expect(page.getByTestId('dato-Goles')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/DNI|@ejemplo\.com|3564/);
  await foto(page, '31-perfil-jugador');

  // El jugador destacado de la demo jugó el Verano 2025 en otro equipo (Fénix FC).
  await expect(page.getByTestId('trayectoria')).toContainText('Verano 2025');
  await expect(page.getByTestId('trayectoria')).toContainText('Fénix FC');

  // Desde un partido del perfil se vuelve a la página del partido.
  await page
    .getByRole('heading', { name: 'Últimos partidos' })
    .locator('..')
    .getByRole('link')
    .first()
    .click();
  await expect(page).toHaveURL(/\/partido\//);

  // Un partido por jugar muestra horario y cancha.
  await page.goto('/t/liga-barrial-sur/apertura-2026');
  await page.locator('section', { hasText: 'Próxima fecha' }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Cuándo y dónde' })).toBeVisible();
  await foto(page, '32-partido-por-jugar');
});

test('panel del organizador: en vivo, alertas, sugerencias, cuenta y organización activa', async ({
  page,
}) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /(Buen día|Buenas tardes|Buenas noches), Carla\./,
  );

  // Partido en vivo con marcador y acceso directo al acta.
  await expect(page.getByTestId('en-vivo')).toContainText('En vivo');
  await expect(page.getByLabel('Marcador')).toHaveText('2:1');

  // Alertas accionables, cada una con su botón.
  const atencion = page.getByRole('region', { name: 'Requiere atención' });
  for (const titulo of ['Jugó un suspendido', 'Acta sin cargar', 'Partido sin árbitro'])
    await expect(atencion).toContainText(titulo);
  await expect(page.getByTestId('sugerencia')).toContainText('Designá árbitros');
  await foto(page, '30-panel');
  await page.setViewportSize({ width: 390, height: 844 });
  await foto(page, '31-panel-celular');
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole('link', { name: 'Abrir acta' }).click();
  await expect(page).toHaveURL(/\/panel\/partidos\//);
  await page.goto('/panel');

  // Conciliar: abrir la caja asienta el pago y la alerta se va (la semilla recién cargada trae uno).
  const pago = atencion.locator('[data-alerta="PAGO_SIN_CONCILIAR"]');
  if (await pago.count()) {
    await expect(pago).toContainText('1 pago sin conciliar');
    await pago.getByRole('link', { name: 'Conciliar' }).click();
    await expect(page).toHaveURL(/\/panel\/caja/);
    await page.goto('/panel');
  }
  await expect(atencion.locator('[data-alerta="PAGO_SIN_CONCILIAR"]')).toHaveCount(0);

  // Selector de organización: la demo tiene una segunda liga.
  await page.getByTestId('menu-cuenta').click();
  await foto(page, '32-menu-cuenta');
  await page.getByRole('menuitemradio', { name: /Veteranos del Oeste/ }).click();
  await expect(page.getByText('Senior +40 · F11')).toBeVisible();
  await expect(page.getByTestId('en-vivo')).toHaveCount(0);

  // Mi cuenta: organizaciones, verificación del email (simulada) y vuelta a la liga principal.
  await page.goto('/panel/cuenta');
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
  await foto(page, '33-mi-cuenta');
  const sinVerificar = page.getByTestId('email-sin-verificar');
  if (await sinVerificar.count()) {
    await sinVerificar.getByRole('button', { name: 'Mandarme el link de verificación' }).click();
    await sinVerificar.getByTestId('link-dev').click();
    await expect(page.getByRole('heading', { name: 'Email verificado' })).toBeVisible();
    await page.getByRole('link', { name: 'Ir a mi cuenta' }).click();
  }
  await expect(page.getByText('Email verificado')).toBeVisible();
  await page
    .locator('li', { hasText: 'Liga Barrial Sur' })
    .getByRole('button', { name: 'Cambiar a esta' })
    .click();
  await expect(page.getByLabel('Marcador')).toBeVisible();
});

test('recuperar la contraseña con el link de un solo uso (email simulado)', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByRole('link', { name: '¿Te olvidaste la contraseña?' }).click();
  await expect(page).toHaveURL(/recuperar/);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByRole('button', { name: 'Mandarme el link' }).click();
  await expect(page.getByTestId('recuperar-enviado')).toBeVisible();
  await foto(page, '34-recuperar');
  const link = await page.getByTestId('link-dev').getAttribute('href');
  await page.goto(link!);
  await page.waitForLoadState('networkidle');
  // Se vuelve a poner la misma contraseña para no romper la demo.
  await page.getByLabel('Contraseña nueva').fill('potrero-demo-2026');
  await page.getByLabel('Repetila').fill('potrero-demo-2026');
  await foto(page, '35-restablecer');
  await page.getByRole('button', { name: 'Guardar e ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeAttached();
  // El link ya no sirve una segunda vez.
  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'El link no sirve' })).toBeVisible();
});

test('armá el formato: simulador por fases con copa estímulo y validación', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/panel'));
  await page.goto('/panel/torneos');
  await page.getByRole('link', { name: 'Armá el formato' }).click();
  await expect(page.getByRole('heading', { name: 'Armá el formato' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Simulador: así quedaría tu torneo.');

  await page.getByLabel('Equipos', { exact: true }).fill('20');
  await page.getByRole('button', { name: /Grupos \+ playoffs \+ copa estímulo/ }).click();
  // 2 grupos de 10 (9 sábados), playoffs ida y vuelta con final única y copa estímulo en paralelo.
  await expect(page.getByTestId('total-sabados')).toHaveText('16');
  await expect(page.getByTestId('total-partidos')).toHaveText('140');
  await expect(page.getByTestId('nodo-f2')).toContainText('Los 8 primeros de cada grupo de Fase 1');
  await expect(page.getByTestId('nodo-f3')).toContainText('Los perdedores de Octavos de final de Playoffs');
  await expect(page.getByTestId('cronograma').locator('li')).toHaveCount(16);
  await expect(page.getByRole('region', { name: 'Revisá el formato' }).getByRole('alert')).toHaveCount(0);
  await foto(page, '40-arma-el-formato');

  // Error de validación: pedir hasta el 12º de grupos de 10.
  await page.getByTestId('fase-f2').getByLabel('Hasta el puesto').fill('12');
  await expect(
    page.getByRole('region', { name: 'Revisá el formato' }).getByRole('alert').first(),
  ).toContainText('no hay puesto 12');
  await expect(page.getByText('Personalizado')).toBeVisible();
});

// Fallas visibles (F1, F4, F6, F9, F18, F19): sanciones del torneo, avisos por rol, menú según el rol y checkout por
// concepto.
test('fallas: sanciones del torneo, menú y avisos por rol, checkout de una multa e inscripción cerrada', async ({
  page,
  browser,
}) => {
  const ingresar = async (p: Page, email: string) => {
    await p.goto('/ingresar');
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Contraseña').fill('potrero-demo-2026');
    await p.getByRole('button', { name: 'Ingresar' }).click();
    await expect(p.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();
  };
  await ingresar(page, 'demo@potrero.app');
  const api = async <T>(metodo: 'GET' | 'POST', ruta: string, data?: unknown): Promise<T> => {
    const r = await page.request.fetch(`/api${ruta}`, { method: metodo, data });
    expect(r.ok(), `${metodo} ${ruta}: ${await r.text()}`).toBe(true);
    return (await r.json()) as T;
  };

  // F19: la liga principal tiene Mercado Pago conectado y el dueño ve todo el menú.
  const lateral = page.locator('aside');
  await expect(lateral).toContainText('Mercado Pago conectado');
  await expect(lateral.getByRole('link', { name: 'Usuarios' })).toBeVisible();

  // F1: la pestaña Sanciones no muestra "undefined" ni "próximamente", y lleva a los expedientes.
  const torneos = await api<{ id: string; nombre: string }[]>('GET', '/torneos');
  const apertura = torneos.find((t) => t.nombre === 'Apertura 2026')!;
  await page.goto(`/panel/torneos/${apertura.id}?tab=sanciones`);
  await expect(page.getByText('Roja directa').first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText('undefined');
  await expect(page.locator('main')).not.toContainText('próximamente');
  await foto(page, '90-torneo-sanciones');
  await page.locator('main').getByRole('link', { name: 'Sanciones', exact: true }).last().click();
  await expect(page).toHaveURL(`/panel/sanciones?torneoId=${apertura.id}`);

  // F9: el checkout de una multa dice "Pago acreditado", no que se confirmó la inscripción.
  const inscripciones = await api<{ equipo: { id: string } }[]>(
    'GET',
    `/torneos/${apertura.id}/inscripciones`,
  );
  const exp = await api<{ id: string }>('POST', '/expedientes', {
    tipo: 'OTRO',
    torneoId: apertura.id,
    equipoId: inscripciones[0]!.equipo.id,
    motivo: 'Incidente de prueba E2E',
  });
  const resuelto = await api<{ cargoId: string }>('POST', `/expedientes/${exp.id}/resolver`, {
    partidos: 0,
    multa: 1000,
    resolucion: 'Multa de prueba.',
  });
  const { urlPago } = await api<{ urlPago: string }>('POST', `/cargos/${resuelto.cargoId}/link`, {});
  await page.goto(new URL(urlPago).pathname);
  await expect(page.getByRole('heading', { name: /Multa/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pagar (aprobar)' }).click();
  await expect(page.getByText('Pago acreditado')).toBeVisible();
  await expect(page.getByText('Tu inscripción quedó confirmada')).toHaveCount(0);
  await foto(page, '91-checkout-multa');

  // F6: la inscripción pública de un torneo en curso avisa que está cerrada, sin formulario.
  await page.goto('/t/liga-barrial-sur/apertura-2026/inscripcion');
  await expect(page.getByRole('heading', { name: 'La inscripción está cerrada' })).toBeVisible();
  await expect(page.getByLabel('Nombre del equipo')).toHaveCount(0);
  await foto(page, '92-inscripcion-cerrada');

  // F18: tesorería ve solo lo suyo en el menú y una sección sin permiso muestra un aviso, no un error.
  const tes = await (await browser.newContext()).newPage();
  await ingresar(tes, 'tesoreria@potrero.app');
  const menuTes = tes.locator('aside');
  await expect(menuTes.getByRole('link', { name: 'Caja' })).toBeVisible();
  for (const oculto of ['Sanciones', 'Usuarios', 'Documentación', 'Canchas', 'Configuración'])
    await expect(menuTes.getByRole('link', { name: oculto, exact: true })).toHaveCount(0);
  await tes.goto('/panel/documentacion');
  await expect(tes.getByText('Tu rol no tiene acceso a esta sección')).toBeVisible();
  await foto(tes, '93-sin-permiso-tesoreria');
  await tes.getByRole('link', { name: 'Volver al panel' }).click();
  await expect(tes.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();

  // Tribunal: ve Sanciones pero no Caja; entrar a Caja muestra el aviso.
  const tri = await (await browser.newContext()).newPage();
  await ingresar(tri, 'tribunal@potrero.app');
  await expect(tri.locator('aside').getByRole('link', { name: 'Sanciones' })).toBeVisible();
  await expect(tri.locator('aside').getByRole('link', { name: 'Caja' })).toHaveCount(0);
  await tri.goto('/panel/caja');
  await expect(tri.getByText('Tu rol no tiene acceso a esta sección')).toBeVisible();
});

test('cobros: pago parcial por transferencia, completar, anular, editar y finalizar un torneo', async ({
  page,
}) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();

  // Un torneo propio para no tocar los de la demo (copa: no cuenta en la retención de las métricas), con un equipo
  // de la liga inscripto ($ 60.000).
  const n = Date.now() % 100000;
  const torneo = await (
    await page.request.post('/api/torneos', {
      data: { nombre: `Prueba Pagos ${n}`, modalidad: 'F5', formato: 'COPA', cupo: 6, inscripcion: 60000 },
    })
  ).json();
  const equipos = (await (await page.request.get('/api/equipos')).json()) as { id: string; nombre: string }[];
  const fenix = equipos.find((e) => e.nombre === 'Fénix FC')!;
  await page.request.post(`/api/torneos/${torneo.id}/inscripciones`, { data: { equipoId: fenix.id } });
  await page.goto(`/panel/torneos/${torneo.id}?tab=inscripciones`);
  const fila = page.getByRole('row').filter({ hasText: 'Fénix FC' });

  // Pago parcial por transferencia.
  await fila.getByRole('button', { name: 'Registrar pago' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByLabel('Monto ($)')).toHaveValue('60000');
  await dialogo.getByLabel('Monto ($)').fill('20000');
  await expect(dialogo.getByText(/queda debiendo \$\s*40\.000/)).toBeVisible();
  await dialogo.getByLabel('Medio').selectOption('TRANSFERENCIA');
  await dialogo.getByLabel('Comprobante (opcional)').fill('Op. 4455');
  await foto(page, '36-registrar-pago');
  await dialogo.getByRole('button', { name: /Registrar pago parcial de/ }).click();
  await expect(dialogo).toBeHidden();
  await expect(fila).toContainText(/20\.000\s*\/\s*\$\s*60\.000/);
  await expect(fila).toContainText('Transferencia');
  await expect(fila).toContainText('Pendiente');

  // El resto en efectivo: el saldo viene por defecto y el equipo queda al día.
  await fila.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(dialogo.getByLabel('Monto ($)')).toHaveValue('40000');
  await dialogo.getByRole('button', { name: /Registrar pago de/ }).click();
  await expect(fila).toContainText('Confirmada');
  await expect(fila).toContainText('Al día');

  // Anular el efectivo (mal cargado) y volver a cobrarlo con el atajo.
  await fila.getByRole('button', { name: 'Ver pagos (2)' }).click();
  await dialogo
    .getByRole('listitem')
    .filter({ hasText: 'Efectivo' })
    .getByRole('button', { name: 'Anular' })
    .click();
  await dialogo.getByRole('button', { name: 'Sí, anular' }).click();
  await expect(dialogo.getByText('Anulado')).toBeVisible();
  await foto(page, '37-pagos-anular');
  await dialogo.getByRole('button', { name: 'Cerrar' }).click();
  await expect(fila).toContainText(/20\.000\s*\/\s*\$\s*60\.000/);
  await fila.getByRole('button', { name: /Cobré \$\s*40\.000 en efectivo/ }).click();
  await expect(fila).toContainText('Al día');

  // Un pago rechazado en el checkout ofrece intentar de nuevo con un link nuevo.
  const oeste = equipos.find((e) => e.nombre === 'Defensores del Oeste')!;
  const ins = await (
    await page.request.post(`/api/torneos/${torneo.id}/inscripciones`, { data: { equipoId: oeste.id } })
  ).json();
  const link = await (await page.request.post(`/api/cargos/${ins.cargo.id}/link`)).json();
  await page.goto(new URL(link.urlPago).pathname);
  await page.getByRole('button', { name: 'Simular pago rechazado' }).click();
  await expect(page.getByText('El pago fue rechazado.')).toBeVisible();
  await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
  await expect(page).not.toHaveURL(new RegExp(link.preferenciaId));
  await expect(page.getByRole('button', { name: 'Pagar (aprobar)' })).toBeVisible();
  await page.goto(`/panel/torneos/${torneo.id}?tab=inscripciones`);

  // Editar el torneo: el cupo no baja de los inscriptos.
  await page.getByRole('button', { name: 'Editar' }).click();
  await dialogo.getByLabel('Nombre').fill(`Prueba Pagos ${n} (editado)`);
  await dialogo.getByLabel('Cupo de equipos').fill('8');
  await dialogo.getByLabel('Inscripción por equipo ($)').fill('70000');
  await expect(dialogo.getByText(/conservan el monto/)).toBeVisible();
  await dialogo.getByLabel('Puntos por ganar').fill('2');
  await foto(page, '38-editar-torneo');
  await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();
  // Defensores del Oeste tiene un link de pago en curso: conserva el monto anterior.
  await expect(dialogo.getByText(/1 con pagos conservan el monto anterior/)).toBeVisible();
  await dialogo.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByRole('heading', { name: `Prueba Pagos ${n} (editado)` })).toBeVisible();
  await expect(page.getByText('2/8')).toBeVisible();

  // Cerrar la inscripción, reabrirla y finalizar.
  await page.getByRole('button', { name: 'Cerrar inscripción' }).click();
  await dialogo.getByRole('button', { name: 'Cerrar inscripción' }).click();
  await expect(page.getByText('En curso', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reabrir inscripción' }).click();
  await dialogo.getByRole('button', { name: 'Reabrir inscripción' }).click();
  await expect(page.getByText('Inscripción abierta', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar torneo' }).click();
  await dialogo.getByRole('button', { name: 'Finalizar torneo' }).click();
  await expect(page.getByText('Finalizado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reabrir torneo' })).toBeVisible();
  await foto(page, '39-torneo-finalizado');

  // En la liga en curso, finalizar avisa cuántos partidos quedan sin jugar (sin confirmar).
  await page.goto('/panel/torneos');
  await page.getByRole('link', { name: /Apertura 2026/ }).click();
  await page.getByRole('button', { name: 'Finalizar torneo' }).click();
  await expect(dialogo.getByRole('alert')).toContainText(/Quedan \d+ partidos sin jugar/);
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
});

test('acta: equipo ausente con tolerancia y resultado, línea de tiempo por minuto y cierre sin firmas (F11-F14)', async ({
  page,
}) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();

  const api = async <T>(metodo: 'GET' | 'POST', ruta: string, data?: unknown): Promise<T> => {
    const r = await page.request.fetch(`/api${ruta}`, { method: metodo, data });
    expect(r.ok(), `${metodo} ${ruta}: ${await r.text()}`).toBe(true);
    return (await r.json()) as T;
  };
  // Liga de dos equipos, ida y vuelta: la ida es hoy a las 00:00 (ya pasó la tolerancia) y la vuelta, más adelante.
  const n = Date.now() % 100000;
  const sedes = await api<{ canchas: { id: string; bloqueada: boolean }[] }[]>('GET', '/canchas');
  const cancha = sedes.flatMap((s) => s.canchas).find((c) => !c.bloqueada)!.id;
  const torneo = await api<{ id: string; slug: string }>('POST', '/torneos', {
    nombre: `Torneo E2E ausente ${n}`,
    modalidad: 'F5',
    formato: 'LIGA',
    idaYVuelta: true,
    cupo: 2,
    inscripcion: 0,
  });
  const nombres = [`Rayo ${n}`, `Trueno ${n}`];
  for (const nombre of nombres) {
    const e = await api<{ id: string }>('POST', '/equipos', { nombre });
    await api('POST', `/equipos/${e.id}/jugadores`, { nombre: 'Juan', apellido: nombre, numero: 10 });
    await api('POST', `/torneos/${torneo.id}/inscripciones`, { equipoId: e.id });
  }
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(),
  );
  await api('POST', `/torneos/${torneo.id}/fixture`, {
    primerDia: hoy,
    horarios: ['00:00'],
    canchaIds: [cancha],
  });
  const partidos = await api<{ id: string; fecha: number; local: string; visitante: string }[]>(
    'GET',
    `/torneos/${torneo.id}/partidos`,
  );
  const ida = partidos.find((p) => p.fecha === 1)!;
  const vuelta = partidos.find((p) => p.fecha === 2)!;

  // Antes de la tolerancia: los botones de equipo ausente están bloqueados y la API también lo rechaza.
  await page.goto(`/panel/partidos/${vuelta.id}`);
  await expect(page.getByTestId('estado-sync')).toContainText('En línea');
  await expect(page.getByRole('button', { name: `${vuelta.local} no se presentó` })).toBeDisabled();
  await expect(page.getByTestId('ausente-bloqueado')).toContainText('15 minutos');
  const temprano = await page.request.post(`/api/partidos/${vuelta.id}/wo`, { data: { ganadorId: 'x' } });
  expect(temprano.status()).toBe(422);
  // Abrir el acta no la toma (F13).
  expect((await api<{ dueno: unknown }>('GET', `/partidos/${vuelta.id}`)).dueno).toBeNull();

  // Pasada la tolerancia: se marca y el acta muestra el resultado del reglamento.
  await page.goto(`/panel/partidos/${ida.id}`);
  await expect(page.getByTestId('cuenta-wo')).toContainText('Pasó la tolerancia de 15 minutos');
  await page.getByRole('button', { name: `${ida.visitante} no se presentó` }).click();
  await expect(page.getByTestId('marcador')).toHaveText('3-0');
  await expect(page.getByTestId('resultado-ausente')).toHaveText(
    `Ganó ${ida.local}: ${ida.visitante} no se presentó`,
  );
  await foto(page, '40-acta-equipo-ausente');
  // El sitio público muestra lo mismo.
  await page.goto(`/t/liga-barrial-sur/${torneo.slug}/partido/${ida.id}`);
  await expect(page.getByTestId('marcador')).toContainText('3');
  await expect(page.getByTestId('resultado-ausente')).toHaveText(
    `Ganó ${ida.local}: ${ida.visitante} no se presentó`,
  );

  // Línea de tiempo por minuto: se carga 30', 5' y uno sin minuto; se ve 5', 30' y el sin minuto al final.
  await page.goto(`/panel/partidos/${vuelta.id}`);
  await page.getByRole('button', { name: 'Iniciar partido' }).click();
  const minuto = page.getByRole('textbox').first();
  const fila = page.locator('li', { hasText: `Juan ${vuelta.local}` }).first();
  await minuto.fill('30');
  await fila.getByRole('button', { name: 'Gol', exact: true }).click();
  await minuto.fill('5');
  await fila.getByRole('button', { name: 'Amarilla' }).click();
  await minuto.fill('');
  await fila.getByRole('button', { name: 'Gol', exact: true }).click();
  const linea = page.getByTestId('linea-de-tiempo').locator('li');
  await expect(linea).toHaveCount(3);
  await expect(linea.nth(0)).toContainText("5'");
  await expect(linea.nth(0)).toContainText('Amarilla');
  await expect(linea.nth(1)).toContainText("30'");
  await expect(linea.nth(2)).not.toContainText("'");
  await expect(page.getByTestId('estado-sync')).toContainText('todo sincronizado', { timeout: 20_000 });
  await foto(page, '41-acta-linea-de-tiempo');

  // Cierre sin firmas ni justificación: avisa en el momento y el acta sigue abierta.
  await page.getByRole('button', { name: 'Cerrar acta' }).click();
  await page.getByRole('button', { name: 'Confirmar cierre' }).click();
  await expect(page.getByTestId('error-cierre')).toContainText('firmas de los dos capitanes');
  await expect(page.getByRole('button', { name: 'Confirmar cierre' })).toBeVisible();
  await page.getByLabel(`Firma del capitán de ${vuelta.local}`).check();
  await page.getByLabel(`Firma del capitán de ${vuelta.visitante}`).check();
  await page.getByRole('button', { name: 'Confirmar cierre' }).click();
  await expect(page.getByText(/Acta cerrada/).first()).toBeVisible();
  await expect
    .poll(async () => (await api<{ estado: string }>('GET', `/partidos/${vuelta.id}`)).estado)
    .toBe('FINALIZADO');
});

// Torneos por fases (ADR-026, E10-07/08): crear el torneo desde "Armá el formato", generar la fase de grupos, jugarla,
// generar los playoffs con los clasificados y verlo por fases en el panel y en el sitio público.
test('torneo por fases: del simulador a los playoffs, en el panel y en el sitio público', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/panel'));
  const api = async <T>(metodo: 'GET' | 'POST', ruta: string, data?: unknown): Promise<T> => {
    const r = await page.request.fetch(`/api${ruta}`, { method: metodo, data });
    expect(r.ok(), `${metodo} ${ruta}: ${await r.text()}`).toBe(true);
    const texto = await r.text();
    return (texto ? JSON.parse(texto) : null) as T;
  };

  // El torneo de ejemplo de la demo ya está armado y con la fase de grupos a mitad de camino.
  await page.goto('/panel/torneos');
  await page.getByRole('link', { name: /Torneo Primavera 2026/ }).click();
  await expect(page.getByRole('navigation', { name: 'Fases' })).toBeVisible();
  await expect(page.getByTestId('detalle-f1')).toContainText('Grupo B');
  await page
    .getByRole('navigation', { name: 'Fases' })
    .getByRole('link', { name: /Playoffs/ })
    .click();
  await expect(page.getByText('Playoffs todavía no se puede armar')).toBeVisible();
  await expect(page.getByText('Falta terminar Fase 1.')).toBeVisible();
  await foto(page, '50-torneo-por-fases');

  // Del simulador al torneo.
  await page.goto('/panel/torneos/formato');
  await page.getByLabel('Equipos', { exact: true }).fill('8');
  await page.getByRole('button', { name: /Grupos \+ playoffs Zonas/ }).click();
  await page.getByRole('button', { name: 'Crear torneo con este formato' }).click();
  const form = page.getByRole('form', { name: 'Crear torneo con este formato' });
  const nombre = `Fases E2E ${Date.now() % 100000}`;
  await form.getByLabel('Nombre').fill(nombre);
  await form.getByLabel('Inscripción por equipo ($)').fill('0');
  await form.getByLabel('Cuota por fecha ($)').fill('0');
  await form.getByRole('button', { name: 'Crear torneo' }).click();
  await page.waitForURL((u) => /^\/panel\/torneos\/(?!formato$|nuevo$)[^/]+$/.test(u.pathname));
  const torneoId = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(page.getByRole('heading', { name: nombre })).toBeVisible();

  // Ocho equipos de la liga (sin arancel quedan confirmados).
  const equipos = await api<{ id: string }[]>('GET', '/equipos');
  for (const e of equipos.slice(0, 8))
    await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.id });

  // Fase 1: se genera desde la pestaña Fases, con fechas lejanas para no tocar los sábados de la demo.
  await page.goto(`/panel/torneos/${torneoId}?tab=fases`);
  const generarGrupos = page.getByRole('form', { name: 'Generar Fase de grupos' });
  await generarGrupos.getByLabel('Primer día de juego').fill('2027-06-06');
  await generarGrupos.getByLabel('Horarios').fill('09:00, 10:00');
  await generarGrupos.getByRole('button', { name: /Generar Fase de grupos con 8 equipos/ }).click();
  await expect(page.getByTestId('detalle-f1')).toContainText('0 de 12 partidos jugados');

  // Se juega por la API: gana siempre el local.
  type Vista = { fases: { clave: string; estado: string; partidos: { id: string; estado: string }[] }[] };
  const jugar = async (id: string) => {
    const acta = await api<{ local: { id: string; jugadores: { id: string; habilitado: boolean }[] } }>(
      'GET',
      `/partidos/${id}`,
    );
    await api('POST', `/partidos/${id}/iniciar`, {});
    await api('POST', `/partidos/${id}/eventos`, {
      tipo: 'GOL',
      equipoId: acta.local.id,
      jugadorId: (acta.local.jugadores.find((j) => j.habilitado) ?? acta.local.jugadores[0])?.id,
      minuto: 10,
      clientUuid: crypto.randomUUID(),
    });
    await api('POST', `/partidos/${id}/cerrar`, { firmaLocal: true, firmaVisitante: true });
  };
  for (const p of (await api<Vista>('GET', `/torneos/${torneoId}/fases?t=${Date.now()}`)).fases[0]!.partidos)
    await jugar(p.id);

  // Fase 2: los playoffs toman a los dos primeros de cada grupo.
  await page.goto(`/panel/torneos/${torneoId}?tab=fases&fase=f2`);
  await expect(page.getByText('Ya están los 4 equipos')).toBeVisible();
  const generarPlayoffs = page.getByRole('form', { name: 'Generar Playoffs' });
  await generarPlayoffs.getByLabel('Primer día de juego').fill('2027-07-11');
  await generarPlayoffs.getByLabel('Horarios').fill('09:00, 10:00');
  await generarPlayoffs.getByRole('button', { name: /Generar Playoffs/ }).click();
  await expect(page.getByTestId('detalle-f2')).toContainText('0 de 2 partidos jugados');
  // Semifinales y, cuando se crea, la final.
  for (let i = 0; i < 4; i++) {
    const vista = await api<Vista>('GET', `/torneos/${torneoId}/fases?t=${Date.now()}`);
    const pendientes = vista.fases[1]!.partidos.filter((p) => p.estado === 'PROGRAMADO');
    if (!pendientes.length) break;
    for (const p of pendientes) await jugar(p.id);
  }
  await page.reload();
  await expect(page.getByTestId('detalle-f2')).toContainText('Terminada');
  await foto(page, '51-playoffs-por-fases');

  // Sitio público por fases.
  const t = await api<{ slug: string; organizacionSlug: string }>('GET', `/torneos/${torneoId}`);
  await page.goto(`/t/${t.organizacionSlug}/${t.slug}?fase=f1`);
  await expect(page.getByRole('navigation', { name: 'Fases' })).toBeVisible();
  await expect(page.getByTestId('detalle-f1')).toContainText('Grupo A');
  await page
    .getByRole('navigation', { name: 'Fases' })
    .getByRole('link', { name: /Playoffs/ })
    .click();
  await expect(page.getByTestId('detalle-f2')).toContainText('Final');
});

test('permisos de cobro: el administrador registra y anula pagos; el tribunal no ve los botones de cobro', async ({
  page,
  browser,
}) => {
  const ingresar = async (p: Page, email: string) => {
    await p.goto('/ingresar');
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Contraseña').fill('potrero-demo-2026');
    await p.getByRole('button', { name: 'Ingresar' }).click();
    await expect(p.getByRole('heading', { name: 'Hoy en tu liga' })).toBeVisible();
  };
  // El dueño arma un torneo propio con un equipo inscripto que debe la inscripción.
  await ingresar(page, 'demo@potrero.app');
  const n = Date.now() % 100000;
  const torneo = await (
    await page.request.post('/api/torneos', {
      data: { nombre: `Prueba Admin ${n}`, modalidad: 'F5', formato: 'COPA', cupo: 6, inscripcion: 60000 },
    })
  ).json();
  const equipos = (await (await page.request.get('/api/equipos')).json()) as { id: string; nombre: string }[];
  const fenix = equipos.find((e) => e.nombre === 'Fénix FC')!;
  await page.request.post(`/api/torneos/${torneo.id}/inscripciones`, { data: { equipoId: fenix.id } });

  // Administrador: ve "Registrar pago" y "Cobré … en efectivo", registra un pago parcial y lo puede anular.
  const adm = await (await browser.newContext()).newPage();
  await ingresar(adm, 'admin@potrero.app');
  await expect(adm.locator('aside').getByRole('link', { name: 'Caja' })).toBeVisible();
  await adm.goto(`/panel/torneos/${torneo.id}?tab=inscripciones`);
  const fila = adm.getByRole('row').filter({ hasText: 'Fénix FC' });
  await expect(fila.getByRole('button', { name: /Cobré .* en efectivo/ })).toBeVisible();
  await fila.getByRole('button', { name: 'Registrar pago' }).click();
  const dialogo = adm.getByRole('dialog');
  await dialogo.getByLabel('Monto ($)').fill('20000');
  await dialogo.getByLabel('Medio').selectOption('EFECTIVO');
  await dialogo.getByRole('button', { name: /Registrar pago parcial de/ }).click();
  await expect(dialogo).toBeHidden();
  await expect(fila).toContainText(/20\.000\s*\/\s*\$\s*60\.000/);
  await fila.getByRole('button', { name: 'Ver pagos (1)' }).click();
  await expect(adm.getByRole('dialog').getByRole('button', { name: 'Anular' })).toBeVisible();
  await foto(adm, '95-administrador-registra-pago');

  // Tribunal: entra al torneo pero no ve los botones de cobro ni la anulación.
  const tri = await (await browser.newContext()).newPage();
  await ingresar(tri, 'tribunal@potrero.app');
  await tri.goto(`/panel/torneos/${torneo.id}?tab=inscripciones`);
  const filaTri = tri.getByRole('row').filter({ hasText: 'Fénix FC' });
  await expect(filaTri).toBeVisible();
  await expect(filaTri.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);
  await expect(filaTri.getByRole('button', { name: /Cobré/ })).toHaveCount(0);
  await filaTri.getByRole('button', { name: 'Ver pagos (1)' }).click();
  await expect(tri.getByRole('dialog')).toContainText('Efectivo');
  await expect(tri.getByRole('dialog').getByRole('button', { name: 'Anular' })).toHaveCount(0);
});

test('backoffice de Gregal: staff separado, métricas, organizaciones, dinero y auditoría (E36)', async ({ page, context }) => {
  // Un organizador logueado no entra a /gregal: lo manda al ingreso del staff.
  await page.goto('/ingresar');
  await page.getByLabel('Email').fill('demo@potrero.app');
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/panel');
  await page.goto('/gregal');
  await expect(page).toHaveURL(/\/gregal\/ingresar$/);
  await context.clearCookies();

  // Ingreso del staff.
  await page.getByLabel('Email').fill('staff@gregal.tech');
  await page.getByLabel('Contraseña').fill('mal-la-clave');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible();
  await page.getByLabel('Contraseña').fill('potrero-demo-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/gregal$/);
  await expect(page.getByRole('heading', { name: 'Cómo viene Potrero' })).toBeVisible();
  await expect(page.getByTestId('kpi-ligas')).not.toHaveText('0');
  await expect(page.getByTestId('partidos-semana').locator('.gregal-cols > div')).toHaveCount(8);
  await expect(page.getByTestId('ligas-en-riesgo')).toContainText('Liga Amigos de Quilmes');
  await foto(page, '90-gregal-inicio');

  // Un staff no usa el panel de una liga: sin sesión de organizador, /panel pide ingresar.
  await page.goto('/panel');
  await expect(page).toHaveURL(/\/ingresar/);

  // Organizaciones: búsqueda y detalle con la salud.
  await page.goto('/gregal/organizaciones');
  const lista = page.getByTestId('lista-organizaciones');
  await expect(lista).toContainText('Liga Barrial Sur');
  await expect(lista).toContainText('Fútbol 5 Palermo');
  await foto(page, '91-gregal-organizaciones');
  await page.getByLabel('Buscar organización').fill('quilmes');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(lista.locator('tbody tr')).toHaveCount(1);
  await lista.getByRole('link', { name: /Liga Amigos de Quilmes/ }).click();
  await expect(page.getByRole('heading', { name: 'Liga Amigos de Quilmes' })).toBeVisible();
  await expect(page.getByTestId('salud')).toContainText('Pocas actas cargadas');
  await expect(page.getByTestId('salud')).toContainText('Solo pagos manuales');
  await foto(page, '92-gregal-organizacion');

  await page.getByRole('link', { name: 'Dinero' }).click();
  await expect(page.getByTestId('dinero-por-mes')).toBeVisible();
  await foto(page, '93-gregal-dinero');

  // La auditoría registra lo que se acaba de hacer.
  await page.getByRole('link', { name: 'Auditoría' }).click();
  const auditoria = page.getByTestId('auditoria');
  await expect(auditoria).toContainText('Ingresó al backoffice');
  await expect(auditoria).toContainText('Vio el detalle de una organización');
  await expect(auditoria).toContainText('Liga Amigos de Quilmes');
  await foto(page, '94-gregal-auditoria');

  await page.getByTestId('gregal-salir').click();
  await page.waitForURL(/\/gregal\/ingresar$/);
});

test('jugador: cuenta, asistencia que ve el capitán, avisos, privacidad e invitación desde el plantel (E20-01, E20-05, E19-02)', async ({
  page,
  browser,
}) => {
  const ingresar = async (p: Page, email: string) => {
    await p.goto('/ingresar');
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Contraseña').fill('potrero-demo-2026');
    await p.getByRole('button', { name: 'Ingresar' }).click();
  };
  // El jugador de demo entra y cae en su panel, nunca en el del organizador ni en el del capitán.
  await ingresar(page, 'jugador@potrero.app');
  await expect(page).toHaveURL(/\/jugador/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const nombre = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
  await expect(page.getByTestId('proximo-jugador').first()).toContainText('Villa Unión');
  await expect(page.getByTestId('avisos')).toBeVisible();
  await expect(page.getByTestId('mis-sanciones')).toContainText('Sin suspensión');
  await expect(page.getByTestId('mi-documentacion')).toBeVisible();
  await expect(page.getByTestId('mi-trayectoria')).toContainText('Apertura 2026');
  await foto(page, '60-jugador');
  await page.goto('/panel');
  await expect(page).toHaveURL(/\/jugador/);
  await page.goto('/capitan');
  await expect(page).toHaveURL(/\/jugador/);

  // Confirma asistencia: primero "No voy" y después "Voy", y el capitán lo ve en su convocatoria.
  const asistencia = page.getByTestId('asistencia');
  await asistencia.getByRole('button', { name: 'No voy' }).click();
  await expect(asistencia).toContainText('Avisaste que no vas');
  await asistencia.getByRole('button', { name: 'Voy', exact: true }).click();
  await expect(asistencia).toContainText('Confirmaste que vas');
  await expect(page.getByTestId('avisos')).not.toContainText('¿Vas contra');

  // Elige cómo aparece su nombre en el sitio público.
  const privacidad = page.getByTestId('privacidad');
  await privacidad.getByRole('radio', { name: 'Completo' }).click();
  await expect(privacidad).toContainText(`aparecés como ${nombre}`);
  await privacidad.getByRole('radio', { name: 'Nombre e inicial' }).click();
  await expect(privacidad).not.toContainText(`aparecés como ${nombre}`);

  // El capitán ve la confirmación y al jugador "En la app"; invita a otro del plantel y recibe el link.
  const cap = await (await browser.newContext()).newPage();
  await ingresar(cap, 'capitan@potrero.app');
  await expect(cap).toHaveURL(/\/capitan/);
  await expect(
    cap.getByTestId('convocatoria').getByTestId('convocado').filter({ hasText: nombre }),
  ).toContainText('Va');
  const fila = cap.getByTestId('jugador-plantel').filter({ hasText: nombre });
  await expect(fila).toContainText('En la app');
  const otro = cap
    .getByTestId('jugador-plantel')
    .filter({ has: cap.getByRole('button', { name: /^Invitar a .* a la app$/ }) })
    .first();
  await otro.getByRole('button', { name: /^Invitar a .* a la app$/ }).click();
  await otro.getByLabel(/^Email de/).fill(`jugador.e2e${Date.now() % 100000}@ejemplo.com.ar`);
  await otro.getByRole('button', { name: 'Generar invitación' }).click();
  const link = await otro.getByLabel('Link de invitación').inputValue();
  expect(link).toContain('/invitacion/');
  await foto(cap, '61-capitan-invita');

  // El invitado ve los términos con su versión: sin aceptarlos no puede crear la cuenta.
  const inv = await (await browser.newContext()).newPage();
  await inv.goto(new URL(link).pathname);
  await expect(inv.getByRole('heading', { name: /Te invitaron como jugador de Villa Unión/ })).toBeVisible();
  await expect(inv.getByText('Términos de uso para jugadores')).toBeVisible();
  await inv.getByLabel('Elegí una contraseña').fill('clave-segura-e2e');
  await inv.getByRole('checkbox').check();
  await inv.getByRole('button', { name: 'Crear cuenta y aceptar' }).click();
  await expect(inv).toHaveURL(/\/jugador/);
  await expect(inv.getByTestId('mi-documentacion')).toBeVisible();
});
