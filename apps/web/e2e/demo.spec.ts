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
  await page.getByRole('link', { name: 'Sanciones' }).click();
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
  const fecha4 = page.locator('section', { hasText: 'Fecha 4' });
  await fecha4.locator('li', { hasText: equipoSancionado }).getByRole('link', { name: 'Acta' }).click();
  await expect(page.getByText(/Suspendido \(roja directa\)/)).toBeVisible();
  await expect(page.getByText('No habilitado')).toBeVisible();
  await foto(page, '09-acta');
});
