import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const src = resolve(import.meta.dirname);
const only = process.argv[2];
for (const f of readdirSync(src).filter(f => /^\d\d-.*\.html$/.test(f) && (!only || f.includes(only)))) {
  const out = resolve(src, '..', basename(f, '.html') + '.pdf');
  execFileSync(chrome, ['--headless=new','--disable-gpu','--no-pdf-header-footer',`--print-to-pdf=${out}`, pathToFileURL(resolve(src, f)).href], {stdio:'ignore'});
  console.log('ok', out);
}
