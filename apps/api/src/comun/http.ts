// Utilidades HTTP comunes: validación con zod, errores uniformes, contexto del pedido y permisos.
import {
  type ArgumentsHost,
  Catch,
  createParamDecorator,
  type ExceptionFilter,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  type PipeTransform,
  SetMetadata,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { Prisma } from '../generated/prisma/client.js';

/** Valida el cuerpo con un esquema compartido de @potrero/shared. */
export class Zod<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodType<T>) {}
  transform(valor: unknown): T {
    return this.esquema.parse(valor);
  }
}

/** Error de negocio con mensaje para mostrar al usuario. */
export class ErrorNegocio extends HttpException {
  constructor(mensaje: string, estado: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY) {
    super({ mensaje }, estado);
  }
}
export const noEncontrado = (que: string) => new ErrorNegocio(`No encontramos ${que}.`, HttpStatus.NOT_FOUND);

/** Formato único de error: { mensaje, campos? }. */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodError) {
      const campos = Object.fromEntries(error.issues.map((i) => [i.path.join('.'), i.message]));
      return res.status(400).json({ mensaje: 'Revisá los datos ingresados.', campos });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return res.status(409).json({ mensaje: 'Ya existe un registro con esos datos.' });
    if (error instanceof HttpException) {
      const cuerpo = error.getResponse();
      const mensaje =
        typeof cuerpo === 'object' && cuerpo && 'mensaje' in cuerpo
          ? (cuerpo as { mensaje: string }).mensaje
          : error.message;
      return res.status(error.getStatus()).json({ mensaje });
    }
    console.error(error);
    return res.status(500).json({ mensaje: 'Ocurrió un error inesperado. Ya quedó registrado.' });
  }
}

export interface Contexto {
  usuarioId: string;
  organizacionId: string;
  rol: string;
}
export type PedidoAutenticado = Request & { ctx?: Contexto };

/** Contexto del usuario autenticado (usuario, organización activa y rol). */
export const Ctx = createParamDecorator((_: unknown, c: ExecutionContext): Contexto => {
  const req = c.switchToHttp().getRequest<PedidoAutenticado>();
  if (!req.ctx)
    throw new HttpException({ mensaje: 'Iniciá sesión para continuar.' }, HttpStatus.UNAUTHORIZED);
  return req.ctx;
});

export const PUBLICO = 'publico';
/** La ruta no requiere sesión. */
export const Publico = () => SetMetadata(PUBLICO, true);

export const PERMISO = 'permiso';
/** La ruta requiere este permiso (ver comun/permisos.ts). */
export const Permiso = (permiso: string) => SetMetadata(PERMISO, permiso);
