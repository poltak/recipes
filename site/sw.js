// Service worker: makes the site installable and lets it work offline.
//
// Pages, scripts, and recipe files: try the network first, so changes show up
// at once. If the network fails, use the saved copy.
// Images: use the saved copy first, then get a new copy in the background.
//
// Change CACHE when you change this list of files.
const CACHE = 'recipes-v2'
const SHELL = [
  './',
  'index.html',
  'recipe.html',
  'manifest.webmanifest',
  'css/style.css',
  'fonts/fraunces-latin.woff2',
  'fonts/fraunces-italic-latin.woff2',
  'fonts/fraunces-vietnamese.woff2',
  'js/amount.js',
  'js/dom.js',
  'js/durations.js',
  'js/list-page.js',
  'js/model.js',
  'js/pwa.js',
  'js/recipe-page.js',
  'js/timers.js',
  'js/views/common.js',
  'js/views/cook.js',
  'js/views/images.js',
  'js/views/table.js',
  'js/views/text.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'recipes/index.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(SHELL)
      await saveAllRecipes(await cache.match('recipes/index.json'))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  event.respondWith(request.destination === 'image' ? cacheFirst(event) : networkFirst(event))
})

async function networkFirst(event) {
  const { request } = event
  const cache = await caches.open(CACHE)
  // recipe.html?r=a and recipe.html?r=b are the same file, so save it once.
  const key = request.mode === 'navigate' ? new URL(request.url).pathname : request
  try {
    const response = await fetch(request)
    if (response.ok) {
      event.waitUntil(cache.put(key, response.clone()))
      if (request.url.endsWith('/recipes/index.json')) event.waitUntil(saveAllRecipes(response.clone()))
    }
    return response
  } catch (error) {
    const saved = await cache.match(key)
    if (saved) return saved
    throw error
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(CACHE)
  const saved = await cache.match(event.request)
  const update = fetch(event.request).then((response) => {
    if (response.ok) cache.put(event.request, response.clone())
    return response
  })
  if (saved) {
    event.waitUntil(update.catch(() => {}))
    return saved
  }
  return update
}

// Saves every recipe that is not saved yet, so all recipes open offline.
async function saveAllRecipes(indexResponse) {
  if (!indexResponse) return
  const cache = await caches.open(CACHE)
  const recipes = await indexResponse.json()
  await Promise.allSettled(
    recipes.map(async ({ slug }) => {
      const url = `recipes/${slug}/recipe.json`
      if (!(await cache.match(url))) await cache.add(url)
    }),
  )
}
