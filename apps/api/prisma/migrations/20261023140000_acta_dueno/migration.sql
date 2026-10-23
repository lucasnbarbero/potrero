-- Un solo dueño del acta por partido (E11-05): qué dispositivo la lleva, quién la tomó y cuándo.
ALTER TABLE "partido"
  ADD COLUMN "acta_dispositivo" TEXT,
  ADD COLUMN "acta_usuario_id" TEXT,
  ADD COLUMN "acta_tomada_en" TIMESTAMP(3);
