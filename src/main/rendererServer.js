import http from 'node:http'
import { createReadStream, stat } from 'node:fs'
import { pipeline } from 'node:stream'
import { extname, resolve, sep } from 'node:path'

// In a packaged build the renderer is served from a localhost HTTP server rather
// than file://. This is required for the in-app Pyodide runtime, which loads its
// wasm + wheels with fetch() — blocked under file://, but perfectly fine over
// http(127.0.0.1). It also keeps everything offline (loopback only).

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

/**
 * Maps a request URL to a file inside `root`, or null if it would escape it.
 * Resolving first and then checking the prefix catches every traversal form
 * (`..`, `%2e%2e`, `....//`, encoded slashes, backslashes).
 */
export function resolveRequestPath(root, reqUrl) {
  let urlPath
  try {
    urlPath = decodeURIComponent(new URL(reqUrl, 'http://localhost').pathname)
  } catch {
    return null
  }
  if (urlPath.includes('\0')) return null
  if (!urlPath || urlPath === '/') urlPath = '/index.html'
  const base = resolve(root)
  const filePath = resolve(base, '.' + urlPath)
  return filePath.startsWith(base + sep) ? filePath : null
}

/**
 * Serves `root` on a random loopback port and resolves with its base URL.
 * Requests must name that exact host:port, so a web page can't reach the
 * server through DNS rebinding.
 */
export function startRendererServer(root) {
  return new Promise((resolvePromise, reject) => {
    let allowedHosts = new Set()
    const server = http.createServer((req, res) => {
      if (!allowedHosts.has(req.headers.host)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end('Method not allowed')
        return
      }
      const filePath = resolveRequestPath(root, req.url)
      if (!filePath) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      stat(filePath, (err, st) => {
        if (err || !st.isFile()) {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size })
        if (req.method === 'HEAD') return res.end()
        // pipeline() also closes the file when the client aborts mid-download
        // (e.g. a stopped Python run while Pyodide's wasm is loading).
        pipeline(createReadStream(filePath), res, () => {})
      })
    })
    server.on('error', reject)
    // Port 0 = OS picks a free port; bind to loopback only.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
      resolvePromise(`http://127.0.0.1:${port}`)
    })
  })
}
