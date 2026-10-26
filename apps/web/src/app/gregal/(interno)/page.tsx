import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado } from '@/componentes/ui';
import { pesos } from '@/lib/formato';
import { apiGregal, diaMes, ESTADO_SALUD, type InicioGregal, nombreMes, porcentaje } from '@/lib/gregal';
import { Columnas, MezclaDeMedios } from './graficos';

export const metadata = { title: 'Inicio' };

const d = (n: number) => ({ '--d': n }) as React.CSSProperties;

export default async function InicioGregal() {
  const m = await apiGregal<InicioGregal>('/inicio');
  const cerradosSemana = m.partidosPorSemana.at(-1)?.cantidad ?? 0;
  const cerrados8 = m.partidosPorSemana.reduce((a, s) => a + s.cantidad, 0);
  return (
    <div className="space-y-4">
      <Encabezado eyebrow="Plataforma · todas las ligas" titulo="Cómo viene Potrero" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="gregal-kpis">
        <section className="tile-gregal rise" style={d(1)}>
          <span className="eyebrow !text-[#0a0f0d]/60">Ligas activas</span>
          <div className="num mt-2 text-5xl font-bold tracking-tighter" data-testid="kpi-ligas">
            {m.ligas.activas}
          </div>
          <p className="text-sm opacity-70">de {m.ligas.total} organizaciones</p>
        </section>
        <section className="tile rise" style={d(2)}>
          <span className="eyebrow">Torneos en curso</span>
          <div className="num mt-2 text-5xl font-bold tracking-tighter">{m.torneosEnCurso}</div>
          <p className="text-sm text-mute">
            {m.equipos} equipos · {m.jugadores} jugadores
          </p>
        </section>
        <section className="tile rise" style={d(3)}>
          <span className="eyebrow">Cobrado (GMV)</span>
          <div className="num mt-2 text-4xl font-bold tracking-tighter" data-testid="kpi-gmv">
            {pesos(m.cobros.total)}
          </div>
          <p className="text-sm text-mute">{m.cobros.pagos} pagos aprobados</p>
        </section>
        <section className="tile-ink rise" style={d(4)}>
          <span className="eyebrow !text-white/50">Comisión de Gregal</span>
          <div className="num text-gregal mt-2 text-4xl font-bold tracking-tighter">
            {pesos(m.cobros.comision)}
          </div>
          <p className="text-sm text-white/50">
            {porcentaje(m.tasa.sobreOnline, 1)} de lo online · {porcentaje(m.tasa.sobreTotal, 1)} del total
          </p>
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="tile rise" style={d(5)} data-testid="partidos-semana">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">Partidos cerrados por semana</h2>
              <p className="text-sm text-mute">El norte del producto: actas cerradas en la plataforma.</p>
            </div>
            <span className="pill-gregal">
              <Icono nombre="ball" />
              {cerradosSemana} esta semana · {cerrados8} en 8 semanas
            </span>
          </div>
          <Columnas
            etiqueta="Partidos cerrados por semana, últimas 8 semanas"
            datos={m.partidosPorSemana.map((s) => ({
              clave: s.semana,
              valor: s.cantidad,
              texto: diaMes(s.semana),
              titulo: `Semana del ${diaMes(s.semana)}: ${s.cantidad} partidos`,
            }))}
          />
        </section>

        <section className="tile rise" style={d(6)}>
          <h2 className="text-xl font-bold">Cobrado por medio</h2>
          <p className="mb-4 text-sm text-mute">La comisión se cobra solo sobre lo online.</p>
          <MezclaDeMedios cobros={m.cobros} />
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_1.4fr]">
        <section className="tile rise" style={d(7)}>
          <h2 className="mb-4 text-xl font-bold">Ligas nuevas por mes</h2>
          <Columnas
            etiqueta="Ligas nuevas por mes, últimos 6 meses"
            datos={m.ligasPorMes.map((x) => ({
              clave: x.mes,
              valor: x.cantidad,
              texto: nombreMes(x.mes),
              titulo: `${nombreMes(x.mes)}: ${x.cantidad} ligas nuevas`,
            }))}
          />
        </section>

        <section className="tile rise" style={d(8)} data-testid="ligas-en-riesgo">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Ligas para llamar</h2>
            <Link href="/gregal/organizaciones" className="btn-glass btn-sm">
              Ver todas
            </Link>
          </div>
          <p className="mb-2 text-sm text-mute">
            Alertas de riesgo de abandono: el gestor llama o escribe en 24 horas.
          </p>
          {m.enRiesgo.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">Ninguna liga con alertas. Bien ahí.</p>
          ) : (
            m.enRiesgo.map((l) => {
              const [texto, clase] = ESTADO_SALUD[l.salud];
              return (
                <Link key={l.id} href={`/gregal/organizaciones/${l.id}`} className="list-row group">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate group-hover:underline">{l.nombre}</b>
                    <span className="text-sm text-mute">{l.alertas.map((a) => a.titulo).join(' · ')}</span>
                  </div>
                  <span className={clase}>{texto}</span>
                  <Icono nombre="chev" className="text-mute" />
                </Link>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
