# Readox InDesign — Phase 26, correctifs de typographie

## Corrections intégrées
- Débordement entre cadres lié : calcul par DOM Range au lieu de découpage de `it.text` uniquement, avec conservation des balises HTML inline des deux fragments.
- Synchronisation de `it.html` et `it.text` sur les deux cadres lors du transfert.
- Transfert déclenché après saisie dans le cadre source lié sans dépendre du bouton visible sur le panneau sélectionné.
- Validation des cadres sources verrouillés et prévention des cycles de chaînage.
- Rendu d'un `it.html` vide sans réintroduire le texte fictif.
- Moteur ReadixInDesign annoncé 26.0. Nom de produit choisi : Readox. Les anciens noms internes Readix sont conservés pour la compatibilité des données et des interfaces.

## Vérifications réalisées
- Analyse syntaxique de 16 scripts inline : OK.
- Aucune validation fonctionnelle complète sous navigateur ou Render dans cette livraison.

## Limites non résolues
- Recomposition automatique complète de toute une chaîne après redimensionnement, changement de police ou suppression de texte non garantie.
- Application de styles aux seules sélections de caractères non implémentée dans ce correctif.
- Import de HTML non fiable ou malformé et débordement à travers plus de deux cadres doivent encore faire l'objet de tests E2E.

## Déploiement
Cette archive est une **version candidate à tester** avant publication sur Render, et non une certification de fonctionnement complet de la Phase 4.
