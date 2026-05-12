# NetworkHub

Dashboard auto-hébergé pour gérer et surveiller les services réseau d'un homelab.

Liste les machines, outils/services et cards (liens), avec monitoring de santé (HTTP ping).

## Stack

- **Runtime :** Node.js (ESM)
- **Backend :** Express 4.21
- **Base de données :** SQLite via `better-sqlite3` (synchrone, WAL, FK)
- **Frontend :** Vanilla JS SPA — CSS custom properties (thème dark/light + mode daltonien)
- **Icônes :** stockées en base de données (SVG)

## Démarrage rapide

```bash
cp .env.dev .env   # ou personnalisez .env
npm install
npm start          # ou : npm run dev (watch mode)
```

Ouvrir [http://localhost:3000](http://localhost:3000) (configurable via `PORT`).

## Structure

```
NetworkHub/
├── server.js        # Serveur Express + API REST
├── db.js            # Init DB, schéma, seed data
├── logger.js        # Logger (INFO/WARN/ERROR/DEBUG)
├── package.json
├── .env             # Variables d'environnement (ignoré par git)
├── .env.dev         # Template environnement de développement (ignoré par git)
├── data.db          # Base SQLite (auto-générée, ignorée par git)
└── public/
    ├── index.html   # SPA shell
    ├── css/style.css
    └── js/app.js    # Frontend SPA
```

## API REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/health` | Statut santé (cache 30s) |
| POST | `/api/health/refresh` | Forcer un refresh |
| GET/POST | `/api/cards` | Liste/ajout cards |
| GET/PUT/DELETE | `/api/cards/:id` | CRUD card |
| GET/POST | `/api/categories` | Liste/ajout catégories |
| GET/PUT/DELETE | `/api/categories/:id` | CRUD catégorie |
| GET/POST | `/api/machines` | Liste/ajout machines |
| GET/PUT/DELETE | `/api/machines/:id` | CRUD machine |
| GET/POST | `/api/outils` | Liste/ajout outils |
| GET/PUT/DELETE | `/api/outils/:id` | CRUD outil |
| GET/POST | `/api/os` | Liste/ajout OS |
| GET/PUT/DELETE | `/api/os/:id` | CRUD OS |
| GET/POST | `/api/fabriquants` | Liste/ajout fabriquants |
| GET/PUT/DELETE | `/api/fabriquants/:id` | CRUD fabriquant |
| GET/POST/PUT/DELETE | `/api/icons` | CRUD icônes |
| GET | `/api/icons/:id/file` | Serve le SVG |
| GET/PUT | `/api/settings` | Paramètres |

Filtres : `?search=`, `?categorie_id=`, `?machine_id=`

## Licence

Projet personnel — GPL3.
