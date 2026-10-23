# ADR-025 · Documentación con cifrado de campos, revisión humana y links firmados

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-24 | Tech lead |

## Contexto
Para habilitar a un jugador hay que verificar su identidad (DNI), su aptitud (apto físico) y, si es menor, la autorización de su tutor. Son datos personales sensibles, de menores incluidos: no pueden quedar en texto plano, ni en una carpeta pública, ni verse sin dejar rastro. Los cuatro requisitos pesan más que la comodidad: cifrado, acceso restringido, revisión humana y retención acotada.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Guardar DNI y archivos como cualquier dato | Simple | Una filtración de la base expone todo; sin trazabilidad | Bajo, pero no se acepta |
| Cifrado de campo (AES-256-GCM) con clave aparte, hash para buscar y almacenamiento privado detrás de una interfaz | La base sola no alcanza para leer nada; los duplicados se detectan sin descifrar; el bucket real se enchufa después | Hay que administrar la clave | Medio |
| Verificación automática con selfie desde el día uno | Menos trabajo humano | Datos biométricos: requiere aprobación legal y proveedor | Alto |

## Decisión
- **Cifrado de campo:** el DNI y los datos de salud se guardan con AES-256-GCM (`documentacion/seguridad.ts`). La clave sale de `CLAVE_CIFRADO` (si falta, de `JWT_SECRET`, solo aceptable en demo). Las claves de cifrado, de hash y de firma se derivan por separado (HKDF). El DNI del tutor también va cifrado.
- **Hash para duplicados:** HMAC del DNI normalizado; dos jugadores con el mismo hash abren un `DuplicadoJugador` que los inhabilita hasta que alguien lo resuelve (sacar a uno del plantel o descartar el DNI mal cargado). La pantalla muestra solo los últimos tres dígitos; ver el número completo se pide aparte y queda auditado.
- **Archivos:** detrás de `AlmacenArchivos`. La implementación local escribe en disco, fuera de lo público (`.almacen/`, ignorado por git); producción usará un bucket privado. Se valida el tamaño (2 MB) y que el contenido coincida con el tipo declarado (JPG, PNG, PDF).
- **Acceso:** nadie recibe el archivo directo. Pedir ver un documento devuelve un link firmado que vence en minutos y sirve el archivo sin caché; pedirlo y abrirlo quedan en `AccesoDocumento`.
- **Revisión humana:** un documento subido queda pendiente y no habilita. Una persona lo aprueba (el apto necesita su vencimiento) o lo rechaza con motivo. La verificación con selfie queda detrás de una bandera apagada hasta tener aprobación legal (E00-05).
- **Consentimientos versionados:** el texto vigente tiene versión; un consentimiento de una versión vieja o revocado no vale. El tutor autoriza en línea con un link de un solo uso que vence a los 14 días, y eso reemplaza al documento de autorización.
- **Habilitación:** regla pura en `shared/dominio/documentacion.ts`. El torneo elige qué exige (por defecto nada, para no trabar torneos existentes). La habilitación también la usa el acta.
- **Retención:** rechazados 30 días, vencidos 365 días y registros de acceso 730 días (cifras provisorias en `datos.json`); un proceso diario los borra, archivo incluido.

## Consecuencias
- Perder `CLAVE_CIFRADO` equivale a perder los datos cifrados: se guarda aparte y rotarla requerirá recifrar (formato versionado `v1.`).
- Toda tabla nueva con datos personales sigue este patrón: cifrar, enmascarar al mostrar, auditar la lectura y definir retención.
- Pendiente: bucket real, antivirus de archivos, rotación de claves, verificación con selfie y la edad exacta del consentimiento (E00-05).

| Se revisa si | Relacionados |
|---|---|
| Legal define otros plazos de retención o la edad del tutor, o se elige el proveedor de almacenamiento o de verificación facial. | ADR-003, ADR-019, ADR-022 |
