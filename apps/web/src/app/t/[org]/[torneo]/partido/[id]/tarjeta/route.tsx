// Tarjeta de resultado compartible (E21-04): imagen PNG para la vista previa de WhatsApp (Open Graph, horizontal),
// para el feed de Instagram (?formato=cuadrado) y para historias (?formato=historia).
import { ImageResponse } from 'next/og';
import { colorEquipo, iniciales } from '@/lib/formato';
import type { PartidoPublico } from '@/lib/tipos-publico';

const API = process.env.API_URL ?? 'http://localhost:4000';
const INK = '#0a0a0a';
const VOLT = '#d6ff3d';

const FORMATOS = {
  horizontal: { width: 1200, height: 630 },
  cuadrado: { width: 1080, height: 1080 },
  historia: { width: 1080, height: 1920 },
} as const;

export async function GET(request: Request, ctx: RouteContext<'/t/[org]/[torneo]/partido/[id]/tarjeta'>) {
  const { org, torneo, id } = await ctx.params;
  const r = await fetch(`${API}/api/publico/${org}/${torneo}/partidos/${id}`, { next: { revalidate: 10 } });
  if (!r.ok) return new Response('No encontramos el partido.', { status: r.status === 404 ? 404 : 502 });
  const s = (await r.json()) as PartidoPublico;
  const p = s.partido;
  const pedido = new URL(request.url).searchParams.get('formato') as keyof typeof FORMATOS | null;
  const formato = pedido && pedido in FORMATOS ? pedido : 'horizontal';
  const { width, height } = FORMATOS[formato];
  const vertical = formato !== 'horizontal';
  const escala = formato === 'historia' ? 1.35 : 1;

  const jugado = p.estado === 'FINALIZADO' || p.estado === 'WO';
  const marcador = jugado ? `${p.golesLocal} - ${p.golesVisitante}` : 'vs';
  // Equipo ausente: el resultado lo define el reglamento; la leyenda dice quién no se presentó.
  const [ganadorWO, ausenteWO] = p.ganadorWO === 'LOCAL' ? [p.local, p.visitante] : [p.visitante, p.local];
  const instancia = p.fase === 'LLAVE' ? (p.ronda ?? 'Playoffs') : `Fecha ${p.fecha}`;
  // Goleadores por equipo, para la línea de abajo del marcador.
  const goles = (lado: 'LOCAL' | 'VISITANTE') => {
    const cuenta = new Map<string, number>();
    for (const e of s.lineaDeTiempo)
      if (e.tipo === 'GOL' && e.lado === lado && e.jugador)
        cuenta.set(e.jugador.nombre, (cuenta.get(e.jugador.nombre) ?? 0) + 1);
    return [...cuenta].map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(' · ');
  };

  const escudo = (nombre: string) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 150 * escala,
        height: 150 * escala,
        borderRadius: 44 * escala,
        background: colorEquipo(nombre),
        color: 'white',
        fontSize: 56 * escala,
        border: '6px solid rgba(255,255,255,0.18)',
      }}
    >
      {iniciales(nombre)}
    </div>
  );
  const equipo = (nombre: string, lado: 'LOCAL' | 'VISITANTE') => (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: vertical ? 420 : 330 }}
    >
      {escudo(nombre)}
      <div
        style={{
          display: 'flex',
          marginTop: 22,
          fontSize: 38 * escala,
          textAlign: 'center',
          justifyContent: 'center',
        }}
      >
        {nombre}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 10,
          fontSize: 22 * escala,
          color: 'rgba(255,255,255,0.55)',
          textAlign: 'center',
          justifyContent: 'center',
        }}
      >
        {goles(lado)}
      </div>
    </div>
  );

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: INK,
        color: 'white',
        padding: vertical ? 80 : 56,
        position: 'relative',
      }}
    >
      {/* Líneas de la cancha */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          right: 24,
          bottom: 24,
          border: '3px solid rgba(255,255,255,0.08)',
          borderRadius: 28,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          ...(vertical
            ? { left: 24, right: 24, top: height / 2, height: 3 }
            : { top: 24, bottom: 24, left: width / 2, width: 3 }),
          background: 'rgba(255,255,255,0.08)',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: width / 2 - 170,
          top: height / 2 - 170,
          width: 340,
          height: 340,
          borderRadius: 340,
          border: '3px solid rgba(255,255,255,0.08)',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: vertical ? -260 : -140,
          top: vertical ? -260 : -140,
          width: 420,
          height: 420,
          borderRadius: 420,
          background: 'rgba(214,255,61,0.16)',
          display: 'flex',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 24 * escala,
            letterSpacing: 4,
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          {`${s.torneo.nombre} · ${s.torneo.modalidad} · ${instancia}`.toUpperCase()}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 14,
            padding: '8px 22px',
            borderRadius: 999,
            background: jugado ? VOLT : 'rgba(255,255,255,0.15)',
            color: jugado ? INK : 'white',
            fontSize: 22 * escala,
          }}
        >
          {p.estado === 'FINALIZADO'
            ? 'Final'
            : p.estado === 'WO'
              ? `Ganó ${ganadorWO}: ${ausenteWO} no se presentó`
              : 'Próximo partido'}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: vertical ? 40 : 24,
        }}
      >
        {equipo(p.local, 'LOCAL')}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            margin: vertical ? '36px 0' : 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: (jugado ? 150 : 110) * escala,
              letterSpacing: -6,
              lineHeight: 1,
            }}
          >
            {marcador}
          </div>
          {p.penalesLocal !== null && p.penalesVisitante !== null && (
            <div style={{ display: 'flex', fontSize: 26 * escala, color: 'rgba(255,255,255,0.6)' }}>
              {`Penales ${p.penalesLocal}-${p.penalesVisitante}`}
            </div>
          )}
        </div>
        {equipo(p.visitante, 'VISITANTE')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26 * escala }}>
        <div style={{ display: 'flex', color: VOLT }}>{s.organizacion.nombre}</div>
        <div style={{ display: 'flex', color: 'rgba(255,255,255,0.35)' }}>· Creado con Potrero</div>
      </div>
    </div>,
    {
      width,
      height,
      headers: { 'cache-control': 'public, max-age=60, s-maxage=60' },
    },
  );
}
