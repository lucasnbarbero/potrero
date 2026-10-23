import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule, GuardSesion } from './auth/auth.js';
import { ArbitrosModule } from './arbitros/arbitros.js';
import { DocumentacionModule } from './documentacion/documentacion.js';
import { TribunalModule } from './tribunal/tribunal.js';
import { CajaModule } from './caja/caja.js';
import { CobrosModule } from './cobros/cobros.js';
import { ContingenciasModule } from './contingencias/contingencias.js';
import { FiltroErrores } from './comun/http.js';
import { MensajeriaModule } from './mensajeria/mensajeria.js';
import { config } from './config.js';
import { DemoModule } from './demo/demo.js';
import { DbModule } from './db/db.service.js';
import { EquiposModule } from './equipos/equipos.js';
import { PartidosModule } from './partidos/partidos.js';
import { PublicoModule } from './publico/publico.js';
import { TorneosModule } from './torneos/torneos.js';

@Module({
  imports: [
    DbModule,
    AuthModule,
    TorneosModule,
    EquiposModule,
    CobrosModule,
    PartidosModule,
    PublicoModule,
    MensajeriaModule,
    ContingenciasModule,
    CajaModule,
    ArbitrosModule,
    DocumentacionModule,
    TribunalModule,
    // Sandboxes de la demo pública (ADR-019): fuera del entorno de demo estas rutas no existen.
    ...(config.DEMO_MODE ? [DemoModule] : []),
  ],
  providers: [
    { provide: APP_GUARD, useClass: GuardSesion },
    { provide: APP_FILTER, useClass: FiltroErrores },
  ],
})
export class AppModule {}
