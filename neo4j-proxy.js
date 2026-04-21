// Proxy HTTP + WebSocket → Neo4j Browser en localhost:7474
// Reescribe headers Location para que redirects apunten al proxy
const http = require('http')
const net = require('net')

const TARGET_HOST = 'localhost'
const TARGET_PORT = 7474
const PROXY_PORT = process.env.PORT || 7475

const server = http.createServer((req, res) => {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${TARGET_HOST}:${TARGET_PORT}`,
    },
  }

  const proxy = http.request(options, (proxyRes) => {
    // Rewrite Location headers so redirects stay on the proxy port
    const headers = { ...proxyRes.headers }
    if (headers.location) {
      headers.location = headers.location.replace(
        `http://${TARGET_HOST}:${TARGET_PORT}`,
        `http://${TARGET_HOST}:${PROXY_PORT}`
      )
    }
    res.writeHead(proxyRes.statusCode, headers)
    proxyRes.pipe(res, { end: true })
  })

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message)
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>Neo4j no disponible (502)</h2>
        <p>Error: ${err.message}</p>
        <p>Verificar que el contenedor está corriendo:</p>
        <pre>docker start argos-neo4j</pre>
      </body></html>
    `)
  })

  req.pipe(proxy, { end: true })
})

// WebSocket tunnel
server.on('upgrade', (req, clientSocket, head) => {
  const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const upgradeReq = [
      `${req.method} ${req.url} HTTP/1.1`,
      ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`),
      '',
      '',
    ].join('\r\n')
    targetSocket.write(upgradeReq)
    if (head && head.length) targetSocket.write(head)
    targetSocket.pipe(clientSocket)
    clientSocket.pipe(targetSocket)
  })
  targetSocket.on('error', () => clientSocket.destroy())
  clientSocket.on('error', () => targetSocket.destroy())
})

server.listen(PROXY_PORT, () => {
  console.log(`Neo4j proxy corriendo → http://localhost:${PROXY_PORT}`)
})
