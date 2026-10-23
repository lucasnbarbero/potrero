-- Caja del torneo (E07) y árbitros y canchas (E08).
ALTER TABLE "cargo" ADD COLUMN "categoria" TEXT NOT NULL DEFAULT 'INSCRIPCIONES';

ALTER TABLE "cancha"
  ADD COLUMN "costo_por_partido" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "superficie" TEXT,
  ADD COLUMN "bloqueada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "motivo_bloqueo" TEXT;

CREATE TABLE "arbitro" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "apellido" TEXT NOT NULL,
  "telefono" TEXT,
  "email" TEXT,
  "tarifa" INTEGER NOT NULL DEFAULT 0,
  "valoracion" DOUBLE PRECISION,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "disponibilidad" JSONB,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "arbitro_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "partido"
  ADD COLUMN "arbitro_id" TEXT,
  ADD COLUMN "arbitro_estado" TEXT;
ALTER TABLE "partido" ADD CONSTRAINT "partido_arbitro_id_fkey"
  FOREIGN KEY ("arbitro_id") REFERENCES "arbitro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "asiento" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "descripcion" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "torneo_id" TEXT,
  "referencia_tipo" TEXT,
  "referencia_id" TEXT,
  "arbitro_id" TEXT,
  "cancha_id" TEXT,
  "comprobante" TEXT,
  "clave" TEXT,
  "revierte_a_id" TEXT,
  "creado_por_id" TEXT,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asiento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "linea_asiento" (
  "id" TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL,
  "asiento_id" TEXT NOT NULL,
  "cuenta" TEXT NOT NULL,
  "debe" INTEGER NOT NULL DEFAULT 0,
  "haber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "linea_asiento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asiento_revierte_a_id_key" ON "asiento"("revierte_a_id");
CREATE UNIQUE INDEX "asiento_organizacion_id_clave_key" ON "asiento"("organizacion_id", "clave");
CREATE INDEX "asiento_organizacion_id_fecha_idx" ON "asiento"("organizacion_id", "fecha");
CREATE INDEX "linea_asiento_organizacion_id_cuenta_idx" ON "linea_asiento"("organizacion_id", "cuenta");
CREATE INDEX "linea_asiento_asiento_id_idx" ON "linea_asiento"("asiento_id");
ALTER TABLE "linea_asiento" ADD CONSTRAINT "linea_asiento_asiento_id_fkey"
  FOREIGN KEY ("asiento_id") REFERENCES "asiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- El libro de caja es inmutable: la base rechaza editar o borrar asientos y líneas. Una corrección es otro asiento que
-- revierte al original. La única excepción es borrar de una organización de demo (la limpieza de las sandboxes), que
-- lo declara en su transacción con SET LOCAL potrero.permitir_borrado_libro = 'on'.
CREATE FUNCTION proteger_libro() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('potrero.permitir_borrado_libro', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'El libro de caja no se edita ni se borra: se corrige con un asiento que lo revierta.';
END;
$$;
CREATE TRIGGER asiento_inmutable BEFORE UPDATE OR DELETE ON "asiento"
  FOR EACH ROW EXECUTE FUNCTION proteger_libro();
CREATE TRIGGER linea_asiento_inmutable BEFORE UPDATE OR DELETE ON "linea_asiento"
  FOR EACH ROW EXECUTE FUNCTION proteger_libro();

-- Row Level Security: cada organización solo ve y modifica sus filas.
ALTER TABLE "arbitro" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "arbitro"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "asiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "asiento"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "linea_asiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "linea_asiento"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());
