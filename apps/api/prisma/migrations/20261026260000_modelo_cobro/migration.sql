-- Modelo de cobro: suscripción mensual por plan (Torneo, Liga, Pro) y cargo por servicio en los pagos online.
-- Desaparece la comisión sobre lo cobrado. "Fundadora" deja de ser un plan: es una marca de la organización
-- (50 % de descuento de por vida en su plan).

ALTER TABLE "organizacion" ADD COLUMN "fundadora" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizacion" ADD COLUMN "absorbe_cargo_servicio" BOOLEAN NOT NULL DEFAULT false;
UPDATE "organizacion" SET "fundadora" = true WHERE "plan"::text = 'FUNDADORA';

ALTER TYPE "Plan" RENAME TO "Plan_viejo";
CREATE TYPE "Plan" AS ENUM ('TORNEO', 'LIGA', 'PRO');
ALTER TABLE "organizacion" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "organizacion" ALTER COLUMN "plan" TYPE "Plan"
  USING (CASE WHEN "plan"::text = 'FUNDADORA' THEN 'LIGA' ELSE "plan"::text END)::"Plan";
ALTER TABLE "organizacion" ALTER COLUMN "plan" SET DEFAULT 'LIGA';
DROP TYPE "Plan_viejo";

-- El pago guarda el cargo por servicio (ingreso de Gregal), lo que retuvo Mercado Pago y si lo absorbió el organizador.
-- Los pagos anteriores no tenían cargo por servicio: arrancan en cero.
ALTER TABLE "pago" DROP COLUMN "comision_plataforma";
ALTER TABLE "pago" ADD COLUMN "cargo_servicio" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pago" ADD COLUMN "costo_mercado_pago" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pago" ADD COLUMN "cargo_absorbido" BOOLEAN NOT NULL DEFAULT false;
