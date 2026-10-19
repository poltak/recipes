// The Cooking For Engineers table: ingredients on the left, steps to the right.
import { h } from '../dom.js'
import { layoutTable } from '../model.js'
import { ingredientLine } from './common.js'

export function renderTable({ recipe, scale, units }) {
  const { cols, prep, rows } = layoutTable(recipe)
  const table = h(
    'table',
    { class: 'rtable' },
    h('caption', { class: 'sr-only' }, 'Ingredients are on the left. Read the steps from left to right.'),
    h(
      'tbody',
      {},
      prep.map((step) => h('tr', {}, h('td', { class: 'prep', colspan: cols }, step.action))),
      rows.map((cells, row) => h('tr', { 'data-row': row }, cells.map((cell) => renderCell({ cell, scale, units })))),
    ),
  )
  // Point at (or tap) a step to see its full text and the ingredients that go into it.
  const detail = h('p', { class: 'rtable-detail', hidden: true })
  table.addEventListener('pointerover', (event) => highlight({ table, detail, cell: event.target.closest('td.op') }))
  table.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') highlight({ table, detail, cell: null })
  })
  return h('div', {}, h('div', { class: 'rtable-wrap' }, table), detail)
}

function renderCell({ cell, scale, units }) {
  const span = {
    rowspan: cell.rowspan > 1 ? cell.rowspan : null,
    colspan: cell.colspan > 1 ? cell.colspan : null,
  }
  if (cell.kind === 'empty') return h('td', { class: 'gap', ...span })
  if (cell.kind === 'ingredient') return h('td', { class: 'ing', ...span }, ingredientLine({ ingredient: cell.ingredient, scale, units }))
  const { action, text } = cell.step
  // Tall cells turn their text on its side, so the table stays narrow. If the
  // text needs more than 3 lines on its side, it reads better the normal way.
  const vertical = cell.rowspan > 1 && sideLines({ text: action, rows: cell.rowspan }) <= 3
  return h(
    'td',
    {
      class: vertical ? 'op vertical' : 'op',
      style: `--rows: ${cell.rowspan}`,
      title: text ?? null,
      'data-first': cell.firstRow,
      'data-last': cell.lastRow,
      ...span,
    },
    h('span', {}, action),
  )
}

// About how many lines the text needs on its side. Keep the numbers the same
// as `.rtable .op.vertical span` in style.css: a row is 2.4em high, and a
// letter is about 0.48em wide.
function sideLines({ text, rows }) {
  return Math.ceil(text.length / ((rows * 2.4 - 1.4) / 0.48))
}

function highlight({ table, detail, cell }) {
  for (const el of table.querySelectorAll('.lit')) el.classList.remove('lit')
  detail.textContent = cell?.title ?? ''
  detail.hidden = !detail.textContent
  if (!cell) return
  cell.classList.add('lit')
  for (let row = Number(cell.dataset.first); row <= Number(cell.dataset.last); row++) {
    table.querySelector(`tr[data-row="${row}"] td.ing`)?.classList.add('lit')
  }
}
