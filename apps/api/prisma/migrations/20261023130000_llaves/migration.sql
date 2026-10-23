-- Llaves y grupos (E10): fase y cruce de cada partido, penales y el cuadro guardado en el torneo.
CREATE TYPE "FasePartido" AS ENUM ('LIGA', 'GRUPOS', 'LLAVE');

ALTER TABLE "partido"
  ADD COLUMN "fase" "FasePartido" NOT NULL DEFAULT 'LIGA',
  ADD COLUMN "grupo" TEXT,
  ADD COLUMN "clave" TEXT,
  ADD COLUMN "penales_local" INTEGER,
  ADD COLUMN "penales_visitante" INTEGER;

CREATE UNIQUE INDEX "partido_torneo_id_clave_key" ON "partido"("torneo_id", "clave");

ALTER TABLE "torneo"
  ADD COLUMN "llave" JSONB,
  ADD COLUMN "grupos" JSONB;
