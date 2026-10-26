-- Configuración inicial (E25): marca, ubicación y progreso del asistente. La organización es global (sin RLS).
ALTER TABLE "organizacion" ADD COLUMN "logo" TEXT,
ADD COLUMN "localidad" TEXT,
ADD COLUMN "provincia" TEXT,
ADD COLUMN "configuracion_inicial" JSONB;
