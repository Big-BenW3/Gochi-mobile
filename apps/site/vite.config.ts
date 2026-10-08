import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Vite config for the Gochi landing page.
 *
 * Two deliberate choices:
 *
 * 1. `manualChunks` splits three.js and gsap out of the app bundle. A 3D landing
 *    page is mostly vendor weight, and separating it means a content change does
 *    not invalidate ~700KB of cached 3D runtime. Worth one extra request.
 *
 * 2. `assetsInlineLimit: 0` for images. Inlining a hero image would duplicate it
 *    into every JS chunk that imports it; the 3D assets are the heaviest thing
 *    on the page and belong on disk with their own cache headers.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          post: ['postprocessing', '@react-three/postprocessing'],
          gsap: ['gsap'],
        },
      },
    },
  },

  server: {
    host: true,
    port: 3000,
  },
})