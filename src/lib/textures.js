import * as THREE from 'three'

// Small seeded RNG so every visitor sees the same world.
export function rng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  return c
}

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function speckle(ctx, w, h, r, n, colors, minR, maxR, alpha) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.4 + r() * 0.6)
    ctx.fillStyle = colors[(r() * colors.length) | 0]
    const rad = minR + r() * (maxR - minR)
    ctx.beginPath()
    ctx.arc(r() * w, r() * h, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// Red-brown laterite earth, the colour of every market floor in Makurdi.
export function laterite(repeat = [40, 40]) {
  const r = rng(11)
  return tex(canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#a4623f'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, r, 900, ['#9a5a38', '#b06c47', '#8a4e30'], 6, 26, 0.10)
    speckle(ctx, w, h, r, 5200, ['#8c4f30', '#b97650', '#7a4429', '#c58a63', '#d0a07c'], 0.6, 2.6, 0.45)
    speckle(ctx, w, h, r, 3200, ['#6b3a22', '#e0b690', '#5a3a2a', '#ead0b0'], 0.4, 1.3, 0.7)
    // tyre-track scuffs
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#4a2a18'
    for (let i = 0; i < 7; i++) ctx.fillRect(0, r() * h, w, 3 + r() * 5)
    ctx.globalAlpha = 1
  }), { repeat })
}

export function dryGrass(repeat = [60, 60]) {
  const r = rng(5)
  return tex(canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#7e7a3b'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, r, 3200, ['#6c6a30', '#8f8c47', '#5f5d2a', '#a39a52', '#7a5b34'], 1, 7, 0.4)
    speckle(ctx, w, h, r, 1500, ['#b6a96a', '#4d4a22'], 0.5, 2, 0.5)
  }), { repeat })
}

export function sand(repeat = [30, 30]) {
  const r = rng(8)
  return tex(canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#b8955f'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, r, 3200, ['#a8844f', '#c9a874', '#9a7745', '#d6b98a'], 1, 6, 0.35)
    speckle(ctx, w, h, r, 1000, ['#7d5f38', '#e8d3aa'], 0.5, 1.5, 0.6)
  }), { repeat })
}

// Weathered corrugated zinc. Returns colour + normal so ridges catch the sun.
export function corrugated(base = '#8d8f90', rust = 0.5, seed = 3) {
  const r = rng(seed)
  const color = canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    const ridges = 16
    for (let i = 0; i < ridges; i++) {
      const g = ctx.createLinearGradient(i * (w / ridges), 0, (i + 1) * (w / ridges), 0)
      g.addColorStop(0, 'rgba(255,255,255,0.16)')
      g.addColorStop(0.5, 'rgba(0,0,0,0.10)')
      g.addColorStop(1, 'rgba(255,255,255,0.16)')
      ctx.fillStyle = g
      ctx.fillRect(i * (w / ridges), 0, w / ridges, h)
    }
    // rust: streaks running down the sheet, heavier near the bottom edge
    for (let i = 0; i < 260 * rust; i++) {
      const x = r() * w, y = r() * h * 0.9
      ctx.globalAlpha = 0.07 + r() * 0.2
      ctx.fillStyle = ['#7a3b1c', '#9a4a22', '#5c2c14', '#b0612f'][(r() * 4) | 0]
      ctx.fillRect(x, y, 1 + r() * 4, 20 + r() * 140)
    }
    speckle(ctx, w, h, r, 700 * rust, ['#8a421f', '#6e3418', '#a95a2a'], 1, 7, 0.4)
    ctx.globalAlpha = 1
  })
  const normal = canvas(512, 512, (ctx, w, h) => {
    const ridges = 16
    const img = ctx.createImageData(w, h)
    for (let x = 0; x < w; x++) {
      const a = (x / w) * ridges * Math.PI * 2
      const nx = Math.cos(a) * 0.55
      const nz = Math.sqrt(1 - nx * nx)
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4
        img.data[i] = (nx * 0.5 + 0.5) * 255
        img.data[i + 1] = 128
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  })
  return { map: tex(color), normalMap: tex(normal, { srgb: false }) }
}

export function wood(repeat = [1, 4], tone = '#6e4a2c') {
  const r = rng(21)
  return tex(canvas(128, 512, (ctx, w, h) => {
    ctx.fillStyle = tone
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = 0.1 + r() * 0.25
      ctx.fillStyle = r() > 0.5 ? '#3d2814' : '#9a7448'
      ctx.fillRect(r() * w, 0, 1 + r() * 3, h)
    }
    ctx.globalAlpha = 1
  }), { repeat })
}

export function concrete(repeat = [4, 4]) {
  const r = rng(33)
  return tex(canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8f8c84'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, r, 3000, ['#7b7870', '#a3a098', '#6c6a63', '#b4b0a6'], 1, 6, 0.3)
    // water stains running down
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.05 + r() * 0.12
      ctx.fillStyle = ['#4f4a3c', '#5b5a44', '#3d4a3a'][(r() * 3) | 0]
      ctx.fillRect(r() * w, r() * h * 0.5, 2 + r() * 14, 40 + r() * 260)
    }
    ctx.globalAlpha = 1
  }), { repeat })
}

export function asphalt(repeat = [20, 2]) {
  const r = rng(44)
  return tex(canvas(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3a3c'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, r, 2600, ['#2c2c2e', '#4a4a4d', '#555558', '#222224'], 0.5, 2.5, 0.6)
    ctx.globalAlpha = 0.3
    ctx.fillStyle = '#ececec'
    ctx.fillRect(0, h / 2 - 2, w * 0.5, 4)
    ctx.globalAlpha = 1
  }), { repeat })
}

export function waterNormal(repeat = [60, 60]) {
  const size = 256
  const r = rng(77)
  // sum a few smooth waves into a height field, then derive a normal map
  const waves = Array.from({ length: 9 }, () => ({
    kx: ((r() * 6) | 0) + 1, ky: ((r() * 6) | 0) + 1, p: r() * 6.28, a: 0.4 + r() * 0.6,
  }))
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0
    for (const w of waves) v += Math.sin((x / size) * w.kx * Math.PI * 2 + (y / size) * w.ky * Math.PI * 2 + w.p) * w.a
    height[y * size + x] = v
  }
  const c = canvas(size, size, (ctx) => {
    const img = ctx.createImageData(size, size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const hx = height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)]
      const hy = height[((y + 1) % size) * size + x] - height[((y - 1 + size) % size) * size + x]
      const nx = -hx * 0.18, ny = -hy * 0.18, nz = 1
      const l = Math.hypot(nx, ny, nz)
      const i = (y * size + x) * 4
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  })
  return tex(c, { repeat, srgb: false })
}

export function tarp(color) {
  const r = rng(99)
  return tex(canvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.12 + r() * 0.12
      ctx.strokeStyle = r() > 0.5 ? '#ffffff' : '#000000'
      ctx.lineWidth = 1 + r() * 3
      ctx.beginPath()
      ctx.moveTo(r() * w, r() * h)
      ctx.lineTo(r() * w, r() * h)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }), { repeat: [2, 2] })
}
