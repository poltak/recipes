// A small MCP server over Streamable HTTP. Each POST is one JSON-RPC message, and the
// server keeps no state between requests. It speaks two kinds of protocol version:
// - 2026-07-28 and later: each request has its version and client capabilities in
//   params._meta, and the server checks that the HTTP headers match the body.
// - 2025-11-25 and earlier: the client sends "initialize" first, then each request has
//   only the MCP-Protocol-Version header.
// https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
const MODERN = ['2026-07-28']
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26']
const META = 'io.modelcontextprotocol/'
const SERVER_INFO = { name: 'recipes', version: '1.0.0' }

// `tools` is a list of { name, title, description, inputSchema, annotations, run }.
// `run(args)` returns a tool result: { content, isError? }.
export async function handleMcp({ request, instructions, tools }) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  let message
  try {
    message = await request.json()
  } catch {
    return answer({ status: 400, error: { code: -32700, message: 'Parse error' } })
  }
  if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return answer({ status: 400, error: { code: -32600, message: 'Invalid request' } })
  }
  // A notification, such as "notifications/initialized". It needs no answer.
  if (message.id === undefined) return new Response(null, { status: 202 })

  const { id, method } = message
  const params = isObject(message.params) ? message.params : {}
  const header = request.headers.get('MCP-Protocol-Version')
  const version = params._meta?.[`${META}protocolVersion`]

  if (method === 'initialize') {
    const asked = params.protocolVersion
    const protocolVersion = LEGACY.includes(asked) ? asked : LEGACY[0]
    return answer({ id, result: { protocolVersion, capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions } })
  }

  // An older client. A request without the header is from version 2025-03-26.
  if (version === undefined && !MODERN.includes(header)) {
    if (header && !LEGACY.includes(header)) return unsupported({ id, requested: header })
    const { result, error } = await run({ method, params, instructions, tools })
    return answer({ id, result, error })
  }

  for (const key of ['protocolVersion', 'clientCapabilities']) {
    if (params._meta?.[META + key] === undefined) {
      return answer({ status: 400, id, error: { code: -32602, message: `Invalid params: _meta needs "${META}${key}"` } })
    }
  }
  if (!MODERN.includes(version)) return unsupported({ id, requested: version })
  const mismatch =
    (header !== version && 'MCP-Protocol-Version') ||
    (request.headers.get('Mcp-Method') !== method && 'Mcp-Method') ||
    (method === 'tools/call' && headerText(request.headers.get('Mcp-Name')) !== params.name && 'Mcp-Name')
  if (mismatch) {
    return answer({ status: 400, id, error: { code: -32020, message: `Header mismatch: the ${mismatch} header is missing or does not match the body` } })
  }
  const { result, error } = await run({ method, params, instructions, tools })
  if (error) return answer({ status: error.code === -32601 ? 404 : 200, id, error })
  return answer({ id, result: { resultType: 'complete', ...result, _meta: { [`${META}serverInfo`]: SERVER_INFO } } })
}

// Returns { result } or { error }.
async function run({ method, params, instructions, tools }) {
  switch (method) {
    case 'server/discover':
      return {
        result: { supportedVersions: [...MODERN, ...LEGACY], capabilities: { tools: {} }, instructions, _meta: { [`${META}serverInfo`]: SERVER_INFO } },
      }
    case 'ping':
      return { result: {} }
    case 'tools/list':
      return { result: { tools: tools.map(({ run: _, ...tool }) => tool) } }
    case 'tools/call': {
      const tool = tools.find((tool) => tool.name === params.name)
      if (!tool) return { error: { code: -32602, message: `Unknown tool: ${params.name}` } }
      try {
        return { result: await tool.run(isObject(params.arguments) ? params.arguments : {}) }
      } catch (error) {
        // The model can read this and tell the user, or try again.
        return { result: { content: [{ type: 'text', text: error.message }], isError: true } }
      }
    }
    default:
      return { error: { code: -32601, message: `Method not found: ${method}` } }
  }
}

function unsupported({ id, requested }) {
  const data = { supported: [...MODERN, ...LEGACY], requested }
  return answer({ status: 400, id, error: { code: -32022, message: 'Unsupported protocol version', data } })
}

function answer({ status = 200, id, result, error }) {
  const body = error ? { jsonrpc: '2.0', ...(id !== undefined && { id }), error } : { jsonrpc: '2.0', id, result }
  return Response.json(body, { status })
}

// Header values that are not plain ASCII come as "=?base64?<base64 of UTF-8>?=".
function headerText(value) {
  const match = /^=\?base64\?(.*)\?=$/.exec(value ?? '')
  if (!match) return value
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0)))
  } catch {
    return null
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
