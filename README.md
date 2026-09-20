# Readix Reader — Projet complet

Plateforme web de traitement de PDF (lecture, édition, remplissage/signature de formulaires,
organisation, conversion) avec back-end pour comptes, abonnements Stripe et assistant IA.

Phases incluses : 1 à 6 + Phase 7 (Stripe) + Phase 8 (Assistant IA) + Phase 9 (Intelligence documentaire).

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
   - Stripe : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` et les identifiants `STRIPE_PRICE_STANDARD_MONTH/YEAR`, `STRIPE_PRICE_PRO_MONTH/YEAR`, `STRIPE_PRICE_STUDIO_MONTH/YEAR`.
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


## Phase 7 — Abonnements Stripe

- menu « Abonnements et tarifs » dans le compte ;
- ouverture d'une session Stripe Checkout ;
- périodicité mensuelle ou annuelle ;
- mise à jour du plan après `checkout.session.completed` ;
- retour au plan gratuit lorsqu'un abonnement devient inactif ;
- les identifiants de prix restent configurables dans `.env`.

## Phase 8 — Assistant Readix

- bouton compact dans l'application et accès depuis le rail droit ;
- le bouton ne recouvre pas le bloc de zoom ;
- historique court de conversation côté navigateur ;
- route serveur `POST /api/ai/chatbot` ;
- manuel Readix injecté côté serveur ;
- aucune clé Anthropic exposée au navigateur.

## Signature — comportement de sélection

Dans « Remplir & Signer », une signature reste redimensionnable et déplaçable. Un clic sur la signature la sélectionne ; un clic dans une zone vide du document retire le cadre de sélection.

## Phase 9 — Intelligence documentaire
La Phase 9 transforme l'IA de Readix en véritable espace de travail documentaire. L'interface affiche chaque module avec une courte description afin que l'utilisateur comprenne immédiatement son utilité.

### 1. Readix AI Workspace (Pro)
Analyse du document, questions-réponses et réponses avec références aux pages. Les réponses peuvent afficher des boutons « Page N » permettant d'aller directement à la page concernée.

### 2. Recherche intelligente (Pro)
Recherche sémantique dans le document : l'utilisateur peut rechercher une idée ou un sujet même lorsque les mots exacts ne sont pas présents.

### 3. Extraction structurée (Pro)
Transforme les informations du PDF en données structurées (dates, montants, personnes, organisations, références, etc.) avec export JSON.

### 4. Comparaison intelligente (Pro)
Compare deux PDF et explique les ajouts, suppressions et modifications significatives de contenu ou de sens, avec références aux pages lorsque disponibles.

### 5. Readix Copilot (Pro)
Assistant contextuel capable d'utiliser le document ouvert comme contexte pour répondre aux questions et guider l'utilisateur vers les outils Readix. Le Copilot flottant existant a également été rendu conscient du document ouvert.

Le texte d'un PDF est extrait localement dans le navigateur avant l'appel au serveur IA. Les contrôles d'abonnement et de quota restent côté serveur.


## Phase 10 — IA avancée flottante et Readix Copilot
- Le premier bouton du rail droit ouvre **IA avancée**. L'ouverture se fait en **panneau flottant au-dessus de l'onglet actif** : l'onglet PDF n'est ni supprimé ni remplacé.
- Dans IA avancée, les cinq modules sont visibles au départ ; après sélection, **seul le module choisi reste affiché**, avec un retour « Tous les modules ».
- Le panneau IA peut être réduit ou fermé sans modifier l'onglet PDF sous-jacent.
- **Readix Copilot** est un espace conversationnel séparé des onglets PDF. Le bouton robot flottant ouvre/ferme le Copilot ; le Copilot ne participe pas à l'historique Précédent/Suivant des onglets.
- Le bouton **+** du Copilot sert à joindre un PDF, le document ouvert ou la page actuelle. Chaque pièce jointe est liée au message qui l'accompagne et apparaît en miniature dans la conversation ; elle n'est pas placée au-dessus du champ de recherche comme un contexte global permanent.
- Les conversations Copilot sont organisées en **nouvelles discussions** et **historique**. Elles sont conservées localement dans IndexedDB afin de permettre de reprendre une discussion et de continuer avec d'autres PDF.
- Les messages précédents et les pièces jointes de la discussion active sont renvoyés au serveur IA comme mémoire de conversation lorsque l'utilisateur poursuit le même chat.
- La saisie vocale utilise Web Speech API lorsque le navigateur la prend en charge.
- Les boutons **Précédent / Suivant** de l'entête utilisent maintenant un historique **propre à chaque onglet**. Ils sont activés uniquement lorsqu'un onglet possède une étape précédente/suivante ; la fermeture d'un onglet ne mélange pas son historique avec celui d'un autre.
- Le Copilot reste indépendant de cet historique de navigation : changer d'onglet ou utiliser Précédent/Suivant ne change pas la conversation active du Copilot.

## Phase 11 — Readix Document Studio

Readix includes a first native, local-first document editor foundation. It provides a Word-like writing workspace without requiring a Microsoft Word license: create documents, edit rich text, headings, lists, links, tables, autosave locally, import DOCX, and export DOCX. The editor is designed as a new Readix tab so PDF tabs and their navigation remain independent.

The current implementation intentionally uses browser-native editing plus the existing JSZip dependency to generate DOCX packages. It is a foundation for progressively adding advanced document features (pagination fidelity, images, headers/footers, comments, track changes, richer DOCX round-tripping, and cloud collaboration) without replacing the existing PDF/AI architecture.

## Phase 12 — Document Studio : tableaux avancés et mise en page

Le Document Studio ajoute une vraie couche d’édition de tableaux : sélection du tableau, ajout/suppression de lignes et colonnes, suppression du tableau, déplacement vers le haut/bas du document, alignement gauche/centre/droite, largeur 50/75/100 %, première ligne d’en-tête, retrait de l’en-tête et lignes alternées. Les cellules restent directement éditables.

La mise en page de base comprend aussi les sauts de page, les marges normales/étroites/larges et les formats A4/Lettre. Ces réglages sont conservés localement avec le document.

## Phase 13 — Mise en page avancée
- Correction : les outils insérés dans le document ne doivent plus afficher leur nom comme contenu parasite. Le saut de page est désormais un séparateur visuel sans texte « Saut de page » dans le document.
- Saut de page avec comportement de pagination à l'impression.
- Zones d'en-tête et de pied de page éditables dans Document Studio.
- Insertion d'un marqueur de numéro de page `{PAGE}`.
- Conservation locale des zones de mise en page.


## Phase 15 — Document Studio : interface Word naturelle + révision locale
- Barre d’outils éclaircie et simplifiée, avec rendu SVG net et style proche d’un traitement de texte classique.
- Poids de police normal, contrastes modérés, pas d’agrandissement artificiel des caractères.
- Commentaires locaux sur une sélection et mode Révision local pour marquer des passages modifiés.
- Les marques de révision restent dans le document local et peuvent être retirées.


## Phase 17 — Document Word et navigation
- Bouton « Document Word » ajouté directement à côté de « Fusionner » dans la barre principale.
- Chaque clic ouvre un nouvel onglet Document Word indépendant.
- Volet de navigation des titres H1/H2/H3 dans Document Studio.
- Navigation locale par titres avec défilement vers la section choisie.
