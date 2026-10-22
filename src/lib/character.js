import * as THREE from 'three'

import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, OUTFITS, FRAMES, COLOR_SWATCHES, DEFAULT_LOOK, sanitizeLook, randomLook } from './look.js'
export { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, OUTFITS, FRAMES, COLOR_SWATCHES, DEFAULT_LOOK, sanitizeLook, randomLook }

const OUTFIT_SHOES = { shirt: '#1d1d1d', tee: '#efefef', ankara: '#caa46a', agbada: '#2b1d14', jersey: '#fafafa', kaftan: '#3a2a1c' }

// ── cached materials and textures ────────────────────────────────────────────
const matCache = new Map()
function mat(color, rough = 0.85, extra = {}) {
  const k = color + rough + JSON.stringify(extra)
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }))
  return matCache.get(k)
}
const patCache = new Map()
function pattern(c1, c2) {
  const k = c1 + c2
  if (patCache.has(k)) return patCache.get(k)
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')
  x.fillStyle = c1
  x.fillRect(0, 0, 128, 128)
  x.fillStyle = c2
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    x.beginPath()
    x.arc(16 + i * 32, 16 + j * 32 + (i % 2) * 8, 9, 0, 7)
    x.fill()
    x.globalAlpha = 0.6
    x.fillRect(i * 32 + 2, j * 32 + 26, 28, 3)
    x.globalAlpha = 1
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.repeat.set(2, 2)
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide })
  patCache.set(k, m)
  return m
}

// ── geometry helpers ─────────────────────────────────────────────────────────
const geoCache = new Map()
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make())
  return geoCache.get(key)
}
const capsule = (r, len, seg = 6) => geo(`cap${r}${len}${seg}`, () => new THREE.CapsuleGeometry(r, len, 4, seg * 2))

function lathe(pts, seg = 20) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)
}

function headGeometry() {
  return geo('head', () => {
    const g = new THREE.SphereGeometry(1, 28, 20)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      if (y < 0) { // taper toward a chin
        const k = 1 + y * 0.3
        x *= k
        z *= 1 + y * 0.12
        if (y < -0.55) z *= 0.92
      }
      p.setXYZ(i, x * 0.088, y * 0.118, z * 0.1)
    }
    g.computeVertexNormals()
    return g
  })
}

const part = (geom, material, parent, x = 0, y = 0, z = 0, shadow = true) => {
  const m = new THREE.Mesh(geom, material)
  m.position.set(x, y, z)
  m.castShadow = shadow
  parent.add(m)
  return m
}

// ── the character ────────────────────────────────────────────────────────────
// lod 'high' for the player and nearby people, 'low' for the crowd.
export function buildCharacter(rawLook, { lod = 'high', carry } = {}) {
  const look = sanitizeLook(rawLook)
  const high = lod === 'high'
  const seg = high ? 6 : 4
  const root = new THREE.Group()
  const skinHex = SKIN_TONES[look.skin]
  const skin = mat(skinHex, 0.62)
  const o = look.outfit
  const clothMat = o === 'ankara' ? pattern(look.c1, look.c2) : mat(look.c1, 0.82, { side: THREE.DoubleSide })
  const pants = mat(look.c2, 0.85)

  // frame sets the silhouette
  const sw = [1.08, 1, 0.9][look.frame] // shoulder width
  const hw = [0.95, 1, 1.14][look.frame] // hip width
  const bust = look.frame === 2 ? 1.06 : 1
  const legLen = 0.92 * look.height
  const k = look.height

  const pelvis = new THREE.Group()
  pelvis.position.y = legLen
  root.add(pelvis)

  // torso: a lathe profile gives a real waist, chest and shoulder line
  const torsoGeo = geo('torso', () => lathe([[0.001, -0.1], [0.15, -0.08], [0.158, 0.0], [0.135, 0.18], [0.14, 0.3], [0.165, 0.43], [0.17, 0.5], [0.12, 0.57], [0.05, 0.6], [0.001, 0.605]], 24))
  const torso = part(torsoGeo, o === 'agbada' || o === 'kaftan' ? clothMat : (o === 'tee' || o === 'shirt' || o === 'jersey' ? clothMat : clothMat), pelvis, 0, 0, 0)
  torso.scale.set(sw * (look.frame === 0 ? 1.04 : 1) * bust, 1, 0.78 * bust)

  // hips / lower garment
  if (o === 'ankara') {
    const sk = part(geo('skirt', () => lathe([[0.15, 0.04], [0.19, -0.1], [0.26, -0.4], [0.3, -0.62], [0.001, -0.62]], 24)), clothMat, pelvis)
    sk.scale.set(hw, 1, hw * 0.92)
  } else if (o === 'agbada') {
    const rb = part(geo('robe', () => lathe([[0.19, 0.5], [0.24, 0.2], [0.3, -0.3], [0.36, -0.82], [0.001, -0.82]], 28)), clothMat, pelvis)
    rb.scale.set(hw * 1.02, 1, hw)
  } else if (o === 'kaftan') {
    const kf = part(geo('kaftan', () => lathe([[0.17, 0.18], [0.2, -0.1], [0.23, -0.42], [0.001, -0.42]], 24)), clothMat, pelvis)
    kf.scale.set(hw, 1, hw * 0.9)
  } else {
    const hips = part(geo('hips', () => lathe([[0.001, -0.14], [0.15, -0.12], [0.17, -0.02], [0.152, 0.06]], 20)), pants, pelvis)
    hips.scale.set(hw * 1.02, 1, 0.82)
  }

  // chest / back details at high detail
  const chest = new THREE.Group()
  chest.position.y = 0.5
  pelvis.add(chest)

  // neck & head
  const neck = part(capsule(0.04, 0.05, seg), skin, chest, 0, 0.1, 0.005)
  const headPivot = new THREE.Group()
  headPivot.position.set(0, 0.19, 0.01)
  chest.add(headPivot)
  const head = part(headGeometry(), skin, headPivot, 0, 0.1, 0)
  head.scale.setScalar(k > 1 ? 1.01 : 1)
  void neck

  if (high) {
    const white = mat('#f4f1ea', 0.3), dark = mat('#120d0a', 0.4)
    for (const s of [-1, 1]) {
      part(geo('eye', () => new THREE.SphereGeometry(0.0125, 10, 8)), white, headPivot, s * 0.034, 0.112, 0.092, false)
      part(geo('iris', () => new THREE.SphereGeometry(0.0072, 8, 6)), dark, headPivot, s * 0.034, 0.112, 0.1, false)
      const brow = part(geo('brow', () => new THREE.BoxGeometry(0.034, 0.006, 0.01)), mat(HAIR_COLORS[Math.min(look.hairColor, 4)], 0.9), headPivot, s * 0.036, 0.137, 0.09, false)
      brow.rotation.z = -s * 0.1
      part(geo('ear', () => new THREE.SphereGeometry(0.022, 8, 6)), skin, headPivot, s * 0.092, 0.1, -0.005, false).scale.set(0.5, 1, 0.9)
    }
    part(geo('nose', () => new THREE.SphereGeometry(0.017, 8, 6)), skin, headPivot, 0, 0.088, 0.1, false).scale.set(0.9, 1.2, 1.1)
    const lipColor = new THREE.Color(skinHex).lerp(new THREE.Color('#7a2d2d'), 0.45).getStyle()
    part(geo('lips', () => new THREE.SphereGeometry(0.02, 10, 6)), mat(lipColor, 0.45), headPivot, 0, 0.056, 0.093, false).scale.set(1.25, 0.42, 0.7)
  }

  // hair and head wear
  const hairHex = HAIR_COLORS[look.hairColor]
  const hairMat = mat(hairHex, 0.95)
  const capGeo = geo('hairCap', () => new THREE.SphereGeometry(0.103, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55))
  const style = look.hair
  if (style === 'low' || style === 'braids' || style === 'bun' || style === 'cap') {
    const h = part(capGeo, hairMat, headPivot, 0, 0.115, -0.004)
    h.scale.set(1.0, 1.0, 1.02)
  }
  if (style === 'afro') {
    part(geo('afro', () => new THREE.SphereGeometry(0.15, 18, 14)), hairMat, headPivot, 0, 0.14, -0.015).scale.set(1, 0.92, 1)
  }
  if (style === 'braids') {
    const n = high ? 14 : 8
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      if (Math.cos(a) > 0.75) continue
      part(capsule(0.011, 0.2, 4), hairMat, headPivot, Math.sin(a) * 0.098, 0.04, Math.cos(a) * 0.088 - 0.012)
    }
  }
  if (style === 'bun') part(geo('bun', () => new THREE.SphereGeometry(0.05, 12, 10)), hairMat, headPivot, 0, 0.2, -0.065)
  if (style === 'cap') {
    const cm = mat(look.c2, 0.8)
    part(geo('capTop', () => new THREE.SphereGeometry(0.108, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), cm, headPivot, 0, 0.125, -0.002).scale.set(1, 0.9, 1.02)
    part(geo('brim', () => new THREE.BoxGeometry(0.17, 0.008, 0.09)), cm, headPivot, 0, 0.128, 0.11)
  }
  if (style === 'headwrap') {
    const wm = pattern(look.c2, look.c1)
    part(geo('wrap', () => new THREE.SphereGeometry(0.125, 16, 12)), wm, headPivot, 0, 0.17, -0.005).scale.set(1.05, 0.95, 1.05)
    part(geo('wrapTop', () => new THREE.SphereGeometry(0.075, 12, 10)), wm, headPivot, 0.04, 0.27, -0.02).scale.set(1.3, 0.8, 1)
  }
  if (style === 'hijab') {
    const hm = mat(look.c2, 0.88, { side: THREE.DoubleSide })
    part(geo('hijab', () => lathe([[0.001, 0.248], [0.095, 0.235], [0.128, 0.16], [0.125, 0.06], [0.15, -0.03], [0.2, -0.12], [0.2, -0.15], [0.11, -0.12]], 22)), hm, headPivot, 0, 0, -0.01)
  }

  // arms
  const shoulders = [], elbows = []
  const longSleeve = o === 'agbada' || o === 'kaftan' || (o === 'shirt' && look.frame !== 1)
  for (const s of [-1, 1]) {
    const sh = new THREE.Group()
    sh.position.set(s * 0.19 * sw, 0.47, 0)
    pelvis.add(sh)
    shoulders.push(sh)
    part(capsule(0.052, 0.27, seg), skin, sh, 0, -0.2, 0)
    // sleeve over the upper arm
    if (o !== 'ankara' || true) {
      const wide = o === 'agbada' ? 1.9 : 1
      const sl = part(capsule(0.056 * wide, longSleeve ? 0.27 : 0.14, seg), clothMat, sh, 0, longSleeve ? -0.2 : -0.1, 0)
      sl.scale.z = 1
    }
    const el = new THREE.Group()
    el.position.set(0, -0.37, 0)
    sh.add(el)
    elbows.push(el)
    part(capsule(0.04, 0.23, seg), skin, el, 0, -0.17, 0)
    if (longSleeve) part(capsule(0.043 * (o === 'agbada' ? 1.8 : 1), 0.22, seg), clothMat, el, 0, -0.16, 0)
    if (high) part(geo('hand', () => new THREE.SphereGeometry(0.04, 10, 8)), skin, el, 0, -0.34, 0.005).scale.set(0.85, 1.25, 0.6)
    sh.rotation.z = s * 0.06
  }

  // legs
  const hips = [], knees = []
  const shorts = o === 'jersey'
  const dressLegs = o === 'ankara'
  const robeLegs = o === 'agbada'
  const shoeHex = OUTFIT_SHOES[o]
  const shoeMat = mat(shoeHex, 0.6)
  for (const s of [-1, 1]) {
    const hp = new THREE.Group()
    hp.position.set(s * 0.085 * hw, -0.08, 0)
    pelvis.add(hp)
    hips.push(hp)
    const thighSkin = shorts || dressLegs
    part(capsule(0.085, 0.3, seg), thighSkin && !shorts ? skin : (shorts ? pants : pants), hp, 0, -0.22, 0)
    if (shorts) part(capsule(0.07, 0.1, seg), skin, hp, 0, -0.4, 0)
    const kn = new THREE.Group()
    kn.position.set(0, -0.44 * k, 0)
    hp.add(kn)
    knees.push(kn)
    const shinMat = shorts || dressLegs ? skin : pants
    part(capsule(0.06, 0.34, seg), shinMat, kn, 0, -0.24, 0)
    if (robeLegs) kn.children.forEach((c) => { c.visible = false })
    const shoe = part(geo('shoe', () => new THREE.BoxGeometry(0.085, 0.07, 0.24)), shoeMat, kn, 0, -0.455, 0.045)
    shoe.scale.set(1, 1, 1)
    if (robeLegs) shoe.visible = true
  }

  if (carry) {
    const basket = part(geo('basket', () => new THREE.CylinderGeometry(0.2, 0.15, 0.14, 14)), mat(carry, 0.9), headPivot, 0, 0.32, 0)
    basket.castShadow = true
  }

  const scale = look.height
  root.scale.setScalar(scale)
  root.userData = { pelvis, chest, headPivot, shoulders, elbows, hips, knees, hip: pelvis, arms: shoulders, legs: hips, phase: Math.random() * 6.28, baseY: legLen, look }
  return root
}

// ── animation: a proper walk cycle with bending knees and elbows ─────────────
export function animateCharacter(g, speed, t) {
  const u = g.userData
  const k = Math.min(1, speed / 1.6)
  const run = Math.max(0, Math.min(1, (speed - 2.4) / 2.2))
  const ph = t * (3.6 + speed * 1.9) + u.phase
  const s = Math.sin(ph), c = Math.cos(ph)
  const amp = 0.62 + run * 0.35
  u.hips[0].rotation.x = s * amp * k
  u.hips[1].rotation.x = -s * amp * k
  u.knees[0].rotation.x = Math.max(0, -Math.cos(ph + 0.5)) * 0.95 * k + 0.04
  u.knees[1].rotation.x = Math.max(0, Math.cos(ph + 0.5)) * 0.95 * k + 0.04
  u.shoulders[0].rotation.x = -s * 0.55 * k
  u.shoulders[1].rotation.x = s * 0.55 * k
  u.elbows[0].rotation.x = -(0.18 + run * 0.9 + Math.max(0, s) * 0.25 * k)
  u.elbows[1].rotation.x = -(0.18 + run * 0.9 + Math.max(0, -s) * 0.25 * k)
  u.pelvis.position.y = u.baseY - Math.abs(c) * 0.035 * k * (1 + run)
  u.pelvis.rotation.y = s * 0.08 * k
  u.chest.rotation.y = -s * 0.1 * k
  u.chest.rotation.x = 0.03 + run * 0.12
  // breathing and a small idle look-around
  const idle = 1 - k
  u.chest.scale.set(1 + Math.sin(t * 1.7 + u.phase) * 0.006 * idle, 1 + Math.sin(t * 1.7 + u.phase) * 0.004 * idle, 1)
  u.headPivot.rotation.y = Math.sin(t * 0.4 + u.phase) * 0.25 * idle
}
