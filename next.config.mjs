/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Lint is run separately in CI; don't fail the build on lint.
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
