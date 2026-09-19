# Readix Reader — Projet complet

Plateforme web de traitement de PDF (lecture, édition, remplissage/signature de formulaires,
organisation, conversion) avec back-end pour comptes, abonnements et IA.

## Structure

```
readix/
├── public/
│   ├── index.html   → la vitrine (page d'accueil marketing)
│   └── app.html     → l'application (l'outil de travail)
├── server/
│   ├── server.js    → back-end Node/Express (comptes, IA, sert le front)
│   ├── package.json → dépendances + scripts
│   └── .env.example → modèle de configuration (à copier en .env)
├── .gitignore
└── README.md
```

Le serveur sert automatiquement le dossier `public/`. En ligne :
`https://VOTRE-APP.onrender.com/` = vitrine, `.../app.html` = application.

## Redéploiement (pas à pas)

### 1) GitHub
1. Crée un dépôt (ex. `readix`) sur github.com.
2. Dépose **tout le contenu de ce dossier** à la racine du dépôt (via GitHub Desktop : glisse les fichiers dans le dossier local du dépôt, puis Commit → Push).

### 2) Base de données (Supabase)
1. Sur supabase.com → ton projet → **Connect** → **Connection string** → mode **Transaction / Pooler** (port **6543**).
2. Copie l'URL `postgresql://...pooler.supabase.com:6543/postgres` (remplace `[YOUR-PASSWORD]` par ton mot de passe DB).
   → ce sera la variable `DATABASE_URL`.
   *(Les tables `users` et `usage` sont créées automatiquement au démarrage du serveur.)*

### 3) Render (hébergement)
1. render.com → **New +** → **Web Service** → connecte ton dépôt GitHub `readix`.
2. Réglages :
   - **Root Directory** : `server`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
3. Onglet **Environment** → ajoute les variables (voir `server/.env.example`) :
   - `DATABASE_URL` (Supabase, port 6543)
   - `JWT_SECRET` (longue chaîne aléatoire — bouton « Generate »)
   - `ANTHROPIC_API_KEY` (ta clé `sk-ant-…`)
   - `ANTHROPIC_MODEL` = `claude-sonnet-5`
   - `CLIENT_URL` = l'URL publique de ton service Render
   - Stripe (facultatif) : `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
4. **Create Web Service**. Render installe et démarre. Les logs doivent afficher
   « ✅ Base de données prête » puis « Your service is live ».

### 4) Vérification
- Ouvre `https://VOTRE-APP.onrender.com/app.html` → l'application se charge.
- Ouvre `https://VOTRE-APP.onrender.com/` → la vitrine.

## Développement local (facultatif)
```
cd server
cp .env.example .env      # puis remplis les valeurs
npm install
npm start                 # http://localhost:8787/app.html
```

## Notes
- Le traitement des PDF (lecture, édition, remplissage, signature, conversion) se fait
  **entièrement dans le navigateur** (confidentialité). Le serveur ne sert qu'aux comptes,
  abonnements et fonctions IA.
- L'application (`public/app.html`) fonctionne même sans back-end pour tous les outils PDF locaux.
  Les comptes et l'IA nécessitent le serveur configuré.
