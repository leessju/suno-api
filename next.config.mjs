/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    'better-sqlite3',
    'rebrowser-playwright-core',
    'ghost-cursor-playwright',
    'undici',
  ],
  turbopack: {
    rules: {
      '*.ttf': {
        loaders: [],
        as: '*.ttf',
      },
      '*.html': {
        loaders: [],
        as: '*.html',
      },
    },
  },
};

export default nextConfig;
