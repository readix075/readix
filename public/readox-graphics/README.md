# Readox C7 — Technologie graphique isolée (base C5)

Ce lot ajoute une **bibliothèque graphique indépendante**, sans modifier `public/flyer-maker.html`, `public/app.html`, le CSS ou les écrans. Les fichiers C5 restent inchangés.

## Modules
- `public/readox-graphics/core.mjs`: document structuré version 3, objets éditables, historique undo/redo, calques par ordre de tableau, SVG commun et export PNG/JPG côté navigateur.
- `public/readox-graphics/konva-adapter.mjs`: adaptateur Konva pour sélection, déplacement et rendu d'objets, **à activer avec une installation réelle du SDK Konva**. Konva n'est pas embarqué dans cette archive (réseau de téléchargement indisponible).
- `public/readox-graphics/tests/`: tests Node et 8 modèles de référence.

## État exact
Le noyau documentaire et le rendu SVG sont utilisables. Le moteur n'est **pas encore raccordé à l'éditeur Flyer Maker existant**, par choix explicite de préserver son interface. L'adaptateur Konva est codé mais exige le SDK Konva. L'export PDF est une interface pour un convertisseur PDF à brancher : aucun PDF factice n'est produit. Les images externes peuvent exiger une préparation CORS ou un encodage intégré.

## Utilisation (module navigateur)
```js
import { GraphicsDocument, toSVG, rasterize } from '/readox-graphics/core.mjs';
const documentModel = new GraphicsDocument(modeleJSON);
documentModel.update('item-14', { text: 'NOUVELLE PROMOTION' });
const svg = toSVG(documentModel);
const pngBlob = await rasterize(documentModel, {format:'png',scale:2});
```

Pour Konva : `import {createKonvaStage} from '/readox-graphics/konva-adapter.mjs'`, puis injecter le SDK Konva réellement installé dans `createKonvaStage(Konva, container, documentModel)`.

## Tests
Exécuter `node public/readox-graphics/tests/test.mjs` depuis la racine du projet. Ces tests sont statiques/Node; aucune validation visuelle Android n'est revendiquée.
