// Kinematic character movement: acceleration, gravity, jumping with coyote time and a jump
// buffer, slope limiting, ledge stepping and sliding along walls. Pure functions on plain
// numbers (no three.js, no DOM) so it can be checked headlessly.

export const MOVE = {
  walk: 2.2,
  run: 4.6,
  accel: 24, // m/s² to reach the wanted speed on the ground
  decel: 20, // m/s² when no input
  airAccel: 8,
  gravity: 22,
  jumpSpeed: 7.0, // about 1.1 m jump
  jumpCut: 0.45, // vy kept when the jump button is released early
  coyote: 0.12, // s you can still jump after walking off an edge
  buffer: 0.12, // s a jump press is remembered before landing
  radius: 0.42,
  stepHeight: 0.45, // ledge we walk straight up
  maxSlope: 1.2, // rise over run we refuse to climb (about 50°)
  snap: 0.3, // follow the ground down slopes this far instead of falling
}

export function createBody(x = 0, y = 0, z = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, sinceGround: 0, bufferT: 0, wasJumpHeld: false, landed: 0 }
}

function tryMove(b, nx, nz, zone) {
  const next = { x: nx, z: nz }
  zone.colliders.resolve(next, MOVE.radius)
  if (zone.isBlocked && zone.isBlocked(next.x, next.z)) return null
  if (b.grounded) {
    const rise = zone.heightAt(next.x, next.z) - b.y
    const run = Math.hypot(next.x - b.x, next.z - b.z)
    if (rise > MOVE.stepHeight && run > 1e-6 && rise / run > MOVE.maxSlope) return null
  }
  return next
}

/**
 * Advance one frame.
 * input: { dx, dz } wanted world direction (length 0..1), run, jumpPressed (edge), jumpHeld
 */
export function stepBody(b, input, zone, dt) {
  const wantSpeed = Math.min(1, Math.hypot(input.dx, input.dz)) * (input.run ? MOVE.run : MOVE.walk)
  const len = Math.hypot(input.dx, input.dz) || 1
  const wx = (input.dx / len) * wantSpeed
  const wz = (input.dz / len) * wantSpeed

  // horizontal velocity eases towards the wanted velocity
  const rate = b.grounded ? (wantSpeed > 0.01 ? MOVE.accel : MOVE.decel) : MOVE.airAccel
  const ex = wx - b.vx, ez = wz - b.vz
  const el = Math.hypot(ex, ez)
  const maxStep = rate * dt
  if (el <= maxStep) { b.vx = wx; b.vz = wz } else { b.vx += (ex / el) * maxStep; b.vz += (ez / el) * maxStep }

  // jumping: buffered press + coyote time
  b.landed = 0
  b.sinceGround = b.grounded ? 0 : b.sinceGround + dt
  if (input.jumpPressed) b.bufferT = MOVE.buffer
  else b.bufferT = Math.max(0, b.bufferT - dt)
  if (b.bufferT > 0 && (b.grounded || b.sinceGround <= MOVE.coyote)) {
    b.vy = MOVE.jumpSpeed
    b.grounded = false
    b.sinceGround = MOVE.coyote + 1 // used up
    b.bufferT = 0
  }
  if (!input.jumpHeld && b.wasJumpHeld && b.vy > 0) b.vy *= MOVE.jumpCut // short hop
  b.wasJumpHeld = !!input.jumpHeld

  // horizontal move, sliding along walls and refusing cliffs
  const ox = b.x, oz = b.z
  const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt
  let moved = tryMove(b, nx, nz, zone) || tryMove(b, nx, b.z, zone) || tryMove(b, b.x, nz, zone)
  if (moved) { b.x = moved.x; b.z = moved.z }
  // velocity follows what really happened, so walking into a wall does not build up speed
  if (dt > 0) { b.vx = (b.x - ox) / dt; b.vz = (b.z - oz) / dt }

  const bnd = zone.bounds
  b.x = Math.max(bnd.x0, Math.min(bnd.x1, b.x))
  b.z = Math.max(bnd.z0, Math.min(bnd.z1, b.z))

  // vertical: gravity, landing, following the ground
  b.vy -= MOVE.gravity * dt
  b.y += b.vy * dt
  const ground = zone.heightAt(b.x, b.z)
  if (b.y <= ground) {
    if (!b.grounded && b.vy < 0) b.landed = -b.vy
    b.y = ground
    b.vy = 0
    b.grounded = true
  } else if (b.grounded && b.vy <= 0 && b.y - ground <= MOVE.snap) {
    b.y = ground // walking down a slope or a small drop
    b.vy = 0
  } else {
    b.grounded = false
  }
  return { speed: Math.hypot(b.vx, b.vz), grounded: b.grounded, landed: b.landed }
}
