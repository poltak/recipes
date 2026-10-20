// Cloudflare serves the files in site/ before this code runs. This code gets only the
// requests that match no file.
import { handleMcp } from './mcp.js'
import { INSTRUCTIONS, recipeTools } from './tools.js'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/index.html', url), request))
    if (isMcpPath({ path: url.pathname, secret: env.MCP_SECRET })) {
      return handleMcp({ request, instructions: INSTRUCTIONS, tools: recipeTools({ env, origin: url.origin }) })
    }
    return new Response('Not found', { status: 404 })
  },
}

// The MCP server is at /mcp/<MCP_SECRET>, so only people who know the secret can use it.
// With no secret, or a secret shorter than 32 characters, the server is off.
function isMcpPath({ path, secret }) {
  if (typeof secret !== 'string' || secret.length < 32) return false
  const expected = `/mcp/${secret}`
  if (path.length !== expected.length) return false
  // Compare every character, so the time does not tell how much of the secret is correct.
  let difference = 0
  for (let i = 0; i < path.length; i++) difference |= path.charCodeAt(i) ^ expected.charCodeAt(i)
  return difference === 0
}
