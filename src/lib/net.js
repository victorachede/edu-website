import * as THREE from 'three'
import PartySocket from 'partysocket'
import { buildAvatar, tickAvatar, disposeAvatar } from './avatar.js'

// Where the game server lives. Set VITE_PARTYKIT_HOST when you deploy it.
const HOST = import.meta.env.VITE_PARTYKIT_HOST || (import.meta.env.DEV ? `${location.hostname}:1999` : '')

function nameTag(name) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const x = c.getContext('2d')
  x.font = '600 28px Inter, Arial, sans-serif'
  const w = Math.min(244, x.measureText(name).width + 28)
  x.fillStyle = 'rgba(12,14,12,0.62)'
  x.beginPath()
  x.roundRect((256 - w) / 2, 10, w, 42, 21)
  x.fill()
  x.fillStyle = '#fff'
  x.textAlign = 'center'
  x.fillText(name, 128, 40)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }))
  s.scale.set(1.5, 0.375, 1)
  s.renderOrder = 10
  return s
}

class Remote {
  constructor(p) {
    this.id = p.id
    this.name = p.name
    this.group = new THREE.Group()
    this.set(p)
    this.group.position.set(p.x, p.y, p.z)
    this.tx = p.x; this.ty = p.y; this.tz = p.z; this.tyaw = p.yaw; this.sp = p.sp || 0
    this.yaw = p.yaw
  }
  set(p) {
    this.name = p.name
    this.look = p.look
    if (this.model) { this.group.remove(this.model); disposeAvatar(this.model) }
    if (this.tag) this.group.remove(this.tag)
    this.model = buildAvatar(p.look, { lod: 'high' })
    this.model.traverse((o) => { if (o.isMesh) o.castShadow = true })
    this.group.add(this.model)
    this.tag = nameTag(p.name)
    this.tag.position.y = 2.15 * (p.look.height || 1)
    this.group.add(this.tag)
  }
  update(dt, t) {
    const k = Math.min(1, dt * 9)
    const g = this.group.position
    g.x += (this.tx - g.x) * k
    g.y += (this.ty - g.y) * k
    g.z += (this.tz - g.z) * k
    let d = this.tyaw - this.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.yaw += d * k
    this.model.rotation.y = this.yaw
    tickAvatar(this.model, this.sp, t, dt)
  }
}

export class Net {
  constructor(scene, onCount) {
    this.scene = scene
    this.onCount = onCount
    this.remotes = new Map()
    this.group = new THREE.Group()
    scene.add(this.group)
    this.socket = null
    this.acc = 0
    this.state = HOST ? 'off' : 'unavailable'
  }

  get enabled() { return !!HOST }

  connect(room, me) {
    this.disconnect()
    if (!HOST) { this.onCount(0, 'unavailable'); return }
    this.me = me
    this.state = 'connecting'
    this.onCount(0, 'connecting')
    const s = new PartySocket({ host: HOST, room })
    this.socket = s
    s.addEventListener('open', () => {
      this.state = 'online'
      this.hello()
    })
    s.addEventListener('close', () => {
      if (this.socket !== s) return
      this.state = 'connecting'
      this.clear()
      this.onCount(0, 'connecting')
    })
    s.addEventListener('message', (e) => this.onMessage(e.data))
  }

  hello() {
    const m = this.me()
    this.send({ t: 'hello', name: m.name, look: m.look, x: m.x, y: m.y, z: m.z })
  }

  sendLook() {
    if (this.state !== 'online') return
    const m = this.me()
    this.send({ t: 'look', name: m.name, look: m.look })
  }

  send(o) {
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(o))
  }

  onMessage(raw) {
    let m
    try { m = JSON.parse(raw) } catch { return }
    if (m.t === 'snap') {
      this.clear()
      for (const p of m.players) this.add(p)
    } else if (m.t === 'join') this.add(m.p)
    else if (m.t === 'leave') this.remove(m.id)
    else if (m.t === 'look') this.remotes.get(m.id)?.set({ ...m, x: 0, y: 0, z: 0 })
    else if (m.t === 'tick') {
      for (const [id, x, y, z, yaw, sp] of m.p) {
        const r = this.remotes.get(id)
        if (r) { r.tx = x; r.ty = y; r.tz = z; r.tyaw = yaw; r.sp = sp }
      }
    } else if (m.t === 'full') { this.state = 'full'; this.onCount(0, 'full') }
    this.count()
  }

  add(p) {
    if (this.remotes.has(p.id)) return
    const r = new Remote(p)
    this.remotes.set(p.id, r)
    this.group.add(r.group)
  }

  remove(id) {
    const r = this.remotes.get(id)
    if (!r) return
    this.group.remove(r.group)
    this.remotes.delete(id)
  }

  clear() { for (const id of [...this.remotes.keys()]) this.remove(id) }
  count() { this.onCount(this.remotes.size + 1, this.state) }

  // send our position ten times a second
  update(dt, t, mePos) {
    for (const r of this.remotes.values()) r.update(dt, t)
    if (this.state !== 'online') return
    this.acc += dt
    if (this.acc >= 0.1) {
      this.acc = 0
      this.send({ t: 'pos', x: +mePos.x.toFixed(2), y: +mePos.y.toFixed(2), z: +mePos.z.toFixed(2), yaw: +mePos.yaw.toFixed(2), sp: +mePos.sp.toFixed(1) })
    }
  }

  disconnect() {
    if (this.socket) { const s = this.socket; this.socket = null; s.close() }
    this.clear()
  }
}
