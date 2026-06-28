# NetworkHub — Contexte du projet

## Règles
- Parles en français.
- Je n'ai pas toujours raison donc ne me donne pas raison si j'ai tort.
- Recherche toujours les solutions pro, maintenables, évolutives et respectant les standards et les bonnes pratiques.
- Mets à jour ce fichier au fur et à mesure de l'avancement du projet.
- Complète le chapitre Difficultés quand c'est nécessaire.

## Description
Dashboard auto-hébergé pour gérer et surveiller les services réseau d'un homelab.  
Liste les machines, outils/services et cards (liens), avec monitoring de santé (HTTP ping).

## Stack
- **Runtime:** Node.js (ESM, `"type": "module"`)
- **Backend:** Express 4.21
- **DB:** SQLite via `better-sqlite3` 11.7 (synchrone, WAL mode, FK activées)
- **Frontend:** Vanilla JS SPA (pas de framework), CSS custom properties (thème dark/light)

## Démarrer
```bash
npm start        # ou : npm run dev (watch mode)
```
Port par défaut : 3000, configurable via `PORT`.

## Structure
```
NetworkHub/
├── server.js          # Serveur Express + API REST (~460 lignes)
├── db.js              # Init DB, schéma, seed data, getSetting() (~255 lignes)
├── logger.js          # Logger avec niveaux INFO/WARN/ERROR/DEBUG
├── package.json
├── .env               # Variables d'environnement prod
├── .env.dev           # Variables d'environnement dev
├── data.db            # Base SQLite (auto-générée)
└── public/
    ├── index.html     # SPA shell
    ├── css/style.css  # Styles (dark/light + daltoniens)
    └── js/app.js      # Frontend SPA (~1530 lignes)
```

## Base de données (8 tables)
- **icons** — nom, filename, entity_type, data (SVG stocké en BDD)
- **fabriquants** — nom, modele (e.g. Radxa ROCK 5B)
- **os** — nom, version, icon_id (e.g. Fedora, Armbian)
- **categories** — nom, icon_id, couleur (e.g. Monitoring, DNS)
- **machines** — nom, hostname, ip, os_id, fabriquant_id, icon_id
- **outils** — nom, categorie_id, port, main_page, icon_id (e.g. Zabbix, Pi-hole)
- **cards** — nom, prefix, base_url, url, port, main_page, categorie_id, outil_id, machine_id
- **settings** — key, value (paramètres de l'application : debug, mode daltonien, healthcheck TTL/timeout)

## API REST
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/health` | Statut santé de toutes les cards (cache 30s) |
| POST | `/api/health/refresh` | Forcer un refresh santé |
| GET/POST | `/api/cards` | Liste/ajout cards (avec joins) |
| GET/PUT/DELETE | `/api/cards/:id` | CRUD card |
| GET/POST | `/api/categories` | Liste/ajout catégories |
| GET/PUT/DELETE | `/api/categories/:id` | CRUD catégorie |
| GET/POST | `/api/machines` | Liste/ajout machines (avec joins OS/fabriquant) |
| GET/PUT/DELETE | `/api/machines/:id` | CRUD machine |
| GET/POST | `/api/outils` | Liste/ajout outils (avec join catégorie) |
| GET/PUT/DELETE | `/api/outils/:id` | CRUD outil |
| GET/POST | `/api/os` | Liste/ajout OS |
| GET/PUT/DELETE | `/api/os/:id` | CRUD OS |
| GET/POST | `/api/fabriquants` | Liste/ajout fabriquants |
| GET/PUT/DELETE | `/api/fabriquants/:id` | CRUD fabriquant |
| GET/POST/PUT/DELETE | `/api/icons` | CRUD icônes (avec upload SVG en BDD) |
| GET | `/api/icons/:id/file` | Serve le fichier SVG depuis la BDD |
| GET/PUT | `/api/settings` | Liste/modifie les paramètres (debug, daltonien, healthcheck) |

Filtres disponibles : `?search=`, `?categorie_id=`, `?machine_id=`

## Patterns clés
- **CRUD générique :** helpers `list()`, `getById()`, `create()`, `update()`, `remove()` paramétrés par table
- **Health check :** `fetch()` avec `AbortController` 5s timeout
- **Seed automatique :** DB seedée au premier lancement (données homelab par défaut)
- **Auto-fill formulaire :** sélection machine + outil → préremplissage nom/URL/port/catégorie
- **`buildUrl()` :** construit l'URL finale depuis prefix + base_url + port + main_page
- **Logger :** 4 niveaux (INFO/WARN/ERROR/DEBUG), activable dans Gestion → Paramètres (mode debug)
- **Settings :** table `settings` key/value, TTL/timeout health check lus depuis la BDD avec fallback `.env`
- **Mode daltonien :** 5 palettes (normal, protanopie, deutéranopie, tritanopie, achromatopsie), ajuste les CSS variables `--green`/`--red`/`--orange`/`--primary` + formes des dots en achromatopsie
- **Icônes stockées en BDD :** colonne `data` dans la table `icons`, servies via `GET /api/icons/:id/file`, plus de dépendance au filesystem
- **Pas de build :** vanilla JS frontend, pas de bundler, pas de TypeScript

## Conventions
- UI en français
- Code en anglais
- Commentaires et JSDoc en anglais
- Pas de tests
- Pas de git
- Pas de CI/CD


## Difficultés
### Bugs

### Solutions
- **DB Browser for SQLite ne peut pas ouvrir data.db (disk I/O error) :** le fichier est verrouillé par le serveur Node.js en cours d'exécution (mode WAL). Arrêter le serveur (`kill $(lsof -ti /mnt/donnees/Projets/NetworkHub/data.db)`) puis ouvrir avec DB Browser. Si l'erreur persiste, supprimer `data.db-shm` et `data.db-wal` (checkpoint non fait), puis relancer le serveur pour recréer la base via le seed automatique. Relancer le serveur après manipulation.

### Icônes stockées en BDD
Les icônes étaient stockées dans `public/icons/` avec une table `icons` pointant vers les fichiers → risque de désync.  
**Solution :** les icônes sont maintenant stockées dans la colonne `data TEXT` de la table `icons`.  
- `GET /api/icons/:id/file` sert le SVG avec le bon Content-Type
- `POST/PUT /api/icons` accepte le contenu SVG dans le champ `data`
- Le seed génère des SVG placeholders (lettre + couleur) via `makeIconSvg()`
- Plus de dépendance au filesystem, backup = un seul fichier `data.db`
- Les JOINs retournent `icon_id` au lieu de `filename`