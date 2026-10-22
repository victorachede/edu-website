import * as THREE from 'three'

const dummy = new THREE.Object3D()
const tmp = new THREE.Color()

// Batch many copies of one geometry into a single draw call.
export function createBatch(geometry, material, capacity, { shadow = true, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.castShadow = shadow
  mesh.receiveShadow = receive
  mesh.count = 0
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  return {
    mesh,
    add(x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, color = 0xffffff } = {}) {
      if (mesh.count >= capacity) return
      dummy.position.set(x, y, z)
      dummy.rotation.order = 'YXZ'
      dummy.rotation.set(rx, ry, rz)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(mesh.count, dummy.matrix)
      mesh.setColorAt(mesh.count, tmp.set(color))
      mesh.count++
    },
    done() {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    },
  }
}

export function pick(r, arr) {
  return arr[(r() * arr.length) | 0]
}
