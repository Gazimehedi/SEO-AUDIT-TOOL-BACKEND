module.exports = {
  apps: [
    {
      name: "seotool-backend",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      instances: 1,
      exec_mode: "fork",
      watch: false
    }
  ]
};
