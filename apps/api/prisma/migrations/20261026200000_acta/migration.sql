-- Equipo ausente (F11): la tolerancia sale del reglamento del torneo (por defecto, la de docs/datos.json).
ALTER TABLE "reglamento" ADD COLUMN "tolerancia_wo_minutos" INTEGER NOT NULL DEFAULT 15;

-- El resultado de un partido con equipo ausente se guarda como cualquier otro (lo define el reglamento), así el acta,
-- el sitio público y la tarjeta muestran lo mismo que la tabla.
UPDATE "partido" p
SET "goles_local" = CASE WHEN p."ganador_wo_id" = p."local_id" THEN r."goles_wo" ELSE 0 END,
    "goles_visitante" = CASE WHEN p."ganador_wo_id" = p."visitante_id" THEN r."goles_wo" ELSE 0 END
FROM "torneo" t
JOIN "reglamento" r ON r."id" = t."reglamento_id"
WHERE p."torneo_id" = t."id" AND p."estado" = 'WO' AND p."ganador_wo_id" IS NOT NULL;
