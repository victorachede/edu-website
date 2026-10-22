// Pure data and validation for a player's look. No three.js here, so the game server can import it too.
// ── options the creator offers ───────────────────────────────────────────────
export const SKIN_TONES = ['#c18f68', '#a07555', '#8d6347', '#7d5640', '#6b4a35', '#5a3a28', '#4a2f20', '#3b2418']
export const HAIR_COLORS = ['#0d0a08', '#1f140d', '#3a2616', '#5b3a22', '#6e1f2a', '#8a8a8a', '#c9a24a']
export const HAIR_STYLES = [
  ['low', 'Low cut'], ['afro', 'Afro'], ['braids', 'Braids'], ['bun', 'Bun'],
  ['cap', 'Cap'], ['headwrap', 'Gele'], ['hijab', 'Hijab'], ['bald', 'Bald'],
]
export const OUTFITS = [
  ['shirt', 'Shirt & trousers'], ['tee', 'Tee & jeans'], ['ankara', 'Ankara dress'],
  ['agbada', 'Agbada'], ['jersey', 'Jersey & shorts'], ['kaftan', 'Kaftan'],
]
export const FRAMES = [['broad', 'Broad'], ['balanced', 'Balanced'], ['curvy', 'Curvy']]
export const COLOR_SWATCHES = ['#1f7a4a', '#c0392b', '#2457a6', '#f1c232', '#222222', '#f2efe6', '#8e44ad', '#e67e22', '#0f8b8d', '#7b3f1d']

export const DEFAULT_LOOK = {
  frame: 1, height: 1, skin: 4, hair: 'low', hairColor: 0, outfit: 'shirt', c1: '#1f7a4a', c2: '#222222',
}

// Server and client both clean looks the same way, so nothing odd travels over the wire.
export function sanitizeLook(l = {}) {
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d)
  const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : d)
  const styles = HAIR_STYLES.map((h) => h[0]), outfits = OUTFITS.map((o) => o[0])
  return {
    frame: Math.round(num(l.frame, 0, 2, 1)),
    height: num(l.height, 0.9, 1.1, 1),
    skin: Math.round(num(l.skin, 0, SKIN_TONES.length - 1, 4)),
    hair: styles.includes(l.hair) ? l.hair : 'low',
    hairColor: Math.round(num(l.hairColor, 0, HAIR_COLORS.length - 1, 0)),
    outfit: outfits.includes(l.outfit) ? l.outfit : 'shirt',
    c1: hex(l.c1, DEFAULT_LOOK.c1),
    c2: hex(l.c2, DEFAULT_LOOK.c2),
  }
}

export function randomLook(r) {
  const pick = (a) => a[(r() * a.length) | 0]
  const female = r() > 0.5
  const hair = female ? pick(['braids', 'bun', 'headwrap', 'hijab', 'low', 'afro']) : pick(['low', 'low', 'cap', 'bald', 'afro'])
  return sanitizeLook({
    frame: female ? 2 : 0 + (r() > 0.6 ? 1 : 0),
    height: 0.94 + r() * 0.12,
    skin: (r() * SKIN_TONES.length) | 0,
    hair,
    hairColor: r() > 0.88 ? 5 : (r() * 4) | 0,
    outfit: female ? pick(['ankara', 'ankara', 'tee', 'kaftan']) : pick(['shirt', 'tee', 'jersey', 'kaftan', 'agbada']),
    c1: pick(COLOR_SWATCHES),
    c2: pick(['#222222', '#2457a6', '#7b3f1d', '#f2efe6', '#c0392b', '#1f7a4a']),
  })
}

