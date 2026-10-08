/**
 * R3F JSX types under React 19.
 *
 * `@react-three/fiber` declares three's elements by augmenting the JSX
 * namespace. React 19 relocated JSX out of the global scope, so TypeScript
 * resolves `JSX.IntrinsicElements` to a namespace fiber never augments, and
 * every intrinsic element (`<mesh>`, `<group>`, `<meshPhysicalMaterial>`) fails
 * with "Property does not exist on type 'JSX.IntrinsicElements'".
 *
 * Re-declaring the interface inside the `React.JSX` namespace is what makes the
 * elements resolve. Verified against this project's exact versions: fiber 9.8.1,
 * React 19.2.8, TypeScript 5.9.
 *
 * No call-site casting is needed as a result, which is the point.
 */
import type { ThreeElements } from '@react-three/fiber'

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements {}
    }
  }
}

export {}