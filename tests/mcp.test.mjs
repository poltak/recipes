import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import worker from '../worker/index.js'
import { formatJson } from '../worker/format.js'

const SECRET = 'a'.repeat(32)
const MCP_URL = `https://recipes.example/mcp/${SECRET}`
const META = 'io.modelcontextprotocol/'
const env = {
  MCP_SECRET: SECRET,
  GITHUB_TOKEN: 'token',
  GITHUB_REPO: 'me/recipes',
  GITHUB_BRANCH: 'main',
  ASSETS: { fetch: async () => Response.json([{ slug: 'toast', title: 'Toast', description: '', tags: ['quick'], ingredients: ['bread'] }]) },
}

const custard = {
  title: "Mom's Crème Brûlée",
  ingredients: [
    { id: 'cream', amount: '2 cups', name: 'heavy cream' },
    { id: 'yolks', amount: '5', name: 'egg yolks' },
    { id: 'sugar', amount: '1/2 cup', metric: '100 g', name: 'sugar' },
  ],
  steps: [
    { action: 'Preheat oven to 325°F (160°C)' },
    { id: 'base', action: 'whisk', inputs: ['yolks', 'sugar'] },
    { action: 'bake 40 min', inputs: ['base', 'cream'], text: 'Stir in the cream and bake in a water bath for 40 minutes.' },
  ],
  images: [{ src: 'made-up.jpg' }],
}

// A GitHub API in memory. `files` maps a path in the repo to the text of the file.
let files
let commits
beforeEach(() => {
  files = new Map([
    ['site/recipes/recipe.schema.json', '{}'],
    ['site/recipes/toast/recipe.json', JSON.stringify({ title: 'Toast', images: [{ src: 'toast.jpg' }] })],
  ])
  commits = []
  globalThis.fetch = async (url, { method = 'GET', body } = {}) => {
    const path = new URL(url).pathname.replace('/repos/me/recipes/contents/', '')
    if (method === 'PUT') {
      const { message, content, branch, sha } = JSON.parse(body)
      if (files.has(path) ? sha !== hash(files.get(path)) : sha) return Response.json({ message: 'sha does not match' }, { status: 409 })
      files.set(path, Buffer.from(content, 'base64').toString('utf8'))
      commits.push({ path, message, branch })
      return Response.json({}, { status: 201 })
    }
    if (files.has(path)) return Response.json({ type: 'file', sha: hash(files.get(path)), content: Buffer.from(files.get(path)).toString('base64') })
    const names = new Set([...files.keys()].filter((key) => key.startsWith(`${path}/`)).map((key) => key.slice(path.length + 1).split('/')[0]))
    if (names.size === 0) return Response.json({ message: 'Not Found' }, { status: 404 })
    return Response.json([...names].map((name) => ({ name, type: files.has(`${path}/${name}`) ? 'file' : 'dir' })))
  }
})

function hash(text) {
  return createHash('sha1').update(text).digest('hex')
}

// Sends one JSON-RPC request. `modern` adds the _meta fields and headers of protocol 2026-07-28.
async function send({ method, params = {}, modern = true, headers = {}, url = MCP_URL, id = 1 }) {
  const meta = { [`${META}protocolVersion`]: '2026-07-28', [`${META}clientCapabilities`]: {} }
  const response = await worker.fetch(
    new Request(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        ...(modern && { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method, ...(params.name && { 'Mcp-Name': params.name }) }),
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: modern ? { ...params, _meta: meta } : params }),
    }),
    env,
  )
  const json = response.headers.get('Content-Type')?.startsWith('application/json')
  return { status: response.status, body: json ? await response.json() : null }
}

async function callTool({ name, args }) {
  const { body } = await send({ method: 'tools/call', params: { name, arguments: args } })
  return { text: body.result.content[0].text, isError: Boolean(body.result.isError) }
}

test('the MCP server needs the secret in the path', async () => {
  assert.equal((await send({ method: 'tools/list', url: 'https://recipes.example/mcp/wrong' })).status, 404)
  const noSecret = await worker.fetch(new Request(MCP_URL, { method: 'POST', body: '{}' }), { ...env, MCP_SECRET: '' })
  assert.equal(noSecret.status, 404)
  const get = await worker.fetch(new Request(MCP_URL), env)
  assert.equal(get.status, 405)
})

test('an older client starts with initialize', async () => {
  const { body } = await send({ method: 'initialize', modern: false, params: { protocolVersion: '2025-06-18', capabilities: {} } })
  assert.equal(body.result.protocolVersion, '2025-06-18')
  assert.deepEqual(body.result.capabilities, { tools: {} })
  assert.match(body.result.instructions, /A recipe is a tree/)

  const old = await send({ method: 'initialize', modern: false, params: { protocolVersion: '2024-11-05' } })
  assert.equal(old.body.result.protocolVersion, '2025-11-25')

  const notification = await worker.fetch(
    new Request(MCP_URL, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }),
    env,
  )
  assert.equal(notification.status, 202)

  const list = await send({ method: 'tools/list', modern: false, headers: { 'MCP-Protocol-Version': '2025-06-18' } })
  assert.deepEqual(
    list.body.result.tools.map((tool) => tool.name),
    ['list_recipes', 'get_recipe', 'check_recipe', 'create_recipe', 'update_recipe'],
  )
  assert.equal(list.body.result.resultType, undefined)

  const unknown = await send({ method: 'tools/list', modern: false, headers: { 'MCP-Protocol-Version': '1999-01-01' } })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.body.error.code, -32022)
})

test('a modern request must have matching headers', async () => {
  const discover = await send({ method: 'server/discover' })
  assert.equal(discover.body.result.resultType, 'complete')
  assert.deepEqual(discover.body.result.supportedVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'])
  assert.equal(discover.body.result._meta[`${META}serverInfo`].name, 'recipes')

  const wrongMethod = await send({ method: 'tools/list', headers: { 'Mcp-Method': 'ping' } })
  assert.deepEqual([wrongMethod.status, wrongMethod.body.error.code], [400, -32020])

  const encodedName = await send({ method: 'tools/call', params: { name: 'list_recipes' }, headers: { 'Mcp-Name': `=?base64?${btoa('list_recipes')}?=` } })
  assert.equal(encodedName.status, 200)

  const unknownMethod = await send({ method: 'resources/list' })
  assert.deepEqual([unknownMethod.status, unknownMethod.body.error.code], [404, -32601])

  const noCapabilities = await send({ method: 'tools/list', modern: false, params: { _meta: { [`${META}protocolVersion`]: '2026-07-28' } } })
  assert.deepEqual([noCapabilities.status, noCapabilities.body.error.code], [400, -32602])

  const meta = { [`${META}protocolVersion`]: '2099-01-01', [`${META}clientCapabilities`]: {} }
  const tooNew = await send({ method: 'tools/list', modern: false, params: { _meta: meta } })
  assert.deepEqual([tooNew.status, tooNew.body.error.code], [400, -32022])
})

test('list_recipes reads the published index', async () => {
  const { text } = await callTool({ name: 'list_recipes', args: {} })
  assert.deepEqual(JSON.parse(text), [
    { slug: 'toast', title: 'Toast', description: '', tags: ['quick'], url: 'https://recipes.example/recipe.html?r=toast' },
  ])
})

test('create_recipe commits a new recipe file without pictures', async () => {
  const { text, isError } = await callTool({ name: 'create_recipe', args: { recipe: custard } })
  assert.equal(isError, false)
  assert.equal(text, 'Added "Mom\'s Crème Brûlée". It will be at https://recipes.example/recipe.html?r=moms-creme-brulee in 1 to 2 minutes.')
  assert.deepEqual(commits, [{ path: 'site/recipes/moms-creme-brulee/recipe.json', message: "Add the Mom's Crème Brûlée recipe", branch: 'main' }])

  const saved = files.get('site/recipes/moms-creme-brulee/recipe.json')
  const { images, ...withoutImages } = custard
  assert.deepEqual(JSON.parse(saved), { $schema: '../recipe.schema.json', ...withoutImages })
  assert.match(saved, /^\{\n {2}"\$schema": "\.\.\/recipe\.schema\.json",\n {2}"title"/)

  const again = await callTool({ name: 'create_recipe', args: { recipe: custard } })
  assert.equal(again.isError, true)
  assert.match(again.text, /already has a recipe with the slug "moms-creme-brulee"/)
})

test('create_recipe sends back the problems and saves nothing', async () => {
  const recipe = { ...custard, servings: 4, steps: custard.steps.slice(0, 2) }
  const { text, isError } = await callTool({ name: 'create_recipe', args: { slug: 'custard', recipe } })
  assert.equal(isError, true)
  assert.equal(
    text,
    'The recipe has 2 problems. Fix them and send the recipe again.\n- unknown field "servings"\n- ingredient "cream" is not an input of any step',
  )
  assert.deepEqual(commits, [])

  const check = await callTool({ name: 'check_recipe', args: { recipe } })
  assert.equal(check.isError, false)
  assert.match(check.text, /2 problems/)
})

test('update_recipe replaces the file and keeps the pictures', async () => {
  const { text, isError } = await callTool({
    name: 'update_recipe',
    args: { slug: 'toast', recipe: { ...custard, title: 'Toast' }, summary: 'Make it a custard.' },
  })
  assert.equal(isError, false)
  assert.match(text, /^Saved "Toast"/)
  assert.deepEqual(commits, [{ path: 'site/recipes/toast/recipe.json', message: 'Change the Toast recipe\n\nMake it a custard.', branch: 'main' }])
  assert.deepEqual(JSON.parse(files.get('site/recipes/toast/recipe.json')).images, [{ src: 'toast.jpg' }])

  const missing = await callTool({ name: 'update_recipe', args: { slug: 'cake', recipe: custard } })
  assert.equal(missing.isError, true)
  assert.match(missing.text, /There is no recipe "cake"/)
})

test('a GitHub problem becomes a tool error that the model can read', async () => {
  globalThis.fetch = async () => Response.json({ message: 'Bad credentials' }, { status: 401 })
  const { text, isError } = await callTool({ name: 'get_recipe', args: { slug: 'toast' } })
  assert.equal(isError, true)
  assert.equal(text, 'GitHub did not accept the GITHUB_TOKEN secret.')
})

test('saved JSON keeps short lists and objects on one line', () => {
  const text = formatJson({ tags: ['a', 'b'], steps: [{ action: 'mix', inputs: ['x'] }, { action: 'x'.repeat(120) }] })
  assert.equal(
    text,
    `{\n  "tags": ["a", "b"],\n  "steps": [\n    { "action": "mix", "inputs": ["x"] },\n    {\n      "action": "${'x'.repeat(120)}"\n    }\n  ]\n}\n`,
  )
})
