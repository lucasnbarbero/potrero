import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule, GuardSesion } from './auth/auth.js';
import { CobrosModule } from './cobros/cobros.js';
import { FiltroErrores } from './comun/http.js';
import { DbModule } from './db/db.service.js';
import { EquiposModule } from './equipos/equipos.js';
import { PartidosModule } from './partidos/partidos.js';
import { PublicoModule } from './publico/publico.js';
import { TorneosModule } from './torneos/torneos.js';

@Module({
  imports: [DbModule, AuthModule, TorneosModule, EquiposModule, CobrosModule, PartidosModule, PublicoModule],
  providers: [
    { provide: APP_GUARD, useClass: GuardSesion },
    { provide: APP_FILTER, useClass: FiltroErrores },
  ],
})
export class AppModule {}
