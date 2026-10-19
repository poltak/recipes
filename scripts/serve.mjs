// A small local web server for site/. Run it with `pnpm dev`.
// It makes recipes/index.json again each time a page asks for it, so a new or
// changed recipe shows after a reload.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIndex } from './build.mjs'

const ROOT = fileURLToPath(new URL('../site/', import.meta.url))
const PORT = Number(process.env.PORT) || 8000
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
}

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  let file = normalize(join(ROOT, path))
  if (!file.startsWith(ROOT) && file + sep !== ROOT) {
    response.writeHead(403).end()
    return
  }
  if (path === '/recipes/index.json') {
    const { errors, warnings } = await buildIndex()
    for (const message of [...warnings, ...errors]) console.warn(`! ${message}`)
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
    response.end(body)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }
}).listen(PORT, () => console.log(`Recipes: http://localhost:${PORT}/`))
