import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { checkRecipe, layoutTable, validateRecipe } from '../site/js/model.js'

const brownies = JSON.parse(await readFile(new URL('../site/recipes/espresso-brownies/recipe.json', import.meta.url), 'utf8'))

// One short string per table row, such as "butter | melt | mix(4) | ...".
function describe(layout) {
  return layout.rows.map((cells) =>
    cells
      .map((cell) => {
        const name = cell.kind === 'ingredient' ? cell.ingredient.id : cell.kind === 'step' ? cell.step.action : '-'
        const spans = [cell.rowspan > 1 && `r${cell.rowspan}`, cell.colspan > 1 && `c${cell.colspan}`].filter(Boolean)
        return spans.length ? `${name}(${spans.join(',')})` : name
      })
      .join(' | '),
  )
}

test('the brownie table matches the one on cookingforengineers.com', () => {
  const layout = layoutTable(brownies)
  assert.equal(layout.cols, 6)
  assert.deepEqual(
    layout.prep.map((step) => step.action),
    ['Butter and flour an 8x8-in pan', 'Preheat oven to 350°F (170°C)'],
  )
  assert.deepEqual(describe(layout), [
    'butter | melt | mix(r4) | mix(r5) | fold in(r9) | bake 350°F (170°C) 30 to 40 min(r9)',
    'sugar | -(r3)',
    'vanilla',
    'espresso',
    'eggs | -(c2)',
    'flour | -(r4,c3)',
    'cocoa',
    'soda',
    'salt',
  ])
})

test('a recipe with two finished parts puts empty cells after the shorter one', () => {
  const recipe = {
    title: 'Two parts',
    ingredients: [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
      { id: 'c', name: 'c' },
    ],
    steps: [
      { id: 'ab', action: 'mix', inputs: ['a', 'b'] },
      { action: 'bake', inputs: ['ab'] },
      { action: 'chop', inputs: ['c'] },
    ],
  }
  assert.deepEqual(validateRecipe(recipe), [])
  assert.deepEqual(describe(layoutTable(recipe)), ['a | mix(r2) | bake(r2)', 'b', 'c | chop | -'])
})

test('every sample recipe is valid', async () => {
  for (const slug of ['espresso-brownies', 'basic-pancakes', 'shrimp-scampi', 'beef-stroganoff', 'chocolate-cake', 'buttercream-frosting']) {
    const recipe = JSON.parse(await readFile(new URL(`../site/recipes/${slug}/recipe.json`, import.meta.url), 'utf8'))
    assert.deepEqual(validateRecipe(recipe), [], slug)
  }
})

test('validation finds broken references', () => {
  const recipe = {
    title: 'Broken',
    ingredients: [
      { id: 'egg', name: 'egg' },
      { id: 'milk', name: 'milk' },
      { id: 'egg', name: 'another egg' },
    ],
    steps: [
      { action: 'Preheat', id: 'oven' },
      { id: 'one', action: 'whisk', inputs: ['egg', 'two'] },
      { id: 'two', action: 'mix', inputs: ['egg', 'flour', 'oven'] },
    ],
  }
  assert.deepEqual(validateRecipe(recipe), [
    'ingredients[2]: the id "egg" is used twice',
    'steps[1] ("one"): "two" is a later step; a step can only use earlier steps',
    'steps[2] ("two"): "egg" is already an input of steps[1]',
    'steps[2] ("two"): unknown input "flour"',
    'steps[2] ("two"): "oven" has no inputs, so it cannot be an input',
    'ingredient "milk" is not an input of any step',
  ])
})

test('checkRecipe finds wrong types, unknown fields, and broken links', async () => {
  const schema = JSON.parse(await readFile(new URL('../site/recipes/recipe.schema.json', import.meta.url), 'utf8'))
  const recipe = {
    title: 'Toast',
    servings: 2,
    time: { prep: 5 },
    ingredients: [{ id: 'bread', name: 'bread', qty: 1 }, { id: 'jam', name: 'jam', recipe: 'jam' }],
    steps: [{ action: 'toast', inputs: ['bread', 'jam'] }],
  }
  assert.deepEqual(checkRecipe({ recipe, schema, slugs: ['toast'] }), [
    'unknown field "servings"',
    'time.prep: must be text',
    'ingredients[0]: unknown field "qty"',
    'ingredient "jam" links to a recipe that does not exist: "jam"',
  ])
})

test('validation needs a title, ingredients, and steps', () => {
  assert.deepEqual(validateRecipe({}), ['"title" is required', '"ingredients" must be a list', '"steps" must be a list'])
})
