// index.html: all recipes, with search and tags.
import { h } from './dom.js'
import './pwa.js'

const main = document.getElementById('main')
const params = new URLSearchParams(location.search)
const state = { query: params.get('q') ?? '', tag: params.get('tag') ?? '' }

let recipes
try {
  const response = await fetch('recipes/index.json')
  if (!response.ok) throw new Error(response.statusText)
  recipes = await response.json()
} catch {
  main.replaceChildren(h('p', { class: 'problem' }, 'Could not load the recipes. Run `pnpm build` and try again.'))
}
if (recipes) showList()

function showList() {
  const tagCounts = new Map()
  for (const tag of recipes.flatMap((recipe) => recipe.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  const tags = [...tagCounts.keys()].sort((a, b) => tagCounts.get(b) - tagCounts.get(a) || a.localeCompare(b))

  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Search recipes and ingredients',
    'aria-label': 'Search',
    value: state.query,
    oninput: () => {
      state.query = search.value
      update()
    },
  })
  const tagButtons = tags.map((tag) =>
    h(
      'button',
      {
        type: 'button',
        class: 'tag',
        'data-tag': tag,
        onclick: () => {
          state.tag = state.tag === tag ? '' : tag
          update()
        },
      },
      tag,
    ),
  )
  const cards = new Map(recipes.map((recipe) => [recipe.slug, card(recipe)]))
  const grid = h('div', { class: 'cards' }, [...cards.values()])
  const empty = h('p', { class: 'empty', hidden: true }, 'No recipes match.')

  main.replaceChildren(
    h('div', { class: 'list-head' }, h('h1', {}, 'Recipes'), h('p', { class: 'lede' }, `${recipes.length} recipes`)),
    h('div', { class: 'filters' }, search, tags.length > 0 && h('div', { class: 'tags' }, tagButtons)),
    grid,
    empty,
  )

  function update() {
    const words = state.query.toLowerCase().split(/\s+/).filter(Boolean)
    let shown = 0
    for (const recipe of recipes) {
      const haystack = [recipe.title, recipe.description, ...recipe.tags, ...recipe.ingredients].join(' ').toLowerCase()
      const visible = words.every((word) => haystack.includes(word)) && (!state.tag || recipe.tags.includes(state.tag))
      cards.get(recipe.slug).hidden = !visible
      if (visible) shown++
    }
    empty.hidden = shown > 0
    for (const button of tagButtons) button.setAttribute('aria-pressed', String(button.dataset.tag === state.tag))
    const url = new URL(location.href)
    url.search = new URLSearchParams(Object.entries({ q: state.query, tag: state.tag }).filter(([, value]) => value)).toString()
    history.replaceState(null, '', url)
  }
  update()
}

function card(recipe) {
  const { prep, cook, total } = recipe.time ?? {}
  const times = total ? [total] : [prep && `Prep ${prep}`, cook && `Cook ${cook}`]
  return h(
    'a',
    { class: 'card', href: `recipe.html?r=${recipe.slug}` },
    h(
      'div',
      { class: 'card-media' },
      recipe.cover ? h('img', { src: recipe.cover, alt: '', loading: 'lazy', decoding: 'async' }) : shapeImage(recipe.shape),
    ),
    h(
      'div',
      { class: 'card-body' },
      h('h2', { style: `view-transition-name: title-${recipe.slug}` }, recipe.title),
      recipe.description && h('p', {}, recipe.description),
      h('p', { class: 'meta' }, [...times, recipe.yield].filter(Boolean).map((text) => h('span', {}, text))),
    ),
  )
}

// A small picture of the recipe's table: ingredient rows on the left, steps as
// bars to the right. Each recipe gets its own shape.
function shapeImage({ rows, cols, prep, cells }) {
  const unit = 10
  const gap = 3
  const ingredientWidth = 46
  const prepHeight = 5
  const top = prep * (prepHeight + gap)
  const width = ingredientWidth + (cols - 1) * (unit + gap)
  const height = top + rows * (unit + gap) - gap
  const x = (col) => (col === 0 ? 0 : ingredientWidth + gap + (col - 1) * (unit + gap))
  const rects = [
    ...Array.from({ length: prep }, (_, i) => `<rect class="s-prep" x="0" y="${i * (prepHeight + gap)}" width="${width}" height="${prepHeight}" rx="2"/>`),
    ...cells.map(([row, col, rowspan, kind]) => {
      const w = kind === 0 ? ingredientWidth : unit
      const ht = rowspan * (unit + gap) - gap
      return `<rect class="${kind === 0 ? 's-ing' : 's-step'}" x="${x(col)}" y="${top + row * (unit + gap)}" width="${w}" height="${ht}" rx="2.5"/>`
    }),
  ]
  const figure = h('div', { class: 'shape' })
  figure.innerHTML = `<svg viewBox="-8 -8 ${width + 16} ${height + 16}" aria-hidden="true">${rects.join('')}</svg>`
  return figure
}
