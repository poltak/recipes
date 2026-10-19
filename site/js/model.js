// The recipe data model: validation and the table layout.
// No DOM code here, so Node can use it too (see scripts/build.mjs).
//
// A recipe is a tree. Ingredients are the leaves. Each step takes a list of
// inputs (ingredient ids or earlier step ids) and makes one new thing. A step
// with no inputs is a "prep" step, such as "Preheat oven to 350°F".

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function validateRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') return ['the recipe must be a JSON object']
  const errors = []
  if (!isText(recipe.title)) errors.push('"title" is required')
  if (!Array.isArray(recipe.ingredients)) errors.push('"ingredients" must be a list')
  if (!Array.isArray(recipe.steps)) errors.push('"steps" must be a list')
  if (errors.length) return errors

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
  for (const [i, image] of (recipe.images ?? []).entries()) {
    if (!isText(image?.src)) errors.push(`images[${i}]: "src" is required`)
  }
  return errors
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
