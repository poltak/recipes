// Checks every recipe in site/recipes/ and writes site/recipes/index.json,
// the list that the home page reads. Run it with `pnpm build`.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SLUG, assetUrl, checkRecipe, layoutTable } from '../site/js/model.js'

const RECIPES = fileURLToPath(new URL('../site/recipes/', import.meta.url))
const BIG_IMAGE = 600 * 1024

// Returns { count, errors, warnings }. Recipes with errors are not in the index.
export async function buildIndex() {
  const errors = []
  const warnings = []
  const index = []
  const schema = JSON.parse(await readFile(join(RECIPES, 'recipe.schema.json'), 'utf8'))
  const slugs = (await readdir(RECIPES, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)

  for (const slug of slugs) {
    if (!SLUG.test(slug)) {
      errors.push(`${slug}: use lowercase letters, numbers, and "-" in folder names`)
      continue
    }
    let recipe
    try {
      recipe = JSON.parse(await readFile(join(RECIPES, slug, 'recipe.json'), 'utf8'))
    } catch (error) {
      errors.push(`${slug}/recipe.json: ${error.message}`)
      continue
    }
    const problems = checkRecipe({ recipe, schema, slugs })
    for (const image of Array.isArray(recipe?.images) ? recipe.images : []) {
      if (!image?.src || /^https?:\/\//.test(image.src)) continue
      const size = await fileSize(join(RECIPES, slug, image.src))
      if (size === null) problems.push(`image not found: ${image.src}`)
      else if (size > BIG_IMAGE) warnings.push(`${slug}/${image.src} is ${Math.round(size / 1024)} KB. See "Images" in the README to make it smaller.`)
    }
    if (problems.length > 0) {
      errors.push(...problems.map((problem) => `${slug}: ${problem}`))
      continue
    }
    index.push(summarize({ slug, recipe }))
  }

  index.sort((a, b) => a.title.localeCompare(b.title))
  await writeFile(join(RECIPES, 'index.json'), JSON.stringify(index, null, 1) + '\n')
  return { count: index.length, errors, warnings }
}

// The data that the home page needs for one recipe card.
function summarize({ slug, recipe }) {
  const { cols, prep, rows } = layoutTable(recipe)
  const cells = rows
    .flat()
    .filter((cell) => cell.kind !== 'empty')
    .map((cell) => [cell.row, cell.col, cell.rowspan, cell.kind === 'ingredient' ? 0 : 1])
  return {
    slug,
    title: recipe.title,
    description: recipe.description ?? '',
    tags: recipe.tags ?? [],
    time: recipe.time ?? null,
    yield: recipe.yield ?? null,
    cover: recipe.images?.length ? assetUrl({ slug, src: recipe.images[0].src }) : null,
    ingredients: recipe.ingredients.map((ingredient) => ingredient.name),
    shape: { rows: rows.length, cols, prep: prep.length, cells },
  }
}

async function fileSize(path) {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { count, errors, warnings } = await buildIndex()
  for (const warning of warnings) console.warn(`! ${warning}`)
  for (const error of errors) console.error(`✗ ${error}`)
  console.log(`Wrote site/recipes/index.json with ${count} recipes.`)
  if (errors.length > 0) process.exitCode = 1
}
