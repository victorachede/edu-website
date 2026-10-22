import * as THREE from 'three'
import { rng, laterite, corrugated, wood, concrete } from '../lib/textures.js'
import { createBatch, pick } from '../lib/instanced.js'
import { Colliders } from '../lib/colliders.js'
import { makePerson, animatePerson } from '../lib/person.js'

const ROOFS = [0xffffff, 0xd9d4cc, 0xcfa389, 0xb9c3cc, 0xa9c4a8, 0xe2c9b0, 0xc2907a]
const WALL = [0xffffff, 0xcbc5bb, 0xb98d70, 0xa7b0b6]

function signTexture(text, sub) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const x = c.getContext('2d')
  x.fillStyle = '#0f5a35'
  x.fillRect(0, 0, 1024, 256)
  x.strokeStyle = '#f2e6b8'
  x.lineWidth = 8
  x.strokeRect(14, 14, 996, 228)
  x.fillStyle = '#fff6d6'
  x.textAlign = 'center'
  x.font = '800 104px Inter, Arial, sans-serif'
  x.fillText(text, 512, 138)
  x.font = '600 38px Inter, Arial, sans-serif'
  x.fillStyle = '#cfe9d6'
  x.fillText(sub, 512, 206)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function makeCar(color, r) {
  const g = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.5 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b242b, roughness: 0.15, metalness: 0.8 })
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 })
  const low = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.75, 1.75), body)
  low.position.y = 0.72
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.62, 1.58), glass)
  cab.position.set(-0.15, 1.38, 0)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 1.56), body)
  roof.position.set(-0.15, 1.72, 0)
  for (const m of [low, cab, roof]) { m.castShadow = true; m.receiveShadow = true; g.add(m) }
  for (const sx of [-1.4, 1.4]) for (const sz of [-0.85, 0.85]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16), tyre)
    w.rotation.x = Math.PI / 2
    w.position.set(sx, 0.33, sz)
    w.castShadow = true
    g.add(w)
  }
  g.userData.size = [4.4, 1.9]
  return g
}

export function createMarket({ renderer }) {
  const r = rng(2026)
  const group = new THREE.Group()
  const colliders = new Colliders()
  const maxAniso = renderer.capabilities.getMaxAnisotropy()

  // ── ground: red laterite, packed hard and scattered with litter ──────────────
  const groundTex = laterite([90, 90])
  groundTex.anisotropy = maxAniso
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  group.add(ground)

  // ── materials ───────────────────────────────────────────────────────────────
  const zinc = corrugated('#9a9c9d', 0.55, 3)
  zinc.map.repeat.set(2, 1)
  zinc.normalMap.repeat.set(2, 1)
  const roofMat = new THREE.MeshStandardMaterial({ ...zinc, roughness: 0.62, metalness: 0.55, side: THREE.DoubleSide, normalScale: new THREE.Vector2(1.1, 1.1) })
  const wallZinc = corrugated('#8a8683', 0.9, 7)
  const wallMat = new THREE.MeshStandardMaterial({ ...wallZinc, roughness: 0.75, metalness: 0.4, side: THREE.DoubleSide })
  const woodMat = new THREE.MeshStandardMaterial({ map: wood([1, 3]), roughness: 0.9 })
  const sackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })
  const fruitMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 })

  const LANE_X = 4.4 // half-width of the main lane
  const ROWS = 31
  const ROW_STEP = 3.7
  const STALL_W = 3.2
  const Z0 = -ROWS * ROW_STEP / 2

  const cap = 900
  const posts = createBatch(new THREE.CylinderGeometry(0.045, 0.055, 1, 6), woodMat, cap * 4)
  const roofs = createBatch(new THREE.PlaneGeometry(1, 1, 1, 1), roofMat, cap)
  const walls = createBatch(new THREE.PlaneGeometry(1, 1, 1, 1), wallMat, cap)
  const counters = createBatch(new THREE.BoxGeometry(1, 1, 1), woodMat, cap)
  const sacks = createBatch(new THREE.BoxGeometry(1, 1, 1), sackMat, cap * 5)
  const fruit = createBatch(new THREE.SphereGeometry(0.06, 8, 6), fruitMat, 14000)
  const plantain = createBatch(new THREE.CapsuleGeometry(0.035, 0.22, 3, 6), fruitMat, 6000)

  const stalls = []
  function addStall(cx, cz, facing, jitter) {
    const w = STALL_W - 0.25 + r() * 0.3
    const d = 2.7 + r() * 0.3
    const h = 2.25 + r() * 0.35
    const yaw = facing // 0 = opens toward +z, π = toward -z, ±π/2 sideways
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const loc = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c]

    // four posts (front ones taller than back so the roof slopes forward-down)
    for (const [lx, lz, hh] of [[-w / 2, d / 2, h - 0.35], [w / 2, d / 2, h - 0.35], [-w / 2, -d / 2, h], [w / 2, -d / 2, h]]) {
      const [px, pz] = loc(lx, lz)
      posts.add(px, hh / 2, pz, { sx: 1, sy: hh, sz: 1, ry: yaw, rz: (r() - 0.5) * 0.04, color: pick(r, [0xffffff, 0xd8c3a4, 0xb08a64]) })
    }
    // sloped roof sheet
    const [rx, rz] = loc(0, 0.1)
    const rm = r() < 0.2 ? 0.88 : 1
    roofs.add(rx, h - 0.17, rz, { rx: -Math.PI / 2 + 0.13, ry: yaw, rz: 0, sx: (w + 0.5) * rm, sy: d + 0.6, sz: 1, color: pick(r, ROOFS) })
    // rear wall sheet
    if (r() < 0.78) {
      const [wx, wz] = loc(0, -d / 2)
      walls.add(wx, h / 2 - 0.1, wz, { ry: yaw, sx: w, sy: h - 0.2, sz: 1, color: pick(r, WALL) })
    }
    // counter
    const [kx, kz] = loc(0, d / 2 - 0.45)
    counters.add(kx, 0.45, kz, { ry: yaw, sx: w - 0.2, sy: 0.9, sz: 0.7 })

    // goods
    const kind = r()
    const n = (lx, lz) => loc(lx, lz)
    if (kind < 0.28) {
      // tomatoes & peppers piled on the counter
      for (let b = 0; b < 3; b++) {
        const [bx, bz] = n(-w / 2 + 0.5 + b * ((w - 1) / 2), d / 2 - 0.45)
        const col = pick(r, [0xd22a1a, 0xc42311, 0xe0381f, 0xb81c10])
        for (let i = 0; i < 48; i++) {
          const a = r() * 6.28, rad = Math.sqrt(r()) * 0.34, hgt = 0.92 + (1 - rad / 0.34) * 0.2
          fruit.add(bx + Math.cos(a) * rad, hgt, bz + Math.sin(a) * rad, { sx: 1 + r() * 0.2, sy: 0.9 + r() * 0.2, sz: 1 + r() * 0.2, color: col })
        }
      }
    } else if (kind < 0.46) {
      // plantain and bananas stacked on the ground
      const [bx, bz] = n(0, d / 2 + 0.7)
      for (let i = 0; i < 110; i++) {
        const lx = (r() - 0.5) * 2.2, lz = (r() - 0.5) * 1.1
        const [px, pz] = n(lx + 0, d / 2 + 0.7 + lz)
        plantain.add(px, 0.08 + r() * 0.34, pz, { rx: Math.PI / 2 + (r() - 0.5) * 0.5, ry: r() * 6.28, color: pick(r, [0x7bb23f, 0x8fc24a, 0x6aa036, 0xd9c94a]) })
      }
    } else if (kind < 0.62) {
      // sacks of grain, beans, garri
      for (let i = 0; i < 5; i++) {
        const [px, pz] = n(-w / 2 + 0.5 + (i % 3) * 0.85, d / 2 + 0.55 + (i > 2 ? 0.55 : 0))
        sacks.add(px, 0.3, pz, { ry: yaw + (r() - 0.5) * 0.3, sx: 0.55, sy: 0.6, sz: 0.38, color: pick(r, [0xe9e1cd, 0xd9cdb0, 0xf0ead8, 0xc9b88f]) })
      }
    } else if (kind < 0.8) {
      // fabric and clothing stacks
      for (let i = 0; i < 8; i++) {
        const [px, pz] = n(-w / 2 + 0.45 + (i % 4) * 0.7, d / 2 - 0.45)
        sacks.add(px, 0.95 + Math.floor(i / 4) * 0.17, pz, { ry: yaw, sx: 0.55, sy: 0.15, sz: 0.5, color: new THREE.Color().setHSL(r(), 0.7, 0.45).getHex() })
      }
    } else {
      // onions, pepper, mixed small goods
      const col = pick(r, [0x7b3a6e, 0xc95a2a, 0x9c2b2b, 0xd7a73a])
      for (let b = 0; b < 2; b++) {
        const [bx, bz] = n(-0.6 + b * 1.2, d / 2 - 0.45)
        for (let i = 0; i < 40; i++) {
          const a = r() * 6.28, rad = Math.sqrt(r()) * 0.33
          fruit.add(bx + Math.cos(a) * rad, 0.94 + (1 - rad / 0.33) * 0.14, bz + Math.sin(a) * rad, { color: col })
        }
      }
    }

    const hw = (Math.abs(c) > 0.7 ? w : d) / 2 + 0.05, hd = (Math.abs(c) > 0.7 ? d : w) / 2 + 0.05
    colliders.box(cx, cz, hw * 2, hd * 2)
    stalls.push({ x: cx, z: cz, yaw })
  }

  // main lane runs north–south; stall blocks on each side, opening toward the lane or toward cross-aisles
  for (let side of [-1, 1]) {
    for (let col = 0; col < 4; col++) {
      const x = side * (LANE_X + STALL_W / 2 + col * (STALL_W + 1.5) + (col > 0 ? 0 : 0))
      for (let row = 0; row < ROWS; row++) {
        // leave cross lanes
        if (row % 8 === 7) continue
        if (r() < 0.07) continue // an empty plot
        const z = Z0 + row * ROW_STEP
        // columns open to their aisle: col 0 faces the lane; others face the previous column's aisle in pairs
        const facing = side === 1 ? -Math.PI / 2 : Math.PI / 2
        const face = col % 2 === 0 ? facing : facing + Math.PI
        addStall(x, z, face)
      }
    }
  }
  // stalls at the north end across the lane
  for (let i = -1; i <= 1; i++) addStall(i * 4.2, Z0 - 6, 0)

  for (const b of [posts, roofs, walls, counters, sacks, fruit, plantain]) { b.done(); group.add(b.mesh) }

  // ── entrance gate and sign ──────────────────────────────────────────────────
  const gateZ = 62
  const pillarMat = new THREE.MeshStandardMaterial({ map: concrete([1, 2]), roughness: 0.9 })
  for (const sx of [-7.5, 7.5]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 1.4), pillarMat)
    p.position.set(sx, 3.5, gateZ)
    p.castShadow = p.receiveShadow = true
    group.add(p)
    colliders.box(sx, gateZ, 1.4, 1.4)
  }
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(15, 2.4, 0.35),
    [pillarMat, pillarMat, pillarMat, pillarMat,
      new THREE.MeshStandardMaterial({ map: signTexture('WURUKUM MARKET', 'MAKURDI · BENUE STATE'), roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: signTexture('WURUKUM MARKET', 'MAKURDI · BENUE STATE'), roughness: 0.6 })],
  )
  sign.position.set(0, 6.9, gateZ)
  sign.castShadow = true
  group.add(sign)

  // ── litter, puddles and dark oil stains on the ground ───────────────────────
  const litter = createBatch(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), 3500, { shadow: false })
  for (let i = 0; i < 3500; i++) {
    const x = (r() - 0.5) * 150, z = (r() - 0.5) * 140
    litter.add(x, 0.012, z, { rx: -Math.PI / 2, rz: r() * 6.28, sx: 0.5 + r() * 1.6, color: pick(r, [0xf1efe8, 0xdadada, 0x3b6ea8, 0x3f8a52, 0x1d1d1d, 0xc9a84a, 0xa83a3a]) })
  }
  litter.done()
  group.add(litter.mesh)
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x7a4a34, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.55 })
  for (let i = 0; i < 18; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.3 + r() * 0.8, 20), puddleMat)
    p.rotation.x = -Math.PI / 2
    p.position.set((r() - 0.5) * 12 + (r() > 0.5 ? 0 : (r() - 0.5) * 60), 0.014, (r() - 0.5) * 110)
    p.scale.set(1 + r() * 1.5, 1, 1)
    group.add(p)
  }

  // ── trees: mango and neem shade the edges and the lane ends ─────────────────
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 1, 8)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 })
  const leafGeo = new THREE.IcosahedronGeometry(1, 2)
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: false })
  const trunks = createBatch(trunkGeo, trunkMat, 120)
  const leaves = createBatch(leafGeo, leafMat, 900)
  function tree(x, z, s = 1) {
    const th = 3.4 * s
    trunks.add(x, th / 2, z, { sx: s, sy: th, sz: s })
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.28, rad = r() * 2.4 * s
      leaves.add(x + Math.cos(a) * rad, th + 1.2 * s + r() * 2.2 * s, z + Math.sin(a) * rad, {
        sx: (1.7 + r() * 1.4) * s, sy: (1.3 + r() * 0.9) * s, sz: (1.7 + r() * 1.4) * s,
        color: pick(r, [0x3d5a24, 0x4a6a2a, 0x35501f, 0x56752f, 0x2f4a1e]),
      })
    }
    colliders.box(x, z, 0.8 * s, 0.8 * s)
  }
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1
    tree(side * (46 + r() * 22), -62 + (i / 26) * 130 + r() * 4, 1 + r() * 0.5)
  }
  for (let i = 0; i < 18; i++) tree((r() - 0.5) * 130, 66 + r() * 14, 0.9 + r() * 0.5)
  for (let i = 0; i < 14; i++) tree((r() - 0.5) * 130, -74 - r() * 10, 0.9 + r() * 0.5)
  for (const b of [trunks, leaves]) { b.done(); group.add(b.mesh) }

  // ── cars parked at the market edge (silver, like the ones in the photographs) ─
  const cars = [
    [-22, 56, 0.2, 0xaab0b6], [18, 58, -0.15, 0x8a9096], [30, 50, 0.1, 0xc2b79b],
    [-34, 60, 3.3, 0x5b6e82], [40, 56, 0.0, 0x9a2f2f],
  ]
  for (const [x, z, yaw, col] of cars) {
    const car = makeCar(col, r)
    car.position.set(x, 0, z)
    car.rotation.y = yaw
    group.add(car)
    colliders.box(x, z, 4.6, 2.2)
  }

  // ── far town: roofs and walls beyond the market, so the horizon isn't empty ─
  const houseGeo = new THREE.BoxGeometry(1, 1, 1)
  const houses = createBatch(houseGeo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), 500)
  const hroofs = createBatch(new THREE.BoxGeometry(1, 0.12, 1), new THREE.MeshStandardMaterial({ ...zinc, metalness: 0.4, roughness: 0.7 }), 500)
  for (let i = 0; i < 400; i++) {
    const a = r() * 6.28, rad = 95 + r() * 150
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad
    const w = 6 + r() * 6, d = 5 + r() * 5, h = 3 + r() * 1.6
    houses.add(x, h / 2, z, { ry: r() * 3.14, sx: w, sy: h, sz: d, color: pick(r, [0xd8c7a6, 0xb9a384, 0xe6dcc6, 0xc9b08d, 0xa9a29a, 0xdcd2bd]) })
    hroofs.add(x, h + 0.08, z, { ry: 0, sx: w + 0.6, sy: 1, sz: d + 0.6, color: pick(r, [0xb4553a, 0x8d8f90, 0xa3482e, 0x6e7f8a, 0x9a5a3a]) })
  }
  for (const b of [houses, hroofs]) { b.done(); group.add(b.mesh) }
  // houses rotate independently of roofs above; keep roofs level so they read as a distant skyline.

  // ── people ──────────────────────────────────────────────────────────────────
  const crowd = []
  const crowdGroup = new THREE.Group()
  group.add(crowdGroup)
  const laneZ = [Z0 - 2, Z0 + 7 * ROW_STEP, Z0 + 15 * ROW_STEP, Z0 + 23 * ROW_STEP, Z0 + 30 * ROW_STEP, 56]
  function addWalker(path, speed) {
    const p = makePerson(r, { carry: r() < 0.22 ? pick(r, [0xf0eadc, 0x2f6a9a, 0xb7452f]) : undefined })
    p.position.set(path.x0, 0, path.z0)
    p.traverse((o) => { if (o.isMesh) o.castShadow = true })
    crowdGroup.add(p)
    crowd.push({ p, ...path, speed, t: r(), dir: 1 })
  }
  for (let i = 0; i < 44; i++) {
    // north–south along the main lane, offset in x
    const x = (r() - 0.5) * (LANE_X * 1.7)
    addWalker({ x0: x, z0: Z0 + r() * 100, x1: x + (r() - 0.5) * 1.2, z1: Z0 + 4 + r() * 108 }, 0.7 + r() * 0.8)
  }
  for (let i = 0; i < 26; i++) {
    // east–west along cross lanes
    const z = pick(r, laneZ)
    const a = (r() - 0.5) * 36, b = a + (r() > 0.5 ? 1 : -1) * (8 + r() * 24)
    addWalker({ x0: a, z0: z, x1: b, z1: z + (r() - 0.5) * 1.4 }, 0.7 + r() * 0.8)
  }
  // vendors stand or sit at stalls and face out toward their customers
  const vendors = []
  for (const s of stalls) {
    if (r() > 0.42) continue
    const v = makePerson(r, { female: r() > 0.3 })
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw)
    v.position.set(s.x + 0 * c + 0.55 * sn, 0, s.z - 0 * sn + 0.55 * c)
    v.rotation.y = s.yaw
    v.traverse((o) => { if (o.isMesh) o.castShadow = true })
    crowdGroup.add(v)
    vendors.push({ v, ph: r() * 6.28 })
  }

  const info = {
    title: 'Wurukum Market',
    text: 'Zinc-roofed stalls, red laterite underfoot, tomatoes, plantain and sacks of grain. The market floor is modelled from photographs of Makurdi markets.',
  }

  return {
    id: 'market',
    group,
    info,
    spawn: { x: 0, z: 56, yaw: Math.PI },
    heightAt: () => 0,
    colliders,
    setCrowd(v) { crowdGroup.visible = v },
    fogDensity: 0.0042,
    sunAzimuth: 215,
    bounds: { x0: -75, x1: 75, z0: -80, z1: 76 },
    update(dt, t) {
      for (const c of crowd) {
        c.t += (dt * c.speed * c.dir) / Math.hypot(c.x1 - c.x0, c.z1 - c.z0)
        if (c.t > 1) { c.t = 1; c.dir = -1 }
        if (c.t < 0) { c.t = 0; c.dir = 1 }
        const x = THREE.MathUtils.lerp(c.x0, c.x1, c.t), z = THREE.MathUtils.lerp(c.z0, c.z1, c.t)
        const yaw = Math.atan2((c.x1 - c.x0) * c.dir, (c.z1 - c.z0) * c.dir)
        c.p.position.set(x, 0, z)
        c.p.rotation.y = yaw
        animatePerson(c.p, c.speed, t)
      }
      for (const v of vendors) {
        animatePerson(v.v, 0, t)
      }
    },
  }
}
