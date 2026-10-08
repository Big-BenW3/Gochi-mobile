/**
 * The creature, built in code.
 *
 * Why procedural rather than a GLB: the scroll story needs an egg that becomes
 * a creature, which means the silhouette itself has to change. A single static
 * model cannot morph into a different outline, so it would have to crossfade,
 * and a crossfade reads as two objects rather than one growing.
 *
 * The geometry is built from primitives arranged with intent, which also keeps
 * the payload in kilobytes instead of megabytes and keeps every material
 * addressable by the app's own palette tokens.
 *
 * Anatomy notes, since proportions are what separate a read as "designed" from
 * a read as "clip art":
 *
 *  - The head is a sphere scaled on Y and pulled forward, not a sphere. A pure
 *    sphere reads as a ball; a slight forward pull gives a muzzle direction, and
 *    a direction is what makes a face look like it is looking at something.
 *  - Ears are tubes swept along a curve rather than cones. A cone reads as a
 *    party hat; a swept tube tapers along its length and can bend, which is what
 *    an ear does.
 *  - The optic is two lenses set into the face, emissive, and the only thing in
 *    the scene allowed to bloom. The design doctrine is explicit: the companion
 *    is the brightest thing on screen, and glow is rationed.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { easeInOut, range, type ScrollState } from '../lib/scroll'

export interface CreatureProps {
  /**
   * Scroll is passed in, but read inside the frame loop rather than turned into
   * props. Deriving these values in React would mean the creature only moved on
   * React renders, which for a scroll-linked page is the wrong cadence and the
   * source of most jank.
   */
  scroll: ScrollState
  /** Raised by the interactive demo, decayed here. */
  demoBoostRef: React.RefObject<number>
  quality: { softShadows: boolean }
  reducedMotion: boolean
}

/** Growth: the egg opens across scene 05, then stays open. */
function growthAt(progress: number): number {
  return easeInOut(range(progress, 0.46, 0.62))
}

/** Energy: rises through the story and lifts with the demo. */
function energyAt(progress: number, boost: number): number {
  const ambient = 0.18 + Math.sin(progress * Math.PI) * 0.22
  return Math.min(1, ambient + boost)
}

const SHELL = '#7a6bff'
const SHELL_LIT = '#a99bff'
const OPTIC = '#31d6ff'

export function Creature({ scroll, demoBoostRef, quality, reducedMotion }: CreatureProps) {
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const earL = useRef<THREE.Mesh>(null)
  const earR = useRef<THREE.Mesh>(null)
  const opticL = useRef<THREE.Mesh>(null)
  const opticR = useRef<THREE.Mesh>(null)
  const shellMaterial = useRef<THREE.MeshPhysicalMaterial>(null)

  /**
   * The ear curve. Built once: a gentle backward-then-forward sweep so the ear
   * has a base, a rise and a tip that leans out. Two mirrored copies.
   */
  const earCurve = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12
      pts.push(
        new THREE.Vector3(
          0,
          t * 1.5,
          // leans back at the base, then tips forward at the tip
          Math.sin(t * Math.PI) * 0.16 - t * 0.1,
        ),
      )
    }
    return new THREE.CatmullRomCurve3(pts)
  }, [])

  const earGeometry = useMemo(() => {
    // TubeGeometry radius is constant, so taper is applied by scaling the mesh
    // along its own length and pinching the tip with a second, smaller ring
    // group. Cheap, and reads correctly at the distances this renders.
    return new THREE.TubeGeometry(earCurve, 24, 0.075, 12, false)
  }, [earCurve])

  const opticGeometry = useMemo(() => new THREE.SphereGeometry(0.062, 20, 16), [])

  // Scratch vectors, allocated once. Creating a Vector2 per frame per instance
  // is the classic three.js leak: they are not garbage collected while the
  // closure lives, so the allocation has to leave the frame loop.
  const lookTarget = useMemo(() => new THREE.Vector2(), [])
  const shellTarget = useMemo(() => new THREE.Color(), [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime

    const progress = reducedMotion ? 0.62 : scroll.progress
    const growth = growthAt(progress)
    const energy = energyAt(progress, demoBoostRef.current ?? 0)

    // Decay the demo boost here so the only place that owns it also spends it.
    if (demoBoostRef.current !== undefined) {
      demoBoostRef.current = THREE.MathUtils.damp(demoBoostRef.current, 0, 1.6, delta)
    }

    // Unfold: the whole creature scales, and the ears uncurl on the same curve
    // so they arrive with the body rather than after it.
    const bodyScale = 0.45 + growth * 0.55
    if (root.current) root.current.scale.setScalar(bodyScale)
    for (const ear of [earL.current, earR.current]) {
      if (ear) ear.scale.y = 0.25 + growth * 0.75
    }
    if (head.current) head.current.position.y = 0.52 * growth + 0.2

    // Damped look-at. Without the damping the head tracks the cursor rigidly and
    // the whole thing reads as a mechanical turret; with it, it reads as
    // attention. Frame-rate independent so it feels the same at 60 and 120fps.
    if (head.current && !reducedMotion) {
      lookTarget.set(scroll.pointer.x, scroll.pointer.y)
      const lambda = 3.2
      const targetY = lookTarget.x * 0.34
      const targetX = -lookTarget.y * 0.22
      head.current.rotation.y = THREE.MathUtils.damp(
        head.current.rotation.y,
        targetY,
        lambda,
        delta,
      )
      head.current.rotation.x = THREE.MathUtils.damp(
        head.current.rotation.x,
        targetX,
        lambda,
        delta,
      )
    }

    if (!reducedMotion) {
      // Breathing, and the body rises a little with excitement rather than
      // bouncing. Two different curves on purpose: bounce reads as toy, breath
      // reads as alive.
      const breath = Math.sin(t * 1.15) * 0.5 + 0.5
      const sway = Math.sin(t * 0.63) * 0.5 + 0.5

      if (root.current) {
        root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, breath * 0.045 + energy * 0.05, 0.06)
        root.current.rotation.z = sway * 0.014
      }

      // Ears twitch on their own schedule, not in sync with breathing, because
      // synchronised motion is the tell that a loop was authored rather than
      // simulated.
      const twitchL = Math.max(0, Math.sin(t * 0.9 + 1.4) - 0.94) * 9
      const twitchR = Math.max(0, Math.sin(t * 0.9 + 4.1) - 0.94) * 9
      if (earL.current) earL.current.rotation.z = 0.34 + twitchL * 0.1
      if (earR.current) earR.current.rotation.z = -0.34 - twitchR * 0.1
    }

    // The optic is the only emissive element, so its brightness is the single
    // lever that expresses state. Idle breathing on the glow, energy widens it.
    const pulse = reducedMotion ? 0.6 : 0.55 + Math.sin(t * 1.6) * 0.12
    const lit = pulse * (0.55 + energy * 0.75)
    const scale = 1 + energy * 0.22
    for (const optic of [opticL.current, opticR.current]) {
      if (!optic) continue
      const mat = optic.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = lit
      optic.scale.setScalar(scale)
    }

    // Shell tint drifts very slightly with energy, which reads as the body
    // warming up. Kept inside the brand violet so it never leaves the palette.
    if (shellMaterial.current) {
      shellTarget.set(SHELL).lerp(new THREE.Color(SHELL_LIT), energy * 0.5)
      shellMaterial.current.color.lerp(shellTarget, 0.04)
    }
  })

  // `growth` is applied in the frame loop above, not here, so the JSX holds no
  // scroll-derived values at all.

  return (
    <group ref={root} position={[0, -0.15, 0]}>
      {/* body — a capsule, the simplest form that still has weight to it */}
      <mesh castShadow={quality.softShadows} receiveShadow={quality.softShadows} scale={0.45}>
        <sphereGeometry args={[0.62, 48, 36]} />
        <meshPhysicalMaterial
          ref={shellMaterial}
          color={SHELL}
          roughness={0.34}
          metalness={0.06}
          clearcoat={0.7}
          clearcoatRoughness={0.28}
          sheen={0.35}
          sheenColor="#31d6ff"
        />
      </mesh>

      {/* head group, so look-at rotates head and ears together */}
      <group ref={head} position={[0, 0.2, 0.06]}>
        <mesh castShadow={quality.softShadows} scale={[0.82, 0.74, 0.9]}>
          <sphereGeometry args={[0.44, 48, 36]} />
          <meshPhysicalMaterial
            color={SHELL}
            roughness={0.3}
            metalness={0.06}
            clearcoat={0.75}
            clearcoatRoughness={0.24}
            sheen={0.4}
            sheenColor="#31d6ff"
          />
        </mesh>

        {/* ears: swept tubes, mirrored, uncurling as growth increases */}
        <group visible>
          <mesh
            ref={earL}
            geometry={earGeometry}
            castShadow={quality.softShadows}
            position={[-0.24, 0.24, -0.02]}
            rotation={[0.16, 0.2, 0.34]}
            scale={[1, 0.25, 1]}
          >
            <meshPhysicalMaterial
              color={SHELL_LIT}
              roughness={0.42}
              clearcoat={0.4}
              sheen={0.5}
              sheenColor="#31d6ff"
            />
          </mesh>
          <mesh
            ref={earR}
            geometry={earGeometry}
            castShadow={quality.softShadows}
            position={[0.24, 0.24, -0.02]}
            rotation={[0.16, -0.2, -0.34]}
            scale={[1, 0.25, 1]}
          >
            <meshPhysicalMaterial
              color={SHELL_LIT}
              roughness={0.42}
              clearcoat={0.4}
              sheen={0.5}
              sheenColor="#31d6ff"
            />
          </mesh>
        </group>

        {/* optic: two emissive lenses. The only bloom source in the scene. */}
        <mesh ref={opticL} geometry={opticGeometry} position={[-0.16, 0.04, 0.36]}>
          <meshStandardMaterial
            color="#05060d"
            emissive={OPTIC}
            emissiveIntensity={0.6}
            roughness={0.2}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={opticR} geometry={opticGeometry} position={[0.16, 0.04, 0.36]}>
          <meshStandardMaterial
            color="#05060d"
            emissive={OPTIC}
            emissiveIntensity={0.6}
            roughness={0.2}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}