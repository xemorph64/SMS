import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { tokenRGB } from './tokens'

/*
 * The analysis pipeline as a tunnel of gates. Packets stream through the
 * finished gates and stop at the one the engine is working on. The scene is
 * driven only by `active` (index of the current stage) from the real job.
 */

const GAP = 1.05
const FLOW = 140

export default function PipelineScene({ stages = 8, active = 0, failed = false }) {
  const group = useRef()
  const rings = useRef([])
  const flow = useRef()

  const c = useMemo(() => {
    const t = (n) => new THREE.Color(...tokenRGB(n))
    return { gold: t('gold'), cipher: t('cipher'), edge: t('edge-2'), danger: t('danger') }
  }, [])

  const x0 = -((stages - 1) * GAP) / 2
  const parts = useMemo(
    () =>
      Array.from({ length: FLOW }, () => ({
        t: Math.random(),
        a: Math.random() * Math.PI * 2,
        rad: 0.08 + Math.random() * 0.34,
        speed: 0.18 + Math.random() * 0.22,
      })),
    [],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((three, delta) => {
    const dt = Math.min(delta, 0.05)
    const time = three.clock.elapsedTime
    if (group.current) {
      group.current.rotation.y = -0.55 + three.pointer.x * 0.08
      group.current.rotation.x = 0.18 - three.pointer.y * 0.05
    }
    rings.current.forEach((ring, i) => {
      if (!ring) return
      ring.rotation.z += dt * (i === active ? 0.9 : 0.12)
      const s = i === active && !failed ? 1 + Math.sin(time * 3) * 0.05 : 1
      ring.scale.setScalar(s)
    })
    const mesh = flow.current
    if (!mesh) return
    const reach = Math.min(active, stages - 1)
    const xEnd = x0 + reach * GAP
    const xStart = x0 - 1.4
    const span = Math.max(0.001, xEnd - xStart)
    for (let i = 0; i < FLOW; i++) {
      const p = parts[i]
      p.t += (p.speed * dt * 2.2) / span
      if (p.t > 1) p.t -= 1
      p.a += dt * 0.6
      dummy.position.set(xStart + p.t * span, Math.cos(p.a) * p.rad, Math.sin(p.a) * p.rad)
      const edgeFade = Math.min(1, p.t * 6, (1 - p.t) * 6)
      dummy.scale.setScalar(edgeFade)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={group}>
      {/* spine */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.004, 0.004, stages * GAP + 1.6, 6]} />
        <meshBasicMaterial color={c.edge} transparent opacity={0.6} />
      </mesh>

      {Array.from({ length: stages }).map((_, i) => {
        const done = i < active
        const current = i === active
        const color = current ? (failed ? c.danger : c.gold) : done ? c.cipher : c.edge
        return (
          <group key={i} position={[x0 + i * GAP, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <mesh ref={(el) => (rings.current[i] = el)}>
              <torusGeometry args={[0.62, current ? 0.018 : 0.01, 12, 96]} />
              <meshBasicMaterial color={color} transparent opacity={current ? 1 : done ? 0.75 : 0.35} toneMapped={false} />
            </mesh>
            <mesh>
              <ringGeometry args={[0.64, 0.7, 6, 1]} />
              <meshBasicMaterial color={color} transparent opacity={current ? 0.35 : done ? 0.12 : 0.05} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}

      <instancedMesh ref={flow} args={[null, null, FLOW]}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshBasicMaterial color={failed ? c.danger : c.gold} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
