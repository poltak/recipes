// Reads and writes the recipe files in the GitHub repo, through the GitHub API.
// The Worker settings give the repo: GITHUB_REPO ("owner/name"), GITHUB_BRANCH, and
// the GITHUB_TOKEN secret. A commit to the branch starts a new deploy of the site.
const API = 'https://api.github.com'
const FOLDER = 'site/recipes'

export function recipeStore({ env }) {
  async function call({ path, method = 'GET', body }) {
    if (!env.GITHUB_TOKEN) throw new Error('The server has no GITHUB_TOKEN secret. See "Add recipes from ChatGPT" in the README.')
    const query = method === 'GET' ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : ''
    const response = await fetch(`${API}/repos/${env.GITHUB_REPO}/contents/${path}${query}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'recipes-mcp',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body && JSON.stringify(body),
    })
    if (response.status === 404 && method === 'GET') return null
    if (response.ok) return response.json()
    const { message } = await response.json().catch(() => ({}))
    if (response.status === 401) throw new Error('GitHub did not accept the GITHUB_TOKEN secret.')
    if (response.status === 409 || response.status === 422) {
      throw new Error('The recipe file changed on GitHub while you worked on it. Get the recipe again, and then make your change.')
    }
    throw new Error(`GitHub answered ${response.status}: ${message ?? response.statusText}`)
  }

  return {
    // The folder names in site/recipes/.
    async slugs() {
      const entries = (await call({ path: FOLDER })) ?? []
      return entries.filter((entry) => entry.type === 'dir').map((entry) => entry.name)
    },

    // Returns { recipe, sha }, or null if there is no such recipe.
    async read(slug) {
      const file = await call({ path: `${FOLDER}/${slug}/recipe.json` })
      if (!file) return null
      let recipe
      try {
        recipe = JSON.parse(fromBase64(file.content))
      } catch (error) {
        throw new Error(`site/recipes/${slug}/recipe.json is not valid JSON: ${error.message}`)
      }
      return { recipe, sha: file.sha }
    },

    // Without a sha, this makes a new file. With a sha, it replaces that version of the file.
    async write({ slug, text, sha, message }) {
      const body = { message, content: toBase64(text), branch: env.GITHUB_BRANCH, ...(sha && { sha }) }
      await call({ path: `${FOLDER}/${slug}/recipe.json`, method: 'PUT', body })
    },
  }
}

function toBase64(text) {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(base64) {
  const binary = atob(base64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}
