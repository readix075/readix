# Readix Reader — Phase 5

Cette version correspond à la Phase 5 du cahier des charges : **outils avancés**.

## Fonctionnalités ajoutées / corrigées

- **Modifier** : saisie de texte corrigée. Le texte saisi est maintenant forcé en noir, avec caret visible, sélection lisible et contraste stable sur les pages PDF.
- **OCR local** : reconnaissance de texte avec Tesseract.js, directement dans le navigateur, avec sélection de page/langue et export TXT.
- **Caviarder** : zones noires aplaties dans le PDF exporté.
- **Protéger** : chiffrement AES-256-GCM local d'une copie du PDF dans un conteneur `.readixprot`. Ce format est propre à Readix et n'est pas présenté comme un PDF standard avec mot de passe.
- **Comparer** : comparaison de texte entre deux PDF.
- **Métadonnées** : lecture et modification du titre, auteur, sujet, mots-clés, créateur et producteur, puis ré-enregistrement du PDF.
- Les fonctions des Phases 1 à 4 restent présentes : lecture, modification, remplissage/signature, organisation, fusion, division/extraction, rotation, etc.

## Lancer en local

```bash
npm install
npm start
```

Puis ouvrir l'adresse indiquée par le serveur, généralement `http://localhost:3000`.

## Déploiement Render

- Type : **Web Service**
- Build Command : `npm install`
- Start Command : `npm start`
- Runtime : Node
- Node : 18+

Le serveur utilise la variable `PORT` fournie par l'hébergeur.

## Dépendances externes du navigateur

PDF.js, pdf-lib, JSZip, Tesseract.js et les polices sont chargés depuis des CDN. Une connexion Internet est donc nécessaire pour charger ces moteurs dans cette version.

## Limites volontairement conservées

Le backend, les comptes/JWT/PostgreSQL, Stripe et les modules IA connectés au serveur restent prévus pour les phases suivantes du cahier des charges. Aucun faux backend ou faux paiement n'a été ajouté dans cette phase.
