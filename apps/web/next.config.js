/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hidden-catalyst/ui', '@hidden-catalyst/domain', '@hidden-catalyst/config', '@hidden-catalyst/db', '@hidden-catalyst/connectors', '@hidden-catalyst/engine'],
};

module.exports = nextConfig;
