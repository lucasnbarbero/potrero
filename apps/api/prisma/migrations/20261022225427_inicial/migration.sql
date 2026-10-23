-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('LIGA', 'FUNDADORA', 'PRO');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('DUENO', 'ADMINISTRADOR', 'TESORERO', 'ARBITRO', 'TRIBUNAL');

-- CreateEnum
CREATE TYPE "Modalidad" AS ENUM ('F5', 'F7', 'F8', 'F11');

-- CreateEnum
CREATE TYPE "Formato" AS ENUM ('LIGA', 'COPA', 'GRUPOS_PLAYOFFS', 'LIGA_PLAYOFFS');

-- CreateEnum
CREATE TYPE "EstadoTorneo" AS ENUM ('BORRADOR', 'INSCRIPCION', 'EN_CURSO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "EstadoInscripcion" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'BAJA');

-- CreateEnum
CREATE TYPE "EstadoCargo" AS ENUM ('PENDIENTE', 'PAGADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('MERCADO_PAGO', 'EFECTIVO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "EstadoPartido" AS ENUM ('PROGRAMADO', 'EN_JUEGO', 'FINALIZADO', 'SUSPENDIDO', 'WO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('GOL', 'GOL_EN_CONTRA', 'AMARILLA', 'ROJA', 'CAMBIO', 'ANULACION');

-- CreateEnum
CREATE TYPE "CausaSancion" AS ENUM ('ROJA_DIRECTA', 'DOBLE_AMARILLA', 'ACUMULACION');

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizacion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'LIGA',
    "color_marca" TEXT,
    "mp_cuenta_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion_refresh" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "familia" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT,
    "usuario_id" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglamento" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "puntos_victoria" INTEGER NOT NULL,
    "puntos_empate" INTEGER NOT NULL,
    "puntos_derrota" INTEGER NOT NULL,
    "desempates" TEXT[],
    "suspension_roja_directa" INTEGER NOT NULL,
    "suspension_doble_amarilla" INTEGER NOT NULL,
    "umbral_amarillas" INTEGER NOT NULL,
    "suspension_acumulacion" INTEGER NOT NULL,
    "goles_wo" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reglamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "torneo" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "modalidad" "Modalidad" NOT NULL,
    "formato" "Formato" NOT NULL,
    "ida_y_vuelta" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoTorneo" NOT NULL DEFAULT 'BORRADOR',
    "cupo" INTEGER NOT NULL,
    "inscripcion" INTEGER NOT NULL,
    "reglamento_id" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "torneo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipo" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT,
    "capitan_nombre" TEXT,
    "capitan_email" TEXT,
    "capitan_telefono" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jugador" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jugador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantel_jugador" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "jugador_id" TEXT NOT NULL,
    "numero" INTEGER,

    CONSTRAINT "plantel_jugador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscripcion" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "torneo_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "estado" "EstadoInscripcion" NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargo" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "inscripcion_id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "estado" "EstadoCargo" NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "cargo_id" TEXT NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" INTEGER NOT NULL,
    "comision_plataforma" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoPago" NOT NULL DEFAULT 'PENDIENTE',
    "preferencia_id" TEXT,
    "pasarela_pago_id" TEXT,
    "comprobante" TEXT,
    "registrado_por_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acreditado_en" TIMESTAMP(3),

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sede" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,

    CONSTRAINT "sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancha" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "cancha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partido" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "torneo_id" TEXT NOT NULL,
    "fecha" INTEGER NOT NULL,
    "local_id" TEXT NOT NULL,
    "visitante_id" TEXT NOT NULL,
    "cancha_id" TEXT,
    "inicio" TIMESTAMP(3),
    "estado" "EstadoPartido" NOT NULL DEFAULT 'PROGRAMADO',
    "goles_local" INTEGER,
    "goles_visitante" INTEGER,
    "ganador_wo_id" TEXT,
    "cerrado_en" TIMESTAMP(3),

    CONSTRAINT "partido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_partido" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "partido_id" TEXT NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "jugador_id" TEXT,
    "minuto" INTEGER,
    "anula_a" TEXT,
    "client_uuid" TEXT NOT NULL,
    "cargado_por_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_partido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sancion" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "torneo_id" TEXT NOT NULL,
    "jugador_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "partido_origen_id" TEXT NOT NULL,
    "causa" "CausaSancion" NOT NULL,
    "partidos" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sancion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizacion_slug_key" ON "organizacion"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "membresia_usuario_id_organizacion_id_key" ON "membresia"("usuario_id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_refresh_token_hash_key" ON "sesion_refresh"("token_hash");

-- CreateIndex
CREATE INDEX "sesion_refresh_familia_idx" ON "sesion_refresh"("familia");

-- CreateIndex
CREATE INDEX "auditoria_organizacion_id_creado_en_idx" ON "auditoria"("organizacion_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "torneo_organizacion_id_slug_key" ON "torneo"("organizacion_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "equipo_organizacion_id_nombre_key" ON "equipo"("organizacion_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "plantel_jugador_equipo_id_jugador_id_key" ON "plantel_jugador"("equipo_id", "jugador_id");

-- CreateIndex
CREATE UNIQUE INDEX "inscripcion_torneo_id_equipo_id_key" ON "inscripcion"("torneo_id", "equipo_id");

-- CreateIndex
CREATE UNIQUE INDEX "pago_preferencia_id_key" ON "pago"("preferencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "pago_pasarela_pago_id_key" ON "pago"("pasarela_pago_id");

-- CreateIndex
CREATE INDEX "partido_torneo_id_fecha_idx" ON "partido"("torneo_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "evento_partido_client_uuid_key" ON "evento_partido"("client_uuid");

-- CreateIndex
CREATE INDEX "evento_partido_partido_id_idx" ON "evento_partido"("partido_id");

-- CreateIndex
CREATE UNIQUE INDEX "sancion_partido_origen_id_jugador_id_causa_key" ON "sancion"("partido_origen_id", "jugador_id", "causa");

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_refresh" ADD CONSTRAINT "sesion_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "torneo" ADD CONSTRAINT "torneo_reglamento_id_fkey" FOREIGN KEY ("reglamento_id") REFERENCES "reglamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantel_jugador" ADD CONSTRAINT "plantel_jugador_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantel_jugador" ADD CONSTRAINT "plantel_jugador_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "jugador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_torneo_id_fkey" FOREIGN KEY ("torneo_id") REFERENCES "torneo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_inscripcion_id_fkey" FOREIGN KEY ("inscripcion_id") REFERENCES "inscripcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancha" ADD CONSTRAINT "cancha_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partido" ADD CONSTRAINT "partido_torneo_id_fkey" FOREIGN KEY ("torneo_id") REFERENCES "torneo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partido" ADD CONSTRAINT "partido_cancha_id_fkey" FOREIGN KEY ("cancha_id") REFERENCES "cancha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_partido" ADD CONSTRAINT "evento_partido_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sancion" ADD CONSTRAINT "sancion_torneo_id_fkey" FOREIGN KEY ("torneo_id") REFERENCES "torneo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
