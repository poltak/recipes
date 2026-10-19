import { h } from '../dom.js'
import { ingredientAmount } from '../amount.js'

// "4 oz (115 g) unsalted butter, softened". Links to the recipe if the ingredient has one.
export function ingredientLine({ ingredient, scale, units }) {
  const amount = ingredientAmount({ ingredient, scale, units })
  const name = ingredient.recipe ? h('a', { href: `recipe.html?r=${ingredient.recipe}` }, ingredient.name) : ingredient.name
  return [
    amount && h('span', { class: 'amount' }, amount),
    amount && ' ',
    name,
    ingredient.note && h('span', { class: 'note' }, `, ${ingredient.note}`),
  ]
}

export function stepText(step) {
  return step.text ?? step.action.charAt(0).toUpperCase() + step.action.slice(1)
}
