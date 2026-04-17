/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // `radius` uses __dirname to locate its bundled dictionary files at runtime.
  // Keep it external so its package layout (and ./dictionaries/) is preserved.
  serverExternalPackages: ["radius"],
  // Exclude tmp/ from build tree
  outputFileTracingExcludes: {
    "*": ["./tmp/**/*"],
  },
};

export default nextConfig;
