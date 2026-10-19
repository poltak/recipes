// Finds times such as "30 to 40 min", "5 minutes", or "1 hr 15 min" in step text.

const UNITS = { h: 3600, m: 60, s: 1 }
const DURATION =
  /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b\.?(?:\s*(?:and\s+)?(\d+)\s*(?:minutes?|mins?)\b\.?)?/gi

// Returns [{ label, seconds }]. A range ("30 to 40 min") counts as its lower end.
export function findDurations(text) {
  const found = []
  for (const match of text.matchAll(DURATION)) {
    const [label, amount, unit, extraMinutes] = match
    let seconds = Number(amount) * UNITS[unit[0].toLowerCase()]
    if (extraMinutes && unit[0].toLowerCase() === 'h') seconds += Number(extraMinutes) * 60
    if (seconds > 0 && !found.some((item) => item.seconds === seconds)) {
      found.push({ label: label.trim().replace(/\.$/, ''), seconds })
    }
  }
  return found
}
