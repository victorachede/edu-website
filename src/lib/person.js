import * as THREE from 'three'

const SKINS = ['#3b2418', '#4a2d1c', '#5a3822', '#6b4529', '#7a5233', '#2f1d12']
const geo = {
  torso: new THREE.CylinderGeometry(0.2, 0.22, 0.62, 10),
  skirt: new THREE.CylinderGeometry(0.2, 0.34, 0.8, 12, 1, true),
  leg: new THREE.CylinderGeometry(0.075, 0.065, 0.82, 8),
  arm: new THREE.CylinderGeometry(0.055, 0.05, 0.6, 8),
  head: new THREE.SphereGeometry(0.135, 14, 12),
  wrap: new THREE.SphereGeometry(0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  load: new THREE.CylinderGeometry(0.22, 0.2, 0.18, 12),
}
const mats = new Map()
function mat(color, rough = 0.85) {
  const key = color + rough
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }))
  return mats.get(key)
}

// A low-poly person built from primitives. `opts.clothes` and `opts.bottom` are hex strings.
export function makePerson(r, opts = {}) {
  const g = new THREE.Group()
  const skin = SKINS[(r() * SKINS.length) | 0]
  const top = opts.top ?? new THREE.Color().setHSL(r(), 0.55 + r() * 0.3, 0.3 + r() * 0.25).getStyle()
  const bottom = opts.bottom ?? new THREE.Color().setHSL(r(), 0.5 + r() * 0.35, 0.25 + r() * 0.3).getStyle()
  const female = opts.female ?? r() > 0.45
  const h = opts.height ?? 0.92 + r() * 0.16

  const hip = new THREE.Group()
  hip.position.y = 0.86 * h
  g.add(hip)

  const torso = new THREE.Mesh(geo.torso, mat(top))
  torso.position.y = 0.34
  torso.castShadow = true
  hip.add(torso)

  const head = new THREE.Mesh(geo.head, mat(skin, 0.7))
  head.position.y = 0.78
  head.castShadow = true
  hip.add(head)

  if (female) {
    const wrap = new THREE.Mesh(geo.wrap, mat(new THREE.Color().setHSL(r(), 0.7, 0.45).getStyle()))
    wrap.position.y = 0.8
    wrap.rotation.x = -0.12
    wrap.castShadow = true
    hip.add(wrap)
    const skirt = new THREE.Mesh(geo.skirt, new THREE.MeshStandardMaterial({ color: bottom, roughness: 0.9, side: THREE.DoubleSide }))
    skirt.position.y = -0.18
    skirt.castShadow = true
    hip.add(skirt)
  } else if (r() > 0.6) {
    const cap = new THREE.Mesh(geo.wrap, mat(['#e8e2d0', '#1c1c1c', '#7c1f1f', '#233a7a'][(r() * 4) | 0]))
    cap.position.y = 0.84
    cap.scale.set(0.95, 0.7, 0.95)
    hip.add(cap)
  }

  const legs = []
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(s * 0.1, 0, 0)
    const leg = new THREE.Mesh(geo.leg, female ? mat(skin, 0.7) : mat(bottom))
    leg.position.y = -0.4
    leg.castShadow = true
    pivot.add(leg)
    hip.add(pivot)
    legs.push(pivot)
  }
  const arms = []
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(s * 0.27, 0.58, 0)
    const arm = new THREE.Mesh(geo.arm, mat(top))
    arm.position.y = -0.27
    arm.castShadow = true
    pivot.add(arm)
    hip.add(pivot)
    arms.push(pivot)
  }

  if (opts.carry) {
    const load = new THREE.Mesh(geo.load, mat(opts.carry))
    load.position.y = 0.97
    load.castShadow = true
    hip.add(load)
  }

  g.scale.setScalar(h)
  g.userData = { legs, arms, hip, phase: r() * 6.28 }
  return g
}

export function animatePerson(g, speed, t) {
  const { legs, arms, hip, phase } = g.userData
  const k = Math.min(1, speed / 1.5)
  const w = Math.sin(t * (4 + speed * 2.2) + phase) * 0.7 * k
  legs[0].rotation.x = w
  legs[1].rotation.x = -w
  arms[0].rotation.x = -w * 0.8
  arms[1].rotation.x = w * 0.8
  hip.position.y = 0.86 + Math.abs(Math.sin(t * (4 + speed * 2.2) + phase)) * 0.035 * k
}
