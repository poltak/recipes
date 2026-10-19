// Kitchen timers. They show in a bar at the bottom of the screen and keep
// running when you change views.
import { h } from './dom.js'

const timers = new Set()
let bar = null
let ticker = null
let audio = null

export function startTimer({ label, seconds }) {
  // Browsers only allow sound after a tap, and this runs from a tap.
  audio ??= new AudioContext()
  bar ??= document.body.appendChild(h('div', { class: 'timers', 'aria-live': 'polite' }))
  const timer = { label, end: Date.now() + seconds * 1000, done: false }
  timer.clock = h('span', { class: 'timer-clock' })
  timer.el = h(
    'div',
    { class: 'timer' },
    h('span', { class: 'timer-label' }, label),
    timer.clock,
    h('button', { class: 'timer-close', 'aria-label': `Remove the ${label} timer`, onclick: () => removeTimer(timer) }, '×'),
  )
  bar.append(timer.el)
  timers.add(timer)
  update()
  ticker ??= setInterval(update, 250)
}

function removeTimer(timer) {
  timer.el.remove()
  timers.delete(timer)
  if (timers.size === 0) {
    clearInterval(ticker)
    ticker = null
  }
}

function update() {
  for (const timer of timers) {
    const left = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000))
    timer.clock.textContent = left === 0 ? 'Done' : clock(left)
    if (left === 0 && !timer.done) {
      timer.done = true
      timer.el.classList.add('done')
      alarm()
    }
  }
}

function clock(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function alarm() {
  navigator.vibrate?.([300, 150, 300, 150, 300])
  const start = audio.currentTime
  for (let i = 0; i < 3; i++) {
    const at = start + i * 0.4
    const tone = audio.createOscillator()
    const volume = audio.createGain()
    tone.frequency.value = 880
    volume.gain.setValueAtTime(0.0001, at)
    volume.gain.exponentialRampToValueAtTime(0.3, at + 0.02)
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
    tone.connect(volume).connect(audio.destination)
    tone.start(at)
    tone.stop(at + 0.32)
  }
}
