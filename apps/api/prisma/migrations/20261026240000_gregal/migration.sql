-- Backoffice de Gregal (E36): staff interno con roles propios y su auditoría inmutable.
-- Tablas globales (sin organizacion_id ni RLS): solo las usa el módulo gregal con la conexión de sistema.
-- CreateEnum
CREATE TYPE "RolStaff" AS ENUM ('SUPERADMIN', 'SOPORTE', 'FINANZAS', 'DIRECCION');

-- CreateTable
CREATE TABLE "staff_usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "RolStaff" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_ingreso_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_auditoria" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT,
    "entidad_id" TEXT,
    "organizacion_id" TEXT,
    "detalle" JSONB,
    "ip" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_usuario_email_key" ON "staff_usuario"("email");

-- CreateIndex
CREATE INDEX "staff_auditoria_creado_en_idx" ON "staff_auditoria"("creado_en");

-- CreateIndex
CREATE INDEX "staff_auditoria_staff_id_creado_en_idx" ON "staff_auditoria"("staff_id", "creado_en");

-- AddForeignKey
ALTER TABLE "staff_auditoria" ADD CONSTRAINT "staff_auditoria_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- La auditoría del staff no se edita ni se borra (E36-03).
CREATE FUNCTION proteger_auditoria_staff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría del equipo de Gregal no se edita ni se borra.';
END;
$$;
CREATE TRIGGER staff_auditoria_inmutable BEFORE UPDATE OR DELETE ON "staff_auditoria"
  FOR EACH ROW EXECUTE FUNCTION proteger_auditoria_staff();
