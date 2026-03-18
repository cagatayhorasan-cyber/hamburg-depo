const { startServer } = require("./server/app");

startServer().catch((error) => {
  console.error("Sunucu baslatilamadi.", error);
  process.exit(1);
});
