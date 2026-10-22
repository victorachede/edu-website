import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { rng, dryGrass, concrete, asphalt, waterNormal, wood, corrugated } from '../lib/textures.js'
import { createBatch, pick } from '../lib/instanced.js'
import { Colliders } from '../lib/colliders.js'
import { makePerson, animatePerson } from '../lib/person.js'

const DECK_Y = 14
const LAND_Y = 13.5
const BED_Y = -7
const HALF = 394 // abutment to centre of the bridge
const SPANS = 16
const SPAN = (HALF * 2) / SPANS

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const riverHalf = (z) => 292 + 22 * Math.sin(z * 0.008) + 12 * Math.sin(z * 0.023 + 1.3)

function terrainY(x, z) {
  const u = Math.abs(x) - riverHalf(z)
  const bank = BED_Y + (LAND_Y - BED_Y) * smooth(-6, 78, u)
  const n = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.55 + Math.sin(x * 0.07 + z * 0.05) * 0.18
  const land = smooth(70, 130, u)
  return bank + n * (0.25 + land * 0.9)
}

export function createBridge({ renderer, sunDir }) {
  const r = rng(1932)
  const group = new THREE.Group()
  const colliders = new Colliders()

  // ── river bank terrain ──────────────────────────────────────────────────────
  const W = 1700, D = 1300, SX = 340, SZ = 260
  const geo = new THREE.PlaneGeometry(W, D, SX, SZ)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const y = terrainY(x, z)
    pos.setY(i, y)
    const n = (Math.sin(x * 0.31 + z * 0.17) + Math.sin(x * 0.11 - z * 0.23)) * 0.04
    if (y < 0.6) c.set('#7b6847')
    else if (y < 3) c.set('#a58a5c').lerp(new THREE.Color('#b8a070'), smooth(0.6, 3, y))
    else if (y < 9) c.set('#b8a070').lerp(new THREE.Color('#8a8442'), smooth(3, 9, y))
    else c.set('#85803f').lerp(new THREE.Color('#6d7236'), smooth(9, 14, y))
    c.offsetHSL(n * 0.3, 0, n)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const gtex = dryGrass([220, 160])
  gtex.anisotropy = 8
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: gtex, vertexColors: true, roughness: 1 }))
  terrain.receiveShadow = true
  group.add(terrain)

  // ── the River Benue ─────────────────────────────────────────────────────────
  const water = new Water(new THREE.PlaneGeometry(1900, 1500), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: waterNormal([1, 1]),
    sunDirection: sunDir.clone().normalize(),
    sunColor: 0xfff2d8,
    waterColor: 0x4f4a30, // silty brown-olive, as in the photographs
    distortionScale: 2.6,
    fog: true,
  })
  water.rotation.x = -Math.PI / 2
  water.position.y = 0
  water.material.uniforms.size.value = 6
  water.material.transparent = false
  group.add(water)

  // ── materials ───────────────────────────────────────────────────────────────
  const steel = new THREE.MeshStandardMaterial({ color: 0x8d8a82, roughness: 0.55, metalness: 0.7 })
  const steelPaint = new THREE.MeshStandardMaterial({ color: 0xa7a398, roughness: 0.6, metalness: 0.55 })
  const concreteMat = new THREE.MeshStandardMaterial({ map: concrete([3, 6]), roughness: 0.95 })
  const asphaltTex = asphalt([HALF / 3, 1])
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92 })
  const sleeperMat = new THREE.MeshStandardMaterial({ map: wood([1, 1], '#4b3a2c'), roughness: 0.95 })
  const railMat = new THREE.MeshStandardMaterial({ color: 0x6e5a4a, roughness: 0.45, metalness: 0.85 })
  const ballastMat = new THREE.MeshStandardMaterial({ color: 0x6c6862, roughness: 1 })

  // ── beams for the trusses ───────────────────────────────────────────────────
  const beams = createBatch(new THREE.BoxGeometry(1, 1, 1), steel, 20000)
  const up = new THREE.Vector3(1, 0, 0)
  const tmpQ = new THREE.Quaternion()
  const dir = new THREE.Vector3()
  const m4 = new THREE.Matrix4()
  const tcolor = new THREE.Color()
  function beam(a, b, t = 0.35, tint = 0xffffff) {
    if (beams.mesh.count >= beams.mesh.instanceMatrix.count) return
    dir.subVectors(b, a)
    const len = dir.length()
    tmpQ.setFromUnitVectors(up, dir.normalize())
    m4.compose(a.clone().add(b).multiplyScalar(0.5), tmpQ, new THREE.Vector3(len, t, t))
    beams.mesh.setMatrixAt(beams.mesh.count, m4)
    beams.mesh.setColorAt(beams.mesh.count, tcolor.set(tint))
    beams.mesh.count++
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z)

  function truss(x0, x1, z, tall) {
    const panels = 8
    const px = (x1 - x0) / panels
    const topY = (i) => {
      if (!tall) return DECK_Y + 6.2
      const k = i / panels
      return DECK_Y + 6.2 + 5.8 * Math.sin(k * Math.PI) // camelback curve
    }
    const tint = pick(r, [0xffffff, 0xf0ece2, 0xe2dccd])
    for (let i = 0; i <= panels; i++) {
      const x = x0 + i * px
      beam(V(x, DECK_Y, z), V(x, topY(i), z), 0.42, tint) // posts
      if (i < panels) {
        beam(V(x, topY(i), z), V(x + px, topY(i + 1), z), 0.5, tint) // top chord
        // Warren diagonals alternate direction
        if (i % 2 === 0) beam(V(x, DECK_Y, z), V(x + px, topY(i + 1), z), 0.3, tint)
        else beam(V(x, topY(i), z), V(x + px, DECK_Y, z), 0.3, tint)
      }
    }
    beam(V(x0, DECK_Y + 0.15, z), V(x1, DECK_Y + 0.15, z), 0.5, tint) // bottom chord
    if (tall) {
      for (let i = 1; i < panels; i++) {
        const x = x0 + i * px
        beam(V(x, topY(i), z - 5.6 * Math.sign(z) * 0), V(x, topY(i), -z), 0.28, tint) // top lateral
      }
    }
  }

  // ── piers: stadium-shaped concrete columns standing in the river ────────────
  const pierBody = new THREE.BoxGeometry(3.6, 1, 6.6)
  const pierCap = new THREE.CylinderGeometry(1.8, 1.8, 1, 18)
  const piers = createBatch(pierBody, concreteMat, 40)
  const pierEnds = createBatch(pierCap, concreteMat, 80)
  for (let i = 0; i <= SPANS; i++) {
    const x = -HALF + i * SPAN
    const base = terrainY(x, 0) - 1.5
    const h = DECK_Y - 0.9 - base
    piers.add(x, base + h / 2, 0, { sx: 1, sy: h, sz: 1 })
    for (const s of [-1, 1]) pierEnds.add(x, base + h / 2, s * 3.3, { sx: 1, sy: h, sz: 1 })
    // pier cap beneath the girders
    piers.add(x, DECK_Y - 0.95, 0, { sx: 1.5, sy: 0.7, sz: 1.5 })
    if (i > 0 && i < SPANS) colliders.box(x, 0, 0, 0)
  }
  piers.done(); pierEnds.done()
  group.add(piers.mesh, pierEnds.mesh)

  // ── deck ────────────────────────────────────────────────────────────────────
  const deckLen = HALF * 2 + 6
  const slab = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 1.0, 11.8), concreteMat)
  slab.position.set(0, DECK_Y - 0.5, 0)
  slab.castShadow = slab.receiveShadow = true
  group.add(slab)

  const road = new THREE.Mesh(new THREE.PlaneGeometry(deckLen, 4.6), roadMat)
  road.rotation.x = -Math.PI / 2
  road.position.set(0, DECK_Y + 0.011, -3.2)
  road.receiveShadow = true
  group.add(road)
  asphaltTex.repeat.set(deckLen / 22, 1)

  // rail bed, sleepers and rails
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.28, 3.6), ballastMat)
  ballast.position.set(0, DECK_Y + 0.14, 3.05)
  ballast.receiveShadow = true
  group.add(ballast)
  const sleepers = createBatch(new THREE.BoxGeometry(0.28, 0.14, 2.4), sleeperMat, 2000)
  for (let x = -HALF - 2; x <= HALF + 2; x += 0.62) sleepers.add(x, DECK_Y + 0.32, 3.05, {})
  sleepers.done()
  group.add(sleepers.mesh)
  for (const dz of [-0.53, 0.53]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.17, 0.1), railMat)
    rail.position.set(0, DECK_Y + 0.46, 3.05 + dz)
    rail.castShadow = true
    group.add(rail)
  }

  // trusses: a low through-truss on every span, tall camelback spans in the middle
  const tall = new Set([6, 7, 8, 9])
  for (let i = 0; i < SPANS; i++) {
    const x0 = -HALF + i * SPAN
    for (const z of [-5.6, 5.6]) truss(x0, x0 + SPAN, z, tall.has(i))
  }
  beams.done()
  group.add(beams.mesh)

  // top and bottom cross girders every span, and the hand rail
  const cross = createBatch(new THREE.BoxGeometry(0.4, 0.45, 11.4), steelPaint, SPANS * 9)
  for (let i = 0; i <= SPANS; i++) cross.add(-HALF + i * SPAN, DECK_Y - 0.25, 0, {})
  cross.done()
  group.add(cross.mesh)

  // lamp posts along the road side
  const lampPoles = createBatch(new THREE.CylinderGeometry(0.08, 0.1, 7.4, 8), steelPaint, 60)
  const lampArms = createBatch(new THREE.BoxGeometry(1.6, 0.1, 0.1), steelPaint, 60)
  const lampHeads = createBatch(new THREE.BoxGeometry(0.6, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xfff2cc, emissiveIntensity: 0.25 }), 60, { shadow: false })
  for (let x = -HALF + 12; x <= HALF - 12; x += SPAN / 2) {
    lampPoles.add(x, DECK_Y + 3.7, -5.3, {})
    lampArms.add(x, DECK_Y + 7.3, -4.5, { rz: 0 })
    lampHeads.add(x, DECK_Y + 7.18, -3.8, {})
  }
  for (const b of [lampPoles, lampArms, lampHeads]) { b.done(); group.add(b.mesh) }

  // ── approach roads and abutments ───────────────────────────────────────────
  for (const s of [-1, 1]) {
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(120, 7), roadMat)
    ramp.rotation.x = -Math.PI / 2
    ramp.position.set(s * (HALF + 60), LAND_Y + 0.03, -3.2)
    ramp.receiveShadow = true
    group.add(ramp)
    const abut = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 12), concreteMat)
    abut.position.set(s * (HALF + 5), DECK_Y - 1.4, 0)
    abut.castShadow = abut.receiveShadow = true
    group.add(abut)
  }

  // ── trees on the banks ──────────────────────────────────────────────────────
  const trunks = createBatch(new THREE.CylinderGeometry(0.25, 0.4, 1, 7), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }), 600)
  const leaves = createBatch(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), 3500)
  function tree(x, z, s) {
    const y = terrainY(x, z)
    const th = 3.2 * s
    trunks.add(x, y + th / 2, z, { sx: s, sy: th, sz: s })
    for (let i = 0; i < 6; i++) {
      const a = r() * 6.28, rad = r() * 2.2 * s
      leaves.add(x + Math.cos(a) * rad, y + th + 1 * s + r() * 2 * s, z + Math.sin(a) * rad, {
        sx: (1.6 + r() * 1.3) * s, sy: (1.2 + r() * 0.8) * s, sz: (1.6 + r() * 1.3) * s,
        color: pick(r, [0x3d5a24, 0x4a6a2a, 0x35501f, 0x56752f, 0x6a7a30]),
      })
    }
  }
  for (let i = 0; i < 520; i++) {
    const side = r() > 0.5 ? 1 : -1
    const z = (r() - 0.5) * 900
    const x = side * (riverHalf(z) + 55 + Math.pow(r(), 1.5) * 260)
    if (Math.abs(z) < 22) continue // keep the approach road clear
    tree(x, z, 0.8 + r() * 0.9)
  }
  for (const b of [trunks, leaves]) { b.done(); group.add(b.mesh) }

  // ── the town on both banks: rooftops among the trees ───────────────────────
  const houses = createBatch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }), 1400)
  const hroofs = createBatch(new THREE.BoxGeometry(1, 0.14, 1), new THREE.MeshStandardMaterial({ metalness: 0.45, roughness: 0.6 }), 1400)
  for (let i = 0; i < 1100; i++) {
    const side = r() > 0.5 ? 1 : -1
    const z = (r() - 0.5) * 1000
    const x = side * (riverHalf(z) + 90 + r() * 330)
    if (Math.abs(z) < 34) continue
    const y = terrainY(x, z)
    const w = 7 + r() * 7, d = 6 + r() * 6, h = 3 + r() * 1.8
    const yaw = Math.round(r() * 2) * 1.5708 + (r() - 0.5) * 0.15
    houses.add(x, y + h / 2, z, { ry: yaw, sx: w, sy: h, sz: d, color: pick(r, [0xe3d9c3, 0xd2c3a4, 0xbfae8f, 0xd9cfb9, 0xa8a095, 0xe8e0cf]) })
    hroofs.add(x, y + h + 0.1, z, { ry: yaw, sx: w + 0.7, sy: 1, sz: d + 0.7, color: pick(r, [0xb4553a, 0xa3482e, 0x7f8d96, 0xc9ccd0, 0x4b78b4, 0x9a5a3a, 0xe9ebed]) })
  }
  for (const b of [houses, hroofs]) { b.done(); group.add(b.mesh) }

  // ── dugout canoes on the water ──────────────────────────────────────────────
  const canoeMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 })
  const canoes = []
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group()
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 6 + r() * 2, 4, 10), canoeMat)
    hull.rotation.z = Math.PI / 2
    hull.scale.set(1, 1, 0.55)
    hull.castShadow = true
    c.add(hull)
    const p = makePerson(r, { female: false })
    p.position.set(1.3, 0.12, 0)
    p.rotation.y = Math.PI / 2
    p.traverse((o) => { if (o.isMesh) o.castShadow = true })
    c.add(p)
    c.userData = { x: (r() - 0.5) * 520, z: (r() - 0.5) * 360, yaw: r() * 6.28, sp: 0.2 + r() * 0.35, ph: r() * 6.28, person: p }
    canoes.push(c)
    group.add(c)
  }

  // ── people on the bridge walkway ────────────────────────────────────────────
  const walkers = []
  for (let i = 0; i < 18; i++) {
    const p = makePerson(r, { carry: r() < 0.2 ? 0xe9dfc8 : undefined })
    p.traverse((o) => { if (o.isMesh) o.castShadow = true })
    group.add(p)
    const z = -5.0 + r() * 0.5
    const x0 = (r() - 0.5) * 700
    walkers.push({ p, z, x0, span: 80 + r() * 220, sp: 0.8 + r() * 0.7, t: r(), dir: r() > 0.5 ? 1 : -1 })
  }

  // fixed lanes of parked cars at the north abutment
  void renderer

  return {
    id: 'bridge',
    group,
    info: {
      title: 'Makurdi Old Bridge',
      text: 'The 1932 rail and road bridge over the River Benue: about 790 m of steel truss on concrete piers, built by Sir William Arrol & Co. Modelled from reference photographs.',
    },
    spawn: { x: -HALF - 40, z: -3.4, yaw: -Math.PI / 2 },
    heightAt(x, z) {
      if (Math.abs(x) <= HALF + 4 && Math.abs(z) <= 5.9) return DECK_Y
      return terrainY(x, z)
    },
    isBlocked(x, z) {
      // keep walkers on the deck while over the river, and out of the water
      const onDeckZone = Math.abs(x) <= HALF + 4
      if (onDeckZone && Math.abs(z) > 5.4 && terrainY(x, z) < 8) return true
      return terrainY(x, z) < 0.3 && !(onDeckZone && Math.abs(z) <= 5.9)
    },
    colliders,
    fogDensity: 0.0017,
    sunAzimuth: 215,
    bounds: { x0: -800, x1: 800, z0: -600, z1: 600 },
    update(dt, t) {
      water.material.uniforms.time.value += dt * 0.35
      for (const c of canoes) {
        const u = c.userData
        u.z += Math.cos(u.yaw) * u.sp * dt
        u.x += Math.sin(u.yaw) * u.sp * dt
        if (Math.abs(u.x) > 270) u.yaw = Math.PI - u.yaw
        if (Math.abs(u.z) > 380) u.yaw = -u.yaw
        c.position.set(u.x, 0.1 + Math.sin(t * 1.3 + u.ph) * 0.05, u.z)
        c.rotation.set(Math.sin(t * 1.1 + u.ph) * 0.03, u.yaw - Math.PI / 2, Math.sin(t * 0.9 + u.ph) * 0.03)
      }
      for (const w of walkers) {
        w.t += (dt * w.sp * w.dir) / w.span
        if (w.t > 1) { w.t = 1; w.dir = -1 }
        if (w.t < 0) { w.t = 0; w.dir = 1 }
        const x = THREE.MathUtils.clamp(w.x0 - w.span / 2 + w.t * w.span, -HALF + 4, HALF - 4)
        w.p.position.set(x, DECK_Y + 0.02, w.z)
        w.p.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2
        animatePerson(w.p, w.sp, t)
      }
    },
  }
}
