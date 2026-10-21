# Recipes

My recipes as a static site. Each recipe is a JSON file. The site shows each recipe in four views:

- **Table.** The recipe as a grid, in the style of [Cooking For Engineers](https://www.cookingforengineers.com/recipe/327/Espresso-Brownies). Ingredients are on the left. Each step is a cell to the right of its inputs.
- **Text.** An ingredient list with check boxes, and numbered steps.
- **Images.** Pictures that you add to the recipe folder. This tab shows only when a recipe has pictures.
- **Cook.** One step at a time in large text. The screen stays on, and times in a step become timer buttons.

You can scale amounts with the ½×, 1×, 2×, and 3× buttons, or type a number such as 1.5 or 1/3 in the custom box. You can also show US units, metric units, or both.

The site is plain HTML, CSS, and JavaScript, with no dependencies. It is a PWA, so you can install it on a phone or computer and use it offline. It runs on Cloudflare Workers. The only dev dependency is Wrangler, the Cloudflare tool that deploys it.

## Run it on your computer

You need Node 22 or newer.

```sh
pnpm install
pnpm dev          # http://localhost:8000
pnpm test         # unit tests
pnpm build        # check all recipes and write site/recipes/index.json
pnpm run deploy   # test, build, and deploy to Cloudflare
```

`pnpm dev` makes the recipe index again each time the home page loads, so you do not need `pnpm build` while you work.

## Files

```
site/                     the website (Cloudflare serves the files in this folder)
  index.html              all recipes
  recipe.html             one recipe: recipe.html?r=pressure-cooker-beef-stew
  sw.js                   service worker (offline use)
  js/model.js             recipe checks and the table layout
  js/amount.js            amounts and scaling
  js/views/               one file per view
  recipes/<name>/         one folder per recipe: recipe.json and its pictures
  recipes/recipe.schema.json
scripts/build.mjs         checks recipes, writes site/recipes/index.json
scripts/serve.mjs         local web server
tests/                    unit tests (node --test)
worker/index.js           Worker code for requests that match no file in site/
worker/mcp.js             MCP protocol
worker/tools.js           MCP tools, and the recipe guide for chat apps
worker/github.js          reads and writes recipe files through the GitHub API
wrangler.jsonc            Cloudflare settings
```

## Add a recipe

1. Make a folder in `site/recipes/`. Use lowercase letters, numbers, and `-` in the name, such as `beef-stroganoff`. The folder name is the recipe's address.
2. Add `recipe.json` to the folder. Copy a sample recipe to start.
3. Run `pnpm build`. It tells you about each problem in the file.

Editors that know JSON Schema (VS Code, for example) complete and check the fields from `"$schema": "../recipe.schema.json"`.

### The recipe format

A recipe is a tree. The ingredients are the leaves. Each step takes some inputs and makes one new thing. An input is an ingredient id or the id of an earlier step.

```json
{
  "$schema": "../recipe.schema.json",
  "title": "Espresso Brownies",
  "description": "Fudgy cocoa brownies with a shot of espresso in the batter.",
  "yield": "one 8×8-in pan",
  "time": { "prep": "15 min", "cook": "35 min" },
  "tags": ["dessert", "chocolate"],
  "source": { "name": "Cooking For Engineers", "url": "https://..." },
  "images": [{ "src": "card.jpg", "alt": "Illustrated recipe card" }],
  "ingredients": [
    { "id": "butter", "amount": "4 oz", "metric": "115 g", "name": "unsalted butter" },
    { "id": "sugar", "amount": "1 cup", "metric": "200 g", "name": "sugar" }
  ],
  "steps": [
    { "action": "Preheat oven to 350°F (170°C)" },
    { "id": "melted", "action": "melt", "inputs": ["butter"], "text": "Melt the butter over low heat." },
    { "action": "mix", "inputs": ["melted", "sugar"], "text": "Stir in the sugar." }
  ],
  "notes": ["A glass pan gives gooier brownies."]
}
```

Only `title`, `ingredients`, and `steps` are necessary.

Ingredients:

- `id` is a short name that steps use. `name` is the text that people see.
- `amount` is the amount as you write it: `"1-1/2 cups"`, `"2 large"`, `"16 to 20"`. The number at the start scales. The rest stays as written.
- `metric` is the same amount in metric units. If you add it, the Units buttons show.
- `note` shows after the name, such as "softened".
- `group` puts a heading over the ingredient in the Text view, such as "Frosting".
- `recipe` links the ingredient to another recipe, such as `"buttercream-frosting"`.

Steps:

- Put the steps in the order that you do them.
- `action` is the short text in the table, such as "fold in" or "bake 350°F 30 min".
- `text` is the full instruction for the Text and Cook views. If you leave it out, those views show `action`.
- `inputs` lists ingredient ids and earlier step ids. Each one can go into one step only. If an ingredient goes into two steps, make two ingredients, such as "1 Tbs. butter, for the beef" and "1 Tbs. butter, for the onion".
- A step with no `inputs` is a prep step, such as "Preheat oven". The table shows prep steps across the top.
- Give an `id` to each step that a later step uses.

The order of `inputs` sets the order of the rows in the table. Each step goes in the first column to the right of all its inputs.

### Versions of a recipe

If you make a recipe in different versions, add `choices`. The page shows a row of buttons for each choice, and the cook can select any combination of options.

```json
"choices": [
  { "id": "flour", "label": "Flour", "options": [
    { "id": "almond", "label": "almond flour" },
    { "id": "chickpea", "label": "chickpea flour", "note": "Chickpea flour is stickier, so this version has milk." }
  ] },
  { "id": "mix-in", "label": "Mix-in", "options": [
    { "id": "chocolate", "label": "chocolate chips" },
    { "id": "raisins", "label": "raisins" }
  ] }
],
"ingredients": [
  { "id": "almond-flour", "amount": "40 g", "name": "almond flour", "when": { "flour": "almond" } },
  { "id": "chickpea-flour", "amount": "40 g", "name": "chickpea flour", "when": { "flour": "chickpea" } },
  { "id": "milk", "amount": "10 g", "name": "milk", "when": { "flour": "chickpea" } },
  { "id": "chips", "amount": "30 g", "name": "chocolate chips", "when": { "mix-in": "chocolate" } },
  { "id": "raisins", "amount": "30 g", "name": "raisins", "when": { "mix-in": "raisins" } }
],
"steps": [
  { "id": "dough", "action": "mix", "inputs": ["almond-flour", "chickpea-flour", "milk"] },
  { "action": "fold in the {mix-in}", "inputs": ["dough", "chips", "raisins"] }
]
```

- The first option of each choice is the default.
- An ingredient or a step with `when` is only for those options. The other ingredients and steps are for all options.
- Put the ingredients of all the options in the step that uses them. The page shows only the ingredients of the selected options. If all the inputs of a step are for other options, the page does not show the step.
- In `action` and `text`, `{mix-in}` shows the label of the selected option.
- The page address keeps the options, such as `recipe.html?r=cookies&flour=chickpea`. The page also remembers the options that you used last.
- `pnpm build` checks each combination of options.

### Nutrition

`nutrition` lists estimated values for a portion. The values do not change when you scale the recipe.

```json
"nutrition": [
  { "per": "100 g", "kcal": 480, "protein": 11, "fat": 30, "carbs": 42, "sugar": 24, "fiber": 6 },
  { "per": "1 cookie", "kcal": 98, "protein": 2.1, "fat": 6.5, "carbs": 7.7, "sugar": 4.8, "fiber": 1.2 }
]
```

`per`, `kcal`, `protein`, `fat`, and `carbs` are necessary. The values are in kcal and grams, and `carbs` includes the sugar and the fiber. In a recipe with choices, give each entry a `when`, such as `{ "flour": "chickpea" }`. Leave out a choice that does not change the values. Each combination of options must have values, and only one entry for each portion. The MCP server tells chat apps to calculate these values when they add or change a recipe.

## Add pictures

1. Make the picture, for example with ChatGPT.
2. Make it smaller. Pictures from ChatGPT are often 2 to 3 MB. On a Mac, this command makes a JPEG with a longest side of 1600 pixels:

   ```sh
   sips -Z 1600 -s format jpeg -s formatOptions 80 picture.png --out site/recipes/pressure-cooker-beef-stew/card.jpg
   ```

3. Add the file to `images` in `recipe.json`. The first picture is also the picture on the recipe card. A recipe with no pictures gets a small drawing of its table on the card.

`pnpm build` shows a warning for each picture that is larger than 600 KB.

## Publish on Cloudflare

`pnpm run deploy` deploys from your computer. Before each deploy, Wrangler runs the tests and `pnpm build` (see `build` in `wrangler.jsonc`). If a test fails or a recipe has a problem, Wrangler does not deploy.

To deploy on each push to `main`, do this one time:

1. In the Cloudflare dashboard, open the `recipes` Worker.
2. Go to **Settings → Builds** and connect the GitHub repo.
3. Keep the default deploy command, `npx wrangler deploy`.

The site is at https://recipes.hoian-embroidery.workers.dev/.

## Add recipes from ChatGPT

The Worker has an MCP server. ChatGPT, and other chat apps that can use MCP servers, can use it to read, add, and change recipes. Each saved recipe is a commit to `main`, so it is on the site after the next deploy, in 1 to 2 minutes.

The server has five tools: `list_recipes`, `get_recipe`, `check_recipe`, `create_recipe`, and `update_recipe`. The tools tell the chat app the recipe format, the rules for steps and inputs, how to write versions of a recipe, and how to calculate nutrition. The server checks each recipe with the same code as `pnpm build`, so a saved recipe cannot stop a deploy. The server does not save pictures. When it changes a recipe, it keeps the pictures that the recipe has.

Do this one time:

1. On GitHub, make a fine-grained personal access token. Give it access to this repo only, with the permission **Contents: Read and write**.
2. Add the token to the Worker. Wrangler asks you for the value.

   ```sh
   pnpm exec wrangler secret put GITHUB_TOKEN
   ```

3. Make a random secret for the address of the server, and add it to the Worker. This command shows the address of the server:

   ```sh
   S=$(openssl rand -hex 32); echo "$S" | pnpm exec wrangler secret put MCP_SECRET; echo "https://recipes.hoian-embroidery.workers.dev/mcp/$S"
   ```

   Anyone who has this address can change your recipes, so keep it private. To change the address, run the command again.

4. In ChatGPT, turn on Developer Mode. Then add an app (connector) with the address of the server and no authentication.

The server saves recipes to the repo and branch in `vars` in `wrangler.jsonc`. To try the server on your computer, copy `.dev.vars.example` to `.dev.vars` and fill it in. Add `GITHUB_BRANCH=<a test branch>` so that your tests do not change `main`. Then run `pnpm exec wrangler dev`.

## Install the app

- iPhone or iPad: open the site in Safari, tap Share, then tap **Add to Home Screen**.
- Android or desktop Chrome: open the site and use **Install app** in the menu or the address bar.

After you open a recipe list once, all recipes work offline. Pictures work offline after you see them one time.

## Change the service worker

`site/sw.js` keeps a list of the app files for offline use. If you add a file to `site/js/` or `site/css/`, add it to `SHELL` in `sw.js`, and change `CACHE` (for example, from `recipes-v1` to `recipes-v2`).
