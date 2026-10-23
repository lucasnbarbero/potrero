-- Documentación, identidad y consentimientos (E15).
CREATE TYPE "TipoDocumento" AS ENUM ('DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR');
CREATE TYPE "EstadoRevision" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');
CREATE TYPE "EstadoDuplicado" AS ENUM ('ABIERTO', 'RESUELTO');

ALTER TABLE "jugador"
  ADD COLUMN "fecha_nacimiento" DATE,
  ADD COLUMN "dni_cifrado" TEXT,
  ADD COLUMN "dni_hash" TEXT,
  ADD COLUMN "datos_medicos_cifrado" TEXT;
CREATE INDEX "jugador_organizacion_id_dni_hash_idx" ON "jugador"("organizacion_id", "dni_hash");

ALTER TABLE "torneo" ADD COLUMN "documentos_requeridos" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "documento_jugador" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "jugador_id" TEXT NOT NULL,
  "tipo" "TipoDocumento" NOT NULL,
  "estado" "EstadoRevision" NOT NULL DEFAULT 'PENDIENTE',
  "archivo_clave" TEXT NOT NULL,
  "archivo_nombre" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "tamano" INTEGER NOT NULL,
  "vencimiento" DATE,
  "motivo_rechazo" TEXT,
  "revisado_por_id" TEXT,
  "revisado_en" TIMESTAMP(3),
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documento_jugador_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "documento_jugador_organizacion_id_jugador_id_idx" ON "documento_jugador"("organizacion_id", "jugador_id");
ALTER TABLE "documento_jugador" ADD CONSTRAINT "documento_jugador_jugador_id_fkey"
  FOREIGN KEY ("jugador_id") REFERENCES "jugador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "acceso_documento" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "documento_id" TEXT NOT NULL,
  "usuario_id" TEXT,
  "accion" TEXT NOT NULL,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acceso_documento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "acceso_documento_organizacion_id_documento_id_idx" ON "acceso_documento"("organizacion_id", "documento_id");
ALTER TABLE "acceso_documento" ADD CONSTRAINT "acceso_documento_documento_id_fkey"
  FOREIGN KEY ("documento_id") REFERENCES "documento_jugador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "duplicado_jugador" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "jugador_a_id" TEXT NOT NULL,
  "jugador_b_id" TEXT NOT NULL,
  "estado" "EstadoDuplicado" NOT NULL DEFAULT 'ABIERTO',
  "resolucion" TEXT,
  "resuelto_por_id" TEXT,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resuelto_en" TIMESTAMP(3),
  CONSTRAINT "duplicado_jugador_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "duplicado_jugador_jugador_a_id_jugador_b_id_key" ON "duplicado_jugador"("jugador_a_id", "jugador_b_id");
CREATE INDEX "duplicado_jugador_organizacion_id_estado_idx" ON "duplicado_jugador"("organizacion_id", "estado");

CREATE TABLE "consentimiento" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "jugador_id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "otorgante" TEXT NOT NULL,
  "otorgante_dni" TEXT,
  "vinculo" TEXT,
  "otorgado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revocado_en" TIMESTAMP(3),
  CONSTRAINT "consentimiento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consentimiento_organizacion_id_jugador_id_idx" ON "consentimiento"("organizacion_id", "jugador_id");
ALTER TABLE "consentimiento" ADD CONSTRAINT "consentimiento_jugador_id_fkey"
  FOREIGN KEY ("jugador_id") REFERENCES "jugador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "solicitud_consentimiento" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "jugador_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "vence_en" TIMESTAMP(3) NOT NULL,
  "usada_en" TIMESTAMP(3),
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "solicitud_consentimiento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "solicitud_consentimiento_token_key" ON "solicitud_consentimiento"("token");
CREATE INDEX "solicitud_consentimiento_organizacion_id_jugador_id_idx" ON "solicitud_consentimiento"("organizacion_id", "jugador_id");

-- Row Level Security: cada organización solo ve y modifica sus filas.
ALTER TABLE "documento_jugador" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "documento_jugador"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "acceso_documento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "acceso_documento"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "duplicado_jugador" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "duplicado_jugador"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "consentimiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "consentimiento"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "solicitud_consentimiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "solicitud_consentimiento"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());
