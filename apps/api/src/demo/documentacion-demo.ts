// Datos de demo de documentación e identidad (E15): casi todo el plantel en regla y siete casos para mostrar la pantalla.
import type { Contexto } from '../comun/http.js';
import { DbService } from '../db/db.service.js';
import { cifrar, hashDeDni } from '../documentacion/seguridad.js';

const DIA = 86_400_000;
const fecha = (desde: Date, dias: number) => new Date(desde.getTime() + dias * DIA);

/** El jugador número 9 de cada equipo es el "caso" (los de arriba no se tocan, así el acta de demo sigue andando). */
export async function cargarDocumentacion(db: DbService, c: Contexto, torneoId: string) {
  const hoy = new Date();
  await db.enOrg(c.organizacionId, async (tx) => {
    await tx.torneo.update({
      where: { id: torneoId },
      data: { documentosRequeridos: ['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR'] },
    });
    const inscripciones = await tx.inscripcion.findMany({
      where: { torneoId, estado: { not: 'BAJA' } },
      include: { equipo: { include: { plantel: { orderBy: { numero: 'asc' } } } } },
      orderBy: { creadoEn: 'asc' },
    });
    const documentos: {
      organizacionId: string;
      jugadorId: string;
      tipo: 'DNI' | 'APTO_FISICO' | 'AUTORIZACION_MENOR';
      estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
      archivoClave: string;
      archivoNombre: string;
      mime: string;
      tamano: number;
      vencimiento: Date | null;
      motivoRechazo: string | null;
      revisadoEn: Date | null;
    }[] = [];
    const doc = (
      jugadorId: string,
      tipo: (typeof documentos)[number]['tipo'],
      estado: (typeof documentos)[number]['estado'],
      vencimiento: Date | null = null,
      motivoRechazo: string | null = null,
    ) =>
      documentos.push({
        organizacionId: c.organizacionId,
        jugadorId,
        tipo,
        estado,
        archivoClave: `demo:${tipo}`,
        archivoNombre:
          tipo === 'DNI' ? 'dni-frente.jpg' : tipo === 'APTO_FISICO' ? 'apto-medico.pdf' : 'autorizacion.pdf',
        mime: 'image/svg+xml',
        tamano: 0,
        vencimiento,
        motivoRechazo,
        revisadoEn: estado === 'PENDIENTE' ? null : fecha(hoy, -20),
      });

    let n = 0;
    const duplicados: string[] = [];
    const casos: Record<number, string> = {};
    for (const [i, ins] of inscripciones.entries()) {
      for (const [k, pl] of ins.equipo.plantel.entries()) {
        const id = pl.jugadorId;
        const esCaso = k === 8; // el número 9
        n++;
        let dni = String(28_000_000 + n * 7_919);
        let nacimiento = fecha(new Date('1996-01-01T00:00:00Z'), (n * 137) % 3_000);
        if (esCaso && i === 3) dni = (casos[2] as string) ?? dni;
        if (esCaso && i === 2) casos[2] = dni;
        if (esCaso && i === 4) nacimiento = new Date(Date.UTC(hoy.getUTCFullYear() - 15, 2, 14));
        if (esCaso && i === 5) nacimiento = new Date(Date.UTC(hoy.getUTCFullYear() - 16, 7, 2));
        // Un par de menores más, ya autorizados con el documento firmado.
        if (!esCaso && k === 7 && i < 2) nacimiento = new Date(Date.UTC(hoy.getUTCFullYear() - 17, 4, 9));
        await tx.jugador.update({
          where: { id },
          data: {
            fechaNacimiento: nacimiento,
            dniCifrado: cifrar(dni),
            dniHash: hashDeDni(dni),
            ...(k === 0 ? { datosMedicosCifrado: cifrar('Alergia a la penicilina') } : {}),
          },
        });
        const vigente = fecha(hoy, 120 + ((n * 53) % 200));
        if (!esCaso) {
          doc(id, 'DNI', 'APROBADO');
          doc(id, 'APTO_FISICO', 'APROBADO', vigente);
          if (k === 7 && i < 2) doc(id, 'AUTORIZACION_MENOR', 'APROBADO');
          continue;
        }
        switch (i) {
          case 0: // Foto de DNI ilegible: se rechazó y falta que la vuelvan a subir.
            doc(id, 'DNI', 'RECHAZADO', null, 'Foto de DNI ilegible');
            doc(id, 'APTO_FISICO', 'APROBADO', vigente);
            break;
          case 1: // Apto vencido.
            doc(id, 'DNI', 'APROBADO');
            doc(id, 'APTO_FISICO', 'APROBADO', fecha(hoy, -22));
            break;
          case 2: // Mismo DNI que el del equipo siguiente.
          case 3:
            doc(id, 'DNI', 'APROBADO');
            doc(id, 'APTO_FISICO', 'APROBADO', vigente);
            duplicados.push(id);
            break;
          case 4: // Menor sin autorización del tutor.
            doc(id, 'DNI', 'APROBADO');
            doc(id, 'APTO_FISICO', 'APROBADO', vigente);
            break;
          case 5: // Menor que ya autorizó el tutor en línea.
            doc(id, 'DNI', 'APROBADO');
            doc(id, 'APTO_FISICO', 'APROBADO', vigente);
            await tx.consentimiento.createMany({
              data: (['TUTOR_PARTICIPACION', 'IMAGEN'] as const).map((tipo) => ({
                organizacionId: c.organizacionId,
                jugadorId: id,
                tipo,
                version: 1,
                otorgante: 'Marta Gómez',
                otorganteDni: cifrar('20111222'),
                vinculo: 'MADRE',
              })),
            });
            break;
          case 6: // El apto vence en menos de un mes: sigue habilitado pero con aviso.
            doc(id, 'DNI', 'APROBADO');
            doc(id, 'APTO_FISICO', 'APROBADO', fecha(hoy, 12));
            break;
          default: // Subió los dos y todavía no se revisaron.
            doc(id, 'DNI', 'PENDIENTE');
            doc(id, 'APTO_FISICO', 'PENDIENTE', fecha(hoy, 300));
        }
      }
    }
    await tx.documentoJugador.createMany({ data: documentos });
    if (duplicados.length === 2) {
      const [a, b] = [...duplicados].sort() as [string, string];
      await tx.duplicadoJugador.create({
        data: { organizacionId: c.organizacionId, jugadorAId: a, jugadorBId: b },
      });
    }
  });
}
