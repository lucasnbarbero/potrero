-- Cuenta del jugador (E20-01): rol JUGADOR atado a un perfil de jugador, y la invitación que manda el capitán.
ALTER TYPE "Rol" ADD VALUE 'JUGADOR';

ALTER TABLE "membresia" ADD COLUMN "jugador_id" TEXT;
CREATE UNIQUE INDEX "membresia_organizacion_id_jugador_id_key" ON "membresia"("organizacion_id", "jugador_id");

ALTER TABLE "invitacion" ADD COLUMN "jugador_id" TEXT;
