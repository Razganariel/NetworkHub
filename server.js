import 'dotenv/config';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import { execSync } from 'child_process';
import { getDb, getSetting, hashPassword, verifyPassword } from './db.js';
import * as logger from './logger.js';

if (process.env.NODE_ENV === 'development') {
  dotenv.config({ path: '.env.dev', override: true });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Init debug mode from DB ──
function initDebugMode() {
  try {
    const db = getDb();
    const val = getSetting('debug', process.env.DEBUG || 'false');
    logger.setDebugMode(val === 'true');
    logger.info(`Debug mode: ${logger.isDebug() ? 'ON' : 'OFF'}`);
  } catch {
    logger.setDebugMode(false);
  }
}
initDebugMode();

// ── Request logger middleware ──
app.use((req, res, next) => {
  if (logger.isDebug()) {
    const start = Date.now();
    res.on('finish', () => {
      logger.debug(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
  }
  next();
});

// ── Auth ──
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;

function authMiddleware(req, res, next) {
  if (req.originalUrl === '/api/auth/login') return next();
  if (req.originalUrl.startsWith('/api/icons/') && req.originalUrl.endsWith('/file')) return next();
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Token expired' });
  }
  session.createdAt = Date.now();
  sessions.set(token, session);
  req.user = session;
  next();
}

app.use('/api', authMiddleware);

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { id: user.id, nom: user.nom, prenom: user.prenom, username: user.username, email: user.email || '', role: user.role, createdAt: Date.now() });
  logger.info(`Connexion : ${username}`);
  if (!healthTimer) startHealthLoop();
  res.json({ token, user: { id: user.id, nom: user.nom, prenom: user.prenom, username: user.username, email: user.email || '', role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    sessions.delete(header.slice(7));
  }
  res.json({ ok: true });
});

// Nettoyage périodique des sessions expirées
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

// ── Health cache (TTL and timeout from DB settings, fallback env / defaults) ──
const healthCache = { data: null, ts: 0 };
let healthTimer = null;

function getHealthTTL() {
  const v = getSetting('healthcheck.delay', process.env.HEALCHECK_REFRESH_DELAY || process.env.HEALTHCHECK_REFRESH_DELAY || '300000');
  return parseInt(v, 10);
}

function getHealthTimeout() {
  const v = getSetting('healthcheck.timeout', process.env.HEALTHCHECK_TIMEOUT || '10000');
  return parseInt(v, 10);
}

function resetHealthCache() {
  healthCache.data = null;
  healthCache.ts = 0;
}

async function checkOne(card) {
  const start = Date.now();
  try {
    const url = new URL(card.url);
    const lib = url.protocol === 'https:' ? https : http;
    const timeout = getHealthTimeout();
    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        timeout,
      };
      if (url.protocol === 'https:') opts.rejectUnauthorized = false;
      const req = lib.request(opts, (res) => {
        resolve({ online: true, status: res.statusCode });
        res.resume();
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
    return { id: card.id, online: result.online, ms: Date.now() - start, status: result.status };
  } catch {
    return { id: card.id, online: false, ms: Date.now() - start, status: null };
  }
}

async function checkHealth() {
  const db = getDb();
  const cards = db.prepare('SELECT id, url FROM cards').all();
  logger.info(`Health check: ${cards.length} carte(s) à vérifier`);
  const results = {};
  const checks = await Promise.all(cards.map(checkOne));
  for (const r of checks) results[r.id] = { online: r.online, ms: r.ms, status: r.status };
  const online = Object.values(results).filter(r => r.online).length;
  logger.info(`Health check terminé : ${online}/${cards.length} en ligne`);
  return results;
}

function startHealthLoop() {
  if (healthTimer) clearInterval(healthTimer);
  const TTL = getHealthTTL();
  logger.info(`Boucle santé: ${TTL}ms d'intervalle`);
  const loop = async () => {
    try {
      healthCache.data = await checkHealth();
      healthCache.ts = Date.now();
    } catch (err) {
      logger.error('Boucle santé échouée:', err.message);
    }
  };
  loop();
  healthTimer = setInterval(loop, TTL);
}

app.get('/api/health', (_req, res) => {
  res.json(healthCache.data || {});
});

app.post('/api/health/refresh', async (_req, res) => {
  logger.info('Refresh santé forcé');
  try {
    healthCache.data = await checkHealth();
    healthCache.ts = Date.now();
  } catch (err) {
    logger.error('Refresh santé forcé échoué:', err.message);
  }
  res.json(healthCache.data);
});

// ── Settings ──
const KNOWN_SETTINGS = [
  { key: 'high.contrast', label: '🔲 Contraste élevé (accessibilité)', type: 'boolean', default: 'false', description: 'Renforcer les contrastes pour les malvoyants (WCAG AAA)' },
  { key: 'debug', label: 'Mode debug', type: 'boolean', default: 'false', description: 'Activer les logs verbeux pour le diagnostic' },
  { key: 'colorblind.mode', label: 'Mode daltonien', type: 'select', default: 'normal',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'protanopia', label: 'Protanopie (rouge)' },
      { value: 'deuteranopia', label: 'Deutéranopie (vert)' },
      { value: 'tritanopia', label: 'Tritanopie (bleu)' },
      { value: 'achromatopsia', label: 'Achromatopsie (monochrome)' },
    ],
    description: 'Adapter les couleurs de l\'interface aux différents types de daltonisme' },
  { key: 'healthcheck.delay', label: 'Rafraîchissement santé (ms)', type: 'number', default: '300000', description: 'Intervalle entre chaque vérification de santé des URLs (5 min = 300000)' },
  { key: 'healthcheck.timeout', label: 'Timeout requête santé (ms)', type: 'number', default: '10000', description: 'Délai max d\'attente par requête (10 sec = 10000)' },
];

app.get('/api/settings', (_req, res) => {
  const db = getDb();





  
  const stored = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const s of stored) map[s.key] = s.value;
  const result = KNOWN_SETTINGS.map(s => ({
    ...s,
    value: map[s.key] !== undefined ? map[s.key] : s.default,
  }));
  res.json(result);
});

app.put('/api/settings', (req, res) => {
  const db = getDb();
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required' });
  try {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
    logger.info(`Setting mis à jour : ${key} = ${value}`);
    if (key === 'debug') logger.setDebugMode(value === 'true');
    if (key.startsWith('healthcheck.')) startHealthLoop();
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Erreur mise à jour setting ${key}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── Users ──
app.get('/api/users/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(req.user);
});

app.put('/api/users/me', (req, res) => {
  const db = getDb();
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { nom, prenom, username, email } = req.body;
  try {
    const updates = [];
    const vals = [];
    if (nom !== undefined) { updates.push('nom = ?'); vals.push(nom); }
    if (prenom !== undefined) { updates.push('prenom = ?'); vals.push(prenom); }
    if (username !== undefined) { updates.push('username = ?'); vals.push(username); }
    if (email !== undefined) { updates.push('email = ?'); vals.push(email); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...vals, user.id);
    logger.info(`Profil utilisateur mis à jour : id=${user.id}`);
    const updated = db.prepare('SELECT id, nom, prenom, username, email, role FROM users WHERE id = ?').get(user.id);
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const tok = header.slice(7);
      if (sessions.has(tok)) sessions.set(tok, { ...sessions.get(tok), ...updated });
    }
    res.json(updated);
  } catch (err) {
    logger.error(`Erreur mise à jour profil id=${user.id}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/users/change-password', (req, res) => {
  const db = getDb();
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  const stored = db.prepare('SELECT password FROM users WHERE id = ?').get(user.id);
  if (!stored || !verifyPassword(currentPassword, stored.password)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  logger.info(`Mot de passe changé : id=${user.id}`);
  res.json({ ok: true });
});

app.get('/api/users', (req, res) => {
  res.json(getDb().prepare('SELECT id, nom, prenom, username, email, role FROM users ORDER BY username ASC').all());
});

app.post('/api/users', (req, res) => {
  const db = getDb();
  const { nom, prenom, username, email, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  try {
    const stmt = db.prepare('INSERT INTO users (nom, prenom, username, email, password, role) VALUES (?, ?, ?, ?, ?, ?)');
    const result = stmt.run(nom || '', prenom || '', username, email || '', hashPassword(password), role || 'user');
    const row = db.prepare('SELECT id, nom, prenom, username, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
    logger.info(`Utilisateur créé : ${username} (id=${result.lastInsertRowid})`);
    res.status(201).json(row);
  } catch (err) {
    logger.error(`Erreur création utilisateur ${username}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  const db = getDb();
  const { nom, prenom, username, email, password, role } = req.body;
  try {
    const updates = [];
    const vals = [];
    if (nom !== undefined) { updates.push('nom = ?'); vals.push(nom); }
    if (prenom !== undefined) { updates.push('prenom = ?'); vals.push(prenom); }
    if (username !== undefined) { updates.push('username = ?'); vals.push(username); }
    if (email !== undefined) { updates.push('email = ?'); vals.push(email); }
    if (password) { updates.push('password = ?'); vals.push(hashPassword(password)); }
    if (role !== undefined) { updates.push('role = ?'); vals.push(role); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
    const row = db.prepare('SELECT id, nom, prenom, username, email, role FROM users WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    logger.info(`Utilisateur modifié : id=${req.params.id}`);
    res.json(row);
  } catch (err) {
    logger.error(`Erreur modification utilisateur id=${req.params.id}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  const db = getDb();
  if (req.user && req.user.id === parseInt(req.params.id)) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    logger.info(`Utilisateur supprimé : id=${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Erreur suppression utilisateur id=${req.params.id}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

const ALLOWED_COLUMNS = {
  fabriquants: ['nom', 'modele'],
  cards: ['nom', 'prefix', 'base_url', 'url', 'categorie_id', 'outil_id', 'machine_id'],
  categories: ['nom', 'couleur', 'icon_id'],
  machines: ['nom', 'hostname', 'ip', 'os_id', 'fabriquant_id', 'icon_id'],
  outils: ['nom', 'categorie_id', 'port', 'main_page', 'icon_id'],
  os: ['nom', 'version', 'icon_id'],
  icons: ['nom', 'filename', 'entity_type', 'data'],
};

const SORTABLE_COLUMNS = {
  fabriquants: ['id', 'nom', 'modele'],
  cards: ['id', 'nom', 'prefix', 'base_url', 'url', 'categorie_id', 'outil_id', 'machine_id'],
  categories: ['id', 'nom', 'couleur'],
  machines: ['id', 'nom', 'hostname', 'ip'],
  outils: ['id', 'nom', 'port', 'main_page'],
  os: ['id', 'nom', 'version'],
  icons: ['id', 'nom', 'filename', 'entity_type'],
};

// ── Generic CRUD helpers ──
function list(table, joins = '') {
  return (req, res) => {
    const db = getDb();
    let sql = `SELECT * FROM ${table} ${joins}`;
    const params = [];
    const where = [];

    if (req.query.search && ['cards', 'machines', 'outils', 'categories'].includes(table)) {
      where.push(`${table}.nom LIKE ?`);
      params.push(`%${req.query.search}%`);
    }
    if (req.query.categorie_id && table === 'cards') {
      where.push('cards.categorie_id = ?');
      params.push(req.query.categorie_id);
    }
    if (req.query.machine_id && table === 'cards') {
      where.push('cards.machine_id = ?');
      params.push(req.query.machine_id);
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');

    if (req.query.sort) {
      const allowed = SORTABLE_COLUMNS[table] || ['nom'];
      if (!allowed.includes(req.query.sort)) {
        return res.status(400).json({ error: 'Invalid sort column' });
      }
      sql += ` ORDER BY ${req.query.sort}`;
    } else {
      sql += ' ORDER BY nom ASC';
    }

    try {
      res.json(db.prepare(sql).all(...params));
    } catch (err) {
      logger.error(`${table} :: list error:`, err.message);
      res.status(400).json({ error: err.message });
    }
  };
}

function getById(table) {
  return (req, res) => {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  };
}

function create(table) {
  return (req, res) => {
    const db = getDb();
    const allowed = ALLOWED_COLUMNS[table] || [];
    const cols = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!cols.length) return res.status(400).json({ error: 'No valid fields' });

    if (table === 'categories' && req.body.couleur && !/^#[0-9a-fA-F]{6}$/.test(req.body.couleur)) {
      return res.status(400).json({ error: 'Invalid color format' });
    }

    const vals = cols.map((c) => req.body[c]);
    const placeholders = cols.map(() => '?').join(',');
    try {
      const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
      const result = stmt.run(...vals);
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
      logger.debug(`${table} :: create id=${result.lastInsertRowid}`);
      res.status(201).json(row);
    } catch (err) {
      logger.error(`${table} :: create error:`, err.message);
      res.status(400).json({ error: err.message });
    }
  };
}

function update(table) {
  return (req, res) => {
    const db = getDb();
    const allowed = ALLOWED_COLUMNS[table] || [];
    const cols = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!cols.length) return res.status(400).json({ error: 'No valid fields' });

    if (table === 'categories' && req.body.couleur && !/^#[0-9a-fA-F]{6}$/.test(req.body.couleur)) {
      return res.status(400).json({ error: 'Invalid color format' });
    }

    const vals = cols.map((c) => req.body[c]);
    const set = cols.map((c) => `${c} = ?`).join(',');
    try {
      db.prepare(`UPDATE ${table} SET ${set} WHERE id = ?`).run(...vals, req.params.id);
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      logger.debug(`${table} :: update id=${req.params.id}`);
      res.json(row);
    } catch (err) {
      logger.error(`${table} :: update id=${req.params.id} error:`, err.message);
      res.status(400).json({ error: err.message });
    }
  };
}

function remove(table) {
  return (req, res) => {
    const db = getDb();
    try {
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
      logger.debug(`${table} :: delete id=${req.params.id}`);
      res.json({ ok: true });
    } catch (err) {
      logger.error(`${table} :: delete id=${req.params.id} error:`, err.message);
      res.status(400).json({ error: err.message });
    }
  };
}

// ── Icons (stored in DB, served via endpoint) ──
app.get('/api/icons', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT id, nom, filename, entity_type FROM icons ORDER BY nom ASC').all());
});

app.get('/api/icons/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id, nom, filename, entity_type, data FROM icons WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.get('/api/icons/:id/file', (req, res) => {
  const db = getDb();
  const icon = db.prepare('SELECT filename, data FROM icons WHERE id = ?').get(req.params.id);
  if (!icon) return res.status(404).json({ error: 'Not found' });
  const ext = path.extname(icon.filename).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/svg+xml';
  res.set('Content-Type', mime);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(icon.data);
});

app.post('/api/icons', (req, res) => {
  const db = getDb();
  const { nom, filename, entity_type, data } = req.body;
  if (!nom) return res.status(400).json({ error: 'nom is required' });
  try {
    const stmt = db.prepare('INSERT INTO icons (nom, filename, entity_type, data) VALUES (?, ?, ?, ?)');
    const result = stmt.run(nom, filename || '', entity_type || '', data || '');
    const row = db.prepare('SELECT id, nom, filename, entity_type FROM icons WHERE id = ?').get(result.lastInsertRowid);
    logger.info(`Icône créée : ${nom} (id=${result.lastInsertRowid})`);
    res.status(201).json(row);
  } catch (err) {
    logger.error(`Erreur création icône ${nom}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/icons/:id', (req, res) => {
  const db = getDb();
  const { nom, filename, entity_type, data } = req.body;
  try {
    const sets = []; const vals = [];
    if (nom !== undefined) { sets.push('nom = ?'); vals.push(nom); }
    if (filename !== undefined) { sets.push('filename = ?'); vals.push(filename); }
    if (entity_type !== undefined) { sets.push('entity_type = ?'); vals.push(entity_type); }
    if (data !== undefined) { sets.push('data = ?'); vals.push(data); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    db.prepare(`UPDATE icons SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
    const row = db.prepare('SELECT id, nom, filename, entity_type FROM icons WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    logger.debug(`Icône modifiée : id=${req.params.id}`);
    res.json(row);
  } catch (err) {
    logger.error(`Erreur modification icône id=${req.params.id}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/icons/:id', (req, res) => {
  const db = getDb();
  try {
    db.prepare('DELETE FROM icons WHERE id = ?').run(req.params.id);
    logger.info(`Icône supprimée : id=${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Erreur suppression icône id=${req.params.id}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── Cards (with joins) ──
app.get('/api/cards', (req, res) => {
  const db = getDb();
  let sql = `
    SELECT cards.*, 
           categories.nom AS categorie_nom, categories.couleur AS categorie_couleur, cat_icon.id AS categorie_icon_id,
           machines.nom AS machine_nom, machines.ip AS machine_ip, mach_icon.id AS machine_icon_id,
           outils.nom AS outil_nom, outils.port AS outil_port, outils.main_page AS outil_main_page, outil_icon.id AS outil_icon_id
    FROM cards
    LEFT JOIN categories ON cards.categorie_id = categories.id
    LEFT JOIN icons cat_icon ON categories.icon_id = cat_icon.id
    LEFT JOIN machines ON cards.machine_id = machines.id
    LEFT JOIN icons mach_icon ON machines.icon_id = mach_icon.id
    LEFT JOIN outils ON cards.outil_id = outils.id
    LEFT JOIN icons outil_icon ON outils.icon_id = outil_icon.id
  `;
  const params = [];
  const where = [];

  if (req.query.search) {
    where.push('cards.nom LIKE ?');
    params.push(`%${req.query.search}%`);
  }
  if (req.query.categorie_id) {
    where.push('cards.categorie_id = ?');
    params.push(req.query.categorie_id);
  }
  if (req.query.machine_id) {
    where.push('cards.machine_id = ?');
    params.push(req.query.machine_id);
  }

  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY cards.nom ASC';

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/cards/:id', getById('cards'));
app.post('/api/cards', create('cards'));
app.put('/api/cards/:id', update('cards'));
app.delete('/api/cards/:id', remove('cards'));

// ── Categories ──
app.get('/api/categories', (req, res) => {
  const db = getDb();
  const sql = `
    SELECT categories.*, icons.id AS icon_id
    FROM categories
    LEFT JOIN icons ON categories.icon_id = icons.id
    ORDER BY categories.nom ASC
  `;
  res.json(db.prepare(sql).all());
});
app.get('/api/categories/:id', getById('categories'));
app.post('/api/categories', create('categories'));
app.put('/api/categories/:id', update('categories'));
app.delete('/api/categories/:id', remove('categories'));

// ── Machines ──
app.get('/api/machines', (req, res) => {
  const db = getDb();
  const sql = `
    SELECT machines.*, os.nom AS os_nom, fabriquants.nom AS fabriquant_nom, fabriquants.modele AS fabriquant_modele,
           icons.id AS icon_id
    FROM machines
    LEFT JOIN os ON machines.os_id = os.id
    LEFT JOIN fabriquants ON machines.fabriquant_id = fabriquants.id
    LEFT JOIN icons ON machines.icon_id = icons.id
    ORDER BY machines.nom ASC
  `;
  res.json(db.prepare(sql).all());
});

app.get('/api/machines/:id', getById('machines'));
app.post('/api/machines', create('machines'));
app.put('/api/machines/:id', update('machines'));
app.delete('/api/machines/:id', remove('machines'));

// ── Outils ──
app.get('/api/outils', (req, res) => {
  const db = getDb();
  const sql = `
    SELECT outils.*, categories.nom AS categorie_nom, categories.couleur AS categorie_couleur,
           icons.id AS icon_id
    FROM outils
    LEFT JOIN categories ON outils.categorie_id = categories.id
    LEFT JOIN icons ON outils.icon_id = icons.id
    ORDER BY outils.nom ASC
  `;
  res.json(db.prepare(sql).all());
});

app.get('/api/outils/:id', getById('outils'));
app.post('/api/outils', create('outils'));
app.put('/api/outils/:id', update('outils'));
app.delete('/api/outils/:id', remove('outils'));

// ── OS ──
app.get('/api/os', (req, res) => {
  const db = getDb();
  const sql = `
    SELECT os.*, icons.id AS icon_id
    FROM os
    LEFT JOIN icons ON os.icon_id = icons.id
    ORDER BY os.nom ASC
  `;
  res.json(db.prepare(sql).all());
});
app.get('/api/os/:id', getById('os'));
app.post('/api/os', create('os'));
app.put('/api/os/:id', update('os'));
app.delete('/api/os/:id', remove('os'));

// ── Fabriquants ──
app.get('/api/fabriquants', list('fabriquants'));
app.get('/api/fabriquants/:id', getById('fabriquants'));
app.post('/api/fabriquants', create('fabriquants'));
app.put('/api/fabriquants/:id', update('fabriquants'));
app.delete('/api/fabriquants/:id', remove('fabriquants'));

// ── Serve SPA ──
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── HTTPS with auto-generated self-signed cert ──
const CERTS_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERTS_DIR, 'key.pem');
const CERT_PATH = path.join(CERTS_DIR, 'cert.pem');

function ensureCerts() {
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) return;
  fs.mkdirSync(CERTS_DIR, { recursive: true });
  logger.info('Génération du certificat auto-signé...');
  execSync(
    `openssl req -x509 -nodes -days 3650 -newkey rsa:2048 ` +
    `-keyout "${KEY_PATH}" -out "${CERT_PATH}" ` +
    `-subj "/C=XX/ST=Homelab/L=Network/O=NetworkHub/CN=localhost"`,
    { stdio: 'pipe' }
  );
  logger.info('Certificat auto-signé prêt');
}

try {
  ensureCerts();
  const sslOptions = { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) };
  https.createServer(sslOptions, app).listen(PORT, () => {
    logger.info(`NetworkHub started on https://0.0.0.0:${PORT}`);
  });
  // HTTP redirect server (PORT + 1)
  const httpApp = express();
  httpApp.use((req, res) => {
    const host = req.headers.host?.replace(/:\d+$/, '') || 'localhost';
    res.redirect(`https://${host}:${PORT}${req.url}`);
  });
  http.createServer(httpApp).listen(parseInt(PORT) + 1, () => {
    logger.info(`HTTP→HTTPS redirect on http://0.0.0.0:${parseInt(PORT) + 1}`);
  });
} catch (err) {
  logger.warn(`Impossible de démarrer en HTTPS (${err.message}) — fallback HTTP`);
  app.listen(PORT, () => {
    logger.info(`NetworkHub started on http://0.0.0.0:${PORT}`);
  });
}
