import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmount, ingredientAmount, parseAmount } from '../site/js/amount.js'
import { findDurations } from '../site/js/durations.js'

test('at 1× amounts stay as written, with nicer fractions', () => {
  assert.equal(formatAmount({ text: '1-1/2 cups' }), '1½ cups')
  assert.equal(formatAmount({ text: '1/4 tsp.' }), '¼ tsp.')
  assert.equal(formatAmount({ text: '5.75 g' }), '5.75 g')
  assert.equal(formatAmount({ text: '1/16 tsp' }), '1/16 tsp')
  assert.equal(formatAmount({ text: 'salt & pepper' }), 'salt & pepper')
})

test('parses the usual ways to write a number', () => {
  assert.deepEqual(parseAmount('1-1/2 cups').values, [1.5])
  assert.deepEqual(parseAmount('1 1/2 cups').values, [1.5])
  assert.deepEqual(parseAmount('1½ cups').values, [1.5])
  assert.deepEqual(parseAmount('½ cup').values, [0.5])
  assert.deepEqual(parseAmount('2.5 mL').values, [2.5])
  assert.deepEqual(parseAmount('2-3 cloves').values, [2, 3])
  assert.deepEqual(parseAmount('16 to 20 pieces').values, [16, 20])
  assert.deepEqual(parseAmount('1 tomato').values, [1])
  assert.equal(parseAmount('a pinch'), null)
})

test('scales cups and spoons as fractions and metric as decimals', () => {
  assert.equal(formatAmount({ text: '1/4 tsp.', scale: 2 }), '½ tsp.')
  assert.equal(formatAmount({ text: '1-1/2 cups', scale: 0.5 }), '¾ cup')
  assert.equal(formatAmount({ text: '1 cup', scale: 1.5 }), '1½ cups')
  assert.equal(formatAmount({ text: '1 batch', scale: 2 }), '2 batches')
  assert.equal(formatAmount({ text: '3 large', scale: 0.5 }), '1½ large')
  assert.equal(formatAmount({ text: '1/3 cup', scale: 2 }), '⅔ cup')
  assert.equal(formatAmount({ text: '115 g', scale: 1.5 }), '173 g')
  assert.equal(formatAmount({ text: '1.3 g', scale: 3 }), '3.9 g')
  assert.equal(formatAmount({ text: '2.5 mL', scale: 0.5 }), '1.3 mL')
  assert.equal(formatAmount({ text: '16 to 20 pieces', scale: 2 }), '32 to 40 pieces')
  assert.equal(formatAmount({ text: '1/8 tsp', scale: 0.5 }), '⅛ tsp')
  assert.equal(formatAmount({ text: 'salt & pepper', scale: 2 }), 'salt & pepper')
})

test('shows US, metric, or both', () => {
  const ingredient = { amount: '4 oz', metric: '115 g', name: 'butter' }
  assert.equal(ingredientAmount({ ingredient }), '4 oz (115 g)')
  assert.equal(ingredientAmount({ ingredient, units: 'us' }), '4 oz')
  assert.equal(ingredientAmount({ ingredient, units: 'metric', scale: 2 }), '230 g')
  assert.equal(ingredientAmount({ ingredient: { amount: '2 large' }, units: 'metric' }), '2 large')
  assert.equal(ingredientAmount({ ingredient: { name: 'salt' } }), '')
})

test('finds times in step text', () => {
  assert.deepEqual(findDurations('Bake for 30 to 40 minutes. bake 350°F (170°C) 30 to 40 min'), [
    { label: '30 to 40 minutes', seconds: 1800 },
  ])
  assert.deepEqual(findDurations('cool 5 min., run knife around'), [{ label: '5 min', seconds: 300 }])
  assert.deepEqual(findDurations('Simmer 1 hr 30 min, then rest 10 minutes'), [
    { label: '1 hr 30 min', seconds: 5400 },
    { label: '10 minutes', seconds: 600 },
  ])
  assert.deepEqual(findDurations('Beat for 10 seconds'), [{ label: '10 seconds', seconds: 10 }])
  assert.deepEqual(findDurations('Preheat oven to 350°F'), [])
})
