const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP_PORT = 37817;

function getEnvTemplate() {
  return [
    'SUPABASE_URL=https://your-project-id.supabase.co',
    'SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key',
    'SUPABASE_SECRET_KEY=your-supabase-service-role-key',
    'OPENAI_API_KEY=your-openai-api-key',
    `APP_BASE_URL=http://127.0.0.1:${DESKTOP_PORT}`,
    'MONTHLY_PRICE_USD=18',
    ''
  ].join('\n');
}

function prepareDesktopEnvironment() {
  const userDataPath = app.getPath('userData');
  const envPath = path.join(userDataPath, '.env');
  const uploadsPath = path.join(userDataPath, 'uploads');
  const appPath = app.getAppPath();

  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(uploadsPath, { recursive: true });

  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, getEnvTemplate(), 'utf8');
  }

  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(DESKTOP_PORT);
  process.env.APP_BASE_URL = `http://127.0.0.1:${DESKTOP_PORT}`;
  process.env.REFRAME_CLIENT_DIST_DIR = path.join(appPath, 'client/dist');
  process.env.REFRAME_ENV_FILE = envPath;
  process.env.REFRAME_UPLOAD_DIR = uploadsPath;

  return {
    envPath,
    serverUrl: `http://127.0.0.1:${DESKTOP_PORT}`
  };
}

function createWindow(serverUrl) {
  const window = new BrowserWindow({
    backgroundColor: '#070706',
    height: 920,
    minHeight: 720,
    minWidth: 1080,
    show: false,
    title: 'Reframe',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    width: 1440
  });

  window.once('ready-to-show', () => window.show());
  window.loadURL(serverUrl);

  return window;
}

async function startDesktopApp() {
  const { envPath, serverUrl } = prepareDesktopEnvironment();

  try {
    const serverModulePath = path.join(app.getAppPath(), 'server/src/index.js');
    const { startServer } = await import(`file://${serverModulePath}`);

    await startServer();
    createWindow(serverUrl);
  } catch (error) {
    const choice = dialog.showMessageBoxSync({
      buttons: ['Open .env file', 'Quit'],
      defaultId: 0,
      detail:
        `${error.message}\n\nThe desktop app stores its environment file here:\n${envPath}\n\nFill in your Supabase and OpenAI keys, then reopen Reframe.`,
      message: 'Reframe could not start',
      type: 'error'
    });

    if (choice === 0) {
      await shell.openPath(envPath);
    }

    app.quit();
  }
}

app.whenReady().then(startDesktopApp);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(`http://127.0.0.1:${DESKTOP_PORT}`);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
