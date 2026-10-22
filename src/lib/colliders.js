// Axis-aligned boxes the player cannot walk into.
export class Colliders {
  constructor() { this.boxes = [] }
  box(cx, cz, w, d) { this.boxes.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }) }
  // Push a circle out of every box it overlaps.
  resolve(p, radius) {
    for (const b of this.boxes) {
      const nx = Math.max(b.x0, Math.min(p.x, b.x1))
      const nz = Math.max(b.z0, Math.min(p.z, b.z1))
      const dx = p.x - nx, dz = p.z - nz
      const d2 = dx * dx + dz * dz
      if (d2 < radius * radius) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2)
          p.x = nx + (dx / d) * radius
          p.z = nz + (dz / d) * radius
        } else {
          // centre is inside the box: leave through the nearest face
          const l = p.x - b.x0, r = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z
          const m = Math.min(l, r, t, bt)
          if (m === l) p.x = b.x0 - radius
          else if (m === r) p.x = b.x1 + radius
          else if (m === t) p.z = b.z0 - radius
          else p.z = b.z1 + radius
        }
      }
    }
  }
}
