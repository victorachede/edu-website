import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { rng, laterite, concrete, asphalt, waterNormal, corrugated, tarp } from '../lib/textures.js'
import { createBatch, pick } from '../lib/instanced.js'
import { Colliders } from '../lib/colliders.js'
import { makePerson, animatePerson } from '../lib/person.js'

// From the new Benue bridge (A3, 1978) south to Wurukum Roundabout, Makurdi.
// Real distance from the bridge's south abutment to the roundabout is about 800 m; this zone
// is 700 m so the walk stays short. North is -z. The roundabout is at the origin.
// Layout from the OpenStreetMap overview in docs/reference; looks from the reference photos.

const DECK_Y = 9
const BED_Y = -7
const RAMP_START = -300 // road starts climbing to the bridge here
const RAMP_END = -540 // deck level from here north
const SHORE = -560 // river edge
const ROAD_HALF = 8.5 // dual carriageway: two 7 m carriageways with a 3 m median
const CROSS_HALF = 7
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const roadY = (z) => DECK_Y * smooth(RAMP_START, RAMP_END, z)

function terrainY(x, z) {
  const base = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 0.18
  const river = smooth(SHORE + 40, SHORE - 30, z) // 0 on land, 1 in the river
  const ground = base + (BED_Y - base) * river
  const ax = Math.abs(x)
  if (ax < ROAD_HALF + 4 && z < RAMP_START + 30) return roadY(z) // road bed / embankment top
  if (z < RAMP_START + 30 && z > SHORE - 30) {
    // embankment slopes down from the road to the ground
    const t = smooth(ROAD_HALF + 4, ROAD_HALF + 4 + roadY(z) * 1.8 + 3, ax)
    return roadY(z) + (ground - roadY(z)) * t
  }
  return ground
}
const onDeck = (x, z) => z < SHORE && Math.abs(x) < ROAD_HALF + 3

export function createWurukum({ renderer, sunDir }) {
  const r = rng(1978)
  const group = new THREE.Group()
  const colliders = new Colliders()

  // ── ground ──────────────────────────────────────────────────────────────────
  const W = 860, D = 1180
  const geo = new THREE.PlaneGeometry(W, D, 172, 236)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, 0, -D / 2 + 380)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const y = terrainY(x, z)
    pos.setY(i, y)
    const n = (Math.sin(x * 0.31 + z * 0.17) + Math.sin(x * 0.11 - z * 0.23)) * 0.03
    if (y < 0.4 && z < SHORE + 20) c.set('#7b6847')
    else if (z > 40 && Math.abs(x) < 260) c.set('#b3835a').lerp(new THREE.Color('#9d7550'), smooth(40, 300, z)) // trodden market-side earth
    else c.set('#a58a5c').lerp(new THREE.Color('#8f8a48'), smooth(-100, -400, z)) // greener towards the river
    c.offsetHSL(n * 0.3, 0, n)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const tex = laterite([180, 220]); tex.anisotropy = 8
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 1 }))
  terrain.receiveShadow = true
  group.add(terrain)

  // ── the River Benue ─────────────────────────────────────────────────────────
  const water = new Water(new THREE.PlaneGeometry(1400, 700), {
    textureWidth: 512, textureHeight: 512, waterNormals: waterNormal([1, 1]),
    sunDirection: sunDir.clone().normalize(), sunColor: 0xfff2d8, waterColor: 0x4f4a30, distortionScale: 2.6, fog: true,
  })
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0, -800)
  water.material.uniforms.size.value = 6
  group.add(water)

  // ── roads ───────────────────────────────────────────────────────────────────
  const asphaltTex = asphalt([2, 90])
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92 })
  const concreteMat = new THREE.MeshStandardMaterial({ map: concrete([2, 6]), roughness: 0.95 })
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.7 })
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.7 })

  // A3 as a ribbon that follows roadY along the ramp
  const roadLen = 1140
  const ribbon = (halfW, lift, material, uvScale = 1) => {
    const g = new THREE.PlaneGeometry(halfW * 2, roadLen, 1, 190)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, -roadLen / 2 + 380)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setY(i, roadY(p.getZ(i)) + lift)
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, material)
    m.receiveShadow = true
    return m
  }
  group.add(ribbon(ROAD_HALF, 0.06, roadMat))
  // median
  const median = ribbon(1.5, 0.22, new THREE.MeshStandardMaterial({ map: concrete([1, 380]), roughness: 0.95 }))
  group.add(median)
  // cross road (Iorchia Ayu Road west, Makurdi-Gboko Road east), flat at ground level
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(W, CROSS_HALF * 2), new THREE.MeshStandardMaterial({ map: asphalt([40, 1]), roughness: 0.92 }))
  cross.rotation.x = -Math.PI / 2
  cross.position.set(0, 0.07, 0)
  cross.receiveShadow = true
  group.add(cross)
  // roundabout ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(10, 24, 64), new THREE.MeshStandardMaterial({ map: asphalt([3, 3]), roughness: 0.92 }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.09
  ring.receiveShadow = true
  group.add(ring)
  // central island: raised kerb, grass, and the Food Basket monument
  const kerb = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.4, 0.5, 48), concreteMat)
  kerb.position.y = 0.3; kerb.castShadow = kerb.receiveShadow = true
  group.add(kerb)
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 9.6, 0.52, 48), new THREE.MeshStandardMaterial({ color: 0x6f7a3a, roughness: 1 }))
  grass.position.y = 0.32; grass.receiveShadow = true
  group.add(grass)
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.6, 24), concreteMat)
  plinth.position.y = 1.2; plinth.castShadow = true
  group.add(plinth)
  // the woven basket sculpture ("Food Basket of the Nation")
  const basket = new THREE.Mesh(
    new THREE.LatheGeometry([[2.1, 0], [2.6, 0.9], [3.1, 2.1], [3.3, 3.0], [3.2, 3.2], [2.9, 3.1]].map(([x, y]) => new THREE.Vector2(x, y)), 28),
    new THREE.MeshStandardMaterial({ color: 0xa8742c, roughness: 0.9, side: THREE.DoubleSide }),
  )
  basket.position.y = 2.0; basket.castShadow = true
  group.add(basket)
  const produce = createBatch(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 90)
  const fruit = [0xd7ac2a, 0xc2561f, 0x6c8a2e, 0xe9d28a, 0x8b3a1e]
  for (let i = 0; i < 70; i++) {
    const a = r() * 6.28, rad = Math.sqrt(r()) * 2.7
    produce.add(Math.cos(a) * rad, 5.0 + (1 - rad / 2.7) * 0.7 + r() * 0.3, Math.sin(a) * rad, { sx: 0.5 + r() * 0.5, color: pick(r, fruit) })
  }
  produce.done(); group.add(produce.mesh)
  colliders.box(0, 0, 8, 8)

  // lane marks and edge lines along the A3, dashes follow the ramp
  const dash = createBatch(new THREE.BoxGeometry(0.18, 0.04, 3), paint, 800, { shadow: false })
  for (let z = -750; z < 355; z += 8) {
    if (Math.abs(z) < 28) continue
    for (const x of [-3.7, 3.7]) dash.add(x, roadY(z) + 0.1, z)
  }
  dash.done(); group.add(dash.mesh)
  const edge = createBatch(new THREE.BoxGeometry(0.2, 0.04, 8), paint, 400, { shadow: false })
  for (let z = -750; z < 355; z += 8) {
    if (Math.abs(z) < 26) continue
    for (const x of [-ROAD_HALF + 0.3, ROAD_HALF - 0.3]) edge.add(x, roadY(z) + 0.1, z)
  }
  edge.done(); group.add(edge.mesh)
  const centre = createBatch(new THREE.BoxGeometry(0.16, 0.04, 8), yellow, 300, { shadow: false })
  for (let x = -W / 2; x < W / 2; x += 8) { if (Math.abs(x) < 26) continue; centre.add(x, 0.11, 0) }
  centre.done(); group.add(centre.mesh)

  // ── the new bridge ──────────────────────────────────────────────────────────
  // flat concrete deck on evenly spaced piers, no truss, as in the photographs
  const deckLen = 400
  const deck = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 4, 1.4, deckLen), concreteMat)
  deck.position.set(0, DECK_Y - 0.8, SHORE - deckLen / 2 + 20)
  deck.castShadow = deck.receiveShadow = true
  group.add(deck)
  const piers = createBatch(new THREE.BoxGeometry(1, 1, 1), concreteMat, 80)
  for (let z = SHORE - 10; z > SHORE - deckLen + 20; z -= 40) {
    for (const x of [-9, 9]) piers.add(x, (DECK_Y + BED_Y) / 2 - 0.4, z, { sx: 3.2, sy: DECK_Y - BED_Y - 1.2, sz: 3.2 })
    piers.add(0, DECK_Y - 1.9, z, { sx: 24, sy: 1.5, sz: 3.4 }) // cap beam
  }
  piers.done(); group.add(piers.mesh)
  const rail = createBatch(new THREE.BoxGeometry(0.5, 1.1, 1), concreteMat, 800)
  for (let z = SHORE + 20; z > SHORE - deckLen + 20; z -= 1) { for (const x of [-ROAD_HALF - 1.6, ROAD_HALF + 1.6]) rail.add(x, DECK_Y + 0.45, z, { sz: 1.0 }) }
  rail.done(); group.add(rail.mesh)

  // ── materials for buildings ─────────────────────────────────────────────────
  const wallCols = [0xd9cdb4, 0xcfc2a6, 0xe4d9c0, 0xbfae8e, 0xc9a98a, 0xd8d2c8, 0xb8c0b0, 0xe8cfa0, 0xc7b8a2, 0xa89880]
  const roofTints = [0x8d8f90, 0x9a6a4a, 0x7f6554, 0xa05a3c, 0x6f7377, 0x8a5a3a]
  const walls = createBatch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: concrete([1, 1]), roughness: 0.95 }), 700)
  const roofGeo = new THREE.ConeGeometry(0.72, 1, 4); roofGeo.rotateY(Math.PI / 4)
  const roofs = createBatch(roofGeo, new THREE.MeshStandardMaterial({ ...corrugated('#8d8f90', 0.5, 7), roughness: 0.7, metalness: 0.35 }), 700)
  const doors = createBatch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3b4a5a, roughness: 0.6 }), 1400, { shadow: false })

  function building(cx, cz, w, d, h, face) {
    walls.add(cx, h / 2, cz, { sx: w, sy: h, sz: d, color: pick(r, wallCols) })
    const rh = 0.9 + r() * 1.5
    roofs.add(cx, h + rh / 2, cz, { sx: w * 1.12, sy: rh, sz: d * 1.12, color: pick(r, roofTints) })
    colliders.box(cx, cz, w, d)
    // shop fronts / doors on the side facing the road
    const n = Math.max(1, Math.floor((face === 'x' ? d : w) / 3.2))
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n - 0.5) * (face === 'x' ? d : w) * 0.9
      if (face === 'x') doors.add(cx + (cx > 0 ? -w / 2 : w / 2) * 1.0 + (cx > 0 ? -0.05 : 0.05), 1.05, cz + t, { sx: 0.12, sy: 2.1, sz: 1.5, color: pick(r, [0x3b4a5a, 0x7a2f20, 0x2e5a3a, 0x8a6a20]) })
      else doors.add(cx + t, 1.05, cz + (cz > 0 ? -d / 2 : d / 2), { sx: 1.5, sy: 2.1, sz: 0.12, color: pick(r, [0x3b4a5a, 0x7a2f20, 0x2e5a3a, 0x8a6a20]) })
    }
  }

  // frontage along the A3, both sides, leaving gaps for side streets and the roundabout
  const clearZ = (z) => Math.abs(z) < 44 || (z > RAMP_START - 20 && z < RAMP_START + 20 && false)
  for (const side of [-1, 1]) {
    for (let z = -270; z < 340; ) {
      const d = 9 + r() * 12
      if (clearZ(z + d / 2) || Math.abs(z + d / 2) < 40) { z += 12; continue }
      if (r() < 0.12) { z += d + 10; continue } // gap: side street
      const w = 8 + r() * 10
      const dense = z > 0
      const h = (dense ? 3.2 : 3.4) + r() * (dense ? 2.4 : 5.5)
      const gap = ROAD_HALF + 6.5 + (dense ? 0 : r() * 4)
      building(side * (gap + w / 2), z + d / 2, w, d, h, 'x')
      if (r() < 0.55) building(side * (gap + w + 6 + (r() * 6) + 6), z + d / 2 + r() * 4, 7 + r() * 8, 8 + r() * 8, 3 + r() * 3.5, 'x')
      z += d + 2.5 + r() * 3
    }
  }
  // along the cross road: shops west (Iorchia Ayu Rd) and east (Makurdi-Gboko Rd)
  for (const side of [-1, 1]) {
    for (let x = 40; x < 400; ) {
      const w = 8 + r() * 11
      for (const zs of [-1, 1]) {
        if (r() < 0.15) continue
        const d = 7 + r() * 8
        building(side * (x + w / 2), zs * (CROSS_HALF + 5.5 + d / 2), w, d, 3.2 + r() * (zs > 0 ? 2.4 : 4.2), 'z')
      }
      x += w + 2.5 + r() * 3
    }
  }
  walls.done(); roofs.done(); doors.done()
  group.add(walls.mesh, roofs.mesh, doors.mesh)

  // ── market-side stalls south-east of the roundabout ─────────────────────────
  const umb = createBatch(new THREE.ConeGeometry(1.6, 0.7, 8), new THREE.MeshStandardMaterial({ map: tarp('#ffffff'), roughness: 0.85, side: THREE.DoubleSide }), 400)
  const poles = createBatch(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x555555 }), 400, { shadow: false })
  const tables = createBatch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.9 }), 400)
  const stallCols = [0xd63d0a, 0x2e8b57, 0xe0b020, 0x3a78c2, 0xb03a8a, 0xe8e0d0, 0xcf5a2a]
  for (let gx = 56; gx < 170; gx += 5.5) {
    for (let gz = 36; gz < 120; gz += 5.5) {
      if (r() < 0.22) continue
      const x = gx + (r() - 0.5) * 1.6, z = gz + (r() - 0.5) * 1.6
      umb.add(x, 2.5, z, { color: pick(r, stallCols), sx: 0.9 + r() * 0.5, sy: 1 })
      poles.add(x, 1.2, z)
      tables.add(x, 0.55, z, { sx: 2.2, sy: 0.9, sz: 1.4, color: pick(r, [0x8a6a40, 0x6a8a4a, 0xa05a3c]) })
    }
  }
  umb.done(); poles.done(); tables.done()
  group.add(umb.mesh, poles.mesh, tables.mesh)

  // ── Wurukum flyover works beside the roundabout ─────────────────────────────
  const flyPiers = createBatch(new THREE.BoxGeometry(1, 1, 1), concreteMat, 60)
  const cones = createBatch(new THREE.ConeGeometry(0.28, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.7 }), 120, { shadow: false })
  for (const dz of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z = dz * (58 + k * 26)
      for (const x of [-4.6, 4.6]) { flyPiers.add(x, 3.4, z, { sx: 1.9, sy: 6.8, sz: 1.9 }); colliders.box(x, z, 2.2, 2.2) }
      flyPiers.add(0, 7.3, z, { sx: 15, sy: 1.1, sz: 3.2 }) // hammerhead cap
      if (k < 2) flyPiers.add(0, 7.55 + (dz > 0 ? 0 : 0), z + dz * 13, { sx: 11, sy: 0.9, sz: 22 }) // placed deck segments
      for (let i = 0; i < 6; i++) cones.add(-ROAD_HALF + 1 + i * 3.2, 0.45, z - 3)
    }
  }
  flyPiers.done(); cones.done(); group.add(flyPiers.mesh, cones.mesh)
  // a yellow crane
  const crane = new THREE.Group()
  const yel = new THREE.MeshStandardMaterial({ color: 0xe5b81c, roughness: 0.6 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 6), yel); body.position.y = 1.4; crane.add(body)
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 16), yel); boom.position.set(0, 6.5, -4); boom.rotation.x = 0.7; crane.add(boom)
  crane.position.set(16, 0, 84); crane.rotation.y = 0.5
  crane.traverse((o) => { if (o.isMesh) o.castShadow = true })
  group.add(crane)

  // ── trees, lamps ────────────────────────────────────────────────────────────
  const trunk = createBatch(new THREE.CylinderGeometry(0.22, 0.34, 1, 6), new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 1 }), 400)
  const crown = createBatch(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x4d6a2c, roughness: 1 }), 400)
  const tcols = [0x4d6a2c, 0x5a7a30, 0x3f5a28, 0x6a8a3a]
  for (let i = 0; i < 260; i++) {
    const side = r() < 0.5 ? -1 : 1
    const x = side * (ROAD_HALF + 4 + r() * 90)
    const z = -480 + r() * 800
    if (Math.abs(z) < 40 && Math.abs(x) < 60) continue
    if (x > 45 && x < 180 && z > 25 && z < 130) continue // stall area
    const y = terrainY(x, z)
    if (y < 0.4 && z < SHORE + 20) continue
    const h = 4 + r() * 6
    trunk.add(x, y + h * 0.3, z, { sx: 1, sy: h * 0.6, sz: 1 })
    crown.add(x, y + h * 0.75, z, { sx: 2.2 + r() * 2, sy: 1.8 + r() * 1.6, sz: 2.2 + r() * 2, color: pick(r, tcols) })
  }
  trunk.done(); crown.done(); group.add(trunk.mesh, crown.mesh)
  const lampPole = createBatch(new THREE.CylinderGeometry(0.1, 0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b6f73, metalness: 0.6, roughness: 0.5 }), 200, { receive: false })
  const lampHead = createBatch(new THREE.BoxGeometry(1.6, 0.18, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a3c3e }), 200, { shadow: false })
  for (let z = -740; z < 350; z += 40) {
    if (Math.abs(z) < 34) continue
    lampPole.add(0, roadY(z) + 4.2, z)
    lampHead.add(0, roadY(z) + 8.1, z)
  }
  lampPole.done(); lampHead.done(); group.add(lampPole.mesh, lampHead.mesh)

  // ── traffic and people ──────────────────────────────────────────────────────
  const vehicles = []
  const carBody = new THREE.BoxGeometry(1.9, 0.8, 4.2)
  const cabin = new THREE.BoxGeometry(1.6, 0.7, 2.2)
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10); wheelGeo.rotateZ(Math.PI / 2)
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
  function car(color, kind) {
    const g = new THREE.Group()
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.4 })
    const b = new THREE.Mesh(kind === 'keke' ? new THREE.BoxGeometry(1.3, 1.1, 2.4) : carBody, m); b.position.y = kind === 'keke' ? 0.85 : 0.7; g.add(b)
    if (kind !== 'keke') { const cb = new THREE.Mesh(cabin, new THREE.MeshStandardMaterial({ color: 0x28323a, roughness: 0.2, metalness: 0.6 })); cb.position.set(0, 1.35, -0.2); g.add(cb) }
    else { const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 2.0), new THREE.MeshStandardMaterial({ color: 0x1f6b3a })); top.position.y = 1.65; g.add(top) }
    for (const [x, z] of kind === 'keke' ? [[0, 1], [-0.6, -0.9], [0.6, -0.9]] : [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) { const w = new THREE.Mesh(wheelGeo, dark); w.position.set(x, 0.34, z); g.add(w) }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    return g
  }
  const carCols = [0xe8e8e8, 0x1c2a44, 0xa83228, 0x2a2a2a, 0xc9c2b0, 0x3a5a7a, 0xd9b030]
  for (let i = 0; i < 26; i++) {
    const lane = [-4, -2.6, 2.6, 4][i % 4]
    const kind = r() < 0.35 ? 'keke' : 'car'
    const v = car(kind === 'keke' ? 0xe5b81c : pick(r, carCols), kind)
    const z0 = -700 + r() * 1040
    vehicles.push({ v, lane, z: z0, sp: (lane < 0 ? 1 : -1) * (5 + r() * 5) * (kind === 'keke' ? 0.7 : 1), kind })
    group.add(v)
  }
  const walkers = []
  for (let i = 0; i < 44; i++) {
    const p = makePerson(r, { female: r() < 0.5, carry: r() < 0.2 ? 0xe9dfc8 : undefined })
    const nearMarket = i < 26
    const x = nearMarket ? 30 + r() * 120 : (r() < 0.5 ? -1 : 1) * (ROAD_HALF + 3 + r() * 3)
    const z0 = nearMarket ? 30 + r() * 90 : -260 + r() * 540
    walkers.push({ p, x, z: z0, base: z0, sp: 0.8 + r() * 0.9, dir: r() < 0.5 ? 1 : -1, span: nearMarket ? 18 + r() * 20 : 120 + r() * 160, nearMarket, t: r() })
    group.add(p)
  }

  return {
    id: 'wurukum',
    group,
    info: {
      title: 'New Bridge to Wurukum Roundabout',
      text: 'The Benue bridge (1978) and the A3 running south to Wurukum Roundabout, with the Food Basket monument, the flyover works and the market side beyond. Layout from OpenStreetMap, shapes from reference photographs.',
    },
    spawn: { x: 0, z: -690, yaw: Math.PI },
    heightAt(x, z) { return onDeck(x, z) || (Math.abs(x) < ROAD_HALF + 4 && z < RAMP_START + 30) ? roadY(z) : terrainY(x, z) },
    isBlocked(x, z) {
      if (z < SHORE && z > SHORE - 410 && Math.abs(x) > ROAD_HALF + 1.2) return true // parapet
      return terrainY(x, z) < 0.3 && z < SHORE + 25 && !onDeck(x, z)
    },
    colliders,
    fogDensity: 0.0019,
    sunAzimuth: 215,
    bounds: { x0: -420, x1: 420, z0: -795, z1: 360 },
    update(dt, t) {
      water.material.uniforms.time.value += dt * 0.35
      for (const v of vehicles) {
        v.z += v.sp * dt
        if (v.z > 355) v.z = -745
        if (v.z < -745) v.z = 355
        // slow through the roundabout ring
        v.v.position.set(v.lane, roadY(v.z) + 0.08, v.z)
        v.v.rotation.y = v.sp > 0 ? 0 : Math.PI
      }
      for (const w of walkers) {
        w.t += (dt * w.sp * w.dir) / w.span
        if (w.t > 1) { w.t = 1; w.dir = -1 }
        if (w.t < 0) { w.t = 0; w.dir = 1 }
        const z = w.base - w.span / 2 + w.t * w.span
        const x = w.x
        w.p.position.set(x, this.heightAt(x, z) + 0.02, z)
        w.p.rotation.y = w.dir > 0 ? Math.PI : 0
        animatePerson(w.p, w.sp, t)
      }
    },
  }
}
