# C9 — Fabric.js et catalogue vidé

Base: archive C8 fournie. Huit catégories conservées. Aucun modèle livré dans les catégories.

## Fabric.js
L’adaptateur `fabric-adapter.mjs` cible Fabric.js v6. Il est isolé et n’altère pas les interfaces actuelles. `package.json` déclare `fabric`. Installation requise dans un environnement ayant accès à npm : `cd public/readox-graphics && npm install`. Puis `npm run check-sdk` et `npm test`.

**État** : téléchargement npm indisponible dans cet environnement (EAI_AGAIN). Le SDK n’est pas embarqué. L’adaptateur n’est pas encore raccordé au moteur d’édition. Ne pas présenter l’intégration comme opérationnelle avant installation et tests navigateur.

## Modèles
`public/flyer-models/registry.json` contient les huit catégories et `models: []`. Les huit JSON de compositions et les huit images `*-preview.jpg` ont été retirés, ainsi que les références C4 embarquées. Le moteur existant et les documents personnels des utilisateurs ne sont pas supprimés.

Pour ajouter un futur modèle : créer son document structuré, enregistrer sa miniature et ajouter une entrée dans `models` avec `categoryId` de la catégorie correspondante.
