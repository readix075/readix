# Readox C8 — modules graphiques isolés

L’interface C7 est inchangée. `konva-adapter.mjs` importe désormais le bon `core.mjs`.

## Konva
Le SDK **n’est pas inclus dans le ZIP** : le registre npm était inaccessible (EAI_AGAIN). Une dépendance npm explicite a été ajoutée. Dès qu’un environnement réseau est disponible :

```sh
cd public/readox-graphics
npm install
npm run check-sdk
```

L’adaptateur attend toujours l’objet Konva injecté ; le SDK installé ne sera pas servi au navigateur automatiquement sans bundler ou publication du module.

## PDF
`pdf-native.mjs` fournit `exportPDFNative(documentModel, {dpi:150})` côté navigateur. Produit un vrai PDF d’une page avec JPEG issu du rendu SVG commun. Le texte du PDF est rasterisé, pas éditable ou sélectionnable. Les dimensions du document sont interprétées en points PDF. Le navigateur doit autoriser la rasterisation SVG et les ressources images.

Aucun écran de Readox n’a été modifié ni raccordé automatiquement à ces modules.
