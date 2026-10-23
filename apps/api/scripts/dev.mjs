// Desarrollo: compila con tsc en modo observación y reinicia la API cuando cambia la salida.
// Se usa tsc (y no esbuild/tsx) porque NestJS necesita los metadatos de decoradores para la inyección de dependencias.
import { spawn } from 'node:child_process';
const opciones = { stdio: 'inherit', shell: true };
spawn('tsc -p tsconfig.build.json --watch --preserveWatchOutput', opciones);
setTimeout(() => spawn('node --enable-source-maps --watch-path=dist dist/main.js', opciones), 6000);
