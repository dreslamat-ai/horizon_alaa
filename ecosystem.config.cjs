// محمول بين السيرفرات: __dirname بدل مسار مطلق ثابت.
// المنفذ عبر PORT (افتراضي 4001) لأن كل مضيف يحجز منفذه الحر بنفسه.
module.exports = {
  apps: [{
    name: "alaa",
    script: "node_modules/.bin/next",
    args: `start -p ${process.env.PORT || 4001}`,
    cwd: __dirname,
    exec_mode: "fork",
    kill_timeout: 30000,
    listen_timeout: 10000,
    env: { NODE_ENV: "production" },
  }],
};
