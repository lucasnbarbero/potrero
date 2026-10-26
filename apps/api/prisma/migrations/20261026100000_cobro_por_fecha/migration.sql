-- Cuota por fecha y seguro por jugador (E06-20, E06-21): configuración por torneo y cargos por equipo y por fecha.
ALTER TABLE "torneo" ADD COLUMN "cobros_por_fecha" JSONB;

ALTER TABLE "cargo" ADD COLUMN "fecha" INTEGER,
ADD COLUMN "partido_id" TEXT,
ADD COLUMN "clave" TEXT;

-- Un cargo automático no se genera dos veces (idempotencia por clave).
CREATE UNIQUE INDEX "cargo_organizacion_id_clave_key" ON "cargo"("organizacion_id", "clave");
