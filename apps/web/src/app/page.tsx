// Landing de Potrero. Origen visual: mocks/landing.html. Precios y comisiones salen de docs/datos.json.
import { DATOS, type Plan } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import { enlaceDemo } from '@/lib/entornos';
import { pesos } from '@/lib/formato';

const pct = (plan: Plan) => `${String(DATOS.planes[plan].comisionPct).replace('.', ',')}%`;

export default function Landing() {
  return (
    <>
      {/* NAV */}
      <header
        className="sticky top-3 z-50 mx-auto mt-3 flex max-w-6xl items-center gap-3 rounded-full glass py-2 pl-3 pr-2"
        style={{ width: 'calc(100% - 1.5rem)' } as React.CSSProperties}
      >
        <a href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <Icono nombre="ball" className="grid size-9 place-items-center rounded-2xl bg-volt text-lg" />
          Potrero
        </a>
        <nav className="ml-6 hidden items-center gap-1 text-sm font-semibold text-mute md:flex">
          <a className="rounded-full px-3.5 py-2 hover:bg-black/5 hover:text-ink" href="#problemas">
            Problemas
          </a>
          <a className="rounded-full px-3.5 py-2 hover:bg-black/5 hover:text-ink" href="#producto">
            Producto
          </a>
          <a className="rounded-full px-3.5 py-2 hover:bg-black/5 hover:text-ink" href="#precios">
            Precios
          </a>
          <a className="rounded-full px-3.5 py-2 hover:bg-black/5 hover:text-ink" href="#faq">
            Preguntas
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={enlaceDemo}
            className="hidden rounded-full px-4 py-2 text-sm font-semibold hover:bg-black/5 md:block"
          >
            Probá la demo
          </a>
          <a
            href="/ingresar"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold hover:bg-black/5 sm:block"
          >
            Ingresar
          </a>
          <a href="/registro" className="btn-volt btn-sm">
            Crear mi liga
            <Icono nombre="arrow" />
          </a>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-14 sm:pt-20">
          <div className="rise mx-auto flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/70 py-1.5 pl-1.5 pr-4 text-sm font-semibold backdrop-blur">
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs text-volt">NUEVO</span>Cobros con
            Mercado Pago y avisos por WhatsApp
          </div>
          <h1
            className="rise mx-auto mt-6 max-w-4xl text-center text-5xl font-bold leading-[.98] tracking-tighter sm:text-7xl lg:text-[5.5rem]"
            style={{ '--d': '1' } as React.CSSProperties}
          >
            Tu torneo, <span className="whitespace-nowrap rounded-3xl bg-volt px-3">sin planillas</span> ni
            grupos de WhatsApp.
          </h1>
          <p
            className="rise mx-auto mt-6 max-w-2xl text-center text-lg text-mute sm:text-xl"
            style={{ '--d': '2' } as React.CSSProperties}
          >
            Potrero arma el fixture, cobra las inscripciones, carga las actas y avisa a todos. Vos organizás.
            Nosotros hacemos el resto.
          </p>
          <div
            className="rise mt-8 flex flex-wrap items-center justify-center gap-3"
            style={{ '--d': '3' } as React.CSSProperties}
          >
            <a href="/registro" className="btn-volt btn-lg">
              Quiero ser liga fundadora
              <Icono nombre="arrow" />
            </a>
            <a href={enlaceDemo} className="btn-glass btn-lg">
              <Icono nombre="eye" />
              Probá la demo
            </a>
          </div>
          <p
            className="rise mt-3 text-center text-sm text-mute"
            style={{ '--d': '3' } as React.CSSProperties}
          >
            Sin tarjeta · Tu primer torneo en menos de 30 minutos · Pagás solo cuando cobrás
          </p>

          {/* collage de producto */}
          <div className="relative mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-6">
            <div className="tile-ink rise md:col-span-4" style={{ '--d': '4' } as React.CSSProperties}>
              <div className="field-pattern pointer-events-none absolute inset-0 opacity-90"></div>
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="pill-live">En vivo · 32'</span>
                  <span className="text-xs text-white/50">Apertura F7 · Cancha 2</span>
                </div>
                <div className="my-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <span className="crest size-16" style={{ '--c': '#16a34a' } as React.CSSProperties}>
                      LP
                    </span>
                    <b>Los Pibes</b>
                  </div>
                  <div className="text-7xl font-bold tracking-tighter num sm:text-8xl">
                    2<span className="mx-1 text-white/25">:</span>1
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="crest size-16" style={{ '--c': '#2563eb' } as React.CSSProperties}>
                      AN
                    </span>
                    <b>Atl. Norte</b>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-white/60">
                  <Icono nombre="ball" className="text-volt" />
                  12' Luna · 25' Gómez · 30' Pérez
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:col-span-2">
              <div className="tile-volt rise" style={{ '--d': '5' } as React.CSSProperties}>
                <span className="eyebrow !text-ink/60">Cobrado</span>
                <div className="mt-2 text-4xl font-bold tracking-tighter num">$1.280.000</div>
                <p className="text-sm text-ink/70">9 de 14 equipos pagaron</p>
              </div>
              <div className="tile rise" style={{ '--d': '6' } as React.CSSProperties}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="grid size-8 place-items-center rounded-full bg-[#25d366] text-white">
                    <Icono nombre="whatsapp" />
                  </span>
                  Fixture publicado
                </div>
                <p className="mt-2 text-sm text-mute">16 capitanes avisados. 94% ya lo leyó.</p>
              </div>
            </div>
          </div>
        </section>

        {/* NUMEROS */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rise text-center">
              <div className="text-5xl font-bold tracking-tighter">10 h</div>
              <p className="text-sm text-mute">menos de gestión por torneo*</p>
            </div>
            <div className="rise text-center" style={{ '--d': '1' } as React.CSSProperties}>
              <div className="text-5xl font-bold tracking-tighter">91%</div>
              <p className="text-sm text-mute">cobra antes del inicio*</p>
            </div>
            <div className="rise text-center" style={{ '--d': '2' } as React.CSSProperties}>
              <div className="text-5xl font-bold tracking-tighter">0</div>
              <p className="text-sm text-mute">planillas de Excel*</p>
            </div>
            <div className="rise text-center" style={{ '--d': '3' } as React.CSSProperties}>
              <div className="text-5xl font-bold tracking-tighter">&lt;30 min</div>
              <p className="text-sm text-mute">para armar un torneo*</p>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-mute">
            * Cifras de ejemplo para el mock; se reemplazan con datos reales del piloto.
          </p>
        </section>

        {/* PROBLEMAS */}
        <section id="problemas" className="mx-auto max-w-6xl px-4 py-16">
          <p className="eyebrow">Lo que ya conocés</p>
          <h2 className="mt-2 max-w-3xl text-4xl font-bold tracking-tighter sm:text-6xl">
            Organizar un torneo no debería sentirse como un segundo trabajo.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="tile rise">
              <span className="text-3xl">🧾</span>
              <h3 className="mt-3 text-xl font-bold">"¿Quién pagó y quién no?"</h3>
              <p className="mt-1 text-mute">
                Transferencias perdidas en el chat, comprobantes en capturas y deudas que nadie recuerda.
              </p>
              <div className="mt-4 rounded-2xl bg-volt/30 p-3 text-sm font-semibold">
                → Cobros con Mercado Pago y recordatorios automáticos.
              </div>
            </div>
            <div className="tile rise" style={{ '--d': '1' } as React.CSSProperties}>
              <span className="text-3xl">🌧️</span>
              <h3 className="mt-3 text-xl font-bold">"Llueve, ¿qué hacemos?"</h3>
              <p className="mt-1 text-mute">
                Reprogramar 9 partidos, avisar a 126 personas y conseguir otra cancha. Un sábado perdido.
              </p>
              <div className="mt-4 rounded-2xl bg-volt/30 p-3 text-sm font-semibold">
                → Reprogramás en un clic y el aviso sale solo.
              </div>
            </div>
            <div className="tile rise" style={{ '--d': '2' } as React.CSSProperties}>
              <span className="text-3xl">🪪</span>
              <h3 className="mt-3 text-xl font-bold">"Jugó con el DNI del hermano"</h3>
              <p className="mt-1 text-mute">
                Jugadores duplicados, menores sin autorización y aptos físicos vencidos.
              </p>
              <div className="mt-4 rounded-2xl bg-volt/30 p-3 text-sm font-semibold">
                → Verificación de identidad antes del partido.
              </div>
            </div>
            <div className="tile rise">
              <span className="text-3xl">🟥</span>
              <h3 className="mt-3 text-xl font-bold">"¿Cuántas fechas le tocan?"</h3>
              <p className="mt-1 text-mute">
                Tarjetas anotadas a mano, suspensiones que se olvidan y reclamos eternos.
              </p>
              <div className="mt-4 rounded-2xl bg-volt/30 p-3 text-sm font-semibold">
                → Sanciones automáticas desde el acta.
              </div>
            </div>
            <div className="tile rise" style={{ '--d': '1' } as React.CSSProperties}>
              <span className="text-3xl">📋</span>
              <h3 className="mt-3 text-xl font-bold">"El fixture quedó mal"</h3>
              <p className="mt-1 text-mute">
                Equipos que juegan dos seguidos, canchas pisadas y árbitros sin asignar.
              </p>
              <div className="mt-4 rounded-2xl bg-volt/30 p-3 text-sm font-semibold">
                → Fixture automático sin choques.
              </div>
            </div>
            <div className="tile rise" style={{ '--d': '2' } as React.CSSProperties}>
              <span className="text-3xl">💸</span>
              <h3 className="mt-3 text-xl font-bold">"No sé si gané plata"</h3>
              <p className="mt-1 text-mute">Canchas, árbitros, premios y multas en cuadernos distintos.</p>
              <div className="mt-4 rounded-2xl bg-volt/30 p-3 text-sm font-semibold">
                → Caja del torneo con resultado en tiempo real.
              </div>
            </div>
          </div>
        </section>

        {/* PRODUCTO */}
        <section id="producto" className="mx-auto max-w-6xl px-4 py-16">
          <p className="eyebrow">El producto</p>
          <h2 className="mt-2 max-w-3xl text-4xl font-bold tracking-tighter sm:text-6xl">
            Todo el torneo en un solo lugar.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            <div className="tile-ink rise md:col-span-4">
              <div className="field-pattern pointer-events-none absolute inset-0 opacity-60"></div>
              <div className="relative">
                <span className="pill-volt">Fixture automático</span>
                <h3 className="mt-4 max-w-md text-3xl font-bold tracking-tight">
                  31 partidos en 6 sábados. En 2 segundos.
                </h3>
                <p className="mt-2 max-w-md text-white/60">
                  Respeta canchas, descansos, árbitros y bloqueos. Mové un partido y te avisa si rompe algo.
                </p>
                <div className="mt-6 grid max-w-md grid-cols-3 gap-2 text-xs">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <b className="block">Los Pibes</b>
                    <span className="text-white/50">14:00 · C1</span>
                  </div>
                  <div className="rounded-2xl bg-volt p-3 text-ink">
                    <b className="block">Dep. Sur</b>
                    <span className="text-ink/60">15:00 · C1</span>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <b className="block">Sparta</b>
                    <span className="text-white/50">16:00 · C1</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="tile-volt rise md:col-span-2" style={{ '--d': '1' } as React.CSSProperties}>
              <Icono nombre="wallet" className="size-8" />
              <h3 className="mt-4 text-2xl font-bold tracking-tight">Cobros que se cobran solos</h3>
              <p className="mt-2 text-sm text-ink/70">
                Link de inscripción, seña, cuotas por fecha y multas. Todo con Mercado Pago.
              </p>
            </div>
            <div className="tile rise md:col-span-2">
              <Icono nombre="whistle" className="size-8" />
              <h3 className="mt-4 text-2xl font-bold tracking-tight">Acta digital</h3>
              <p className="mt-2 text-sm text-mute">
                Goles, tarjetas y firmas desde el celular, incluso sin señal. La tabla se actualiza sola.
              </p>
            </div>
            <div className="tile rise md:col-span-2" style={{ '--d': '1' } as React.CSSProperties}>
              <Icono nombre="cloud" className="size-8" />
              <h3 className="mt-4 text-2xl font-bold tracking-tight">Reprogramación en un clic</h3>
              <p className="mt-2 text-sm text-mute">
                Lluvia o cancha caída: elegís la opción y todos reciben el aviso.
              </p>
            </div>
            <div className="tile rise md:col-span-2" style={{ '--d': '2' } as React.CSSProperties}>
              <Icono nombre="whatsapp" className="size-8" />
              <h3 className="mt-4 text-2xl font-bold tracking-tight">WhatsApp integrado</h3>
              <p className="mt-2 text-sm text-mute">
                Mensajes por segmento, con plantillas y recordatorios automáticos.
              </p>
            </div>
            <div className="tile rise md:col-span-3">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/5 text-xl">
                  <Icono nombre="flag" />
                </span>
                <div>
                  <h3 className="text-2xl font-bold tracking-tight">Sanciones y tribunal</h3>
                  <p className="mt-1 text-sm text-mute">
                    Las amarillas y rojas del acta se convierten en suspensiones según tu reglamento. Los
                    casos graves llegan a un expediente.
                  </p>
                </div>
              </div>
            </div>
            <div className="tile rise md:col-span-3" style={{ '--d': '1' } as React.CSSProperties}>
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/5 text-xl">
                  <Icono nombre="id" />
                </span>
                <div>
                  <h3 className="text-2xl font-bold tracking-tight">Identidad y documentación</h3>
                  <p className="mt-1 text-sm text-mute">
                    DNI, apto físico, menores y duplicados verificados antes de cada partido, con selfie
                    opcional.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PASOS */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="tile-ink !p-8 sm:!p-12">
            <div className="field-pattern pointer-events-none absolute inset-0 opacity-70"></div>
            <div className="relative">
              <p className="eyebrow !text-white/50">Cómo funciona</p>
              <h2 className="mt-2 text-4xl font-bold tracking-tighter sm:text-5xl">
                De cero a torneo en una tarde.
              </h2>
              <div className="mt-10 grid gap-6 md:grid-cols-3">
                <div>
                  <span className="grid size-12 place-items-center rounded-full bg-volt text-lg font-bold text-ink">
                    1
                  </span>
                  <h3 className="mt-4 text-xl font-bold">Armá tu torneo</h3>
                  <p className="mt-1 text-white/60">
                    Elegí modalidad y formato. Potrero genera grupos, llaves y fixture.
                  </p>
                </div>
                <div>
                  <span className="grid size-12 place-items-center rounded-full bg-volt text-lg font-bold text-ink">
                    2
                  </span>
                  <h3 className="mt-4 text-xl font-bold">Compartí el link</h3>
                  <p className="mt-1 text-white/60">
                    Los capitanes se inscriben y pagan solos. Vos ves los cupos llenarse.
                  </p>
                </div>
                <div>
                  <span className="grid size-12 place-items-center rounded-full bg-volt text-lg font-bold text-ink">
                    3
                  </span>
                  <h3 className="mt-4 text-xl font-bold">Jugá y relajate</h3>
                  <p className="mt-1 text-white/60">Actas, tablas, sanciones y avisos se actualizan solos.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRECIOS */}
        <section id="precios" className="mx-auto max-w-6xl px-4 py-16">
          <p className="eyebrow text-center">Precios</p>
          <h2 className="mt-2 text-center text-4xl font-bold tracking-tighter sm:text-6xl">
            Pagás cuando cobrás.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-mute">
            Sin costo fijo. Pagás un porcentaje solo de lo que se cobra por la plataforma; lo que cobrás en
            efectivo no paga comisión.
          </p>
          <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-3">
            <div className="tile rise !p-8">
              <span className="pill">Liga</span>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-6xl font-bold tracking-tighter">{pct('LIGA')}</span>
                <span className="pb-2 text-mute">por cobro online</span>
              </div>
              <p className="mt-1 text-sm text-mute">Sin cuota fija.</p>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex gap-2">
                  <Icono nombre="check" className="text-emerald-600" />
                  Todos los módulos
                </li>
                <li className="flex gap-2">
                  <Icono nombre="check" className="text-emerald-600" />
                  Torneos y equipos ilimitados
                </li>
                <li className="flex gap-2">
                  <Icono nombre="check" className="text-emerald-600" />
                  Efectivo y transferencia sin comisión
                </li>
                <li className="flex gap-2">
                  <Icono nombre="check" className="text-emerald-600" />
                  Mensajería incluida con tope
                </li>
              </ul>
              <a href="/registro" className="btn-glass btn-lg mt-8 w-full">
                Crear mi liga
              </a>
            </div>
            <div className="tile-ink rise !p-8" style={{ '--d': '1' } as React.CSSProperties}>
              <div className="field-pattern pointer-events-none absolute inset-0 opacity-60"></div>
              <div className="relative">
                <span className="pill-volt">Ligas fundadoras</span>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-6xl font-bold tracking-tighter">{pct('FUNDADORA')}</span>
                  <span className="pb-2 text-white/50">de por vida</span>
                </div>
                <p className="mt-1 text-sm text-white/50">
                  Solo las primeras {DATOS.planes.FUNDADORA.cupo} ligas.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex gap-2">
                    <Icono nombre="check" className="text-volt" />
                    Todo lo del plan Liga
                  </li>
                  <li className="flex gap-2">
                    <Icono nombre="check" className="text-volt" />
                    Alta y migración gratis
                  </li>
                  <li className="flex gap-2">
                    <Icono nombre="check" className="text-volt" />
                    Acompañamiento directo
                  </li>
                  <li className="flex gap-2">
                    <Icono nombre="check" className="text-volt" />
                    Tu opinión define el producto
                  </li>
                </ul>
                <a href="/registro" className="btn-volt btn-lg mt-8 w-full">
                  Quiero ser fundadora
                </a>
              </div>
            </div>
            <div className="tile rise !p-8" style={{ '--d': '2' } as React.CSSProperties}>
              <span className="pill">Pro</span>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-6xl font-bold tracking-tighter">
                  {pesos(DATOS.planes.PRO.cuotaMensual)}
                </span>
                <span className="pb-2 text-mute">/ mes</span>
              </div>
              <p className="mt-1 text-sm text-mute">+ {pct('PRO')} por cobro online.</p>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex gap-2">
                  <Icono nombre="check" className="text-emerald-600" />
                  Tu marca y dominio propio
                </li>
                <li className="flex gap-2">
                  <Icono nombre="check" className="text-emerald-600" />
                  WhatsApp ampliado
                </li>
                <li className="flex gap-2">
                  <Icono nombre="check" className="text-emerald-600" />
                  Sponsors y reportes avanzados
                </li>
                <li className="flex gap-2">
                  <Icono nombre="check" className="text-emerald-600" />
                  Métricas completas y soporte prioritario
                </li>
              </ul>
              <a href="/registro" className="btn-glass btn-lg mt-8 w-full">
                Hablar con ventas
              </a>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-mute">
            Valores de referencia. Mercado Pago cobra aparte su costo por procesar el pago: podés absorberlo o
            mostrarlo al equipo como cargo por servicio. Siempre ves cuánto recibís.
          </p>
        </section>

        {/* JUGADORES */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid items-center gap-4 md:grid-cols-2">
            <div className="tile-volt !p-8 sm:!p-10">
              <span className="pill-ink">Para equipos y jugadores</span>
              <h2 className="mt-4 text-4xl font-bold tracking-tighter sm:text-5xl">
                Más gente adentro, más ganas de volver.
              </h2>
              <p className="mt-3 text-ink/70">
                Capitanes que convocan en un toque. Jugadores con perfil, estadísticas y trayectoria. Tus
                torneos se vuelven un lugar al que quieren pertenecer.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="tile text-center">
                <div className="text-5xl font-bold tracking-tighter">38</div>
                <p className="text-sm text-mute">goles en el perfil de cada jugador</p>
              </div>
              <div className="tile-ink text-center">
                <div className="text-5xl font-bold tracking-tighter text-volt">4,8</div>
                <p className="text-sm text-white/60">valoración de juego limpio</p>
              </div>
              <div className="tile col-span-2 flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-volt">
                  <Icono nombre="share" />
                </span>
                <p className="text-sm font-semibold">
                  Tarjetas de resultado listas para compartir en WhatsApp e Instagram.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-center text-4xl font-bold tracking-tighter sm:text-5xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-8 space-y-3">
            <details className="tile group !py-4" open>
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold">
                ¿Necesito instalar algo?
                <Icono nombre="plus" className="transition group-open:rotate-45" />
              </summary>
              <p className="mt-3 text-mute">
                No. Potrero funciona desde el navegador y se instala como app (PWA) desde el celular con un
                toque.
              </p>
            </details>
            <details className="tile group !py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold">
                ¿Cómo cobro las inscripciones?
                <Icono nombre="plus" className="transition group-open:rotate-45" />
              </summary>
              <p className="mt-3 text-mute">
                Conectás tu cuenta de Mercado Pago. Los equipos pagan con tarjeta o dinero en cuenta y el
                dinero va directo a tu cuenta, menos nuestra comisión. Lo que cobrás en efectivo lo registrás
                sin comisión.
              </p>
            </details>
            <details className="tile group !py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold">
                ¿Puedo traer mis equipos desde Excel?
                <Icono nombre="plus" className="transition group-open:rotate-45" />
              </summary>
              <p className="mt-3 text-mute">
                Sí. Subís tu planilla y migramos equipos y jugadores. Te acompañamos en el primer torneo.
              </p>
            </details>
            <details className="tile group !py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold">
                ¿Sirve para fútbol 5, 7, 8 y 11?
                <Icono nombre="plus" className="transition group-open:rotate-45" />
              </summary>
              <p className="mt-3 text-mute">
                Sí, con formatos de liga, copa, grupos con playoffs y liga con playoffs. Cada modalidad tiene
                sus reglas configurables.
              </p>
            </details>
            <details className="tile group !py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold">
                ¿Qué pasa con los datos de menores?
                <Icono nombre="plus" className="transition group-open:rotate-45" />
              </summary>
              <p className="mt-3 text-mute">
                Se guardan cifrados, con consentimiento del tutor, y no se muestran al público. Solo ve cada
                dato quien lo necesita.
              </p>
            </details>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="tile-ink text-center !p-10 sm:!p-16">
            <div className="field-pattern pointer-events-none absolute inset-0 opacity-80"></div>
            <div className="pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-volt/30 blur-3xl"></div>
            <div className="relative">
              <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.02] tracking-tighter sm:text-6xl">
                El próximo torneo, <span className="text-volt">que se arme solo.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-white/60">
                De cero a tu primer torneo en menos de 30 minutos. Te acompañamos sin costo.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href="/registro" className="btn-volt btn-lg">
                  Quiero ser liga fundadora
                  <Icono nombre="arrow" />
                </a>
                <a href={enlaceDemo} className="btn-glass btn-lg !bg-white/10 !text-white !border-white/10">
                  Probá la demo
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-6 text-sm text-mute">
          <div className="flex items-center gap-2 font-bold text-ink">
            <Icono nombre="ball" className="grid size-8 place-items-center rounded-xl bg-volt" />
            Potrero
          </div>
          <div className="flex gap-5">
            <a href="#">Términos</a>
            <a href="#">Privacidad</a>
            <a href="#">Contacto</a>
          </div>
          <a href="https://gregal.tech" className="flex items-center gap-2">
            Un producto de
            <img src="/gregal-claro.svg" alt="Gregal Tech" className="h-5 w-auto" />
          </a>
          <span>© 2026 Gregal Tech · Hecho en Argentina</span>
        </div>
      </footer>
    </>
  );
}
