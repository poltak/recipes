// The MCP tools that let a chat assistant, such as ChatGPT, read and save recipes.
import schema from '../site/recipes/recipe.schema.json' with { type: 'json' }
import { SLUG, checkRecipe } from '../site/js/model.js'
import { formatJson } from './format.js'
import { recipeStore } from './github.js'

export const INSTRUCTIONS = `This server keeps a recipe website. Each recipe is a JSON file. The site shows each recipe as a table in the style of cookingforengineers.com, as a list of steps, and in a cook mode.

Before you add a recipe, call list_recipes. Do not add a recipe that is already on the site. To change a recipe, call get_recipe, change the result, and send all of it to update_recipe.

How a recipe works:
- A recipe is a tree. The ingredients are the leaves. Each step takes some inputs and makes one new thing.
- Give each ingredient a short id, such as "flour". An input is an ingredient id or the id of an earlier step.
- Each id can be an input of one step only. If the recipe uses an ingredient in two places, make two ingredients with different ids, such as "butter-sauce" (1 Tbs. butter, for the sauce) and "butter-pan" (1 Tbs. butter, for the pan).
- Each ingredient must be an input of a step.
- Put the steps in the order that you do them. Give an id to each step that a later step uses.
- A step with no inputs is a prep step, such as "Preheat oven to 350°F (175°C)". A prep step cannot be an input.
- The order of the inputs sets the order of the rows in the table. Put the main ingredient first.
- "action" is the short text in the table, 1 to 5 words, such as "whisk", "fold in", or "bake 350°F 30 min". "text" is the full instruction.
- Usually, the last step uses the results of all the earlier steps, so the recipe makes one thing. A recipe can make more than one thing, such as a cake and its frosting.

Amounts:
- Write "amount" as a cook writes it, with the number first: "1-1/2 cups", "2 large", "1/4 tsp.". The number at the start scales. For "salt, to taste", leave out "amount".
- Put the metric amount in "metric", such as "190 g" or "60 mL", if the source gives it or if you can convert it accurately.
- Use "note" for words such as "softened" or "finely chopped".
- Use "group" for headings in the ingredient list, such as "Dough" and "Filling". Keep the ingredients of one group together.
- If another recipe on the site makes an ingredient, set "recipe" to the slug of that recipe.

Choices (versions of one recipe):
- If the user makes a recipe in different versions, such as with almond flour or with chickpea flour, add "choices". Do not make a second recipe.
- A choice has an "id", a "label", and two or more "options". Example: { "id": "mix-in", "label": "Mix-in", "options": [{ "id": "chocolate", "label": "chocolate chips" }, { "id": "raisins", "label": "raisins" }] }. The first option is the default.
- Write the label of an option as it reads in a sentence, such as "chocolate chips". Use "note" on an option to tell why the version is different, such as "Chickpea flour is stickier, so this version has milk."
- Give an ingredient a "when" if it is only for some options, such as "when": { "flour": "chickpea" }. A version can have more ingredients than another, such as chickpea flour and milk in place of almond flour.
- Put the ingredients of all the options in the inputs of the step that uses them, such as "inputs": ["dough", "chips", "raisins"]. The site shows only the ingredients of the selected options. A step whose inputs are all for other options is left out.
- To show the selected option in a step, write the choice id in braces, such as "fold in the {mix-in}".
- Use "when" on a step only for a step that some options do not have, such as a prep step "Soak the dates in hot water".
- The cook can select any combination of options. The tools check each combination and tell you about its problems.

Nutrition:
- Always add "nutrition" when you add or change a recipe. If the ingredients change, calculate the values again.
- Calculate the values from the ingredients and their amounts. Use standard nutrition data, such as USDA FoodData Central, or the label of a product that the user names.
- Give an entry "per 100 g" of the finished food. If the recipe makes servings or pieces, such as "16 cookies", also give an entry per serving or per piece, such as "1 cookie".
- For baked or cooked food, use the weight after cooking. Baking removes water, so 100 g of cookies has more calories than 100 g of dough. If the user does not give that weight, estimate it.
- Each entry has "per", "kcal", "protein", "fat", "carbs", "sugar", and "fiber". The values after "per" are numbers: kcal and grams. "carbs" includes the sugar and the fiber.
- In a recipe with choices, each combination of options needs its entries. Use "when" to name the options, such as "when": { "flour": "chickpea", "mix-in": "dates" }. If a choice does not change the values, leave it out of "when".

Other fields: "description" is one or two sentences for the recipe card. "yield" is what the recipe makes, such as "12 pancakes". "time" has "prep", "cook", and "total", such as "15 min". "tags" are short lowercase words. "source" tells where the recipe comes from. "notes" are tips.

Use the amounts, times, and temperatures of the source. Do not invent them. If something is not clear, ask the user.
The owner adds pictures by hand, so do not send "images".
If a tool tells you about problems, fix them and call the tool again.`

// The recipe that a tool accepts: recipe.schema.json without "$schema" and "images".
const RECIPE = {
  type: 'object',
  description: schema.description,
  required: schema.required,
  additionalProperties: false,
  properties: Object.fromEntries(Object.entries(schema.properties).filter(([key]) => key !== '$schema' && key !== 'images')),
}
const SLUG_FIELD = {
  type: 'string',
  pattern: SLUG.source,
  description: 'The address of the recipe: lowercase letters, numbers, and "-", such as "beef-stroganoff".',
}
const READ_ONLY = { readOnlyHint: true, openWorldHint: false }

export function recipeTools({ env, origin }) {
  const store = recipeStore({ env })
  const pageUrl = (slug) => `${origin}/recipe.html?r=${slug}`

  return [
    {
      name: 'list_recipes',
      title: 'List recipes',
      description: 'Lists the recipes on the site, with the slug, title, description, and tags of each. A recipe that was saved in the last 2 minutes can be missing from the list.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: READ_ONLY,
      async run() {
        const response = await env.ASSETS.fetch(new URL('/recipes/index.json', origin))
        const index = await response.json()
        const recipes = index.map(({ slug, title, description, tags }) => ({ slug, title, description, tags, url: pageUrl(slug) }))
        return reply(JSON.stringify(recipes))
      },
    },
    {
      name: 'get_recipe',
      title: 'Get a recipe',
      description: 'Gets one recipe as JSON. Use it before update_recipe.',
      inputSchema: { type: 'object', required: ['slug'], additionalProperties: false, properties: { slug: SLUG_FIELD } },
      annotations: READ_ONLY,
      async run({ slug }) {
        const found = SLUG.test(slug ?? '') && (await store.read(slug))
        if (!found) return problem(`There is no recipe "${slug}". Call list_recipes to see the slugs.`)
        const { $schema, ...recipe } = found.recipe
        return reply(JSON.stringify(recipe))
      },
    },
    {
      name: 'check_recipe',
      title: 'Check a recipe',
      description: 'Checks a recipe and does not save it. Returns the problems, if any. The format is the same as for create_recipe.',
      inputSchema: { type: 'object', required: ['recipe'], additionalProperties: false, properties: { recipe: RECIPE } },
      annotations: READ_ONLY,
      async run({ recipe }) {
        const errors = checkRecipe({ recipe: withoutImages(recipe), schema, slugs: await store.slugs() })
        return reply(errors.length ? problemList(errors) : 'The recipe has no problems.')
      },
    },
    {
      name: 'create_recipe',
      title: 'Add a recipe',
      description: `Adds a new recipe to the site. The recipe is on the site after 1 to 2 minutes.\n\n${INSTRUCTIONS}`,
      inputSchema: {
        type: 'object',
        required: ['recipe'],
        additionalProperties: false,
        properties: {
          slug: { ...SLUG_FIELD, description: `${SLUG_FIELD.description} If you leave it out, the server makes one from the title.` },
          recipe: RECIPE,
        },
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async run({ slug, recipe }) {
        recipe = withoutImages(recipe)
        const slugs = await store.slugs()
        const errors = checkRecipe({ recipe, schema, slugs })
        if (errors.length) return problem(problemList(errors))
        slug ??= slugify(recipe.title)
        if (!SLUG.test(slug)) {
          return problem(`"${slug}" cannot be a slug. Send a slug with lowercase letters, numbers, and "-", such as "beef-stroganoff".`)
        }
        if (slugs.includes(slug)) {
          return problem(`The site already has a recipe with the slug "${slug}". To change it, use update_recipe. To add a different recipe, use a different slug.`)
        }
        await store.write({ slug, text: recipeFile(recipe), message: `Add the ${recipe.title} recipe` })
        return reply(`Added "${recipe.title}". It will be at ${pageUrl(slug)} in 1 to 2 minutes.`)
      },
    },
    {
      name: 'update_recipe',
      title: 'Change a recipe',
      description: 'Replaces a recipe with a new version. Send the full recipe, not only the changes. The format is the same as for create_recipe. The pictures of the recipe stay.',
      inputSchema: {
        type: 'object',
        required: ['slug', 'recipe'],
        additionalProperties: false,
        properties: {
          slug: SLUG_FIELD,
          recipe: RECIPE,
          summary: { type: 'string', description: 'One sentence about the change, for the history of the recipe.' },
        },
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      async run({ slug, recipe, summary }) {
        const current = SLUG.test(slug ?? '') && (await store.read(slug))
        if (!current) return problem(`There is no recipe "${slug}". Call list_recipes to see the slugs.`)
        recipe = withoutImages(recipe)
        if (current.recipe.images && recipe && typeof recipe === 'object') recipe = { ...recipe, images: current.recipe.images }
        const errors = checkRecipe({ recipe, schema, slugs: await store.slugs() })
        if (errors.length) return problem(problemList(errors))
        const message = `Change the ${recipe.title} recipe` + (summary ? `\n\n${summary}` : '')
        await store.write({ slug, text: recipeFile(recipe), sha: current.sha, message })
        return reply(`Saved "${recipe.title}". The change will be at ${pageUrl(slug)} in 1 to 2 minutes.`)
      },
    },
  ]
}

function reply(text) {
  return { content: [{ type: 'text', text }] }
}

function problem(text) {
  return { content: [{ type: 'text', text }], isError: true }
}

function problemList(errors) {
  return `The recipe has ${errors.length === 1 ? '1 problem' : `${errors.length} problems`}. Fix them and send the recipe again.\n${errors.map((error) => `- ${error}`).join('\n')}`
}

// The owner adds pictures by hand, and a picture file must be in the repo.
function withoutImages(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return recipe
  const { $schema, images, ...rest } = recipe
  return rest
}

// The text of recipe.json, with the fields in the order of the schema.
function recipeFile(recipe) {
  const order = Object.keys(schema.properties)
  const fields = Object.entries({ $schema: '../recipe.schema.json', ...recipe })
  fields.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
  return formatJson(Object.fromEntries(fields))
}

// "Mom's Crème Brûlée" -> "moms-creme-brulee"
function slugify(title) {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ'’]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
