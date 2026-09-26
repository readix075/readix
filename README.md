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


## Phase 18 — IA avancée fonctionnelle
- Les modules IA avancés disposent maintenant d’un sélecteur de source explicite : PDF ouvert ou téléversement direct.
- Workspace, Recherche intelligente et Extraction structurée peuvent fonctionner sans document PDF déjà ouvert dans un onglet.
- Comparaison intelligente accepte un PDF A (ouvert/téléversé) et un PDF B téléversé.
- Ajout de `/api/ai/status` pour diagnostiquer l’authentification, le plan, le quota et la configuration de la clé IA avant une requête.
- Les erreurs IA sont affichées directement à l’utilisateur au lieu de laisser une interface inerte.

## Phase 19 — Readix Copilot Action Engine 1.0
- Copilot passe d’un assistant purement conversationnel à un moteur d’actions Readix.
- Ajout de `/api/copilot/action` : l’IA renvoie un plan d’actions JSON contrôlé plutôt qu’une simple réponse textuelle.
- Actions locales prises en charge : création réelle de PDF, création réelle de DOCX, création/ouverture dans Document Studio, ouverture d’outils Readix, extraction de pages, suppression de pages avec confirmation, rotation de pages.
- Le Copilot transmet désormais le contexte du PDF ouvert au moteur d’actions.
- Les pièces jointes PDF restent liées au message et leurs contenus sont disponibles au moteur d’actions.
- Création PDF côté navigateur avec pdf-lib et création DOCX avec le moteur DOCX existant.
- Les opérations destructives demandent une confirmation avant exécution.
- Les actions exécutées retournent un état explicite dans la conversation.
- Ajout/rétablissement de `/api/ai/status` pour diagnostiquer clé Anthropic, plan et quota.
- Les modules IA avancés affichent un bouton de téléversement PDF avec icône SVG et acceptent aussi le glisser-déposer.
- Le bouton de téléversement ne remplace pas le PDF ouvert : l’utilisateur peut choisir explicitement sa source.

## Phase 19.1 — Copilot Action Engine hotfix

Cette version corrige le flux d'exécution du Copilot et ajoute des diagnostics plus explicites.

- alias API `/api/copilot/action/` et `/api/copilot/actions` ;
- endpoint public `/api/health` pour vérifier la version réellement déployée ;
- le client détecte un 404 du moteur et affiche une erreur de déploiement explicite ;
- les erreurs Anthropic indiquent désormais le code HTTP et le modèle utilisé ;
- si une ancienne valeur `ANTHROPIC_MODEL` provoque un 404, le serveur retente avec `claude-sonnet-5` ;
- le moteur d'action reste compatible avec le plan Pro/Studio et le quota existant.

Après déploiement, `https://VOTRE-APP.onrender.com/api/health` doit renvoyer JSON avec `version: "19.1"` et `actionEngine: true`.


## Phase A — Readix Document Studio / Word Engine

Cette version introduit la première couche du Word Engine : l'interface professionnelle de Document Studio, inspirée de l'organisation d'un traitement de texte classique.

### Ajouts Phase A
- barre de titre du document ;
- barre de menus : Fichier, Édition, Affichage, Insertion, Format, Révision, Outils, Aide ;
- menus déroulants fonctionnels ;
- barre d'accès rapide ;
- barre de mise en forme structurée ;
- choix de police et taille ;
- gras, italique, souligné, barré ;
- styles Normal/Titre 1/Titre 2/Titre 3/Citation ;
- alignements ;
- listes et retraits ;
- surlignage et interligne ;
- liens ;
- insertion de tableau, saut de page et commentaire ;
- règles horizontale et verticale ;
- zone de page type traitement de texte ;
- barre d'état avec page, section, langue, mode, statistiques et zoom ;
- commandes d'impression, recherche, navigation, import/export ;
- export PDF branché sur le moteur PDF local existant ;
- conservation des fonctions Document Studio déjà présentes : tableaux, révision, recherche/remplacement, en-tête/pied de page, navigation, autosave, DOCX.

### Règle de non-régression
La Phase A ne remplace pas le moteur PDF, Copilot, AI Advanced, Project Engine ou les fonctions existantes. Elle enrichit uniquement l'interface et les points d'entrée du Document Studio.

## Phase A.2 — Word Engine reference polish + document-only printing

- Document Studio UI aligned to the professional Word Engine reference layout.
- Cleaner, readable drawing/status bars.
- Expanded quick-access controls (navigation/search).
- Print command is document-scoped: it no longer prints the Readix application shell.
- DOCX/Document Studio printing opens a clean document-only print window.
- PDF printing renders only the active PDF pages in a clean print window.
- Ctrl+P and the Document Studio print menu/toolbar use the document-scoped print engine.


## Phase A.3 — Readix Word Engine A3 (Document Studio fidèle à la maquette)

Document Studio est entièrement reconstruit. L’interface reprend la maquette de référence : barre de titre bleue avec recherche, 10 menus, barre standard, barre de mise en forme, règles, barre de dessin et barre d’état. Chaque icône exécute réellement le rôle annoncé dans son infobulle (« Nom — rôle »), et **Aide › Aide sur les outils** liste le rôle des 115 outils.

### Ce qui fonctionne
- **Pages réelles** A4 / Lettre / Légal / A5, portrait ou paysage, marges réglables (règles ou Fichier › Mise en page). Un paragraphe qui ne tient plus sur la page passe à la page suivante. Saut de page avec Ctrl+Entrée.
- **En-têtes et pieds de page** sur toutes les pages (double-clic dans la marge), numéros de page automatiques « Page X sur Y ».
- **Règles déplaçables** : retraits de première ligne, négatif, gauche et droit ; marges ; tabulations gauche, centrée, droite et décimale (le coin « L » change le type).
- **Mise en forme** :
  - police, taille, gras, italique, souligné, barré, couleur, surlignage, exposant et indice, casse ;
  - alignements, interligne, espacement, retraits, trame, bordures, colonnes ;
  - styles (Titre, Titre 1 à 3, Citation, Code) ;
  - reproduction de la mise en forme (pinceau).
- **Listes** : puces (7 symboles), numérotation, listes multiniveaux (1/a/i, 1.1.1, I/A/1) ; Tab et Maj+Tab changent de niveau.
- **Tableaux** :
  - grille d’insertion, ajout et suppression de lignes et colonnes, fusion et fractionnement ;
  - tri, formules (somme, moyenne, max, min, nombre) ;
  - en-tête, bandes, sans bordure, tableau de calcul avec totaux automatiques.
- **Dessin** :
  - une trentaine de formes, lignes, flèches, forme libre, zone de texte, ellipse avec texte, WordArt, diagrammes (organigramme, processus, cycle, pyramide) ;
  - graphiques (histogramme, courbe, secteurs), images, cliparts intégrés, stylo, surligneur et gomme ;
  - sélection, déplacement, redimensionnement, rotation, remplissage, trait, tirets, flèches, ombre et relief 3D, ordre, alignement, habillage.
- **Révision** :
  - suivi des modifications (RÉV, Ctrl+Maj+E), accepter ou refuser ;
  - commentaires avec leur volet ;
  - langue, vérification orthographique, statistiques, correction automatique (« », majuscules, ©, →, —, …).
- **Barre d’état vivante** :
  - Page X sur Y, Section, « À x cm », Li, Col, mots, caractères ;
  - INS/RFP (touche Inser, refrappe réelle) et STD/EXT (F8, sélection étendue) ;
  - modes Page, Web et Plan, zoom réel de 25 à 300 %.
- **Recherche** :
  - en direct depuis la barre de titre, avec surlignage de toutes les occurrences ;
  - Rechercher, Remplacer et Atteindre (Ctrl+F, Ctrl+H, Ctrl+G).
- **Fichiers** :
  - ouverture de fichiers .docx (avec mise en forme, listes, tableaux, images, en-têtes, commentaires et révisions), .txt, .html et .md ;
  - enregistrement en **.docx** qui conserve toute la mise en forme, y compris les formes et images ancrées ;
  - export **PDF** fidèle à l’affichage, HTML et texte ;
  - impression des seules pages du document.
- **Annuler / Rétablir** avec historique détaillé : la flèche ▾ permet d’annuler plusieurs actions d’un coup.
- **Personnalisation** :
  - barres affichables ou masquables ;
  - barre standard et barre de dessin ancrables en haut ou en bas (glisser la poignée) ;
  - réduire, agrandir, plein écran, mode lecture.

### Intégration
- `public/app.html` embarque le moteur (`<script id="readix-word-engine">` et `<style id="readix-word-engine-css">`). `renderDocStudio()` le monte dans l’onglet actif et le relie à l’onglet (`t.doc`, `t.docMeta`, nom, autosave IndexedDB, Copilot).
- `saveDocStudio`, `printActiveReadixDocument` et l’import (`#hiddenDocFile`) passent désormais par le moteur. `buildDocxBlob` (utilisé par Copilot) produit maintenant des DOCX mis en forme, avec repli sur l’ancien export.
- Correctif : la reprise de session restaure aussi la mise en page (`docMeta`).
- `public/document-studio-demo.html` : version autonome pour tester Document Studio hors de l’application.
- Sources du moteur : `word-engine/src/`. Après modification, lancez `python3 word-engine/build.py` pour réinjecter le moteur dans `app.html`.

### Notes
- Le zoom affiche le pourcentage réel. Les boutons (police, taille, gras, alignement…) reflètent le texte sous le curseur, comme dans Word.
- L’export PDF est une image fidèle de chaque page : le texte n’y est pas sélectionnable.
- Les notes sont placées en fin de document (notes de fin).
- L’en-tête et le pied de page sont identiques sur toutes les pages.


## Nouveautés — Studio de publication (Phase A.3+)

Le moteur Word intègre désormais un ensemble complet de fonctions de publication, toutes fonctionnelles et exportées fidèlement en .docx :

**Références et structure**
- **Table des matières automatique** (Insertion › Table des matières) : générée à partir des styles Titre 1 à 3, cliquable (Ctrl+clic pour atteindre le titre), numéros de page mis à jour automatiquement.
- **Notes de bas de page** (Insertion › Note de bas de page, Ctrl+Alt+B) : véritables notes rendues au bas de la page contenant l'appel, exportées dans `footnotes.xml`. Les notes de fin (Ctrl+Alt+F) restent disponibles.
- **Légendes** (Insertion › Légende) : « Figure N », « Tableau N », etc., numérotées automatiquement.
- **Index** (Insertion › Marquer une entrée, puis Insérer l'index) : liste alphabétique avec numéros de page.

**Mise en page**
- **Filigrane** (Format › Filigrane) : texte (avec préréglages CONFIDENTIEL, BROUILLON…) ou image, en diagonale, opacité réglable. Exporté en VML dans l'en-tête .docx (lu par Word et LibreOffice).
- **Bordure de page** (Format › Bordure de page) : style, épaisseur, couleur, marge — exportée via `w:pgBorders`.
- **Couleur de page** (Format › Couleur de page) — exportée via `w:background`.
- **En-têtes et pieds différenciés** (Format › En-têtes et pieds de page) : première page différente et pages paires/impaires distinctes (`w:titlePg`, `w:evenAndOddHeaders`, références d'en-tête multiples).
- **Zoom jusqu'à 500 %**.

**Publipostage et révision**
- **Publipostage** (Outils › Publipostage) : import CSV (séparateur virgule ou point-virgule), insertion de champs «Champ», fusion produisant un document avec une copie par enregistrement (séparées par un saut de page).
- **Comparer des versions** (Outils › Comparer) : compare le document actuel avec un .docx révisé et affiche les différences en modifications suivies (ajouts soulignés, suppressions barrées) à accepter/refuser via l'onglet Révision.
- **Dictionnaire personnel** (Outils › Dictionnaire personnel) : mots à ne pas signaler, conservés localement, en complément du correcteur du navigateur selon la langue.

**PDF avec texte sélectionnable** : l'export PDF conserve le rendu fidèle des pages et ajoute une couche de texte invisible, rendant le PDF sélectionnable et consultable (recherche).

### Limites assumées (hors périmètre du moteur navigateur)
- **Coédition en temps réel** : nécessite un serveur (WebSocket/CRDT) — relève de la couche serveur, pas du moteur client.
- **Macros / VBA** : volontairement exclues (sécurité et périmètre).
- **Correcteur grammatical et dictionnaire de synonymes complets** : nécessitent une grande base lexicale française. Le correcteur orthographique du navigateur (souligné rouge) et le dictionnaire personnel sont fournis à la place.
- **Sections multiples à orientation/marges mixtes dans un même document** : reportées (nécessitent une refonte de la pagination).


## Phase 1 — Common Core (intégration au socle existant)

Le Common Core est une **façade additive** injectée dans `public/app.html` sous le bloc `<script id="readix-core">` (source maintenable : `core/readix-core.js`). Elle **nomme et unifie l'existant** sans rien réécrire ni dupliquer : elle expose `window.Readix.core` avec cinq modules qui délèguent aux systèmes déjà présents.

- **Project Engine** (`Readix.core.projects`) — schéma de projet complet (id, name, description, domain, status, settings, skills, tabs, documents, generatedObjects, tasks, history, versions, metadata, createdAt, updatedAt). S'appuie sur `newProject`, `PROJECT_STATE` et le magasin IndexedDB `projects` **existant** (+ synchro serveur `/api/projects` déjà en place). Création, liste, projet actif, ajout de documents/objets générés, journal d'historique.
- **Document Engine** (`Readix.core.documents`) — représentation commune d'un document et **registre de formats** : PDF, DOCX, TXT, HTML, MD, PNG, JPG marqués `supported` ; XLSX, PPTX, CSV, EPUB, SVG marqués `planned` (prévus architecturalement, non implémentés — état honnête). `describe(tab)` normalise un onglet ; `supports(fmt)` dit la vérité sur ce qui est réellement pris en charge.
- **Context Engine** (`Readix.core.context.snapshot()`) — instantané pour l'IA/Copilot : outil actif, onglet/document actif, projet actif, sélection courante, nombre d'onglets, actions récentes.
- **Storage Engine** (`Readix.core.storage`) — **adaptateur** vers le stockage existant (IndexedDB `readix` : magasins `tabs`, `projects`, `copilotChats`) + préférences légères `localStorage` préfixées `rx:`. **Aucune seconde base de données n'est créée** (règle §1.4 / §9).
- **Action Registry** (`Readix.core.actions`) — registre où **chaque action est reliée à une fonction réelle** du code (`open_tool`, `open_pdf_editor`, `open_document_studio`, `open_book_studio`, `open_cv_studio`, `create_project`, `open_project`, `new_tab`, `switch_tab`, `close_tab`, `open_file`, `save_document`, `export_pdf`, `export_docx`, `rename_document`). Aucune action fictive (§10) ; `run(id,args)` journalise l'historique et refuse proprement une action inconnue.

**Garanties vérifiées (tests automatisés) :** 31/31 modules du socle strictement identiques à l'original (lecteur PDF, éditeur, fusion, division, remplissage, signature, rails, onglets, stockage, Copilot, Document Studio) ; une seule base IndexedDB `readix` ; création/persistance de projet à travers le magasin existant ; contexte et actions fonctionnels ; **zéro erreur console**. Le Common Core est strictement additif : il ne modifie aucune fonction existante.

**Note produit :** la démo autonome `document-studio-demo.html` a été retirée de `public/` (règle §14 — aucune application autonome dans le produit). Les sources de build du moteur Word (`word-engine/`) et du core (`core/`) ne sont pas servies ; le seul produit est `public/app.html` + `server/`.


---

## Phase 2 — Readix Shell v2.1 (évolution visuelle, fidèle au prototype)

Cette phase fait **évoluer l'interface** vers le prototype cible (barre latérale sombre, en-tête avec recherche + IA avancée + compte, tableau de bord riche, rail droit d'assistance), **sans remplacer l'application ni casser une seule fonction du socle**. Elle est **strictement additive** : injectée dans `public/app.html` sous les blocs `<style id="readix-shell-css">` et `<script id="readix-shell">`, à partir des sources `shell/readix-shell.css` et `shell/readix-shell.js`. Retirer ces deux blocs restaure l'application d'origine à l'octet près.

**Ce qui change visuellement :**

- **Barre latérale sombre persistante** — marque *Readix*, navigation à plat fidèle au prototype (Accueil, Mes projets, Documents, Book Studio, CV Studio, Document Studio, PDF Reader/Editor, IA/Copilot, Paramètres), indicateur de stockage et carte *Readix Pro*. **Chaque entrée appelle une fonction réelle** (`openTool`, `openBookStudio`, `openCvBuilder`, `toggleCopilotFloating`, ouverture de fichier, menu Projet). L'item actif reflète l'outil courant.
- **En-tête** — barre de **recherche fonctionnelle** (filtre les outils et ouvre le vrai outil), bouton **IA avancée** (`openAIFloating`), cloche de notifications, puce **compte** (reflète `APP.user`/`APP.plan`, ouvre les Paramètres).
- **Tableau de bord d'accueil** — bandeau daté « Bonjour », **5 cartes d'outils colorées** (PDF Reader/Editor, IA/Copilot, Book Studio, CV Studio, Document Studio), *Projets récents* (`Readix.core.projects`) et *Fichiers récents* (`Readix.core.storage`) avec badges d'état, **Accès rapide** (6 outils) et **Raccourcis** (Créer, Importer, Ouvrir, Gérer projets, Paramètres).
- **Rail droit d'accueil** — *Espace IA* (→ IA avancée), *Raccourcis rapides* (Résumé, Traduction, Analyser PDF, Créer image, Aide → Copilot), *Assistant Readix* (→ Copilot) et *Outils de lecture* (Zoom câblé sur `#zIn/#zOut`, Mode nuit sur le thème réel, Plein écran). Affiché **uniquement à l'accueil** ; sur les vues outil, le rail fin d'origine et la barre d'outils native reviennent intacts.
- **Modale Paramètres** — bascule de thème et sélecteur de langue **pilotant les contrôles réels** existants (`#themeBtn`, `#langSel`).
- **Repli responsive** (< 1024 px : rail droit escamoté ; < 900 px : barre latérale escamotable, barre d'outils horizontale rétablie).

**Garanties vérifiées (tests automatisés Playwright) :**

- **34/35** modules `render*` du socle **identiques octet pour octet** à l'original (le seul différent, `renderDocStudio`, relève de l'intégration Document Studio livrée précédemment) ; **309/314** fonctions du socle inchangées. **Le shell n'a modifié aucune fonction inline.**
- La barre latérale native (`.lrail`) et le rail fin (`.rrail`) sont **masqués uniquement à l'accueil** et **réapparaissent** sur les vues outil (non-régression prouvée).
- La navigation et la recherche ouvrent les **vrais outils** ; Document Studio monte bien le moteur Word A3.
- `Readix.core` (Common Core) intact, **une seule** base IndexedDB, **zéro erreur console**.

> **Écart connu (prochaine tranche)** : le rail droit de la *vue lecteur PDF* du prototype (Actions rapides / Outils d'édition / Outils IA) et le sélecteur d'espace de travail ne sont pas encore posés — l'accueil (écran principal) est traité en priorité.

