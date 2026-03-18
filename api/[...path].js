const { initDatabase } = require("../server/db");
const { createApp } = require("../server/app");

let appPromise = null;

module.exports = async (req, res) => {
  if (!appPromise) {
    appPromise = (async () => {
      await initDatabase();
      return createApp();
    })();
  }

  const app = await appPromise;
  return app(req, res);
};
