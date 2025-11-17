module.exports = {
  apps: [
    {
      name: 'worker',
      script: 'dist/src/main.js',
      cwd: __dirname,
      instances: parseInt(process.env.WORKER_PM2_INSTANCES || '1', 10),
      exec_mode: 'cluster',
      watch: false,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        WORKER_MAX_CONCURRENT: process.env.WORKER_MAX_CONCURRENT || '1',
        MAIN_SERVICE_URL: process.env.MAIN_SERVICE_URL || 'http://localhost:3000/api/v1',
      },
      env_development: {
        NODE_ENV: 'development',
      },
    },
  ],
};
