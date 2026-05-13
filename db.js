import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data.db');
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
      categorie_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      outil_id INTEGER REFERENCES outils(id) ON DELETE SET NULL,
      machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL
    );
  `);

  // Migration: add data column if missing
  try { db.exec(`ALTER TABLE icons ADD COLUMN data TEXT NOT NULL DEFAULT ''`); } catch {}

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

  // Seed default admin user if users table is empty
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const adminPassword = hashPassword('admin');
    db.prepare('INSERT INTO users (nom, prenom, username, password, role) VALUES (?, ?, ?, ?, ?)')
      .run('Admin', 'Super', 'admin', adminPassword, 'admin');
  }
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
  insert('machines', data.machines);
  insert('outils', data.outils);
  insert('cards', data.cards);
}

function makeIconSvg(label, color) {
  const letter = label.charAt(0).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="${color}"/><text x="50" y="50" text-anchor="middle" dy=".35em" fill="#fff" font-size="40" font-weight="700" font-family="sans-serif">${letter}</text></svg>`;
}

const ICON_COLORS = {
  fedora: '#294172', armbian: '#e45c2f', dsm: '#00b4ef', ubuntu: '#e95420',
  zabbix: '#cc0000', pihole: '#f60', wireguard: '#881b94', vaultwarden: '#175ddc',
  grafana: '#f46800', 'synology-dsm': '#00b4ef', 'proxmox-ve': '#e57000',
  monitoring: '#3fb950', dns: '#58a6ff', vpn: '#bc8cff', securite: '#f85149',
  stockage: '#d29922', virtualisation: '#f0883e',
};

function getDefaultSeed() {
  return {
    icons: [
      { nom: 'fedora', filename: 'fedora.svg', entity_type: 'os', data: makeIconSvg('fedora', ICON_COLORS.fedora) },
      { nom: 'armbian', filename: 'armbian.svg', entity_type: 'os', data: makeIconSvg('armbian', ICON_COLORS.armbian) },
      { nom: 'dsm', filename: 'dsm.svg', entity_type: 'os', data: makeIconSvg('dsm', ICON_COLORS.dsm) },
      { nom: 'ubuntu', filename: 'ubuntu.svg', entity_type: 'os', data: makeIconSvg('ubuntu', ICON_COLORS.ubuntu) },
      { nom: 'zabbix', filename: 'zabbix.svg', entity_type: 'outil', data: makeIconSvg('zabbix', ICON_COLORS.zabbix) },
      { nom: 'pihole', filename: 'pihole.svg', entity_type: 'outil', data: makeIconSvg('pihole', ICON_COLORS.pihole) },
      { nom: 'wireguard', filename: 'wireguard.svg', entity_type: 'outil', data: makeIconSvg('wireguard', ICON_COLORS.wireguard) },
      { nom: 'vaultwarden', filename: 'vaultwarden.svg', entity_type: 'outil', data: makeIconSvg('vaultwarden', ICON_COLORS.vaultwarden) },
      { nom: 'grafana', filename: 'grafana.svg', entity_type: 'outil', data: makeIconSvg('grafana', ICON_COLORS.grafana) },
      { nom: 'synology-dsm', filename: 'synology-dsm.svg', entity_type: 'outil', data: makeIconSvg('synology-dsm', ICON_COLORS['synology-dsm']) },
      { nom: 'proxmox-ve', filename: 'proxmox-ve.svg', entity_type: 'outil', data: makeIconSvg('proxmox-ve', ICON_COLORS['proxmox-ve']) },
      { nom: 'monitoring', filename: 'monitoring.svg', entity_type: 'category', data: makeIconSvg('monitoring', ICON_COLORS.monitoring) },
      { nom: 'dns', filename: 'dns.svg', entity_type: 'category', data: makeIconSvg('dns', ICON_COLORS.dns) },
      { nom: 'vpn', filename: 'vpn.svg', entity_type: 'category', data: makeIconSvg('vpn', ICON_COLORS.vpn) },
      { nom: 'securite', filename: 'securite.svg', entity_type: 'category', data: makeIconSvg('securite', ICON_COLORS.securite) },
      { nom: 'stockage', filename: 'stockage.svg', entity_type: 'category', data: makeIconSvg('stockage', ICON_COLORS.stockage) },
      { nom: 'virtualisation', filename: 'virtualisation.svg', entity_type: 'category', data: makeIconSvg('virtualisation', ICON_COLORS.virtualisation) },
    ],
    fabriquants: [
      { nom: 'Radxa', modele: 'ROCK 5B' },
      { nom: 'Synology', modele: 'DS220+' },
      { nom: 'Generic', modele: 'VPS' },
      { nom: 'Raspberry Pi', modele: 'Pi 4' },
    ],
    os: [
      { nom: 'Fedora', version: '40', icon_id: 1 },
      { nom: 'Armbian', version: '24.5', icon_id: 2 },
      { nom: 'DSM', version: '7.2', icon_id: 3 },
      { nom: 'Ubuntu', version: '24.04', icon_id: 4 },
    ],
    categories: [
      { nom: 'Monitoring', icon_id: 12, couleur: '#3fb950' },
      { nom: 'DNS', icon_id: 13, couleur: '#58a6ff' },
      { nom: 'VPN', icon_id: 14, couleur: '#bc8cff' },
      { nom: 'Securite', icon_id: 15, couleur: '#f85149' },
      { nom: 'Stockage', icon_id: 16, couleur: '#d29922' },
      { nom: 'Virtualisation', icon_id: 17, couleur: '#f0883e' },
    ],
    machines: [
      { nom: 'Monster', hostname: 'monster.local', ip: '192.168.1.10', os_id: 1, fabriquant_id: null, icon_id: null },
      { nom: 'ROCK-5B', hostname: 'rock5b.local', ip: '192.168.1.20', os_id: 2, fabriquant_id: 1, icon_id: null },
      { nom: 'Synology', hostname: 'diskstation.local', ip: '192.168.1.30', os_id: 3, fabriquant_id: 2, icon_id: null },
      { nom: 'VPS', hostname: 'vps.example.com', ip: '10.0.0.1', os_id: 4, fabriquant_id: 3, icon_id: null },
    ],
    outils: [
      { nom: 'Zabbix', categorie_id: 1, port: 8080, main_page: '/zabbix', icon_id: 5 },
      { nom: 'Pi-hole', categorie_id: 2, port: 80, main_page: '/admin', icon_id: 6 },
      { nom: 'WireGuard', categorie_id: 3, port: 51821, main_page: '/', icon_id: 7 },
      { nom: 'Vaultwarden', categorie_id: 4, port: 8080, main_page: '/', icon_id: 8 },
      { nom: 'Grafana', categorie_id: 1, port: 3000, main_page: '/login', icon_id: 9 },
      { nom: 'Synology DSM', categorie_id: 5, port: 5000, main_page: '/', icon_id: 10 },
      { nom: 'Proxmox VE', categorie_id: 6, port: 8006, main_page: '/', icon_id: 11 },
    ],
    cards: [
      { nom: 'Monster - Zabbix', prefix: 'http://', base_url: '', url: 'http://192.168.1.10:8080/zabbix', categorie_id: 1, outil_id: 1, machine_id: 1 },
      { nom: 'Monster - Grafana', prefix: 'http://', base_url: '', url: 'http://192.168.1.10:3000/login', categorie_id: 1, outil_id: 5, machine_id: 1 },
      { nom: 'ROCK-5B - Pi-hole', prefix: 'http://', base_url: '', url: 'http://192.168.1.20:80/admin', categorie_id: 2, outil_id: 2, machine_id: 2 },
      { nom: 'ROCK-5B - WireGuard', prefix: 'http://', base_url: '', url: 'http://192.168.1.20:51821/', categorie_id: 3, outil_id: 3, machine_id: 2 },
      { nom: 'VPS - Vaultwarden', prefix: 'https://', base_url: '', url: 'https://10.0.0.1:8080/', categorie_id: 4, outil_id: 4, machine_id: 4 },
      { nom: 'Synology - DSM', prefix: 'http://', base_url: '', url: 'http://192.168.1.30:5000/', categorie_id: 5, outil_id: 6, machine_id: 3 },
    ],
  };
}
