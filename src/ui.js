import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, OUTFITS, FRAMES, COLOR_SWATCHES, DEFAULT_LOOK, sanitizeLook, randomLook } from './lib/look.js'
import { rng } from './lib/textures.js'

const KEY = 'benuelife.profile.v1'

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (p) return { name: String(p.name || '').slice(0, 18), look: sanitizeLook(p.look), saved: true }
  } catch { /* storage blocked */ }
  return { name: '', look: { ...DEFAULT_LOOK }, saved: false }
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify({ name: p.name, look: p.look })) } catch { /* ignore */ }
}

const el = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}

// The character creator. Every change calls onChange so the 3D preview updates live.
export function createCreator(root, profile, { onChange, onDone }) {
  let { name, look } = profile
  const state = () => ({ name, look })

  root.innerHTML = ''
  const head = el('div', 'cr-head', '<h2>Your character</h2><p>Build who you are in Benue Life.</p>')
  root.appendChild(head)

  const body = el('div', 'cr-body')
  root.appendChild(body)

  const section = (title) => {
    const s = el('div', 'cr-sec')
    s.appendChild(el('label', '', title))
    body.appendChild(s)
    return s
  }
  const swatches = (host, colors, key, isIndex) => {
    const row = el('div', 'cr-row')
    colors.forEach((c, i) => {
      const b = el('button', 'sw')
      b.type = 'button'
      b.style.background = c
      b.setAttribute('aria-label', c)
      b.onclick = () => { look = sanitizeLook({ ...look, [key]: isIndex ? i : c }); sync(); onChange(state()) }
      b.dataset.v = isIndex ? i : c
      row.appendChild(b)
    })
    host.appendChild(row)
    return row
  }
  const choices = (host, list, key) => {
    const row = el('div', 'cr-row')
    list.forEach(([v, label]) => {
      const b = el('button', 'ch', label)
      b.type = 'button'
      b.dataset.v = v
      b.onclick = () => { look = sanitizeLook({ ...look, [key]: key === 'frame' ? +v : v }); sync(); onChange(state()) }
      row.appendChild(b)
    })
    host.appendChild(row)
    return row
  }

  const nameSec = section('Name')
  const nameInput = el('input', 'cr-in')
  nameInput.placeholder = 'Your name'
  nameInput.maxLength = 18
  nameInput.value = name
  nameInput.oninput = () => { name = nameInput.value; onChange(state()) }
  nameSec.appendChild(nameInput)

  const rows = {}
  rows.frame = choices(section('Build'), FRAMES.map(([, l], i) => [i, l]), 'frame')
  const hs = section('Height')
  const range = el('input', 'cr-range')
  range.type = 'range'; range.min = '0.92'; range.max = '1.08'; range.step = '0.01'
  range.oninput = () => { look = sanitizeLook({ ...look, height: +range.value }); onChange(state()) }
  hs.appendChild(range)
  rows.skin = swatches(section('Skin'), SKIN_TONES, 'skin', true)
  rows.hair = choices(section('Hair'), HAIR_STYLES, 'hair')
  rows.hairColor = swatches(section('Hair colour'), HAIR_COLORS, 'hairColor', true)
  rows.outfit = choices(section('Outfit'), OUTFITS, 'outfit')
  rows.c1 = swatches(section('Main colour'), COLOR_SWATCHES, 'c1', false)
  rows.c2 = swatches(section('Second colour'), COLOR_SWATCHES, 'c2', false)

  const foot = el('div', 'cr-foot')
  const rnd = el('button', 'cr-btn ghost', 'Randomise')
  rnd.type = 'button'
  rnd.onclick = () => { look = randomLook(rng((Math.random() * 1e9) | 0)); sync(); onChange(state()) }
  const go = el('button', 'cr-btn', 'Walk in')
  go.type = 'button'
  go.onclick = () => {
    if (name.trim().length < 2) { nameInput.focus(); nameInput.classList.add('bad'); return }
    onDone(state())
  }
  foot.append(rnd, go)
  root.appendChild(foot)

  function sync() {
    const mark = (row, test) => row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', test(b.dataset.v)))
    mark(rows.frame, (v) => +v === look.frame)
    mark(rows.skin, (v) => +v === look.skin)
    mark(rows.hair, (v) => v === look.hair)
    mark(rows.hairColor, (v) => +v === look.hairColor)
    mark(rows.outfit, (v) => v === look.outfit)
    mark(rows.c1, (v) => v.toLowerCase() === look.c1.toLowerCase())
    mark(rows.c2, (v) => v.toLowerCase() === look.c2.toLowerCase())
    range.value = look.height
  }
  sync()
  return { state, setDoneLabel: (t) => { go.textContent = t } }
}
