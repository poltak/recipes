// The usual recipe layout: an ingredient list and numbered steps.
import { h } from '../dom.js'
import { ingredientAmount } from '../amount.js'
import { ingredientLine, stepText } from './common.js'

export function renderText({ recipe, scale, units }) {
  const ingredients = new Map(recipe.ingredients.map((ingredient) => [ingredient.id, ingredient]))
  const stepNumbers = new Map(recipe.steps.map((step, i) => [step.id, i + 1]))

  const groups = []
  for (const ingredient of recipe.ingredients) {
    const group = ingredient.group ?? ''
    if (groups.at(-1)?.name !== group) groups.push({ name: group, items: [] })
    groups.at(-1).items.push(ingredient)
  }

  return h(
    'div',
    { class: 'text-view' },
    h(
      'section',
      { class: 'ingredients' },
      h('h2', {}, 'Ingredients'),
      groups.map((group) => [
        group.name && h('h3', {}, group.name),
        h(
          'ul',
          {},
          group.items.map((ingredient) =>
            h('li', {}, h('label', {}, h('input', { type: 'checkbox' }), h('span', {}, ingredientLine({ ingredient, scale, units })))),
          ),
        ),
      ]),
    ),
    h(
      'section',
      { class: 'method' },
      h('h2', {}, 'Method'),
      h(
        'ol',
        { class: 'steps' },
        recipe.steps.map((step) => {
          const inputs = step.inputs ?? []
          const used = inputs.filter((id) => ingredients.has(id))
          const earlier = inputs.filter((id) => stepNumbers.has(id)).map((id) => stepNumbers.get(id))
          return h(
            'li',
            {},
            h('p', {}, stepText(step)),
            (used.length > 0 || earlier.length > 0) &&
              h(
                'p',
                { class: 'uses' },
                earlier.length > 0 && h('span', { class: 'chip chip-step' }, `${earlier.length > 1 ? 'Steps' : 'Step'} ${earlier.join(' + ')}`),
                used.map((id) => {
                  const ingredient = ingredients.get(id)
                  const amount = ingredientAmount({ ingredient, scale, units })
                  return h('span', { class: 'chip' }, amount && h('b', {}, amount), amount && ' ', ingredient.name)
                }),
              ),
          )
        }),
      ),
      recipe.notes?.length > 0 && [h('h2', {}, 'Notes'), [recipe.notes].flat().map((note) => h('p', { class: 'note-text' }, note))],
    ),
  )
}
