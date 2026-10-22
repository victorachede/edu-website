import * as THREE from 'three'
import { createRenderer, createSky, followShadow } from './lib/world.js'
import { Player } from './lib/player.js'
import { createMarket } from './zones/market.js'
import { createBridge } from './zones/bridge.js'

const bar = document.querySelector('#bar i')
const go = document.getElementById('go')
const startEl = document.getElementById('start')
const placeEl = document.getElementById('place')
const params = new URLSearchParams(location.search)

const renderer = createRenderer(document.body)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3500)
const { dir, sunDir } = createSky(scene, renderer)
const player = new Player(camera, renderer.domElement)
scene.add(player.model)

const zones = {}
let zone = null

function load(id) {
  if (zone) scene.remove(zone.group)
  if (!zones[id]) zones[id] = id === 'market' ? createMarket({ renderer }) : createBridge({ renderer, sunDir })
  zone = zones[id]
  scene.add(zone.group)
  scene.fog.density = zone.fogDensity
  player.place(zone)
  camera.position.set(player.pos.x, player.pos.y + 3, player.pos.z + 6)
  placeEl.innerHTML = `<h2>${zone.info.title}</h2>${zone.info.text}`
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.z === id))
  history.replaceState(null, '', `?zone=${id}`)
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => load(b.dataset.z)))

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

const clock = new THREE.Clock()
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05)
  const t = clock.elapsedTime
  zone.update(dt, t)
  player.update(dt, zone)
  followShadow(dir, player.pos, sunDir)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// Build the first place on the next frame so the loading bar can paint.
bar.style.width = '35%'
setTimeout(() => {
  load(params.get('zone') === 'bridge' ? 'bridge' : 'market')
  scene.add(player.model)
  bar.style.width = '100%'
  go.disabled = false
  go.textContent = 'Walk in'
  const begin = () => { startEl.remove(); }
  go.addEventListener('click', begin)
  if (params.has('skip')) begin()
  requestAnimationFrame(frame)
}, 60)
window.__bl = { renderer, scene, camera, player, load, get zone() { return zone } }
