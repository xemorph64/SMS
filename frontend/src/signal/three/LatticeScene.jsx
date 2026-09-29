import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { tokenRGB } from './tokens'

/*
 * PQC readiness as a lattice. ML-KEM (FIPS 203) is lattice-based
 * cryptography, so the gauge is literally a lattice: one node per percent of
 * traffic, lit steel-blue when that share already uses quantum-safe key
 * exchange. An unlit lattice is the honest picture of "harvest now, decrypt
 * later" exposure.
 */

const N = 5 // 5 x 5 x 4 = 100 nodes -> one per percent
const LAYERS = 4
const STEP = 0.42

export default function LatticeScene({ percent = 0 }) {
  const group = useRef()
  const mesh = useRef()

  const colors = useMemo(() => ({
    lit: new THREE.Color(...tokenRGB('ice')),
    dim: new THREE.Color(...tokenRGB('hair-2')),
    gold: new THREE.Color(...tokenRGB('signal')),
  }), [])

  // Nodes ordered from one corner outward so the fill grows like a front.
  const nodes = useMemo(() => {
    const out = []
    const off = (N - 1) / 2
    const offL = (LAYERS - 1) / 2
    for (let y = 0; y < LAYERS; y++)
      for (let x = 0; x < N; x++)
        for (let z = 0; z < N; z++)
          out.push({ p: new THREE.Vector3((x - off) * STEP, (y - offL) * STEP, (z - off) * STEP), d: x + y + z })
    return out.sort((a, b) => a.d - b.d)
  }, [])

  const lit = Math.round(Math.max(0, Math.min(100, percent)))

  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry((N - 1) * STEP + 0.3, (LAYERS - 1) * STEP + 0.3, (N - 1) * STEP + 0.3)
    return new THREE.EdgesGeometry(box)
  }, [])

  const setup = (m) => {
    mesh.current = m
    if (!m) return
    const d = new THREE.Object3D()
    nodes.forEach((n, i) => {
      d.position.copy(n.p)
      d.scale.setScalar(i < lit ? 1.25 : 0.8)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      m.setColorAt(i, i < lit ? colors.lit : colors.dim)
    })
    if (m.material) m.material.needsUpdate = true
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }

  useFrame((three, delta) => {
    if (!group.current) return
    group.current.rotation.y += Math.min(delta, 0.05) * 0.25
    group.current.rotation.x = 0.45 + three.pointer.y * 0.1
  })

  return (
    <group ref={group}>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={colors.gold} transparent opacity={0.45} />
      </lineSegments>
      <instancedMesh key={lit} ref={setup} args={[null, null, nodes.length]}>
        <instancedBufferAttribute attach="instanceColor" args={[new Float32Array(nodes.length * 3), 3]} />
        <boxGeometry args={[0.07, 0.07, 0.07]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
