/**
 * PM2 Ecosystem Config
 *
 * 사용법:
 *   개발:  pm2 start ecosystem.config.js --env development
 *   운영:  pm2 start ecosystem.config.js --env production
 *   중지:  pm2 stop all
 *   재시작: pm2 restart all
 *   로그:  pm2 logs
 *
 * 설치 (최초 1회):
 *   npm install -g pm2
 */

const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'nextjs',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: ROOT,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'python-worker',
      script: path.join(ROOT, 'scripts', 'dev-worker.sh'),
      interpreter: 'bash',
      cwd: ROOT,
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 2000,
      // flapping 감지: 5분 내 10회 이상 재시작 시 중단
      min_uptime: '10s',
      env: {
        MUSIC_GEN_DB_PATH: path.join(ROOT, 'data', 'music-gen.db'),
      },
    },
  ],
};
