// h('a', { href: '#', onclick }, 'text', child) makes an element.
// Text children go in as text, never as HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value)
    else el.setAttribute(key, value === true ? '' : value)
  }
  el.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false && child !== ''))
  return el
}
