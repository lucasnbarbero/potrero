-- Torneos con formato flexible por fases (ADR-026, E10-07/08) y llaves ida y vuelta (E10-03).
-- CreateEnum
CREATE TYPE "EstadoFase" AS ENUM ('PENDIENTE', 'EN_CURSO', 'FINALIZADA');

-- AlterEnum
ALTER TYPE "Formato" ADD VALUE IF NOT EXISTS 'FLEXIBLE';

-- AlterTable
ALTER TABLE "partido" ADD COLUMN     "fase_id" TEXT,
ADD COLUMN     "pierna" INTEGER,
ADD COLUMN     "ronda" INTEGER;

-- CreateTable
CREATE TABLE "fase" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "torneo_id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "definicion" JSONB NOT NULL,
    "estado" "EstadoFase" NOT NULL DEFAULT 'PENDIENTE',
    "equipo_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "grupos" JSONB,
    "llave" JSONB,
    "base_fecha" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fase_torneo_id_clave_key" ON "fase"("torneo_id", "clave");

-- AddForeignKey
ALTER TABLE "fase" ADD CONSTRAINT "fase_torneo_id_fkey" FOREIGN KEY ("torneo_id") REFERENCES "torneo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fases de un torneo: datos de la organización, aislados por RLS como el resto.
ALTER TABLE "fase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "fase"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

CREATE INDEX "partido_fase_id_idx" ON "partido"("fase_id");
