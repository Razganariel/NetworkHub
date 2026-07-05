# NetworkHub

Dashboard auto-hébergé pour centraliser, organiser et surveiller l'ensemble des services et machines d'un homelab depuis une interface unique.

## Fonctionnalités

- **Inventaire des machines** — liste des serveurs, NAS, SBC (Radxa, Raspberry Pi…) avec OS, fabricant et icône
- **Catalogue d'outils/services** — Zabbix, Pi-hole, Home Assistant, Uptime Kuma… classés par catégorie (Monitoring, DNS, VPN…)
- **Cards (liens rapides)** — accès à chaque service avec URL, port, préfixe HTTP/HTTPS et icône
- **Monitoring de santé** — vérification périodique (HTTP ping) de chaque card avec affichage du statut (en ligne/hors ligne/temps de réponse)
- **Authentication** — comptes utilisateurs avec rôles (admin/user), sessions 24h, protection rate-limiting
- **Mode daltonien** — 5 palettes de couleurs (normal, protanopie, deutéranopie, tritanopie, achromatopsie) avec adaptation des formes
- **Thème dark/light** — basculement en un clic
- **Paramètres** — configuration du debug, TTL/timeout healthcheck, mode daltonien
- **Déploiement conteneurisé** — Docker/Podman (multi-stage, non-root, volumes persistants)

## Stack

- **Runtime :** Node.js (ESM)
- **Backend :** Express 4.21
- **Base de données :** SQLite via `better-sqlite3` (synchrone, WAL, FK)
- **Frontend :** Vanilla JS SPA — CSS custom properties (dark/light + daltonien)
- **Icônes :** stockées en base de données (SVG), seed automatique au premier lancement

## Démarrage rapide

### Sans conteneur

```bash
cp .env.dev .env   # ou personnalisez .env
npm install
npm start          # ou : npm run dev (watch mode)
```

Ouvrir [http://localhost:3000](http://localhost:3000) — configurable via `PORT`.

### Avec Docker/Podman

```bash
docker compose up -d
# ou
podman-compose up -d
```

Le premier lancement crée automatiquement la base de données avec les données initiales (catégories, outils, OS, fabricants, icônes). Aucun compte administrateur par défaut — la page de configuration initiale s'affiche au premier accès.

## Structure

```
NetworkHub/
├── server.js        # Serveur Express + API REST
├── db.js            # Init DB, schéma, seed data
├── logger.js        # Logger (INFO/WARN/ERROR/DEBUG)
├── package.json
├── Dockerfile       # Image multi-stage
├── docker-compose.yml
├── .env             # Variables d'environnement (ignoré par git)
├── .env.dev         # Template développement (ignoré par git)
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
