import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { applyChoices, checkRecipe, combinations, layoutTable, validateRecipe } from '../site/js/model.js'

// A copy of the Cooking For Engineers brownie recipe, to test the table layout.
const brownies = JSON.parse(await readFile(new URL('./fixtures/espresso-brownies.json', import.meta.url), 'utf8'))
const RECIPES = new URL('../site/recipes/', import.meta.url)

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

test('every recipe on the site is valid', async () => {
  const folders = (await readdir(RECIPES, { withFileTypes: true })).filter((entry) => entry.isDirectory())
  for (const { name } of folders) {
    const recipe = JSON.parse(await readFile(new URL(`${name}/recipe.json`, RECIPES), 'utf8'))
    assert.deepEqual(validateRecipe(recipe), [], name)
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

// Almond flour, or chickpea flour with milk. Chocolate chips, raisins, or dates.
function cookies() {
  return {
    title: 'Cookies',
    choices: [
      {
        id: 'flour',
        label: 'Flour',
        options: [
          { id: 'almond', label: 'almond flour' },
          { id: 'chickpea', label: 'chickpea flour', note: 'Chickpea flour is stickier, so this version has milk.' },
        ],
      },
      {
        id: 'mix-in',
        label: 'Mix-in',
        options: [
          { id: 'chocolate', label: 'chocolate chips' },
          { id: 'raisins', label: 'raisins' },
          { id: 'dates', label: 'dates' },
        ],
      },
    ],
    ingredients: [
      { id: 'butter', amount: '50 g', name: 'butter' },
      { id: 'almond-flour', amount: '40 g', name: 'almond flour', when: { flour: 'almond' } },
      { id: 'chickpea-flour', amount: '40 g', name: 'chickpea flour', when: { flour: 'chickpea' } },
      { id: 'milk', amount: '10 g', name: 'milk', when: { flour: 'chickpea' } },
      { id: 'chips', amount: '30 g', name: 'chocolate chips', when: { 'mix-in': 'chocolate' } },
      { id: 'raisins', amount: '30 g', name: 'raisins', when: { 'mix-in': 'raisins' } },
      { id: 'dates', amount: '30 g', name: 'dates', when: { 'mix-in': 'dates' } },
    ],
    steps: [
      { action: 'Preheat oven to 350°F (175°C)' },
      { action: 'Soak the dates in hot water', when: { 'mix-in': 'dates' } },
      { id: 'wet', action: 'stir', inputs: ['milk'] },
      { id: 'dough', action: 'mix', inputs: ['butter', 'almond-flour', 'chickpea-flour', 'wet'] },
      { action: 'fold in {mix-in}', inputs: ['dough', 'chips', 'raisins', 'dates'], text: 'Fold in the {mix-in}.' },
    ],
  }
}

test('a recipe with choices is valid, and each combination is a plain recipe', () => {
  const recipe = cookies()
  assert.deepEqual(validateRecipe(recipe), [])
  assert.equal(combinations(recipe).length, 6)

  const plain = applyChoices({ recipe })
  assert.deepEqual(plain.ingredients.map((ingredient) => ingredient.id), ['butter', 'almond-flour', 'chips'])
  assert.deepEqual(plain.steps.map((step) => step.action), ['Preheat oven to 350°F (175°C)', 'mix', 'fold in chocolate chips'])
  assert.deepEqual(plain.steps[1].inputs, ['butter', 'almond-flour'])
  assert.equal(plain.steps[2].text, 'Fold in the chocolate chips.')
  assert.equal(plain.ingredients[1].when, undefined)
  assert.deepEqual(validateRecipe(plain), [])

  const other = applyChoices({ recipe, picks: { flour: 'chickpea', 'mix-in': 'dates' } })
  assert.deepEqual(other.ingredients.map((ingredient) => ingredient.id), ['butter', 'chickpea-flour', 'milk', 'dates'])
  assert.deepEqual(
    other.steps.map((step) => step.action),
    ['Preheat oven to 350°F (175°C)', 'Soak the dates in hot water', 'stir', 'mix', 'fold in dates'],
  )
  assert.deepEqual(other.steps[3].inputs, ['butter', 'chickpea-flour', 'wet'])
})

test('a pick that is not an option gets the first option', () => {
  const plain = applyChoices({ recipe: cookies(), picks: { flour: 'rice', other: 'x' } })
  assert.deepEqual(plain.ingredients.map((ingredient) => ingredient.id), ['butter', 'almond-flour', 'chips'])
})

test('validation finds bad choices, bad "when" fields, and unknown {choice} text', () => {
  const recipe = cookies()
  recipe.choices.push({ id: 'r', label: 'Size', options: [{ id: 'big', label: 'big' }] })
  recipe.choices[1].options[2].id = 'raisins'
  recipe.ingredients[1].when = { flur: 'almond' }
  recipe.ingredients[2].when = { flour: 'rice' }
  recipe.steps[4].action = 'fold in {mixin}'
  assert.deepEqual(validateRecipe(recipe), [
    'choices[1].options[2]: the id "raisins" is used twice',
    'choices[2]: "r" cannot be the id of a choice',
    'choices[2]: "options" must be a list of 2 or more options',
    'ingredients[1]: "when" has an unknown choice "flur"',
    'ingredients[2]: "when" has an unknown option "rice" for the choice "flour"',
    'ingredients[6]: "when" has an unknown option "dates" for the choice "mix-in"',
    'steps[1]: "when" has an unknown option "dates" for the choice "mix-in"',
    'steps[4]: {mixin} is not the id of a choice',
  ])
})

test('validation finds an ingredient that a combination does not use', () => {
  const recipe = cookies()
  delete recipe.ingredients[3].when // milk, but the "wet" step stays for chickpea flour only
  recipe.steps[2].when = { flour: 'chickpea' }
  assert.deepEqual(validateRecipe(recipe), [
    'ingredient "milk" is not an input of any step. Give it the same "when" as the step that uses it (with flour "almond", mix-in "chocolate")',
  ])
})

test('each combination of options needs its nutrition entries', () => {
  const recipe = cookies()
  const values = { kcal: 480, protein: 9, fat: 28, carbs: 50, sugar: 30, fiber: 5 }
  recipe.nutrition = [
    { per: '100 g', ...values, when: { flour: 'almond' } },
    { per: '100 g', ...values, when: { flour: 'chickpea', 'mix-in': 'chocolate' } },
    { per: '100 G', ...values, when: { 'mix-in': 'chocolate' } },
  ]
  assert.deepEqual(validateRecipe(recipe), [
    'two "nutrition" entries are "per 100 g" for the same options (with flour "almond", mix-in "chocolate")',
    'no "nutrition" entry is for these options (with flour "chickpea", mix-in "raisins")',
  ])

  recipe.nutrition = [{ per: '100 g', ...values }]
  assert.deepEqual(validateRecipe(recipe), [])
  assert.deepEqual(applyChoices({ recipe }).nutrition, [{ per: '100 g', ...values }])
})

test('validation and checkRecipe find bad nutrition values', async () => {
  const schema = JSON.parse(await readFile(new URL('../site/recipes/recipe.schema.json', import.meta.url), 'utf8'))
  const recipe = {
    title: 'Toast',
    ingredients: [{ id: 'bread', name: 'bread' }],
    steps: [{ action: 'toast', inputs: ['bread'] }],
    nutrition: [{ per: '1 slice', kcal: '80', protein: -1, carbs: 15, salt: 1 }],
  }
  assert.deepEqual(checkRecipe({ recipe, schema, slugs: ['toast'] }), [
    'nutrition[0].kcal: must be a number',
    'nutrition[0]: unknown field "salt"',
    'nutrition[0]: "fat" is required',
    'nutrition[0]: "protein" must be 0 or more',
  ])
})
