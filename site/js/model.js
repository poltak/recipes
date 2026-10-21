// The recipe data model: validation and the table layout.
// No DOM code here, so Node can use it too (see scripts/build.mjs).
//
// A recipe is a tree. Ingredients are the leaves. Each step takes a list of
// inputs (ingredient ids or earlier step ids) and makes one new thing. A step
// with no inputs is a "prep" step, such as "Preheat oven to 350°F".

//
// A recipe can have "choices", such as the flour or the mix-in. An ingredient,
// step, or nutrition entry with "when" is only for some options. applyChoices
// makes the plain recipe for one set of options, so the views do not need to
// know about choices.

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs', 'sugar', 'fiber']
const REQUIRED_NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs']
const PLACEHOLDER = /\{([a-z0-9-]+)\}/g

export function validateRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') return ['the recipe must be a JSON object']
  const errors = []
  if (!isText(recipe.title)) errors.push('"title" is required')
  if (!Array.isArray(recipe.ingredients)) errors.push('"ingredients" must be a list')
  if (!Array.isArray(recipe.steps)) errors.push('"steps" must be a list')
  if (errors.length) return errors

  errors.push(...choiceErrors(recipe), ...treeErrors(recipe), ...nutritionErrors(recipe))
  for (const [i, image] of (recipe.images ?? []).entries()) {
    if (!isText(image?.src)) errors.push(`images[${i}]: "src" is required`)
  }
  if (errors.length) return errors
  return variantErrors(recipe)
}

// The plain recipe for the options in `picks` ({ choice id: option id }). A choice that
// is not in `picks` gets its first option. The result has no "when", and its steps say
// "raisins" where the recipe says {mix-in}. A step whose inputs are all for other
// options is left out, and so is its id in later steps.
export function applyChoices({ recipe, picks = {} }) {
  const choices = recipeChoices(recipe)
  if (choices.length === 0) return recipe
  const picked = selectedOptions({ recipe, picks })
  const fits = (item) => Object.entries(item.when ?? {}).every(([choice, option]) => picked[choice]?.id === option)
  const fill = (text) => text.replace(PLACEHOLDER, (match, id) => picked[id]?.label ?? match)
  const plain = ({ when, ...item }) => item

  const ingredients = recipe.ingredients.filter(fits).map(plain)
  const kept = new Set(ingredients.map((ingredient) => ingredient.id))
  const steps = []
  for (const step of recipe.steps.filter(fits).map(plain)) {
    const inputs = step.inputs?.filter((id) => kept.has(id))
    if (step.inputs?.length && !inputs.length) continue
    if (step.id) kept.add(step.id)
    steps.push({
      ...step,
      action: fill(step.action),
      ...(step.text !== undefined && { text: fill(step.text) }),
      ...(inputs && { inputs }),
    })
  }
  const nutrition = recipe.nutrition && recipe.nutrition.filter(fits).map(plain)
  return { ...recipe, ingredients, steps, ...(nutrition && { nutrition }) }
}

// The selected option of each choice, as { choice id: option }. A pick that is not an
// option of its choice gets the first option.
export function selectedOptions({ recipe, picks = {} }) {
  return Object.fromEntries(
    recipeChoices(recipe).map((choice) => [
      choice.id,
      choice.options.find((option) => option.id === picks[choice.id]) ?? choice.options[0],
    ]),
  )
}

// Each set of picks that the cook can select: [{ flour: 'almond', 'mix-in': 'dates' }, ...]
export function combinations(recipe) {
  return recipeChoices(recipe).reduce(
    (all, choice) => all.flatMap((picks) => choice.options.map((option) => ({ ...picks, [choice.id]: option.id }))),
    [{}],
  )
}

function recipeChoices(recipe) {
  return Array.isArray(recipe.choices) ? recipe.choices : []
}

function choiceErrors(recipe) {
  const errors = []
  const options = new Map() // choice id -> Set of option ids
  recipeChoices(recipe).forEach((choice, i) => {
    const where = `choices[${i}]`
    if (!isText(choice?.label)) errors.push(`${where}: "label" is required`)
    if (!isText(choice?.id)) errors.push(`${where}: "id" is required`)
    else if (!SLUG.test(choice.id)) errors.push(`${where}: the id "${choice.id}" must have only lowercase letters, numbers, and "-"`)
    // The page address has "r" for the recipe and one more item for each choice.
    else if (choice.id === 'r') errors.push(`${where}: "r" cannot be the id of a choice`)
    else if (options.has(choice.id)) errors.push(`${where}: the id "${choice.id}" is used twice`)
    const ids = new Set()
    if (isText(choice?.id) && !options.has(choice.id)) options.set(choice.id, ids)
    if (!Array.isArray(choice?.options) || choice.options.length < 2) {
      errors.push(`${where}: "options" must be a list of 2 or more options`)
      return
    }
    choice.options.forEach((option, j) => {
      const at = `${where}.options[${j}]`
      if (!isText(option?.label)) errors.push(`${at}: "label" is required`)
      if (!isText(option?.id)) errors.push(`${at}: "id" is required`)
      else if (!SLUG.test(option.id)) errors.push(`${at}: the id "${option.id}" must have only lowercase letters, numbers, and "-"`)
      else if (ids.has(option.id)) errors.push(`${at}: the id "${option.id}" is used twice`)
      else ids.add(option.id)
    })
  })

  const checkWhen = ({ item, where }) => {
    if (item?.when === undefined) return
    if (!item.when || typeof item.when !== 'object' || Array.isArray(item.when)) return // schemaErrors tells about the type.
    for (const [choice, option] of Object.entries(item.when)) {
      if (!options.has(choice)) errors.push(`${where}: "when" has an unknown choice "${choice}"`)
      else if (!options.get(choice).has(option)) errors.push(`${where}: "when" has an unknown option "${option}" for the choice "${choice}"`)
    }
  }
  recipe.ingredients.forEach((item, i) => checkWhen({ item, where: `ingredients[${i}]` }))
  recipe.nutrition?.forEach?.((item, i) => checkWhen({ item, where: `nutrition[${i}]` }))
  recipe.steps.forEach((step, i) => {
    const where = `steps[${i}]` + (step?.id ? ` ("${step.id}")` : '')
    checkWhen({ item: step, where })
    for (const text of [step?.action, step?.text].filter(isText)) {
      for (const [, id] of text.matchAll(PLACEHOLDER)) {
        if (!options.has(id)) errors.push(`${where}: {${id}} is not the id of a choice`)
      }
    }
  })
  return errors
}

function nutritionErrors(recipe) {
  if (!Array.isArray(recipe.nutrition)) return []
  const errors = []
  recipe.nutrition.forEach((entry, i) => {
    const where = `nutrition[${i}]`
    if (!isText(entry?.per)) errors.push(`${where}: "per" is required, such as "100 g"`)
    for (const key of REQUIRED_NUTRIENTS) {
      if (entry?.[key] === undefined) errors.push(`${where}: "${key}" is required`)
    }
    for (const key of NUTRIENTS) {
      if (typeof entry?.[key] === 'number' && !(entry[key] >= 0)) errors.push(`${where}: "${key}" must be 0 or more`)
    }
  })
  return errors
}

// The checks that apply to each combination of options, after the checks of the
// whole recipe have passed.
function variantErrors(recipe) {
  const choices = recipeChoices(recipe)
  const errors = []
  const seen = new Set()
  for (const picks of combinations(recipe)) {
    const variant = applyChoices({ recipe, picks })
    const problems = []
    if (choices.length > 0) {
      const used = new Set(variant.steps.flatMap((step) => step.inputs ?? []))
      for (const { id } of variant.ingredients) {
        if (!used.has(id)) problems.push(`ingredient "${id}" is not an input of any step. Give it the same "when" as the step that uses it`)
      }
    }
    if (recipe.nutrition?.length > 0) {
      if (variant.nutrition.length === 0) problems.push('no "nutrition" entry is for these options')
      const portions = variant.nutrition.map((entry) => entry.per.trim().toLowerCase())
      for (const per of new Set(portions.filter((per, i) => portions.indexOf(per) !== i))) {
        problems.push(`two "nutrition" entries are "per ${per}" for the same options`)
      }
    }
    for (const problem of problems) {
      if (seen.has(problem)) continue
      seen.add(problem)
      const options = Object.entries(picks).map(([choice, option]) => `${choice} "${option}"`)
      errors.push(options.length ? `${problem} (with ${options.join(', ')})` : problem)
    }
  }
  return errors
}

function treeErrors(recipe) {
  const errors = []
  const kinds = new Map() // id -> 'ingredient' | 'step' | 'prep'
  recipe.ingredients.forEach((ingredient, i) => {
    const where = `ingredients[${i}]`
    if (!isText(ingredient?.name)) errors.push(`${where}: "name" is required`)
    if (!isText(ingredient?.id)) errors.push(`${where}: "id" is required`)
    else if (kinds.has(ingredient.id)) errors.push(`${where}: the id "${ingredient.id}" is used twice`)
    else kinds.set(ingredient.id, 'ingredient')
  })

  const laterSteps = new Set(recipe.steps.map((step) => step?.id).filter(Boolean))
  const usedBy = new Map() // id -> index of the step that uses it
  recipe.steps.forEach((step, i) => {
    const where = `steps[${i}]` + (step?.id ? ` ("${step.id}")` : '')
    if (!isText(step?.action)) errors.push(`${where}: "action" is required`)
    if (step?.inputs !== undefined && !Array.isArray(step.inputs)) errors.push(`${where}: "inputs" must be a list`)
    for (const input of Array.isArray(step?.inputs) ? step.inputs : []) {
      const kind = kinds.get(input)
      if (kind === 'prep') errors.push(`${where}: "${input}" has no inputs, so it cannot be an input`)
      else if (kind && usedBy.has(input)) errors.push(`${where}: "${input}" is already an input of steps[${usedBy.get(input)}]`)
      else if (kind) usedBy.set(input, i)
      else if (laterSteps.has(input)) errors.push(`${where}: "${input}" is a later step; a step can only use earlier steps`)
      else errors.push(`${where}: unknown input "${input}"`)
    }
    if (step?.id === undefined) return
    if (!isText(step.id)) errors.push(`${where}: "id" must be text`)
    else if (kinds.has(step.id)) errors.push(`${where}: the id "${step.id}" is used twice`)
    else kinds.set(step.id, step.inputs?.length ? 'step' : 'prep')
    laterSteps.delete(step.id)
  })

  for (const { id } of recipe.ingredients) {
    if (isText(id) && !usedBy.has(id)) errors.push(`ingredient "${id}" is not an input of any step`)
  }
  return errors
}

// All the checks for a recipe file: the field types, the tree, and the links to other
// recipes. `schema` is recipe.schema.json. `slugs` lists the folders in site/recipes/.
// The build and the MCP server both use this, so they accept the same recipes.
export function checkRecipe({ recipe, schema, slugs }) {
  const errors = [...schemaErrors({ value: recipe, schema }), ...validateRecipe(recipe)]
  for (const ingredient of Array.isArray(recipe?.ingredients) ? recipe.ingredients : []) {
    if (ingredient?.recipe && !slugs.includes(ingredient.recipe)) {
      errors.push(`ingredient "${ingredient.id}" links to a recipe that does not exist: "${ingredient.recipe}"`)
    }
  }
  return errors
}

// Finds fields of the wrong type and fields that the schema does not know. It reads
// only the parts of JSON Schema that recipe.schema.json uses. validateRecipe reports
// missing fields.
export function schemaErrors({ value, schema, path = '' }) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return path ? [`${path}: must be an object`] : []
    return Object.entries(value).flatMap(([key, item]) => {
      const where = path ? `${path}.${key}` : key
      if (schema.properties?.[key]) return schemaErrors({ value: item, schema: schema.properties[key], path: where })
      // An object such as "when", where any key is allowed and each value has one type.
      if (typeof schema.additionalProperties === 'object') return schemaErrors({ value: item, schema: schema.additionalProperties, path: where })
      return schema.additionalProperties === false ? [`${path ? `${path}: ` : ''}unknown field "${key}"`] : []
    })
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}: must be a list`]
    return value.flatMap((item, i) => schemaErrors({ value: item, schema: schema.items, path: `${path}[${i}]` }))
  }
  if (schema.type === 'string' && typeof value !== 'string') return [`${path}: must be text`]
  if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return [`${path}: must be a number`]
  return []
}

// Lays the recipe out as a grid, in the style of cookingforengineers.com.
// Ingredients go down the first column. Each step is a cell in the first
// column to the right of all its inputs, and spans the rows of every
// ingredient under it. Empty cells fill the gaps.
//
// Returns { cols, prep, rows }. Each item of `rows` is the list of cells that
// start in that row, left to right, ready for an HTML table:
//   { kind: 'ingredient' | 'step' | 'empty', row, col, rowspan, colspan,
//     ingredient?, step?, firstRow?, lastRow? }
export function layoutTable(recipe) {
  const ingredients = new Map(recipe.ingredients.map((ingredient) => [ingredient.id, ingredient]))
  const steps = new Map(recipe.steps.filter((step) => step.id).map((step) => [step.id, step]))
  const used = new Set(recipe.steps.flatMap((step) => step.inputs ?? []))
  const prep = recipe.steps.filter((step) => !step.inputs?.length)
  const roots = recipe.steps.filter((step) => step.inputs?.length && !used.has(step.id))

  let nextRow = 0
  const toNode = (step) => {
    const children = step.inputs.map((id) =>
      ingredients.has(id)
        ? { kind: 'ingredient', ingredient: ingredients.get(id), col: 0, row: nextRow++, rows: 1 }
        : toNode(steps.get(id)),
    )
    return {
      kind: 'step',
      step,
      children,
      col: 1 + Math.max(...children.map((child) => child.col)),
      row: children[0].row,
      rows: children.reduce((sum, child) => sum + child.rows, 0),
    }
  }
  const trees = roots.map(toNode)
  const cols = 1 + Math.max(0, ...trees.map((tree) => tree.col))

  const cells = []
  const addEmpty = ({ row, col, rowspan, colspan }) => {
    if (colspan > 0) cells.push({ kind: 'empty', row, col, rowspan, colspan })
  }
  const addNode = (node) => {
    if (node.kind === 'ingredient') {
      cells.push({ kind: 'ingredient', ingredient: node.ingredient, row: node.row, col: 0, rowspan: 1, colspan: 1 })
      return
    }
    cells.push({
      kind: 'step',
      step: node.step,
      row: node.row,
      col: node.col,
      rowspan: node.rows,
      colspan: 1,
      firstRow: node.row,
      lastRow: node.row + node.rows - 1,
    })
    node.children.forEach(addNode)
    // Next to each other, children in the same column share one empty cell.
    for (const run of runsBy(node.children, (child) => child.col)) {
      addEmpty({
        row: run[0].row,
        col: run[0].col + 1,
        rowspan: run.reduce((sum, child) => sum + child.rows, 0),
        colspan: node.col - run[0].col - 1,
      })
    }
  }
  for (const tree of trees) {
    addNode(tree)
    addEmpty({ row: tree.row, col: tree.col + 1, rowspan: tree.rows, colspan: cols - tree.col - 1 })
  }

  const rows = Array.from({ length: nextRow }, () => [])
  for (const cell of cells) rows[cell.row].push(cell)
  for (const row of rows) row.sort((a, b) => a.col - b.col)
  return { cols, prep, rows }
}

// The URL of a recipe image. `src` is a file in the recipe folder, or a full URL.
export function assetUrl({ slug, src }) {
  return /^https?:\/\//.test(src) ? src : `recipes/${slug}/${src}`
}

function runsBy(items, key) {
  const runs = []
  for (const item of items) {
    const last = runs.at(-1)
    if (last && key(last[0]) === key(item)) last.push(item)
    else runs.push([item])
  }
  return runs
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== ''
}
