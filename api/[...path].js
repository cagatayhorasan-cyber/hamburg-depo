const serverless = require("serverless-http");
const { initDatabase } = require("../server/db");
const { createApp } = require("../server/app");

let handlerPromise = null;

module.exports = async (req, res) => {
  if (!handlerPromise) {
    await initDatabase();
    handlerPromise = serverless(createApp());
  }

  return handlerPromise(req, res);
};
