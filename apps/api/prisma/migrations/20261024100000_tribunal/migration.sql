-- Tribunal de disciplina (E14): expedientes y sanciones impuestas por el tribunal.
ALTER TYPE "CausaSancion" ADD VALUE 'TRIBUNAL';

CREATE TYPE "TipoExpediente" AS ENUM ('ROJA_DIRECTA', 'AGRESION', 'INCIDENTE_HINCHADA', 'JUGADOR_NO_HABILITADO', 'OTRO');
CREATE TYPE "EstadoExpediente" AS ENUM ('ABIERTO', 'RESUELTO');

CREATE TABLE "expediente" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "torneo_id" TEXT NOT NULL,
    "partido_id" TEXT,
    "equipo_id" TEXT NOT NULL,
    "jugador_id" TEXT,
    "tipo" "TipoExpediente" NOT NULL,
    "motivo" TEXT NOT NULL,
    "informe_arbitro" TEXT,
    "descargo" TEXT,
    "descargo_en" TIMESTAMP(3),
    "sugeridos" INTEGER NOT NULL DEFAULT 0,
    "sancion_id" TEXT,
    "estado" "EstadoExpediente" NOT NULL DEFAULT 'ABIERTO',
    "clave" TEXT,
    "partidos_resueltos" INTEGER,
    "multa" INTEGER NOT NULL DEFAULT 0,
    "cargo_id" TEXT,
    "veredicto" TEXT,
    "resolucion" TEXT,
    "resuelto_por_id" TEXT,
    "resuelto_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expediente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expediente_organizacion_id_clave_key" ON "expediente"("organizacion_id", "clave");
CREATE INDEX "expediente_torneo_id_estado_idx" ON "expediente"("torneo_id", "estado");

ALTER TABLE "expediente" ADD CONSTRAINT "expediente_torneo_id_fkey" FOREIGN KEY ("torneo_id") REFERENCES "torneo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: cada organización solo ve y modifica sus filas.
ALTER TABLE "expediente" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "expediente"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());
