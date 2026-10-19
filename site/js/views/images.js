// The pictures you add for a recipe, at full size.
import { h } from '../dom.js'
import { assetUrl } from '../model.js'

export function renderImages({ recipe, slug }) {
  return h(
    'div',
    { class: 'gallery' },
    recipe.images.map((image) => {
      const src = assetUrl({ slug, src: image.src })
      return h(
        'figure',
        {},
        h('a', { href: src, target: '_blank', rel: 'noopener' }, h('img', { src, alt: image.alt ?? '', loading: 'lazy', decoding: 'async' })),
        image.caption && h('figcaption', {}, image.caption),
      )
    }),
  )
}
