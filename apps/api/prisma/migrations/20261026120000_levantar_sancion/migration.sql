-- Levantar una suspensión pagando una multa (E14-08): opción del reglamento y pedidos de levantar un partido.
ALTER TABLE "reglamento" ADD COLUMN     "levantar_sancion_monto" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "levantar_sancion_pagando" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "levantar_sancion_tipos" TEXT[] DEFAULT ARRAY['ACUMULACION', 'DOBLE_AMARILLA']::TEXT[];

CREATE TABLE "levantamiento_sancion" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "sancion_id" TEXT NOT NULL,
    "cargo_id" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "solicitado_por_id" TEXT,
    "anulado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "levantamiento_sancion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "levantamiento_sancion_cargo_id_key" ON "levantamiento_sancion"("cargo_id");
CREATE INDEX "levantamiento_sancion_sancion_id_idx" ON "levantamiento_sancion"("sancion_id");

ALTER TABLE "levantamiento_sancion" ADD CONSTRAINT "levantamiento_sancion_sancion_id_fkey" FOREIGN KEY ("sancion_id") REFERENCES "sancion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: cada organización solo ve y modifica sus filas.
ALTER TABLE "levantamiento_sancion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "levantamiento_sancion"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());
