// Cook mode: one step at a time, in big text. The screen stays on, and the
// times in a step ("bake 30 to 40 min") become timer buttons.
import { h } from '../dom.js'
import { findDurations } from '../durations.js'
import { startTimer } from '../timers.js'
import { ingredientLine, stepText } from './common.js'

let place = { slug: null, index: 0 } // index 0 is "gather the ingredients", then 1 per step
let stopCooking = null

export function leaveCook() {
  stopCooking?.()
}

export function renderCook({ recipe, slug, scale, units }) {
  stopCooking?.()
  if (place.slug !== slug) place = { slug, index: 0 }
  const total = recipe.steps.length
  place.index = Math.min(place.index, total) // Other options can have fewer steps.
  const ingredients = new Map(recipe.ingredients.map((ingredient) => [ingredient.id, ingredient]))
  const stepNumbers = new Map(recipe.steps.map((step, i) => [step.id, i + 1]))
  const root = h('section', { class: 'cook' })

  const checklist = (items) =>
    h(
      'ul',
      { class: 'cook-list' },
      items.map((item) => h('li', {}, h('label', {}, h('input', { type: 'checkbox' }), h('span', {}, item)))),
    )

  const gatherCard = () =>
    h(
      'article',
      { class: 'cook-card' },
      h('p', { class: 'cook-count' }, `${total} steps`),
      h('h2', { class: 'cook-text' }, 'First, get everything out.'),
      checklist(recipe.ingredients.map((ingredient) => ingredientLine({ ingredient, scale, units }))),
    )

  const stepCard = (step, number) => {
    const inputs = step.inputs ?? []
    const items = inputs.map((id) =>
      ingredients.has(id)
        ? ingredientLine({ ingredient: ingredients.get(id), scale, units })
        : h('span', { class: 'from-step' }, `What you made in step ${stepNumbers.get(id)}`),
    )
    const name = step.action.split(/[\s,;]/)[0]
    const durations = findDurations(`${step.text ?? ''} ${step.action}`)
    return h(
      'article',
      { class: 'cook-card' },
      h('p', { class: 'cook-count' }, `Step ${number} of ${total}`),
      h('p', { class: 'cook-text' }, stepText(step)),
      items.length > 0 && checklist(items),
      durations.length > 0 &&
        h(
          'div',
          { class: 'cook-timers' },
          durations.map(({ label, seconds }) =>
            h(
              'button',
              { class: 'button', onclick: () => startTimer({ label: `${name[0].toUpperCase()}${name.slice(1)} · ${label}`, seconds }) },
              `Start timer: ${label}`,
            ),
          ),
        ),
    )
  }

  const draw = () => {
    const { index } = place
    root.replaceChildren(
      h('div', { class: 'cook-progress', 'aria-hidden': 'true' }, h('span', { style: `width: ${(index / total) * 100}%` })),
      index === 0 ? gatherCard() : stepCard(recipe.steps[index - 1], index),
      h(
        'div',
        { class: 'cook-nav' },
        h('button', { class: 'button', disabled: index === 0, onclick: () => go(-1) }, '← Back'),
        h('button', { class: 'button primary', disabled: index === total, onclick: () => go(1) }, index === 0 ? 'Start →' : 'Next →'),
      ),
      'wakeLock' in navigator && h('p', { class: 'cook-hint' }, 'The screen stays on in cook mode. Use the ← and → keys to move between steps.'),
    )
  }
  const go = (delta) => {
    place.index = Math.min(total, Math.max(0, place.index + delta))
    draw()
  }

  let wakeLock = null
  let stopped = false
  const keepAwake = async () => {
    try {
      const lock = await navigator.wakeLock?.request('screen')
      if (stopped) lock?.release()
      else wakeLock = lock
    } catch {
      // The browser can refuse, for example on low battery. Cook mode still works.
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') keepAwake()
  }
  const onKey = (event) => {
    if (event.target.closest?.('input, textarea, select')) return
    if (event.key === 'ArrowRight') go(1)
    if (event.key === 'ArrowLeft') go(-1)
  }
  keepAwake()
  document.addEventListener('visibilitychange', onVisible)
  document.addEventListener('keydown', onKey)
  stopCooking = () => {
    stopped = true
    wakeLock?.release()
    document.removeEventListener('visibilitychange', onVisible)
    document.removeEventListener('keydown', onKey)
    stopCooking = null
  }

  draw()
  return root
}
