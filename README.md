# Readix Reader — plateforme complète

Généré par `generer-readix.sh`. Deux parties :

```
readix-platform/
├── public/            → le SITE (front-end statique, déployable tel quel sur Netlify)
│   └── index.html
├── server/            → le SERVEUR (back-end : comptes, Stripe, fonctions IA)
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   └── data/db.json
├── netlify.toml
└── README.md
```

Le front-end fonctionne **seul** (tous les outils gratuits et signature tournent dans le
navigateur). Le serveur ajoute les **comptes réels**, les **paiements** et les **fonctions IA**.

---

## 1. Déployer le front-end (immédiat, gratuit)

1. Rendez-vous sur https://app.netlify.com/drop
2. Glissez-déposez le dossier `public/`.
3. En ligne. Tous les outils gratuits marchent aussitôt.

---

## 2. Lancer le serveur en local

Pré-requis : Node.js 18 ou plus.

```bash
cd server
cp .env.example .env      # puis remplissez les valeurs
npm install
npm start                 # http://localhost:8787
```

En développement, le serveur sert aussi le front-end : ouvrez http://localhost:8787
et vous avez le site + l'API au même endroit.

### Variables d'environnement (fichier .env)
- `JWT_SECRET` : longue chaîne aléatoire pour sécuriser les connexions.
- `ANTHROPIC_API_KEY` : clé de l'API d'IA (reste **sur le serveur**).
- `ANTHROPIC_MODEL` : modèle utilisé (par défaut `claude-sonnet-5`).
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` : pour l'abonnement.

---

## 3. Points d'entrée de l'API

| Méthode | Route                    | Rôle                                   |
|--------:|--------------------------|----------------------------------------|
| POST    | `/api/signup`            | Créer un compte (renvoie un jeton)     |
| POST    | `/api/login`             | Se connecter                           |
| GET     | `/api/me`                | Profil de l'utilisateur connecté       |
| POST    | `/api/billing/checkout`  | Ouvrir le paiement Stripe (Premium)    |
| POST    | `/api/billing/webhook`   | Stripe confirme l'abonnement           |
| POST    | `/api/ai/:feature`       | Fonctions IA (lens, dialogue, extract…)|

Les fonctions IA disponibles : `lens`, `dialogue`, `compareai`, `factcheck`,
`negociateur`, `conformite`, `extract`, `study`, `access`, `podcast`, `generate`,
`translate`. Les fonctions `word` (PDF→Word) et `esign` (signature certifiée)
nécessitent des services dédiés (LibreOffice headless ; prestataire eIDAS type Yousign).

---

## 4. Relier le front-end au serveur

Dans `public/index.html`, la partie comptes/paiement est aujourd'hui une **démonstration
en mémoire**. Pour la brancher au vrai serveur, remplacez ces appels par des `fetch`.
Exemple pour l'inscription :

```js
const API = "http://localhost:8787"; // en prod : l'URL de votre serveur

async function submitAuth() {
  const r = await fetch(API + "/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email, password: pass }),
  });
  const data = await r.json();
  if (data.token) { localStorage.setItem("readix_token", data.token); /* … */ }
}
```

Et pour appeler une fonction IA (ex. Readix Lens) :

```js
const r = await fetch(API + "/api/ai/lens", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "authorization": "Bearer " + localStorage.getItem("readix_token"),
  },
  body: JSON.stringify({ text: texteDuPDF, question: "Résume ce document." }),
});
const { answer } = await r.json();
```

---

## 5. Mettre le serveur en ligne

Hébergeurs simples pour le back-end : **Railway** ou **Render** (gratuits pour démarrer),
ou **Fly.io**. Poussez le dossier `server/` sur GitHub, connectez-le, ajoutez les mêmes
variables d'environnement, et pointez le front-end vers l'URL publique du serveur.

Pour la production, remplacez la mini-base `data/db.json` par **Supabase** ou une base
PostgreSQL managée.
