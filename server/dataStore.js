import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determina o caminho do arquivo db.json (no Vercel usa /tmp se o diretório padrão for somente leitura)
const localDbPath = path.join(__dirname, 'data', 'db.json');
const tmpDbPath = path.join('/tmp', 'nyaman_db.json');

let activeDbPath = localDbPath;

// Verifica se estamos no ambiente Vercel Serverless
const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;

let memoryDb = null;

function getDbPath() {
  if (isVercel) {
    if (!fs.existsSync(tmpDbPath)) {
      try {
        if (fs.existsSync(localDbPath)) {
          const content = fs.readFileSync(localDbPath, 'utf8');
          fs.writeFileSync(tmpDbPath, content, 'utf8');
        }
      } catch (err) {
        console.warn('Vercel tmp init warning:', err.message);
      }
    }
    return tmpDbPath;
  }
  return localDbPath;
}

export function readDb() {
  try {
    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      memoryDb = JSON.parse(data);
      return memoryDb;
    }
  } catch (err) {
    console.error('Erro ao ler DB:', err.message);
  }
  if (!memoryDb) {
    memoryDb = {
      config: { airbnbIcalUrl: '', bookingIcalUrl: '', lastSyncTimestamp: null, syncStatus: 'idle' },
      manualBlocks: [],
      cachedEvents: [],
      analytics: { pageViews: [], bookingClicks: [] }
    };
  }
  return memoryDb;
}

export function writeDb(dbData) {
  memoryDb = dbData;
  try {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (err) {
    console.warn('Erro ao salvar no disco (mantido em memória):', err.message);
  }
}
