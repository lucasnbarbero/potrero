-- Perfil público del jugador (E20-04): apodo y preferencia de cómo se lo nombra en el sitio público.
ALTER TABLE "jugador" ADD COLUMN "apodo" TEXT,
ADD COLUMN "nombre_publico" TEXT NOT NULL DEFAULT 'INICIALES';
