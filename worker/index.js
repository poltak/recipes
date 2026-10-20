// Cloudflare serves the files in site/ before this code runs. This code gets only the
// requests that match no file.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/index.html', url), request))
    return new Response('Not found', { status: 404 })
  },
}
