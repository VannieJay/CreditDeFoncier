module.exports = {
  apps: [{
    name: "creditdefoncier",
    cwd: "/opt/creditdefoncier/backend",
    script: "server.js",
    instances: 1,
    exec_mode: "fork",
    env: { NODE_ENV: "production", PORT: 4000 },
    max_memory_restart: "450M"
  }]
};
