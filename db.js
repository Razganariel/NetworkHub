import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const SEED_PATH = path.join(__dirname, 'seed.json');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
    seedIfEmpty();
  }
  return db;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === check;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS icons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS fabriquants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      modele TEXT NOT NULL DEFAULT '',
      UNIQUE(nom, modele)
    );

    CREATE TABLE IF NOT EXISTS os (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE,
      version TEXT DEFAULT '',
      icon_id INTEGER REFERENCES icons(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE,
      couleur TEXT DEFAULT '#58a6ff',
      icon_id INTEGER REFERENCES icons(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE,
      hostname TEXT DEFAULT '',
      ip TEXT NOT NULL,
      os_id INTEGER REFERENCES os(id) ON DELETE SET NULL,
      fabriquant_id INTEGER REFERENCES fabriquants(id) ON DELETE SET NULL,
      icon_id INTEGER REFERENCES icons(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS outils (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE,
      categorie_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      port INTEGER,
      main_page TEXT DEFAULT '/',
      icon_id INTEGER REFERENCES icons(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      prefix TEXT NOT NULL DEFAULT 'http://',
      base_url TEXT DEFAULT '',
      url TEXT NOT NULL,
      port TEXT,
      main_page TEXT,
      categorie_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      outil_id INTEGER REFERENCES outils(id) ON DELETE SET NULL,
      machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL
    );
  `);

  // Migration: add data column if missing
  try { db.exec(`ALTER TABLE icons ADD COLUMN data TEXT NOT NULL DEFAULT ''`); } catch {}
  // Migration: add port column if missing
  try { db.exec(`ALTER TABLE cards ADD COLUMN port TEXT`); } catch {}
  try { db.exec(`ALTER TABLE cards ADD COLUMN main_page TEXT`); } catch {}

  // Migration: add settings table if missing
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  // Migration: add users table if missing
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL DEFAULT '',
      prenom TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin'))
    )
  `);

  // Migration: add email column
  try { db.exec(`ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''`); } catch {}
  // Migration: add icon_id column to fabriquants
  try { db.exec(`ALTER TABLE fabriquants ADD COLUMN icon_id INTEGER REFERENCES icons(id) ON DELETE SET NULL`); } catch {}
}

export function getSetting(key, defaultVal) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : (defaultVal !== undefined ? defaultVal : null);
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (count > 0) return;

  // Try seed.json first, then fallback to hardcoded seed
  let data;
  if (fs.existsSync(SEED_PATH)) {
    try {
      data = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
    } catch {}
  }
  if (!data) data = getDefaultSeed();

  const insert = (table, rows) => {
    if (!rows || rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(',');
    const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
    const tx = db.transaction((items) => {
      for (const item of items) stmt.run(cols.map((c) => item[c]));
    });
    tx(rows);
  };

  insert('icons', data.icons);
  insert('fabriquants', data.fabriquants);
  insert('os', data.os);
  insert('categories', data.categories);
  insert('outils', data.outils);
}

function makeIconSvg(label, color) {
  const letter = label.charAt(0).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="${color}"/><text x="50" y="50" text-anchor="middle" dy=".35em" fill="#fff" font-size="40" font-weight="700" font-family="sans-serif">${letter}</text></svg>`;
}

const ICONS_DIR = path.join(__dirname, 'public', 'icons');

const ICON_DEFS = [
  // OS
  { nom: 'fedora', entity_type: 'os', file: 'fedora.svg', color: '#294172' },
  { nom: 'armbian', entity_type: 'os', file: 'armbian.svg', color: '#e45c2f' },
  { nom: 'dsm', entity_type: 'os', file: 'synologie.svg', color: '#00b4ef' },
  { nom: 'ubuntu', entity_type: 'os', file: 'ubuntu.svg', color: '#e95420' },
  { nom: 'debian', entity_type: 'os', file: 'debian.svg', color: '#A80030' },
  { nom: 'windows', entity_type: 'os', file: 'windows.svg', color: '#0078d4' },
  // Outils
  { nom: 'zabbix', entity_type: 'outil', file: 'zabbix.svg', color: '#cc0000' },
  { nom: 'pihole', entity_type: 'outil', file: 'pi-hole.svg', color: '#f60' },
  { nom: 'wireguard', entity_type: 'outil', file: 'wireguard.svg', color: '#881b94' },
  { nom: 'vaultwarden', entity_type: 'outil', file: 'vaultwarden.svg', color: '#175ddc' },
  { nom: 'grafana', entity_type: 'outil', file: 'grafana.svg', color: '#f46800' },
  { nom: 'synology-dsm', entity_type: 'outil', file: 'synologie.svg', color: '#00b4ef' },
  { nom: 'proxmox-ve', entity_type: 'outil', file: 'proxmox.svg', color: '#e57000' },
  { nom: 'nginx-proxy-manager', entity_type: 'outil', file: 'nginx-proxy-manager.svg', color: '#009639' },
  { nom: 'uptime-kuma', entity_type: 'outil', file: null, color: '#6c5ce7' },
  { nom: 'cockpit', entity_type: 'outil', file: 'cockpit.svg', color: '#3fb950' },
  { nom: 'docker', entity_type: 'outil', file: 'docker.svg', color: '#2496ed' },
  { nom: 'home-assistant', entity_type: 'outil', file: 'home-assistant.svg', color: '#03a9f4' },
  { nom: 'nextdns', entity_type: 'outil', file: 'nextdns.svg', color: '#007bff' },
  { nom: 'prometheus', entity_type: 'outil', file: 'prometheus.svg', color: '#e6522c' },
  { nom: 'nginx', entity_type: 'outil', file: 'nginx.svg', color: '#009639' },
  { nom: 'podman', entity_type: 'outil', file: 'podman.svg', color: '#892CA0' },
  // Categories
  { nom: 'monitoring', entity_type: 'category', file: 'monitoring.svg', color: '#3fb950' },
  { nom: 'dns', entity_type: 'category', file: 'dns.svg', color: '#58a6ff' },
  { nom: 'vpn', entity_type: 'category', file: 'vpn.svg', color: '#bc8cff' },
  { nom: 'securite', entity_type: 'category', file: 'security.svg', color: '#f85149' },
  { nom: 'stockage', entity_type: 'category', file: 'storage-network.svg', color: '#d29922' },
  { nom: 'virtualisation', entity_type: 'category', file: null, color: '#f0883e' },
  { nom: 'proxy', entity_type: 'category', file: null, color: '#f46800' },
  { nom: 'firewall', entity_type: 'category', file: 'firewall.svg', color: '#f85149' },
  // Fabriquants
  { nom: 'dell', entity_type: 'fabriquant', file: 'dell.svg', color: '#007db8' },
  { nom: 'espressif', entity_type: 'fabriquant', file: 'espressif.svg', color: '#e7352c' },
  { nom: 'hp', entity_type: 'fabriquant', file: 'hp.svg', color: '#0096d6' },
  { nom: 'vmware', entity_type: 'fabriquant', file: 'vmware.svg', color: '#607078' },
  { nom: 'radxa', entity_type: 'fabriquant', file: 'radxa.svg', color: '#e95420' },
  { nom: 'raspberry', entity_type: 'fabriquant', file: 'raspberry.svg', color: '#c51a4a' },
  // Generic
  { nom: 'pc-tower', entity_type: '', file: 'pc-tower.svg', color: '#58a6ff' },
  { nom: 'server', entity_type: '', file: 'server.svg', color: '#58a6ff' },
  { nom: 'dashboard', entity_type: '', file: 'dashboard.svg', color: '#58a6ff' },
  { nom: 'save', entity_type: '', file: 'save.svg', color: '#58a6ff' },
];

function getDefaultSeed() {
  const icons = ICON_DEFS.map((def) => {
    let data;
    if (def.file) {
      const fp = path.join(ICONS_DIR, def.file);
      if (fs.existsSync(fp)) {
        data = fs.readFileSync(fp, 'utf-8');
      } else {
        data = makeIconSvg(def.nom, def.color);
      }
    } else {
      data = makeIconSvg(def.nom, def.color);
    }
    return {
      nom: def.nom,
      filename: def.file || `${def.nom}.svg`,
      entity_type: def.entity_type,
      data,
    };
  });

  // Build lookup: icon nom → auto-increment id (1-based)
  const idOf = {};
  ICON_DEFS.forEach((def, i) => { idOf[def.nom] = i + 1; });

  return {
    icons,
    fabriquants: [
      { nom: 'Radxa', modele: 'ROCK 5B', icon_id: idOf.radxa },
      { nom: 'Synology', modele: 'DS220+', icon_id: idOf['synology-dsm'] },
      { nom: 'Raspberry Pi', modele: 'Pi 4', icon_id: idOf.raspberry },
      { nom: 'QNAP', modele: 'TS-464', icon_id: null },
      { nom: 'Intel NUC', modele: 'NUC 13 Pro', icon_id: null },
      { nom: 'Generic', modele: 'VPS', icon_id: idOf['pc-tower'] },
      { nom: 'Dell', modele: 'PowerEdge', icon_id: idOf.dell },
      { nom: 'Espressif', modele: 'ESP32', icon_id: idOf.espressif },
      { nom: 'HP', modele: 'ProLiant', icon_id: idOf.hp },
      { nom: 'VMware', modele: 'ESXi', icon_id: idOf.vmware },
    ],
    os: [
      { nom: 'Fedora', version: '41', icon_id: idOf.fedora },
      { nom: 'Armbian', version: '24.11', icon_id: idOf.armbian },
      { nom: 'DSM', version: '7.2', icon_id: idOf.dsm },
      { nom: 'Ubuntu', version: '24.04', icon_id: idOf.ubuntu },
      { nom: 'Debian', version: '12', icon_id: idOf.debian },
      { nom: 'Proxmox VE', version: '8.2', icon_id: idOf['proxmox-ve'] },
      { nom: 'Windows Server', version: '2025', icon_id: idOf.windows },
    ],
    categories: [
      { nom: 'Monitoring', icon_id: idOf.monitoring, couleur: '#3fb950' },
      { nom: 'DNS', icon_id: idOf.dns, couleur: '#58a6ff' },
      { nom: 'VPN', icon_id: idOf.vpn, couleur: '#bc8cff' },
      { nom: 'Securite', icon_id: idOf.securite, couleur: '#f85149' },
      { nom: 'Stockage', icon_id: idOf.stockage, couleur: '#d29922' },
      { nom: 'Virtualisation', icon_id: idOf.virtualisation, couleur: '#f0883e' },
      { nom: 'Proxy', icon_id: idOf.proxy, couleur: '#f46800' },
      { nom: 'Firewall', icon_id: idOf.firewall, couleur: '#f85149' },
    ],
    outils: [
      { nom: 'Zabbix', categorie_id: 1, port: 8080, main_page: '/zabbix', icon_id: idOf.zabbix },
      { nom: 'Pi-hole', categorie_id: 2, port: 80, main_page: '/admin', icon_id: idOf.pihole },
      { nom: 'WireGuard', categorie_id: 3, port: 51821, main_page: '/', icon_id: idOf.wireguard },
      { nom: 'Vaultwarden', categorie_id: 4, port: 8080, main_page: '/', icon_id: idOf.vaultwarden },
      { nom: 'Grafana', categorie_id: 1, port: 3000, main_page: '/login', icon_id: idOf.grafana },
      { nom: 'Synology DSM', categorie_id: 5, port: 5000, main_page: '/', icon_id: idOf['synology-dsm'] },
      { nom: 'Proxmox VE', categorie_id: 6, port: 8006, main_page: '/', icon_id: idOf['proxmox-ve'] },
      { nom: 'Uptime Kuma', categorie_id: 1, port: 3001, main_page: '/', icon_id: idOf['uptime-kuma'] },
      { nom: 'Nginx Proxy Manager', categorie_id: 7, port: 81, main_page: '/', icon_id: idOf['nginx-proxy-manager'] },
      { nom: 'Cockpit', categorie_id: 1, port: 9090, main_page: '/', icon_id: idOf.cockpit },
      { nom: 'Docker', categorie_id: 6, port: 9000, main_page: '/', icon_id: idOf.docker },
      { nom: 'Home Assistant', categorie_id: 1, port: 8123, main_page: '/', icon_id: idOf['home-assistant'] },
      { nom: 'NextDNS', categorie_id: 2, port: 443, main_page: '/', icon_id: idOf.nextdns },
      { nom: 'Prometheus', categorie_id: 1, port: 9090, main_page: '/', icon_id: idOf.prometheus },
      { nom: 'Nginx', categorie_id: 7, port: 80, main_page: '/', icon_id: idOf.nginx },
      { nom: 'Podman', categorie_id: 6, port: null, main_page: '/', icon_id: idOf.podman },
    ],
  };
}
