/**
 * The scene: one light, one creature, one camera path.
 *
 * design/DESIGN.md is the constraint here, not a style preference:
 *
 *  - "The companion is the brightest thing on the screen. Always." So exactly one
 *    key light, a low violet fill, and bloom on the optic only.
 *  - "Glow is rationed." Three things may bloom: the optic, the level meter, the
 *    download affordance. Nothing else.
 *  - "Shadows are tinted, never neutral." The fill is violet so the creature reads
 *    as standing in the brand's light rather than under stage lighting.
 *
 * The camera follows a fixed path driven by scroll, and every value is damped.
 * A snapping transition is the difference between "interactive" and "a web page
 * with 3D on it", so nothing here snaps.
 */
import { Suspense, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

import { Creature } from './Creature'
import { easeInOut, range, type ScrollState } from '../lib/scroll'
import type { Quality } from '../lib/quality'

interface Keyframe {
  at: number
  pos: [number, number, number]
  look: [number, number, number]
}

/**
 * Camera keyframes, one per narrative beat. Positions were chosen against the
 * creature's real scale at roughly 0.9 units tall: closer than ~2.2 and the
 * ears clip, further than ~5 and it stops being a character.
 */
const CAMERA_PATH: Keyframe[] = [
  { at: 0.0, pos: [0, 0.3, 4.4], look: [0, 0.1, 0] },
  { at: 0.13, pos: [0, 0.22, 3.4], look: [0, 0.26, 0] },
  { at: 0.27, pos: [0.34, 0.32, 2.6], look: [0, 0.4, 0] },
  { at: 0.41, pos: [-0.62, 0.5, 2.8], look: [0, 0.32, 0] },
  { at: 0.55, pos: [0, 1.05, 2.5], look: [0, 0.22, 0] },
  { at: 0.69, pos: [0.2, 0.4, 3.3], look: [0, 0.36, 0] },
  { at: 0.83, pos: [1.05, 0.24, 2.35], look: [0.1, 0.32, 0] },
  { at: 1.0, pos: [0, 0.14, 5.0], look: [0, 0.1, 0] },
]

function samplePath(progress: number): { pos: THREE.Vector3; look: THREE.Vector3 } {
  // Indexing a module constant is provably in range, but noUncheckedIndexedAccess
  // cannot see that. A non-null assertion here is honest: the bounds are
  // guaranteed by the loop condition and by the constant's length.
  let i = 0
  while (i < CAMERA_PATH.length - 2 && progress > CAMERA_PATH[i + 1]!.at) i += 1
  const a = CAMERA_PATH[i]!
  const b = CAMERA_PATH[i + 1]!
  const t = easeInOut(range(progress, a.at, b.at))

  const pos = new THREE.Vector3(
    THREE.MathUtils.lerp(a.pos[0], b.pos[0], t),
    THREE.MathUtils.lerp(a.pos[1], b.pos[1], t),
    THREE.MathUtils.lerp(a.pos[2], b.pos[2], t),
  )
  const look = new THREE.Vector3(
    THREE.MathUtils.lerp(a.look[0], b.look[0], t),
    THREE.MathUtils.lerp(a.look[1], b.look[1], t),
    THREE.MathUtils.lerp(a.look[2], b.look[2], t),
  )
  return { pos, look }
}

function Rig({
  scroll,
  quality,
  demoBoostRef,
  reducedMotion,
}: {
  scroll: ScrollState
  quality: Quality
  demoBoostRef: React.RefObject<number>
  reducedMotion: boolean
}) {
  const camera = useThree((s) => s.camera)
  const target = useRef({
    pos: new THREE.Vector3(0, 0.3, 4.4),
    look: new THREE.Vector3(0, 0.1, 0),
    scratchPos: new THREE.Vector3(),
    scratchLook: new THREE.Vector3(),
  })

  useFrame((_, delta) => {
    const state = target.current
    // Reduced motion composes a still frame instead of hiding the scene. The
    // creature is the argument for the product, so it stays on screen; it just
    // stops moving. Spec §20 and the OS setting are honoured as real states.
    const p = reducedMotion ? 0.62 : scroll.progress

    const { pos, look } = samplePath(p)
    const lambda = reducedMotion ? 0 : 2.4

    state.pos.set(
      THREE.MathUtils.damp(state.pos.x, pos.x, lambda, delta),
      THREE.MathUtils.damp(state.pos.y, pos.y, lambda, delta),
      THREE.MathUtils.damp(state.pos.z, pos.z, lambda, delta),
    )
    state.look.set(
      THREE.MathUtils.damp(state.look.x, look.x, lambda, delta),
      THREE.MathUtils.damp(state.look.y, look.y, lambda, delta),
      THREE.MathUtils.damp(state.look.z, look.z, lambda, delta),
    )

    // Idle drift so a still page still breathes. Slower than the creature's own
    // idle, so the two never beat together like loops cut from the same file.
    if (!reducedMotion) {
      const t = performance.now() * 0.00013
      state.scratchPos.set(state.pos.x + Math.sin(t) * 0.035, state.pos.y + Math.cos(t * 0.83) * 0.022, state.pos.z)
      state.scratchLook.copy(state.look)
    } else {
      state.scratchPos.copy(state.pos)
      state.scratchLook.copy(state.look)
    }

    camera.position.copy(state.scratchPos)
    camera.lookAt(state.scratchLook)
  })

  return (
    <>
      {/*
        One key light, top-left, the only shadow caster. Two competing keys is
        the fastest way to make a subject look lit twice.
      */}
      <directionalLight
        position={[-3.2, 4.4, 3]}
        intensity={2.7}
        color="#f4f2ff"
        castShadow={quality.softShadows}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-bias={-0.0004}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      {/* Violet fill. Reads as the brand's own light rather than stage lighting. */}
      <hemisphereLight args={['#4b3fd6', '#0a0c16', 0.6]} />
      {/* Dim cyan rim from behind to separate the silhouette from the fog. */}
      <directionalLight position={[3.2, 1.6, -4]} intensity={0.9} color="#31d6ff" />

      <Creature
        scroll={scroll}
        demoBoostRef={demoBoostRef}
        quality={quality}
        reducedMotion={reducedMotion}
      />
    </>
  )
}

export function GochiScene({
  scroll,
  quality,
  demoBoostRef,
  reducedMotion,
}: {
  scroll: ScrollState
  quality: Quality
  demoBoostRef: React.RefObject<number>
  reducedMotion: boolean
}) {
  return (
    <Canvas
      shadows={quality.softShadows ? 'soft' : false}
      dpr={[1, quality.dprCap]}
      camera={{ position: [0, 0.3, 4.4], fov: 38, near: 0.1, far: 60 }}
      gl={{
        antialias: quality.tier !== 'low',
        powerPreference: 'high-performance',
        alpha: true,
      }}
      // The stage sits behind the content and must never intercept a click.
      style={{ pointerEvents: 'none' }}
    >
      {/* Depth fog, not a gradient. One deep value that swallows the edges. */}
      <fog attach="fog" args={['#05060d', 5.5, 15]} />
      <color attach="background" args={['#05060d']} />

      <Suspense fallback={null}>
        <Rig
          scroll={scroll}
          quality={quality}
          demoBoostRef={demoBoostRef}
          reducedMotion={reducedMotion}
        />

        {quality.bloom ? (
          <EffectComposer enableNormalPass={false}>
            {/*
              High threshold, low intensity. A low threshold blooms the whole
              subject and turns a violet character into a neon smear; this keeps
              the glow on the optic and nowhere else.
            */}
            <Bloom
              intensity={quality.bloomIntensity}
              luminanceThreshold={0.62}
              luminanceSmoothing={0.28}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.22} darkness={0.7} />
          </EffectComposer>
        ) : null}
      </Suspense>
    </Canvas>
  )
}