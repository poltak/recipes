// JSON in the style of the recipe files in the repo: a list or an object stays on one
// line if the line fits in 120 characters. Saved recipes then give small, clear diffs.
const WIDTH = 120

export function formatJson(value) {
  return format({ value, indent: '', used: 0 }) + '\n'
}

// `used` is the number of characters before the value on its line, such as `"steps": `.
function format({ value, indent, used }) {
  const line = oneLine(value)
  // The 1 is for the comma after the value.
  if (typeof value !== 'object' || value === null || indent.length + used + line.length + 1 <= WIDTH) return line
  const inner = indent + '  '
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => inner + format({ value: item, indent: inner, used: 0 })).join(',\n')}\n${indent}]`
  }
  const fields = Object.entries(value).map(([key, item]) => {
    const name = `${JSON.stringify(key)}: `
    return inner + name + format({ value: item, indent: inner, used: name.length })
  })
  return `{\n${fields.join(',\n')}\n${indent}}`
}

function oneLine(value) {
  if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  const fields = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${oneLine(item)}`)
  return fields.length ? `{ ${fields.join(', ')} }` : '{}'
}
