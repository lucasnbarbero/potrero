-- Comunicación (E16) y contingencias (E17): mensajes, difusiones, automatizaciones, reprogramaciones,
-- consentimientos del capitán y vencimientos de cargos.
CREATE TYPE "CanalMensaje" AS ENUM ('EMAIL', 'WHATSAPP', 'PUSH');
CREATE TYPE "EstadoMensaje" AS ENUM ('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'FALLIDO');
CREATE TYPE "EstadoDifusion" AS ENUM ('PROGRAMADA', 'ENVIADA');

ALTER TABLE "equipo"
  ADD COLUMN "capitan_optin_whatsapp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "capitan_baja_marketing" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "cargo" ADD COLUMN "vence" DATE;
ALTER TABLE "torneo" ADD COLUMN "vence_inscripcion" DATE;

CREATE TABLE "difusion" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "plantilla" TEXT NOT NULL,
  "canal" "CanalMensaje" NOT NULL,
  "titulo" TEXT NOT NULL,
  "segmento" JSONB NOT NULL,
  "texto" TEXT,
  "programada_para" TIMESTAMP(3),
  "estado" "EstadoDifusion" NOT NULL DEFAULT 'ENVIADA',
  "creada_por_id" TEXT,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "difusion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contingencia" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "accion" TEXT NOT NULL,
  "detalle" JSONB NOT NULL,
  "aplicada_por_id" TEXT,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contingencia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mensaje" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "difusion_id" TEXT,
  "contingencia_id" TEXT,
  "equipo_id" TEXT,
  "clave" TEXT,
  "plantilla" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "canal" "CanalMensaje" NOT NULL,
  "destinatario" TEXT NOT NULL,
  "destino" TEXT NOT NULL,
  "asunto" TEXT NOT NULL,
  "cuerpo" TEXT NOT NULL,
  "estado" "EstadoMensaje" NOT NULL DEFAULT 'PENDIENTE',
  "costo_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "proveedor_id" TEXT,
  "token" TEXT,
  "respuesta" TEXT,
  "respondido_en" TIMESTAMP(3),
  "error" TEXT,
  "enviado_en" TIMESTAMP(3),
  "entregado_en" TIMESTAMP(3),
  "leido_en" TIMESTAMP(3),
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mensaje_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automatizacion" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT false,
  "canal" "CanalMensaje" NOT NULL DEFAULT 'WHATSAPP',
  CONSTRAINT "automatizacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mensaje_token_key" ON "mensaje"("token");
CREATE UNIQUE INDEX "mensaje_organizacion_id_clave_key" ON "mensaje"("organizacion_id", "clave");
CREATE INDEX "mensaje_organizacion_id_creado_en_idx" ON "mensaje"("organizacion_id", "creado_en");
CREATE INDEX "mensaje_contingencia_id_idx" ON "mensaje"("contingencia_id");
CREATE INDEX "difusion_organizacion_id_creado_en_idx" ON "difusion"("organizacion_id", "creado_en");
CREATE INDEX "contingencia_organizacion_id_creado_en_idx" ON "contingencia"("organizacion_id", "creado_en");
CREATE UNIQUE INDEX "automatizacion_organizacion_id_clave_key" ON "automatizacion"("organizacion_id", "clave");

ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_difusion_id_fkey"
  FOREIGN KEY ("difusion_id") REFERENCES "difusion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_contingencia_id_fkey"
  FOREIGN KEY ("contingencia_id") REFERENCES "contingencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: cada organización solo ve y modifica sus filas.
ALTER TABLE "difusion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "difusion"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "mensaje" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "mensaje"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "automatizacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "automatizacion"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "contingencia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "contingencia"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());
