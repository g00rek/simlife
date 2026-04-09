import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function logSaverPlugin(): Plugin {
  return {
    name: 'log-saver',
    configureServer(server) {
      server.middlewares.use('/api/save-log', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString()
          const logsDir = path.resolve(__dirname, 'logs')
          if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir)
          const filename = `civ-${Date.now()}.txt`
          fs.writeFileSync(path.join(logsDir, filename), body)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ saved: filename }))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), logSaverPlugin()],
  server: {
    port: 5273,
    strictPort: true,
    allowedHosts: ['evod.g00rek.ovh'],
  },
})
