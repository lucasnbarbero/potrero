-- Sandboxes de la demo pública (ADR-019): vencimiento de la organización. Nulo en las ligas reales.
ALTER TABLE "organizacion" ADD COLUMN "demo_expira_en" TIMESTAMP(3);
CREATE INDEX "organizacion_demo_expira_en_idx" ON "organizacion"("demo_expira_en");
