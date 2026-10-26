-- Sponsors del torneo (E23): auspiciantes, espacios vendidos por período, métricas agregadas por día y rubros rechazados.
-- CreateTable
CREATE TABLE "sponsor" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT,
    "link" TEXT,
    "logo_url" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "sponsor_id" TEXT NOT NULL,
    "torneo_id" TEXT NOT NULL,
    "espacio" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "monto" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrica_placement" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "impresiones" INTEGER NOT NULL DEFAULT 0,
    "clics" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "metrica_placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferencias_sponsors" (
    "organizacion_id" TEXT NOT NULL,
    "categorias_rechazadas" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "preferencias_sponsors_pkey" PRIMARY KEY ("organizacion_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_organizacion_id_nombre_key" ON "sponsor"("organizacion_id", "nombre");

-- CreateIndex
CREATE INDEX "placement_organizacion_id_torneo_id_idx" ON "placement"("organizacion_id", "torneo_id");

-- CreateIndex
CREATE UNIQUE INDEX "metrica_placement_placement_id_dia_key" ON "metrica_placement"("placement_id", "dia");

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrica_placement" ADD CONSTRAINT "metrica_placement_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security: cada organización solo ve y modifica sus filas.
ALTER TABLE "sponsor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "sponsor"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "placement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "placement"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "metrica_placement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "metrica_placement"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "preferencias_sponsors" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "preferencias_sponsors"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());
