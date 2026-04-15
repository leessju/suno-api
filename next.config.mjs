/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(ttf|html)$/i,
      type: 'asset/resource'
    });
    return config;
  },
  experimental: {
    serverMinification: false, // the server minification unfortunately breaks the selector class names
    serverComponentsExternalPackages: [
      'better-sqlite3',
      'rebrowser-playwright-core',
      'ghost-cursor-playwright',
      'undici',
    ],
  },
};  

export default nextConfig;
