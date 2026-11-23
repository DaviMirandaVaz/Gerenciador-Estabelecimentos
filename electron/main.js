const { app, BrowserWindow, Menu, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow = null;

function getLogPath() {
  try {
    if (app && app.isReady()) {
      return path.join(app.getPath('userData'), 'app-debug.log');
    }
  } catch (e) {}
  const tmpDir = require('os').tmpdir();
  return path.join(tmpDir, 'app-debug.log');
}
function log(msg) {
  try {
    fs.appendFileSync(getLogPath(), `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

log("Electron main process starting...");

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      codeCache: true
    }
  }
]);

function findWasmFile(requestedPath) {
  if (fs.existsSync(requestedPath)) return requestedPath;

  const unpackedPath = requestedPath.replace('app.asar', 'app.asar.unpacked');
  if (fs.existsSync(unpackedPath)) return unpackedPath;

  const appDir = path.join(__dirname, '..');
  const candidates = [
    path.join(appDir, 'node_modules', 'expo-sqlite', 'web', 'wa-sqlite', 'wa-sqlite.wasm'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'expo-sqlite', 'web', 'wa-sqlite', 'wa-sqlite.wasm'),
    path.join(appDir, 'dist', 'assets', 'node_modules', 'expo-sqlite', 'web', 'wa-sqlite', 'wa-sqlite.wasm')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  const searchDirs = [
    path.join(appDir, 'dist', 'assets', 'node_modules', 'expo-sqlite', 'web', 'wa-sqlite'),
    path.join(appDir.replace('app.asar', 'app.asar.unpacked'), 'dist', 'assets', 'node_modules', 'expo-sqlite', 'web', 'wa-sqlite'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'expo-sqlite', 'web', 'wa-sqlite')
  ];

  for (const dir of searchDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        const found = files.find(f => f.endsWith('.wasm'));
        if (found) return path.join(dir, found);
      }
    } catch (e) {}
  }

  return null;
}

// Resolve the real path for any asset file, looking in multiple locations
function resolveAssetPath(distDir, pathname) {
  // 1. Direct path in dist
  const directPath = path.join(distDir, pathname);
  if (fs.existsSync(directPath) && !fs.statSync(directPath).isDirectory()) {
    return directPath;
  }

  // 2. app.asar.unpacked equivalent of the direct path
  const unpackedDirect = directPath.replace(/app\.asar([\/\\])/g, 'app.asar.unpacked$1');
  if (unpackedDirect !== directPath && fs.existsSync(unpackedDirect) && !fs.statSync(unpackedDirect).isDirectory()) {
    return unpackedDirect;
  }

  // 3. For /assets/node_modules/... paths, try looking in unpacked node_modules at root
  //    e.g. /assets/node_modules/@expo/vector-icons/... -> <unpacked>/node_modules/@expo/vector-icons/...
  const assetsNodeModulesPrefix = '/assets/node_modules/';
  if (pathname.startsWith(assetsNodeModulesPrefix)) {
    const subPath = pathname.slice(assetsNodeModulesPrefix.length);
    const appRoot = path.join(__dirname, '..');

    // Try unpacked node_modules (where asarUnpack extracts to)
    const unpackedNmPath = path.join(
      appRoot.replace(/app\.asar([\/\\])/g, 'app.asar.unpacked$1'),
      'node_modules',
      subPath
    );
    if (fs.existsSync(unpackedNmPath) && !fs.statSync(unpackedNmPath).isDirectory()) {
      return unpackedNmPath;
    }

    // Also try under process.resourcesPath unpacked
    if (process.resourcesPath) {
      const resPacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', subPath);
      if (fs.existsSync(resPacked) && !fs.statSync(resPacked).isDirectory()) {
        return resPacked;
      }
    }

    // Try dist/assets/node_modules (hashed filenames - strip hash from filename)
    const distAssetsPath = path.join(distDir, 'assets', 'node_modules', subPath);
    if (fs.existsSync(distAssetsPath) && !fs.statSync(distAssetsPath).isDirectory()) {
      return distAssetsPath;
    }

    // Try to find by base filename (ignoring content hash) in dist/assets/node_modules
    const dirName = path.dirname(distAssetsPath);
    const baseName = path.basename(subPath);
    const extName = path.extname(baseName).toLowerCase();
    const nameWithoutExt = path.basename(baseName, extName);
    // Strip hash like ".b4eb097d35f44ed943676fd56f6bdc51" from the name
    const nameWithoutHash = nameWithoutExt.replace(/\.[a-f0-9]{32}$/, '');
    try {
      if (fs.existsSync(dirName)) {
        const files = fs.readdirSync(dirName);
        const match = files.find(f => {
          const fExt = path.extname(f).toLowerCase();
          const fBase = path.basename(f, fExt);
          const fBaseNoHash = fBase.replace(/\.[a-f0-9]{32}$/, '');
          return fExt === extName && fBaseNoHash === nameWithoutHash;
        });
        if (match) return path.join(dirName, match);
      }
    } catch (e) {}
  }

  return null;
}

function createWindow() {
  const distDir = path.join(__dirname, '..', 'dist');
  log(`distDir: ${distDir}`);

  protocol.handle('app', async (request) => {
    const reqUrl = new URL(request.url);
    let pathname = decodeURIComponent(reqUrl.pathname);

    if (pathname === '/' || !pathname) {
      pathname = '/index.html';
    }

    let filePath = path.join(distDir, pathname);

    if (pathname.endsWith('.wasm') || pathname.includes('.wasm')) {
      // --- WASM files ---
      const wasmPath = findWasmFile(filePath);
      if (wasmPath) {
        filePath = wasmPath;
        log(`Found WASM file: ${filePath}`);
      } else {
        log(`WASM file not found for ${pathname}`);
        return new Response('WASM file not found', { status: 404 });
      }
    } else {
      const ext = path.extname(pathname).toLowerCase();
      const isFont = ['.ttf', '.otf', '.woff', '.woff2'].includes(ext);
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].includes(ext);

      if (isFont || isImage) {
        // --- Font / Image assets: use smart resolver ---
        const resolved = resolveAssetPath(distDir, pathname);
        if (resolved) {
          filePath = resolved;
          log(`Resolved asset: ${pathname} -> ${filePath}`);
        } else {
          log(`Asset not found: ${pathname}`);
          return new Response(`Asset not found: ${pathname}`, { status: 404 });
        }
      } else {
        // --- JS / HTML and other files ---
        try {
          if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            const unpackedPath = filePath.replace('app.asar', 'app.asar.unpacked');
            if (fs.existsSync(unpackedPath) && !fs.statSync(unpackedPath).isDirectory()) {
              filePath = unpackedPath;
            } else {
              if (ext && ext !== '.html') {
                log(`Asset not found: ${pathname} [checked ${filePath}]`);
                return new Response(`Asset not found: ${pathname}`, { status: 404 });
              }
              const htmlPath = filePath + '.html';
              if (fs.existsSync(htmlPath)) {
                filePath = htmlPath;
              } else {
                filePath = path.join(distDir, 'index.html');
              }
            }
          }
        } catch (err) {
          log(`Error checking file ${filePath}: ${err.message}`);
          const ext2 = path.extname(pathname).toLowerCase();
          if (ext2 && ext2 !== '.html') {
            return new Response(`Asset error: ${err.message}`, { status: 404 });
          }
          filePath = path.join(distDir, 'index.html');
        }
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    log(`Serving ${pathname} -> ${filePath} [MIME: ${mimeType}]`);

    try {
      const response = await net.fetch(pathToFileURL(filePath).toString());
      const headers = new Headers(response.headers);
      headers.set('content-type', mimeType);
      headers.set('access-control-allow-origin', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
      });
    } catch (err) {
      log(`Fetch error for ${filePath}: ${err.message}`);
      return new Response(`File error: ${err.message}`, { status: 404 });
    }
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Projeto 2026 - PDV",
    icon: path.join(__dirname, '..', 'assets', 'images', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log(`did-fail-load: code ${errorCode}, desc: ${errorDescription}, url: ${validatedURL}`);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log(`BROWSER CONSOLE [level ${level}]: ${message} (${sourceId}:${line})`);
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL('app://local/');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

