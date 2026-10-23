import * as THREE from 'three'
import { DEFAULT_LOOK } from './character.js'
import { buildAvatar, tickAvatar, disposeAvatar } from './avatar.js'
import { createBody, stepBody } from './movement.js'

// Third-person walker: WASD/arrows or a touch joystick, drag to orbit, wheel to zoom.
export class Player {
  constructor(camera, dom) {
    this.camera = camera
    this.pos = new THREE.Vector3()
    this.vel = new THREE.Vector3()
    this.yaw = 0 // body facing
    this.camYaw = 0
    this.camPitch = 0.28
    this.camDist = 5.2
    this.keys = new Set()
    this.joy = { x: 0, y: 0 }
    this.speed = 0
    this.root = new THREE.Group()
    this.look = { ...DEFAULT_LOOK }
    this.frozen = false
    this.body = createBody()
    this.grounded = true
    this.jumpPressed = false
    this.jumpHeld = false
    this.setLook(this.look)
    this.dom = dom

    addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.jumpPressed = true; this.jumpHeld = true }
      this.keys.add(e.code)
    })
    addEventListener('keyup', (e) => { if (e.code === 'Space') this.jumpHeld = false; this.keys.delete(e.code) })
    addEventListener('blur', () => this.keys.clear())

    let drag = null
    dom.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#joy') || e.target.closest('#top')) return
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
      dom.setPointerCapture?.(e.pointerId)
    })
    addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return
      this.camYaw -= (e.clientX - drag.x) * 0.0055
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + (e.clientY - drag.y) * 0.004, -0.12, 1.2)
      drag.x = e.clientX
      drag.y = e.clientY
    })
    addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) drag = null })
    addEventListener('wheel', (e) => {
      this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.004, 2.2, 14)
    }, { passive: true })

    const jumpBtn = document.getElementById('jump')
    if (jumpBtn) {
      jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.jumpPressed = true; this.jumpHeld = true })
      const up = () => { this.jumpHeld = false }
      jumpBtn.addEventListener('pointerup', up)
      jumpBtn.addEventListener('pointercancel', up)
    }

    const joy = document.getElementById('joy')
    if (joy) {
      const knob = joy.querySelector('i')
      const move = (e) => {
        const b = joy.getBoundingClientRect()
        const dx = (e.clientX - (b.left + b.width / 2)) / 40
        const dy = (e.clientY - (b.top + b.height / 2)) / 40
        const l = Math.hypot(dx, dy) || 1
        const k = Math.min(1, l)
        this.joy.x = (dx / l) * k
        this.joy.y = (dy / l) * k
        knob.style.transform = `translate(${this.joy.x * 30}px,${this.joy.y * 30}px)`
      }
      joy.addEventListener('pointerdown', (e) => { joy.setPointerCapture(e.pointerId); move(e) })
      joy.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure) move(e) })
      const end = () => { this.joy.x = this.joy.y = 0; knob.style.transform = '' }
      joy.addEventListener('pointerup', end)
      joy.addEventListener('pointercancel', end)
    }
  }

  setLook(look) {
    this.look = look
    if (this.model) { this.root.remove(this.model); disposeAvatar(this.model) }
    this.model = buildAvatar(look, { lod: 'high' })
    this.model.traverse((o) => { if (o.isMesh) o.castShadow = true })
    this.root.add(this.model)
  }

  place(zone) {
    this.pos.set(zone.spawn.x, zone.heightAt(zone.spawn.x, zone.spawn.z), zone.spawn.z)
    this.body = createBody(this.pos.x, this.pos.y, this.pos.z)
    this.yaw = zone.spawn.yaw
    this.camYaw = zone.spawn.yaw
    this.camPitch = 0.26
  }

  update(dt, zone) {
    if (this.frozen) {
      this.speed = 0
      this.root.position.copy(this.pos)
      this.model.rotation.y = this.yaw
      tickAvatar(this.model, 0, performance.now() / 1000, dt)
      return
    }
    let ix = 0, iz = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1
    ix += this.joy.x
    iz += this.joy.y
    const mag = Math.min(1, Math.hypot(ix, iz))
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.85
    // camera-relative wanted direction, then the shared movement step does the rest
    let dx = 0, dz = 0
    if (mag > 0.05) {
      const dirYaw = Math.atan2(ix, iz) + this.camYaw
      dx = -Math.sin(dirYaw) * mag
      dz = -Math.cos(dirYaw) * mag
    }
    const body = this.body
    body.x = this.pos.x; body.y = this.pos.y; body.z = this.pos.z
    const r = stepBody(body, { dx, dz, run, jumpPressed: this.jumpPressed, jumpHeld: this.jumpHeld }, zone, dt)
    this.jumpPressed = false
    this.pos.set(body.x, body.y, body.z)
    this.speed = r.speed
    this.grounded = r.grounded
    if (r.speed > 0.3) {
      // face where we're heading
      const want = Math.atan2(-body.vx, -body.vz)
      let d = want - this.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      this.yaw += d * Math.min(1, dt * 12)
    }

    this.root.position.copy(this.pos)
    this.model.rotation.y = this.yaw
    tickAvatar(this.model, this.speed, performance.now() / 1000, dt)

    // camera sits behind the player, orbiting by yaw/pitch
    const head = new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z)
    const cx = head.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist
    const cz = head.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist
    let cy = head.y + Math.sin(this.camPitch) * this.camDist
    cy = Math.max(cy, zone.heightAt(cx, cz) + 0.6)
    this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 18))
    this.camera.lookAt(head)
  }
}
