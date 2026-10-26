-- Usuarios de la organización y panel del capitán (E04-09, E19): rol CAPITAN con su equipo, invitaciones y convocatoria.
-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'CAPITAN';

-- AlterTable
ALTER TABLE "membresia" ADD COLUMN     "equipo_id" TEXT;

-- CreateTable
CREATE TABLE "invitacion" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT,
    "rol" "Rol" NOT NULL,
    "equipo_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "vence_en" TIMESTAMP(3) NOT NULL,
    "aceptada_en" TIMESTAMP(3),
    "rechazada_en" TIMESTAMP(3),
    "anulada_en" TIMESTAMP(3),
    "invitado_por_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convocatoria" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "partido_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "jugador_id" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "respondido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convocatoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitacion_token_hash_key" ON "invitacion"("token_hash");

-- CreateIndex
CREATE INDEX "invitacion_organizacion_id_email_idx" ON "invitacion"("organizacion_id", "email");

-- CreateIndex
CREATE INDEX "convocatoria_organizacion_id_partido_id_idx" ON "convocatoria"("organizacion_id", "partido_id");

-- CreateIndex
CREATE UNIQUE INDEX "convocatoria_partido_id_jugador_id_key" ON "convocatoria"("partido_id", "jugador_id");

-- Row Level Security: cada organización solo ve y modifica sus filas.
-- (La membresía es global, como hasta ahora: su equipo_id solo acota al capitán.)
ALTER TABLE "invitacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "invitacion"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "convocatoria" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "convocatoria"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());
