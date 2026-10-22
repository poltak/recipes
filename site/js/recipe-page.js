// recipe.html?r=<slug>#<view>
import { h } from './dom.js'
import { NUTRIENTS, SLUG, applyChoices, selectedOptions, validateRecipe } from './model.js'
import { formatAmount, parseAmount, parseScale } from './amount.js'
import { renderTable } from './views/table.js'
import { renderText } from './views/text.js'
import { renderImages } from './views/images.js'
import { renderCook, leaveCook } from './views/cook.js'
import './pwa.js'

const VIEWS = [
  { id: 'table', label: 'Table', render: renderTable },
  { id: 'text', label: 'Text', render: renderText },
  { id: 'images', label: 'Images', render: renderImages, plain: true, show: (recipe) => recipe.images?.length > 0 },
  { id: 'cook', label: 'Cook', render: renderCook, leave: leaveCook },
]
const SCALES = [0.5, 1, 2, 3]
// Sugar and fiber are part of the carbs, so they show inside the carbs group.
const CARB_PARTS = ['sugar', 'fiber']
const UNITS = [
  ['both', 'Both'],
  ['us', 'US'],
  ['metric', 'Metric'],
]

const main = document.getElementById('main')
const slug = new URLSearchParams(location.search).get('r') ?? ''
const recipe = await loadRecipe(slug)
if (recipe) showRecipe(recipe)

async function loadRecipe(slug) {
  if (!SLUG.test(slug)) return showProblem({ message: 'There is no recipe at this address.' })
  let response
  try {
    response = await fetch(`recipes/${slug}/recipe.json`)
  } catch {
    return showProblem({ message: 'Could not load this recipe. Are you offline?' })
  }
  if (!response.ok) return showProblem({ message: 'There is no recipe at this address.' })
  let recipe
  try {
    recipe = await response.json()
  } catch (error) {
    return showProblem({ message: 'This recipe file is not valid JSON.', details: [error.message] })
  }
  const errors = validateRecipe(recipe)
  if (errors.length > 0) return showProblem({ message: 'This recipe file has problems.', details: errors })
  return recipe
}

function showProblem({ message, details = [] }) {
  main.replaceChildren(
    h(
      'div',
      { class: 'problem' },
      h('h1', {}, message),
      details.length > 0 && h('ul', {}, details.map((detail) => h('li', {}, h('code', {}, detail)))),
      h('p', {}, h('a', { href: './' }, '← All recipes')),
    ),
  )
  return null
}

function showRecipe(recipe) {
  document.title = `${recipe.title} · Recipes`
  const views = VIEWS.filter((view) => !view.show || view.show(recipe))
  const hasMetric = recipe.ingredients.some((ingredient) => ingredient.amount && ingredient.metric)
  const choices = recipe.choices ?? []
  const state = {
    scale: 1,
    units: hasMetric ? (localStorage.getItem('units') ?? 'both') : 'both',
    picks: loadPicks({ recipe }),
    view: null,
  }

  const yieldText = h('span', {})
  const viewNav = h(
    'nav',
    { class: 'segmented views', 'aria-label': 'Views' },
    views.map((view) => h('a', { href: `#${view.id}`, 'data-view': view.id }, view.label)),
  )
  const setScale = (scale) => {
    state.scale = scale
    showView()
  }
  const scaleGroup = segmented({
    label: 'Scale',
    options: SCALES.map((scale) => [scale, `${scaleLabel(scale)}×`]),
    get: () => state.scale,
    set: setScale,
  })
  scaleGroup.append(customScale({ get: () => state.scale, set: setScale }))
  const toolbar = h(
    'div',
    { class: 'toolbar' },
    scaleGroup,
    hasMetric &&
      segmented({
        label: 'Units',
        options: UNITS,
        get: () => state.units,
        set: (units) => {
          state.units = units
          localStorage.setItem('units', units)
          showView()
        },
      }),
  )
  const viewBox = h('div', { class: 'view' })
  const choiceBox =
    choices.length > 0 &&
    h(
      'div',
      { class: 'choices' },
      choices.map((choice) =>
        segmented({
          label: choice.label,
          options: choice.options.map((option) => [option.id, capitalize(option.label)]),
          get: () => state.picks[choice.id],
          set: (id) => {
            state.picks = { ...state.picks, [choice.id]: id }
            savePicks({ recipe, picks: state.picks })
            showView()
          },
        }),
      ),
    )
  const choiceNotes = h('div', { class: 'choice-notes' })
  const nutritionBox = h('div', { class: 'nutrition' })

  main.replaceChildren(
    h(
      'article',
      { class: 'recipe' },
      h(
        'header',
        { class: 'recipe-head' },
        h('h1', { style: `view-transition-name: title-${slug}` }, recipe.title),
        recipe.description && h('p', { class: 'lede' }, recipe.description),
        h(
          'dl',
          { class: 'facts' },
          recipe.yield && fact({ label: 'Makes', value: yieldText }),
          ['prep', 'cook', 'total'].map((key) => recipe.time?.[key] && fact({ label: capitalize(key), value: recipe.time[key] })),
          recipe.source &&
            fact({
              label: 'From',
              value: recipe.source.url
                ? h('a', { href: recipe.source.url, rel: 'noopener' }, recipe.source.name ?? 'source')
                : recipe.source.name,
            }),
        ),
        recipe.tags?.length > 0 &&
          h(
            'p',
            { class: 'tags' },
            recipe.tags.map((tag) => h('a', { class: 'tag', href: `./?tag=${encodeURIComponent(tag)}` }, tag)),
          ),
        choiceBox,
        choiceNotes,
        nutritionBox,
      ),
      h('div', { class: 'controls' }, viewNav, toolbar),
      viewBox,
    ),
  )

  function showView() {
    const wanted = location.hash.slice(1) || localStorage.getItem('view') || 'table'
    const view = views.find((view) => view.id === wanted) ?? views[0]
    if (state.view !== view) state.view?.leave?.()
    state.view = view
    if (view.id === wanted) localStorage.setItem('view', view.id)
    main.querySelector('.recipe').dataset.view = view.id
    for (const link of viewNav.children) {
      if (link.dataset.view === view.id) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
    for (const control of main.querySelectorAll('.toolbar button, .toolbar input, .choices button')) control.update()
    toolbar.hidden = Boolean(view.plain)
    yieldText.textContent = scaledYield({ text: recipe.yield ?? '', scale: state.scale })
    const variant = applyChoices({ recipe, picks: state.picks })
    const notes = Object.values(selectedOptions({ recipe, picks: state.picks })).filter((option) => option.note)
    choiceNotes.replaceChildren(...notes.map((option) => h('p', {}, option.note)))
    nutritionBox.replaceChildren(...(variant.nutrition ?? []).map(nutritionLine))
    viewBox.replaceChildren(view.render({ recipe: variant, slug, scale: state.scale, units: state.units }))
  }

  window.addEventListener('hashchange', showView)
  if (choices.length > 0) savePicks({ recipe, picks: state.picks })
  showView()
}

// The options in the page address win, then the options that the cook used last time.
// recipe.html?r=cookies&flour=chickpea
function loadPicks({ recipe }) {
  const params = new URLSearchParams(location.search)
  const saved = JSON.parse(localStorage.getItem(`picks:${slug}`) ?? '{}')
  const picks = Object.fromEntries((recipe.choices ?? []).map((choice) => [choice.id, params.get(choice.id) ?? saved[choice.id]]))
  const selected = selectedOptions({ recipe, picks })
  return Object.fromEntries(Object.entries(selected).map(([choice, option]) => [choice, option.id]))
}

// Puts the options in the page address, so that a link opens the same version.
// The address leaves out the default options.
function savePicks({ recipe, picks }) {
  localStorage.setItem(`picks:${slug}`, JSON.stringify(picks))
  const params = new URLSearchParams(location.search)
  for (const choice of recipe.choices ?? []) {
    if (picks[choice.id] === choice.options[0].id) params.delete(choice.id)
    else params.set(choice.id, picks[choice.id])
  }
  history.replaceState(null, '', `?${params}${location.hash}`)
}

// "Per 100 g · 480 kcal · 12 g protein · 30 g fat · 40 g carbs (incl. 18 g sugar · 4 g fiber)"
function nutritionLine(entry) {
  const has = (key) => typeof entry[key] === 'number'
  const nutrient = (key) =>
    h('span', {}, h('b', {}, key === 'kcal' ? formatNutrient(entry[key]) : `${formatNutrient(entry[key])} g`), ` ${key}`)
  const parts = CARB_PARTS.filter(has)
  return h(
    'p',
    {},
    h('span', { class: 'nutrition-per' }, `Per ${entry.per}`),
    NUTRIENTS.filter((key) => has(key) && !CARB_PARTS.includes(key)).map((key) =>
      key === 'carbs' && parts.length > 0
        ? h(
            'span',
            { class: 'nutrition-carbs' },
            nutrient(key),
            h('span', { class: 'nutrition-parts' }, h('span', { class: 'nutrition-incl' }, 'incl.'), parts.map(nutrient)),
          )
        : nutrient(key),
    ),
  )
}

function formatNutrient(value) {
  return String(value >= 10 ? Math.round(value) : Number(value.toFixed(1)))
}

// "PREP / 15 min" in the recipe header.
function fact({ label, value }) {
  return h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, value))
}

// A row of buttons where one is on, such as "½× 1× 2× 3×".
function segmented({ label, options, get, set }) {
  return h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': label },
    h('span', { class: 'segmented-label' }, label),
    options.map(([value, text]) => {
      const button = h('button', { type: 'button', onclick: () => set(value) }, text)
      button.update = () => button.setAttribute('aria-pressed', String(get() === value))
      return button
    }),
  )
}

// A box for any scale, such as 1.5 or 1/3. It is on when the scale is not one of the buttons.
function customScale({ get, set }) {
  const input = h('input', {
    type: 'text',
    inputmode: 'decimal',
    placeholder: 'custom',
    'aria-label': 'Custom scale',
    oninput: () => {
      const scale = parseScale(input.value)
      input.setAttribute('aria-invalid', String(input.value.trim() !== '' && scale === null))
      if (scale !== null) set(scale)
    },
    onchange: () => {
      if (input.value.trim() === '') set(1)
    },
    onblur: () => input.update(),
  })
  const box = h('label', { class: 'custom-scale' }, input, h('span', { 'aria-hidden': 'true' }, '×'))
  input.update = () => {
    const custom = !SCALES.includes(get())
    box.classList.toggle('on', custom)
    // Do not change the text while someone types, or when it already shows the scale ("1/3").
    if (document.activeElement === input || (custom && parseScale(input.value) === get())) return
    input.value = custom ? scaleLabel(get()) : ''
    input.setAttribute('aria-invalid', 'false')
  }
  return box
}

function scaleLabel(scale) {
  return scale === 0.5 ? '½' : String(Number(scale.toFixed(2)))
}

// "16 brownies" at 2× is "32 brownies". "One 8x8-in pan" at 2× is "One 8x8-in pan (×2)".
function scaledYield({ text, scale }) {
  if (scale === 1 || parseAmount(text)) return formatAmount({ text, scale })
  return `${text} (×${scaleLabel(scale)})`
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
