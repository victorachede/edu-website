import * as THREE from 'three'
import { createRenderer, createSky, followShadow } from './lib/world.js'
import { Player } from './lib/player.js'
import { Net } from './lib/net.js'
import { createMarket } from './zones/market.js'
import { createBridge } from './zones/bridge.js'
import { createWurukum } from './zones/wurukum.js'
import { createCreator, loadProfile, saveProfile } from './ui.js'
import { listCharacters } from './lib/models.js'

const bar = document.querySelector('#bar i')
const loadingEl = document.getElementById('loading')
const creatorEl = document.getElementById('creator')
const placeEl = document.getElementById('place')
const onlineEl = document.getElementById('online')
const params = new URLSearchParams(location.search)

const renderer = createRenderer(document.body)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3500)
const { dir, sunDir } = createSky(scene, renderer)
const player = new Player(camera, renderer.domElement)
scene.add(player.root)

let profile = loadProfile()
let creating = false
let modelList = []
let previewSnap = true
let started = false // don't join the server until the player has chosen a look
let creator = null
player.setLook(profile.look)

const net = new Net(scene, (n, state) => {
  const label = state === 'online' ? `${n} here now` : state === 'connecting' ? 'Connecting…' : state === 'full' ? 'Place is full (solo)' : 'Solo (server off)'
  onlineEl.innerHTML = `<i></i>${label}`
  onlineEl.classList.toggle('on', state === 'online')
})
const me = () => ({ name: profile.name || 'Guest', look: player.look, x: player.pos.x, y: player.pos.y, z: player.pos.z })

const zones = {}
let zone = null

function load(id) {
  if (zone) scene.remove(zone.group)
  if (!zones[id]) zones[id] = id === 'market' ? createMarket({ renderer }) : id === 'wurukum' ? createWurukum({ renderer, sunDir }) : createBridge({ renderer, sunDir })
  zone = zones[id]
  scene.add(zone.group)
  scene.fog.density = zone.fogDensity
  player.place(zone)
  zone.setCrowd?.(!creating)
  camera.position.set(player.pos.x, player.pos.y + 3, player.pos.z + 6)
  placeEl.innerHTML = `<h2>${zone.info.title}</h2>${zone.info.text}`
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.z === id))
  history.replaceState(null, '', `?zone=${id}`)
  if (started && !creating) net.connect(id, me)
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => load(b.dataset.z)))

function openCreator() {
  creating = true
  previewSnap = true
  document.body.classList.add('creating')
  player.frozen = true
  creatorEl.hidden = false
  zone.setCrowd?.(false)
  placeEl.style.display = 'none'
  creator = createCreator(creatorEl, profile, {
    models: modelList,
    onChange: ({ name, look }) => {
      profile = { ...profile, name, look }
      player.setLook(look)
    },
    onDone: ({ name, look }) => {
      profile = { name: name.trim(), look, saved: true }
      saveProfile(profile)
      player.setLook(look)
      closeCreator()
    },
  })
  creator.setDoneLabel(profile.saved ? 'Back to Benue Life' : 'Walk in')
}

function closeCreator() {
  creating = false
  document.body.classList.remove('creating')
  player.frozen = false
  creatorEl.hidden = true
  zone.setCrowd?.(true)
  placeEl.style.display = ''
  camera.clearViewOffset()
  camera.updateProjectionMatrix()
  started = true
  net.connect(zone.id, me) // (re)join with the final look and name
}
document.getElementById('chbtn').addEventListener('click', () => { if (!creating) openCreator() })

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

// While the creator is open the camera turns to face the character.
function previewCamera() {
  const h = player.look.height || 1
  const yaw = player.yaw + Math.PI
  const d = 3 * h
  const target = new THREE.Vector3(player.pos.x, player.pos.y + 0.98 * h, player.pos.z)
  const want = new THREE.Vector3(player.pos.x + Math.sin(player.yaw) * d, player.pos.y + 1.3 * h, player.pos.z + Math.cos(player.yaw) * d)
  void yaw
  if (previewSnap) { camera.position.copy(want); previewSnap = false } else camera.position.lerp(want, 0.2)
  camera.lookAt(target)
  const narrow = innerWidth < 760
  camera.setViewOffset(innerWidth, innerHeight, narrow ? 0 : -innerWidth * 0.17, narrow ? innerHeight * 0.18 : 0, innerWidth, innerHeight)
}

const clock = new THREE.Clock()
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05)
  const t = clock.elapsedTime
  zone.update(dt, t)
  player.update(dt, zone)
  if (creating) previewCamera()
  net.update(dt, t, { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, sp: player.speed })
  followShadow(dir, player.pos, sunDir)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// Build the first place on the next frame so the loading bar can paint.
bar.style.width = '40%'
setTimeout(() => {
  load(['bridge', 'wurukum'].includes(params.get('zone')) ? params.get('zone') : 'market')
  bar.style.width = '100%'
  loadingEl.remove()
  requestAnimationFrame(frame)
  listCharacters().then((l) => { modelList = l }).catch(() => {}).finally(() => {
    if (params.has('skip') && profile.name) closeCreatorFirst()
    else openCreator()
  })
}, 60)

function closeCreatorFirst() { creating = false; player.frozen = false; started = true; net.connect(zone.id, me) }

// handy for tests and debugging
window.__bl = { renderer, scene, camera, player, net, load, get zone() { return zone }, openCreator, closeCreator }
