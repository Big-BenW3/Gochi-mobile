/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM in places, which trips the default server
  // components build. Left explicit rather than silencing the whole rule, since
  // a broad ignore would also hide genuine errors.
  transpilePackages: ['three'],
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig