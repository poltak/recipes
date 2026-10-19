// Amounts are text, as you would write them: "1-1/2 cups", "115 g", "2 large",
// "16 to 20". The number at the start can scale. The rest stays as written.

const GLYPHS = {
  '1/8': '⅛', '1/4': '¼', '1/3': '⅓', '3/8': '⅜', '1/2': '½',
  '5/8': '⅝', '2/3': '⅔', '3/4': '¾', '7/8': '⅞',
}
const GLYPH_VALUES = Object.fromEntries(
  Object.entries(GLYPHS).map(([fraction, glyph]) => {
    const [top, bottom] = fraction.split('/')
    return [glyph, top / bottom]
  }),
)
const STEPS = Object.entries(GLYPH_VALUES).sort((a, b) => a[1] - b[1])
const G = Object.keys(GLYPH_VALUES).join('')

// "1/2", "1.5", "1 1/2", "1-1/2", "1½", "½", "2"
const NUMBER = String.raw`\d+\/\d+|\d*\.\d+|\d+(?:[ -]\d+\/\d+|[${G}])?|[${G}]`
const AMOUNT = new RegExp(String.raw`^(${NUMBER})(?:(\s*(?:-|–|to)\s*)(${NUMBER}))?(.*)$`, 's')
const METRIC = /^\s*(?:mg|g|kg|ml|cl|dl|l)\b/i
const PLURALS = {
  batch: 'batches', bunch: 'bunches', can: 'cans', clove: 'cloves', cup: 'cups', head: 'heads',
  pinch: 'pinches', shot: 'shots', slice: 'slices', sprig: 'sprigs', stick: 'sticks',
}
const SINGULARS = Object.fromEntries(Object.entries(PLURALS).map(([one, many]) => [many, one]))

export function parseAmount(text) {
  const match = AMOUNT.exec(text.trim())
  if (!match) return null
  const [, low, separator, high, rest] = match
  return {
    values: high ? [toNumber(low), toNumber(high)] : [toNumber(low)],
    separator: separator ?? '',
    rest,
    // Decimals and metric units read best as decimals. Cups and spoons read best as fractions.
    decimal: low.includes('.') || (/^\d+$/.test(low) && METRIC.test(rest)),
  }
}

// Returns the amount for display, multiplied by `scale`.
export function formatAmount({ text, scale = 1 }) {
  if (!text) return ''
  const amount = scale === 1 ? null : parseAmount(text)
  if (!amount) return prettyFractions(text)
  const [low, high] = amount.values.map((value) => formatNumber({ value: value * scale, decimal: amount.decimal }))
  const rest = plural({ rest: amount.rest, many: Math.max(...amount.values) * scale > 1 })
  return high ? `${low}${amount.separator}${high}${rest}` : `${low}${rest}`
}

// units: 'both' | 'us' | 'metric'. "us" shows `amount`, the amount as written.
export function ingredientAmount({ ingredient, scale = 1, units = 'both' }) {
  const main = formatAmount({ text: ingredient.amount, scale })
  const metric = formatAmount({ text: ingredient.metric, scale })
  if (units === 'metric') return metric || main
  if (units === 'us') return main || metric
  return main && metric ? `${main} (${metric})` : main || metric
}

// "2 cup" -> "2 cups", "½ cups" -> "½ cup"
function plural({ rest, many }) {
  return rest.replace(/^(\s*)([a-z]+)\b/i, (match, space, word) => {
    const swap = many ? PLURALS[word] : SINGULARS[word]
    return swap ? space + swap : match
  })
}

function toNumber(token) {
  let match
  if ((match = /^(\d+)\/(\d+)$/.exec(token))) return match[1] / match[2]
  if ((match = /^(\d+)[ -](\d+)\/(\d+)$/.exec(token))) return Number(match[1]) + match[2] / match[3]
  if ((match = new RegExp(`^(\\d*)([${G}])$`).exec(token))) return Number(match[1] || 0) + GLYPH_VALUES[match[2]]
  return Number(token)
}

function formatNumber({ value, decimal }) {
  if (decimal) return value >= 10 ? String(Math.round(value)) : String(Number(value.toPrecision(2)))
  let whole = Math.floor(value)
  let [glyph, part] = nearestStep(value - whole)
  if (part === 1) [whole, glyph] = [whole + 1, '']
  if (whole === 0 && !glyph) glyph = '⅛' // Never round a real amount down to nothing.
  return `${whole || ''}${glyph}`
}

function nearestStep(fraction) {
  let best = ['', 0]
  for (const candidate of [...STEPS, ['', 1]]) {
    if (Math.abs(candidate[1] - fraction) < Math.abs(best[1] - fraction)) best = candidate
  }
  return best
}

// "1-1/2 cup" -> "1½ cup", "1/4 tsp" -> "¼ tsp". Other fractions stay as written.
function prettyFractions(text) {
  return text.replace(/\b(?:(\d+)[ -])?(\d\/\d)\b/g, (match, whole, fraction) =>
    GLYPHS[fraction] ? `${whole ?? ''}${GLYPHS[fraction]}` : match,
  )
}
