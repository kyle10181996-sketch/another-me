const { app, BrowserWindow, dialog } = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const isDev = !app.isPackaged;
const preferredPort = 37843;
let serverProcess;
let mainWindow;

function findFreePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(findFreePort(startPort + 1)));
    server.once("listening", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.listen(startPort, "127.0.0.1");
  });
}

function getServerPath() {
  const base = isDev ? process.cwd() : process.resourcesPath;
  const packagedPath = path.join(base, ".next", "standalone", "server.js");
  const devPath = path.join(process.cwd(), ".next", "standalone", "server.js");

  if (fs.existsSync(packagedPath)) return packagedPath;
  return devPath;
}

async function waitForServer(url, timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  throw new Error(`Server did not start: ${url}`);
}

async function startNextServer() {
  const port = await findFreePort(preferredPort);
  const serverPath = getServerPath();
  const dataDirectory = path.join(app.getPath("userData"), "data");

  serverProcess = fork(serverPath, [], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      ANOTHER_ME_DATA_DIR: dataDirectory,
    },
    stdio: "ignore",
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

async function createWindow() {
  try {
    const url = await startNextServer();
    mainWindow = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 980,
      minHeight: 680,
      title: "AnotherMe",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await mainWindow.loadURL(url);
  } catch (error) {
    dialog.showErrorBox("AnotherMe failed to start", error instanceof Error ? error.message : String(error));
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});
