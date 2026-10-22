import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Realistic characters (for example from Mixamo) live outside the app bundle, so the repo stays clean
// and each file's licence is respected. BASE can point at any static host. See public/models/README.md.
const BASE = (import.meta.env.VITE_MODELS_BASE || '/models').replace(/\/$/, '')
const TARGET_HEIGHT = 1.75

const loaders = { glb: new GLTFLoader(), gltf: new GLTFLoader(), fbx: new FBXLoader() }
const ext = (f) => f.split('?')[0].split('.').pop().toLowerCase()
const url = (f) => (/^https?:/.test(f) ? f : `${BASE}/${f.replace(/^\//, '')}`)

function loadFile(file) {
  const l = loaders[ext(file)]
  if (!l) return Promise.reject(new Error(`Unsupported model type: ${file}`))
  return new Promise((res, rej) => l.load(url(file), res, undefined, rej))
}

let manifestPromise = null
export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${BASE}/manifest.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => (m && Array.isArray(m.characters) ? m : { characters: [], animations: {} }))
      .catch(() => ({ characters: [], animations: {} }))
  }
  return manifestPromise
}

// Idle / walk / run clips. They can be separate Mixamo "without skin" files, or clips inside one model file.
// All Mixamo rigs share bone names, so the same clips drive every Mixamo character.
let clipsPromise = null
function loadClips() {
  if (!clipsPromise) {
    clipsPromise = loadManifest().then(async (m) => {
      const out = {}
      const cache = new Map()
      for (const kind of ['idle', 'walk', 'run']) {
        const spec = m.animations?.[kind]
        if (!spec) continue
        const { file, clip } = typeof spec === 'string' ? { file: spec } : spec
        try {
          if (!cache.has(file)) cache.set(file, await loadFile(file))
          const asset = cache.get(file)
          const clips = asset.animations || []
          const found = (clip && clips.find((c) => c.name === clip)) || clips.find((c) => !/t-?pose/i.test(c.name)) || clips[0]
          if (found) out[kind] = found.clone()
        } catch (e) { console.warn('animation failed', kind, e) }
      }
      for (const c of Object.values(out)) {
        // drop the hips' travel and root turn so characters walk in place and upright, whatever the download settings or export rig were
        c.tracks = c.tracks.filter((t) => !/hips\.(position|quaternion)$/i.test(t.name))
      }
      return out
    })
  }
  return clipsPromise
}

const templates = new Map()
function loadTemplate(def) {
  if (!templates.has(def.id)) {
    templates.set(def.id, loadFile(def.file).then((asset) => {
      const root = asset.scene || asset
      root.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(root)
      const h = box.max.y - box.min.y || 1
      return { root, scale: TARGET_HEIGHT / h, lift: -box.min.y, clips: asset.animations || [] }
    }))
  }
  return templates.get(def.id)
}

export async function listCharacters() {
  return (await loadManifest()).characters
}

// Returns { root, update(dt, speed) } for a character id, or null if it isn't available.
export async function createModelInstance(id, height = 1) {
  const m = await loadManifest()
  const def = m.characters.find((c) => c.id === id)
  if (!def) return null
  const [tpl, shared] = await Promise.all([loadTemplate(def), loadClips()])
  const model = cloneSkinned(tpl.root)
  model.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true
      o.receiveShadow = true
      o.frustumCulled = false
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const mt of mats) {
        if (!mt) continue
        if (mt.map) mt.map.colorSpace = THREE.SRGBColorSpace
        if (mt.transparent && mt.opacity >= 0.99) mt.transparent = false
        mt.envMapIntensity = 0.6
      }
    }
  })
  const s = tpl.scale * (def.scale || 1) * height
  const wrap = new THREE.Group()
  model.scale.setScalar(s)
  model.position.y = tpl.lift * s
  wrap.add(model)

  const mixer = new THREE.AnimationMixer(model)
  const own = (n) => tpl.clips.find((c) => new RegExp(n, 'i').test(c.name))
  const actions = {}
  for (const k of ['idle', 'walk', 'run']) {
    const clip = shared[k] || (own(k) && own(k).clone())
    if (clip) {
      const a = mixer.clipAction(clip)
      a.play()
      a.setEffectiveWeight(k === 'idle' ? 1 : 0)
      actions[k] = a
    }
  }
  const clamp = (v) => Math.min(1, Math.max(0, v))
  return {
    root: wrap,
    update(dt, speed) {
      const wi = actions.idle ? clamp(1 - speed / 0.6) : 0
      const wr = actions.run ? clamp((speed - 2.4) / 1.2) : 0
      const ww = actions.walk ? clamp(1 - wi - wr) : 0
      actions.idle?.setEffectiveWeight(wi || (actions.walk ? 0 : 1))
      actions.walk?.setEffectiveWeight(ww)
      actions.run?.setEffectiveWeight(wr)
      if (actions.walk) actions.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 1.5, 0.6, 1.5))
      mixer.update(dt)
    },
  }
}
