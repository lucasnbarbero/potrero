-- Row Level Security: cada organización solo ve y modifica sus filas.
-- La aplicación fija la organización con set_config('app.organizacion_id', ...) al inicio de cada transacción
-- (DbService.enOrg). Sin ese valor, las consultas no devuelven nada.
-- El rol potrero_app (ver infra/postgres/init.sql) no es dueño de las tablas ni puede saltear RLS.

CREATE FUNCTION app_organizacion_id() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organizacion_id', true), '')
$$;

ALTER TABLE "reglamento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "reglamento"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "torneo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "torneo"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "equipo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "equipo"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "jugador" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "jugador"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "plantel_jugador" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "plantel_jugador"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "inscripcion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "inscripcion"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "cargo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "cargo"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "pago" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "pago"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "sede" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "sede"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "cancha" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "cancha"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "partido" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "partido"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "evento_partido" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "evento_partido"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

ALTER TABLE "sancion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_organizacion ON "sancion"
  USING ("organizacion_id" = app_organizacion_id())
  WITH CHECK ("organizacion_id" = app_organizacion_id());

-- Permisos del rol de la aplicación (por si las tablas se crearon antes de los privilegios por defecto).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'potrero_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO potrero_app;
    GRANT EXECUTE ON FUNCTION app_organizacion_id() TO potrero_app;
  END IF;
END $$;
