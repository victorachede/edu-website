import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

export function createRenderer(canvasParent) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  const phone = matchMedia('(pointer:coarse)').matches
  renderer.setPixelRatio(phone ? 1 : Math.min(window.devicePixelRatio, 1.75))
  renderer.setSize(innerWidth, innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.78
  canvasParent.appendChild(renderer.domElement)
  return renderer
}

const Vignette = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 d=vUv-.5; float v=smoothstep(.85,.25,length(d)*1.25);
      c.rgb*=mix(1.-strength,1.,v);
      // warm, slightly hazy grade
      c.rgb=mix(c.rgb,c.rgb*vec3(1.04,1.0,.93),.6);
      gl_FragColor=c; }`,
}

export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.8, 0.92))
  composer.addPass(new OutputPass())
  composer.addPass(new ShaderPass(Vignette))
  return composer
}

// Hot, hazy harmattan-season Makurdi afternoon: high sun, pale warm sky, dust in the air.
export function createSky(scene, renderer, { elevation = 38, azimuth = 215 } = {}) {
  const sky = new Sky()
  sky.scale.setScalar(4500)
  scene.add(sky)
  const u = sky.material.uniforms
  u.turbidity.value = 9
  u.rayleigh.value = 1.6
  u.mieCoefficient.value = 0.012
  u.mieDirectionalG.value = 0.82

  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth))
  u.sunPosition.value.copy(sun)

  const pm = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  const envSky = sky.clone()
  envSky.material = sky.material
  envScene.add(envSky)
  scene.environment = pm.fromScene(envScene, 0.02).texture
  scene.environmentIntensity = 0.55

  const dir = new THREE.DirectionalLight(0xfff0d8, 3.1)
  dir.position.copy(sun).multiplyScalar(120)
  dir.castShadow = true
  dir.shadow.mapSize.setScalar(matchMedia('(pointer:coarse)').matches ? 1024 : 2048)
  const sc = dir.shadow.camera
  sc.left = sc.bottom = -55
  sc.right = sc.top = 55
  sc.near = 10
  sc.far = 400
  dir.shadow.bias = -0.0004
  dir.shadow.normalBias = 0.04
  scene.add(dir, dir.target)

  const hemi = new THREE.HemisphereLight(0xcfe0f2, 0x8a6a4a, 0.55)
  scene.add(hemi)

  scene.fog = new THREE.FogExp2(0xd8cdb8, 0.0036)
  scene.background = null
  return { sky, dir, sunDir: sun }
}

// Keeps the shadow frustum glued to the player so shadows stay sharp up close.
export function followShadow(light, target, sunDir) {
  light.target.position.copy(target)
  light.position.copy(target).addScaledVector(sunDir, 120)
  light.target.updateMatrixWorld()
}
