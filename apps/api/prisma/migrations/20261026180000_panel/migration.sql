-- Cuenta del usuario (E04-02, E04-05, E04-10): links de un solo uso, email verificado, intentos de ingreso y organización activa de la sesión.
-- Tablas globales (como usuario y sesion_refresh): sin RLS.
-- CreateEnum
CREATE TYPE "TipoLinkCuenta" AS ENUM ('RECUPERAR', 'VERIFICAR_EMAIL');

-- AlterTable
ALTER TABLE "sesion_refresh" ADD COLUMN     "organizacion_activa_id" TEXT;

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "email_verificado_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "link_cuenta" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" "TipoLinkCuenta" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "vence_en" TIMESTAMP(3) NOT NULL,
    "usado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intento_ingreso" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "exitoso" BOOLEAN NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intento_ingreso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_cuenta_token_hash_key" ON "link_cuenta"("token_hash");

-- CreateIndex
CREATE INDEX "link_cuenta_usuario_id_tipo_idx" ON "link_cuenta"("usuario_id", "tipo");

-- CreateIndex
CREATE INDEX "intento_ingreso_email_creado_en_idx" ON "intento_ingreso"("email", "creado_en");

-- CreateIndex
CREATE INDEX "intento_ingreso_ip_creado_en_idx" ON "intento_ingreso"("ip", "creado_en");

-- AddForeignKey
ALTER TABLE "link_cuenta" ADD CONSTRAINT "link_cuenta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
