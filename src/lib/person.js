import { buildCharacter, animateCharacter, randomLook, sanitizeLook } from './character.js'

// Crowd people: random look, low detail so 70 of them stay cheap.
export function makePerson(r, opts = {}) {
  const look = randomLook(r)
  if (opts.female !== undefined) {
    look.hair = opts.female ? ['braids', 'bun', 'headwrap', 'hijab'][(r() * 4) | 0] : 'low'
    look.outfit = opts.female ? 'ankara' : look.outfit
    look.frame = opts.female ? 2 : 0
  }
  if (opts.top) look.c1 = opts.top
  if (opts.bottom) look.c2 = opts.bottom
  if (opts.height) look.height = opts.height
  const person = buildCharacter(sanitizeLook(look), { lod: 'low', carry: opts.carry })
  person.userData.phase = r() * 6.28
  return person
}

export const animatePerson = animateCharacter
