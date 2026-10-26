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
