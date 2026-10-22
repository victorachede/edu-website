import type * as Party from 'partykit/server'
import { sanitizeLook } from '../src/lib/look.js'

const MAX_PLAYERS = 60 // per place
const TICK_MS = 100
const MAX_MESSAGE = 700

interface Player {
  id: string
  name: string
  look: ReturnType<typeof sanitizeLook>
  x: number
  y: number
  z: number
  yaw: number
  sp: number
  at: number
  dirty: boolean
}

const num = (v: unknown, lo: number, hi: number, d = 0) => (Number.isFinite(+(v as number)) ? Math.min(hi, Math.max(lo, +(v as number))) : d)
const cleanName = (v: unknown) => {
  const s = String(v ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 18)
  return s.length >= 2 ? s : 'Guest'
}

// One room per place ("market", "bridge"). Players send where they are about ten times a second;
// the server clamps it, batches it, and tells everyone else.
export default class BenueLife implements Party.Server {
  players = new Map<string, Player>()
  timer: ReturnType<typeof setInterval> | null = null

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    if (this.players.size >= MAX_PLAYERS) {
      conn.send(JSON.stringify({ t: 'full' }))
      conn.close()
      return
    }
    // joins the room once they say hello with a look and a name
    conn.send(JSON.stringify({ t: 'welcome', id: conn.id, n: this.players.size }))
  }

  onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return
    let msg: any
    try { msg = JSON.parse(raw) } catch { return }
    if (!msg || typeof msg !== 'object') return

    if (msg.t === 'hello') {
      const known = this.players.get(sender.id)
      const p: Player = known ?? { id: sender.id, name: 'Guest', look: sanitizeLook({}), x: 0, y: 0, z: 0, yaw: 0, sp: 0, at: 0, dirty: false }
      p.name = cleanName(msg.name)
      p.look = sanitizeLook(msg.look)
      p.x = num(msg.x, -900, 900)
      p.y = num(msg.y, -20, 60)
      p.z = num(msg.z, -900, 900)
      this.players.set(sender.id, p)
      sender.send(JSON.stringify({ t: 'snap', players: [...this.players.values()].filter((q) => q.id !== sender.id).map(this.full) }))
      this.room.broadcast(JSON.stringify({ t: 'join', p: this.full(p) }), [sender.id])
      this.ensureTimer()
      return
    }

    const p = this.players.get(sender.id)
    if (!p) return
    if (msg.t === 'pos') {
      const now = Date.now()
      if (now - p.at < 40) return
      p.at = now
      p.x = num(msg.x, -900, 900, p.x)
      p.y = num(msg.y, -20, 60, p.y)
      p.z = num(msg.z, -900, 900, p.z)
      p.yaw = num(msg.yaw, -7, 7, p.yaw)
      p.sp = num(msg.sp, 0, 8, 0)
      p.dirty = true
    } else if (msg.t === 'look') {
      p.name = cleanName(msg.name)
      p.look = sanitizeLook(msg.look)
      this.room.broadcast(JSON.stringify({ t: 'look', id: p.id, name: p.name, look: p.look }), [sender.id])
    }
  }

  onClose(conn: Party.Connection) {
    if (this.players.delete(conn.id)) this.room.broadcast(JSON.stringify({ t: 'leave', id: conn.id }))
    if (this.players.size === 0 && this.timer) { clearInterval(this.timer); this.timer = null }
  }

  onError(conn: Party.Connection) { this.onClose(conn) }

  full = (p: Player) => ({ id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, z: p.z, yaw: p.yaw, sp: p.sp })

  ensureTimer() {
    if (this.timer) return
    this.timer = setInterval(() => {
      const moved: number[][] = []
      for (const p of this.players.values()) {
        if (!p.dirty) continue
        p.dirty = false
        moved.push([p.id as unknown as number, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.sp.toFixed(1)])
      }
      if (moved.length) this.room.broadcast(JSON.stringify({ t: 'tick', p: moved }))
    }, TICK_MS)
  }
}
