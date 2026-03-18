const { app, BrowserWindow } = require("electron");
const path = require("path");
const { startServer } = require(path.join(__dirname, "..", "server", "app"));

let server;

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 960,
    backgroundColor: "#efe8dc",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://127.0.0.1:3000");
}

app.whenReady().then(() => {
  server = startServer(3000);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
  }
});
