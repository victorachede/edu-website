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

const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2))

// Skin: a fine grain texture so the surface isn't a flat plastic colour, plus a soft sheen.
let grain = null
function skinMaterial(hex, vertexColors = false) {
  if (!grain) {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const x = c.getContext('2d')
    x.fillStyle = '#ffffff'
    x.fillRect(0, 0, 256, 256)
    const img = x.getImageData(0, 0, 256, 256)
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 238 + rnd() * 17
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    }
    x.putImageData(img, 0, 0)
    for (let i = 0; i < 160; i++) { // soft blotches
      x.globalAlpha = 0.05
      x.fillStyle = rnd() > 0.5 ? '#c9a090' : '#ffffff'
      x.beginPath(); x.arc(rnd() * 256, rnd() * 256, 6 + rnd() * 22, 0, 7); x.fill()
    }
    grain = new THREE.CanvasTexture(c)
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping
    grain.colorSpace = THREE.SRGBColorSpace
    grain.repeat.set(3, 3)
  }
  const k = 'skin' + hex + vertexColors
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshPhysicalMaterial({
      color: hex, map: grain, roughness: 0.52, metalness: 0, vertexColors,
      sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ff9a7a'),
      clearcoat: 0.08, clearcoatRoughness: 0.5,
    }))
  }
  return matCache.get(k)
}

// A sculpted face: the head is one surface, with the eye sockets, brow ridge, nose, lips, cheekbones
// and chin pushed into it, and lips, brows and nostrils painted with vertex colours.
function headGeometry(hairHex, lipHex) {
  return geo('head' + hairHex + lipHex, () => {
    const g = new THREE.SphereGeometry(1, 64, 48)
    const p = g.attributes.position
    const col = new Float32Array(p.count * 3)
    const hair = new THREE.Color(hairHex).multiplyScalar(0.9)
    const lip = new THREE.Color(lipHex)
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      if (y < 0) { // taper toward the chin
        const k = 1 + y * 0.3
        x *= k
        z *= 1 + y * 0.1
      }
      let c = [1, 1, 1]
      if (z > 0.18) {
        const ax = Math.abs(x)
        const w = Math.min(1, (z - 0.18) / 0.4) // fade features in on the front of the face
        let dz = 0
        dz += 0.07 * g2(ax, y, 0.0, 0.32, 0.62, 0.07)      // brow ridge
        dz -= 0.1 * g2(ax, y, 0.34, 0.2, 0.17, 0.11)       // eye sockets
        dz += 0.11 * g2(ax, y, 0, 0.05, 0.07, 0.24)      // nose bridge
        dz += 0.26 * g2(ax, y, 0, -0.2, 0.11, 0.09)        // nose tip
        dz += 0.1 * g2(ax, y, 0.15, -0.2, 0.07, 0.065)    // nose wings
        dz -= 0.04 * g2(ax, y, 0.07, -0.295, 0.05, 0.03)   // under the nostrils
        dz += 0.06 * g2(ax, y, 0.44, -0.06, 0.2, 0.15)     // cheekbones
        dz += 0.09 * g2(ax, y, 0, -0.43, 0.21, 0.05)       // upper lip
        dz += 0.1 * g2(ax, y, 0, -0.55, 0.18, 0.055)      // lower lip
        dz -= 0.08 * g2(ax, y, 0, -0.485, 0.23, 0.014)    // mouth line
        dz += 0.1 * g2(ax, y, 0, -0.8, 0.16, 0.1)        // chin
        z += dz * w
        // paint: lips, brows, nostrils, a little darkening in the eye sockets
        const l = Math.max(g2(ax, y, 0, -0.43, 0.2, 0.05), g2(ax, y, 0, -0.55, 0.17, 0.055)) * w
        const b = g2(ax, y, 0.3, 0.32 + (0.3 - Math.min(ax, 0.55)) * 0.12, 0.2, 0.032) * w
        const n = g2(ax, y, 0.055, -0.27, 0.035, 0.025) * w
        const e = g2(ax, y, 0.34, 0.2, 0.17, 0.11) * w * 0.28
        c = [1 - e, 1 - e, 1 - e]
        c = [c[0] * (1 - l) + lip.r * 2.2 * l, c[1] * (1 - l) + lip.g * 2.2 * l, c[2] * (1 - l) + lip.b * 2.2 * l]
        c = [c[0] * (1 - b) + hair.r * b, c[1] * (1 - b) + hair.g * b, c[2] * (1 - b) + hair.b * b]
        c = [c[0] * (1 - n) + 0.12 * n, c[1] * (1 - n) + 0.08 * n, c[2] * (1 - n) + 0.07 * n]
      }
      p.setXYZ(i, x * 0.088, y * 0.118, z * 0.1)
      col.set(c, i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
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

// Shaped limbs: thigh, calf, upper arm and forearm come from tapered profiles with muscle bulges.
const THIGH = () => geo('thigh', () => lathe([[0.001, 0.12], [0.088, 0.1], [0.094, 0.02], [0.088, -0.12], [0.072, -0.3], [0.058, -0.44], [0.001, -0.46]], 18))
const SHIN = () => geo('shin', () => lathe([[0.001, 0.02], [0.056, 0.0], [0.06, -0.08], [0.052, -0.2], [0.038, -0.34], [0.033, -0.43], [0.001, -0.44]], 16))
const UARM = () => geo('uarm', () => lathe([[0.001, 0.05], [0.056, 0.02], [0.054, -0.1], [0.045, -0.28], [0.04, -0.35], [0.001, -0.36]], 14))
const FARM = () => geo('farm', () => lathe([[0.001, 0.03], [0.042, 0.0], [0.04, -0.07], [0.03, -0.24], [0.027, -0.28], [0.001, -0.29]], 14))

// A hand with a palm, four fingers and a thumb, held relaxed.
function buildHand(skin, parent, side, detailed) {
  const hand = new THREE.Group()
  hand.position.set(0, -0.285, 0)
  parent.add(hand)
  const palm = part(geo('palm', () => new THREE.SphereGeometry(1, 14, 10)), skin, hand, 0, -0.045, 0)
  palm.scale.set(0.036, 0.048, 0.017)
  if (!detailed) return hand
  const f = (x, len, curl, th) => {
    const base = new THREE.Group()
    base.position.set(x, -0.085, 0)
    base.rotation.x = -curl * 0.5
    hand.add(base)
    part(capsule(th, len, 4), skin, base, 0, -len / 2 - 0.005, 0)
    const tip = new THREE.Group()
    tip.position.set(0, -len - 0.012, 0)
    tip.rotation.x = -curl
    base.add(tip)
    part(capsule(th * 0.92, len * 0.8, 4), skin, tip, 0, -len * 0.4 - 0.004, 0)
  }
  f(-0.026, 0.026, 0.45, 0.0085)
  f(-0.009, 0.03, 0.5, 0.0088)
  f(0.009, 0.029, 0.55, 0.0086)
  f(0.026, 0.023, 0.6, 0.0078)
  const th = new THREE.Group()
  th.position.set(side * -0.032, -0.05, 0.006)
  th.rotation.set(-0.3, 0, side * 0.5)
  hand.add(th)
  part(capsule(0.0105, 0.03, 4), skin, th, 0, -0.02, 0)
  const t2 = new THREE.Group()
  t2.position.set(0, -0.045, 0)
  t2.rotation.x = -0.35
  th.add(t2)
  part(capsule(0.0095, 0.022, 4), skin, t2, 0, -0.013, 0)
  hand.rotation.x = -0.12
  return hand
}

function buildShoe(kind, color, skin, parent, detailed = true) {
  const g = new THREE.Group()
  parent.add(g)
  const m = mat(color, 0.55)
  if (!detailed) {
    part(geo('shoeLow', () => new THREE.BoxGeometry(0.09, 0.05, 0.25)), kind === 'sandal' ? skin : m, g, 0, -0.465, 0.05)
    return g
  }
  if (kind === 'sandal') {
    part(geo('foot', () => new THREE.SphereGeometry(1, 14, 10)), skin, g, 0, -0.455, 0.05).scale.set(0.044, 0.03, 0.115)
    part(geo('sole', () => new THREE.BoxGeometry(0.09, 0.012, 0.25)), mat('#6b4a2c', 0.8), g, 0, -0.485, 0.05)
    part(geo('strap', () => new THREE.BoxGeometry(0.09, 0.012, 0.03)), m, g, 0, -0.45, 0.06)
    for (let i = 0; i < 5; i++) part(geo('toe', () => new THREE.SphereGeometry(0.009, 6, 5)), skin, g, -0.026 + i * 0.013, -0.468, 0.165)
  } else {
    part(geo('sole2', () => new THREE.BoxGeometry(0.098, 0.022, 0.285)), mat(kind === 'sneaker' ? '#f4f4f4' : '#161616', 0.7), g, 0, -0.482, 0.055)
    const up = part(geo('upper', () => new THREE.SphereGeometry(1, 16, 10)), m, g, 0, -0.455, 0.07)
    up.scale.set(0.05, 0.036, 0.135)
    part(geo('heelUp', () => new THREE.SphereGeometry(0.05, 12, 8)), m, g, 0, -0.447, -0.02).scale.set(1, 0.9, 1)
    part(geo('collar', () => new THREE.CylinderGeometry(0.048, 0.052, 0.03, 14)), m, g, 0, -0.43, -0.005)
  }
  return g
}

// ── the character ────────────────────────────────────────────────────────────
// lod 'high' for the player and nearby people, 'low' for the crowd.
export function buildCharacter(rawLook, { lod = 'high', carry } = {}) {
  const look = sanitizeLook(rawLook)
  const high = lod === 'high'
  const seg = high ? 6 : 4
  const root = new THREE.Group()
  const skinHex = SKIN_TONES[look.skin]
  const skin = skinMaterial(skinHex)
  const o = look.outfit
  const clothMat = o === 'ankara' ? pattern(look.c1, look.c2) : mat(look.c1, 0.82, { side: THREE.DoubleSide })
  const pants = mat(look.c2, 0.85)

  const sw = [1.08, 1, 0.9][look.frame]
  const hw = [0.95, 1, 1.14][look.frame]
  const bust = look.frame === 2 ? 1.06 : 1
  const legLen = 1.016 // hip height so the soles of the shoes touch the ground
  const k = 1

  const pelvis = new THREE.Group()
  pelvis.position.y = legLen
  root.add(pelvis)

  const torsoGeo = geo('torso', () => lathe([[0.001, -0.1], [0.15, -0.08], [0.158, 0.0], [0.135, 0.18], [0.14, 0.3], [0.165, 0.43], [0.172, 0.5], [0.125, 0.565], [0.055, 0.6], [0.001, 0.605]], 28))
  const torso = part(torsoGeo, clothMat, pelvis, 0, 0, 0)
  torso.scale.set(sw * (look.frame === 0 ? 1.04 : 1) * bust, 1, 0.78 * bust)

  if (o === 'ankara') {
    const sk = part(geo('skirt', () => lathe([[0.15, 0.04], [0.19, -0.1], [0.26, -0.4], [0.3, -0.62], [0.001, -0.62]], 28)), clothMat, pelvis)
    sk.scale.set(hw, 1, hw * 0.92)
  } else if (o === 'agbada') {
    const rb = part(geo('robe', () => lathe([[0.19, 0.5], [0.24, 0.2], [0.3, -0.3], [0.36, -0.82], [0.001, -0.82]], 32)), clothMat, pelvis)
    rb.scale.set(hw * 1.02, 1, hw)
  } else if (o === 'kaftan') {
    const kf = part(geo('kaftan', () => lathe([[0.17, 0.18], [0.2, -0.1], [0.23, -0.42], [0.001, -0.42]], 28)), clothMat, pelvis)
    kf.scale.set(hw, 1, hw * 0.9)
  } else {
    const hips = part(geo('hips', () => lathe([[0.001, -0.14], [0.15, -0.12], [0.17, -0.02], [0.152, 0.06]], 24)), pants, pelvis)
    hips.scale.set(hw * 1.02, 1, 0.82)
  }

  const chest = new THREE.Group()
  chest.position.y = 0.5
  pelvis.add(chest)

  // neck with a hint of the muscle running to the shoulders
  part(geo('neck', () => lathe([[0.001, 0.0], [0.05, 0.0], [0.043, 0.07], [0.04, 0.14], [0.001, 0.15]], 14)), skin, chest, 0, 0.02, 0.006)
  const headPivot = new THREE.Group()
  headPivot.position.set(0, 0.17, 0.012)
  chest.add(headPivot)

  const hairHex = HAIR_COLORS[look.hairColor]
  const lipHex = new THREE.Color(skinHex).lerp(new THREE.Color('#7a2d2d'), 0.5).getStyle()
  const faceMat = skinMaterial(skinHex, true)
  const head = part(headGeometry(hairHex, lipHex), faceMat, headPivot, 0, 0.1, 0)
  head.scale.setScalar(k > 1 ? 1.01 : 1)

  if (high) {
    // eyes: a white ball in each socket, an iris disc with a pupil and a catch-light, and lids
    const white = mat('#f3efe8', 0.25)
    const lid = skin
    const irisColor = ['#3a2415', '#2a1a10', '#4a2f1a'][look.skin % 3]
    const irisTex = geo('irisTex', () => 0) === 0 ? null : null
    void irisTex
    for (const s of [-1, 1]) {
      const eye = new THREE.Group()
      eye.position.set(s * 0.0305, 0.1 + 0.2 * 0.118, 0.079)
      headPivot.add(eye)
      part(geo('eyeball', () => new THREE.SphereGeometry(0.0138, 18, 14)), white, eye, 0, 0, 0, false)
      const iris = part(geo('iris', () => new THREE.CircleGeometry(0.0079, 20)), mat(irisColor, 0.2), eye, 0, 0, 0.0136, false)
      iris.rotation.y = 0
      part(geo('pupil', () => new THREE.CircleGeometry(0.0039, 14)), mat('#050403', 0.1), eye, 0, 0, 0.0138, false)
      part(geo('glint', () => new THREE.CircleGeometry(0.0016, 8)), new THREE.MeshBasicMaterial({ color: '#ffffff' }), eye, 0.0028, 0.0028, 0.0139, false)
      // upper and lower lids
      const up = part(geo('lidUp', () => new THREE.SphereGeometry(0.0148, 16, 8, 0, Math.PI * 2, 0, 1.05)), lid, eye, 0, 0, 0, false)
      up.rotation.x = Math.PI / 2 - 0.35
      const lo = part(geo('lidLo', () => new THREE.SphereGeometry(0.0146, 16, 6, 0, Math.PI * 2, 0, 0.55)), lid, eye, 0, 0, 0, false)
      lo.rotation.x = -Math.PI / 2 + 0.25
      // ear
      part(geo('ear', () => new THREE.SphereGeometry(0.022, 10, 8)), skin, headPivot, s * 0.089, 0.1, -0.003, false).scale.set(0.45, 1, 0.85)
      // lashes as a thin dark line along the upper lid
      const lash = part(geo('lash', () => new THREE.TorusGeometry(0.0142, 0.0009, 4, 14, Math.PI * 0.8)), mat('#0a0706', 0.9), eye, 0, 0.0005, 0.0005, false)
      lash.rotation.set(0, 0, Math.PI * 0.1)
    }
    // nostrils
    for (const s of [-1, 1]) part(geo('nostril', () => new THREE.SphereGeometry(0.0042, 8, 6)), mat('#120a08', 0.9), headPivot, s * 0.0085, 0.1 - 0.235 * 0.118, 0.108, false).scale.set(1, 0.7, 0.8)
  }

  // hair and head wear
  const hairMat = mat(hairHex, 0.95)
  const capGeo = geo('hairCap2', () => new THREE.SphereGeometry(0.1, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.43))
  const style = look.hair
  if (style === 'low' || style === 'braids' || style === 'bun' || style === 'cap') {
    const h = part(capGeo, hairMat, headPivot, 0, 0.135, -0.008)
    h.scale.set(0.98, 1.08, 1.06)
  }
  if (style === 'afro') {
    part(geo('afro', () => new THREE.SphereGeometry(0.15, 22, 16)), hairMat, headPivot, 0, 0.145, -0.018).scale.set(1, 0.92, 1)
  }
  if (style === 'braids') {
    const n = high ? 16 : 8
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      if (Math.cos(a) > 0.7) continue
      part(capsule(0.0105, 0.22, 4), hairMat, headPivot, Math.sin(a) * 0.1, 0.03, Math.cos(a) * 0.09 - 0.014)
    }
  }
  if (style === 'bun') part(geo('bun', () => new THREE.SphereGeometry(0.05, 14, 10)), hairMat, headPivot, 0, 0.205, -0.07)
  if (style === 'cap') {
    const cm = mat(look.c2, 0.8)
    part(geo('capTop', () => new THREE.SphereGeometry(0.11, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), cm, headPivot, 0, 0.13, -0.002).scale.set(1, 0.9, 1.04)
    part(geo('brim', () => new THREE.BoxGeometry(0.17, 0.008, 0.09)), cm, headPivot, 0, 0.133, 0.115)
  }
  if (style === 'headwrap') {
    const wm = pattern(look.c2, look.c1)
    part(geo('wrap', () => new THREE.SphereGeometry(0.125, 20, 14)), wm, headPivot, 0, 0.175, -0.008).scale.set(1.05, 0.95, 1.05)
    part(geo('wrapTop', () => new THREE.SphereGeometry(0.075, 14, 10)), wm, headPivot, 0.04, 0.275, -0.02).scale.set(1.3, 0.8, 1)
  }
  if (style === 'hijab') {
    const hm = mat(look.c2, 0.88, { side: THREE.DoubleSide })
    part(geo('hijab', () => lathe([[0.001, 0.25], [0.097, 0.237], [0.13, 0.16], [0.126, 0.07], [0.15, -0.03], [0.2, -0.12], [0.2, -0.15], [0.11, -0.12]], 26)), hm, headPivot, 0, 0, -0.012)
  }

  // arms: shaped upper arm and forearm, sleeves, and a real hand
  const shoulders = [], elbows = []
  const longSleeve = o === 'agbada' || o === 'kaftan' || (o === 'shirt' && look.frame !== 1)
  const wide = o === 'agbada' ? 1.8 : 1
  for (const s of [-1, 1]) {
    const sh = new THREE.Group()
    sh.position.set(s * 0.19 * sw, 0.47, 0)
    pelvis.add(sh)
    shoulders.push(sh)
    if (high) part(geo('shoulderCap', () => new THREE.SphereGeometry(0.055, 14, 10)), clothMat, sh, 0, 0.0, 0)
    part(UARM(), skin, sh, 0, 0, 0)
    const sl = part(UARM(), clothMat, sh, 0, 0, 0)
    sl.scale.set(1.1 * wide, longSleeve ? 1 : 0.5, 1.1 * wide)
    sl.position.y = longSleeve ? 0 : 0.0
    const el = new THREE.Group()
    el.position.set(0, -0.35, 0)
    sh.add(el)
    elbows.push(el)
    part(FARM(), skin, el, 0, 0, 0)
    if (longSleeve) part(FARM(), clothMat, el, 0, 0, 0).scale.set(1.12 * wide, 0.97, 1.12 * wide)
    buildHand(skin, el, s, high)
    sh.rotation.z = s * 0.06
  }

  // legs: shaped thigh and calf, knee, ankle, and real shoes
  const hips = [], knees = []
  const shorts = o === 'jersey'
  const dressLegs = o === 'ankara'
  const robeLegs = o === 'agbada'
  const shoeKind = o === 'ankara' ? 'sandal' : (o === 'tee' || o === 'jersey' ? 'sneaker' : 'dress')
  const shoeHex = OUTFIT_SHOES[o]
  for (const s of [-1, 1]) {
    const hp = new THREE.Group()
    hp.position.set(s * 0.085 * hw, -0.08, 0)
    pelvis.add(hp)
    hips.push(hp)
    const thighMat = dressLegs ? skin : pants
    const th = part(THIGH(), thighMat, hp, 0, 0, 0)
    if (shorts) { th.material = skin; part(THIGH(), pants, hp, 0, 0, 0).scale.set(1.08, 0.62, 1.08) }
    const kn = new THREE.Group()
    kn.position.set(0, -0.44 * k, 0)
    hp.add(kn)
    knees.push(kn)
    const shinMat = shorts || dressLegs ? skin : pants
    const sh = part(SHIN(), shinMat, kn, 0, 0, 0)
    if (high) part(geo('kneecap', () => new THREE.SphereGeometry(0.052, 12, 10)), shorts || dressLegs ? skin : pants, kn, 0, 0.005, 0.012)
    const shoe = buildShoe(shoeKind, shoeHex, skin, kn, high)
    if (robeLegs) { th.visible = false; sh.visible = false }
    void shoe
  }

  if (carry) {
    const basket = part(geo('basket', () => new THREE.CylinderGeometry(0.2, 0.15, 0.14, 14)), mat(carry, 0.9), headPivot, 0, 0.32, 0)
    basket.castShadow = true
  }

  root.scale.setScalar(look.height * 0.92) // 1.0 build is about 1.75 m tall
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
