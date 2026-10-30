# C10.3 — Objets Fabric.js

- 54 types reconnus par le modèle de données; adaptation Fabric.js isolée.
- Primitives natives: rectangle, ellipse, triangle, polygones, polyline, ligne, chemin, texte, image, groupe et SVG lorsque les API Fabric correspondantes sont disponibles.
- Types spécialisés (chart, table, QR, barcode, motifs avancés, flèches) ont une **représentation géométrique provisoire**, pas leur rendu sémantique final.
- Pas de changement visuel de Flyer Maker et **pas d’activation du SDK dans l’éditeur historique**.
- `npm install` requis dans `public/readox-graphics` pour charger Fabric.js. Le SDK n’est pas embarqué (accès réseau npm impossible).
- `node tests/test-fabric-types.mjs` teste les 54 types au niveau document; ne remplace pas des tests de rendu navigateur.
