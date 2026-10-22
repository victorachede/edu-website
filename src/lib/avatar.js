import * as THREE from 'three'
import { buildCharacter, animateCharacter } from './character.js'
import { createModelInstance } from './models.js'

// An avatar is the custom (procedural) character, or a realistic model once it has loaded.
// While the model downloads the custom character stands in, so nobody sees an empty spot.
export function buildAvatar(look, { lod = 'high' } = {}) {
  const g = new THREE.Group()
  const proc = buildCharacter(look, { lod })
  g.add(proc)
  g.userData = { look, proc, inst: null }
  if (look.model) {
    createModelInstance(look.model, look.height || 1)
      .then((inst) => {
        if (!inst || g.userData.disposed) return
        g.remove(proc)
        g.add(inst.root)
        g.userData.inst = inst
      })
      .catch((e) => console.warn('model failed', look.model, e))
  }
  return g
}

export function disposeAvatar(g) { if (g) g.userData.disposed = true }

export function tickAvatar(g, speed, t, dt) {
  const u = g.userData
  if (u.inst) u.inst.update(dt, speed)
  else animateCharacter(u.proc, speed, t)
}
