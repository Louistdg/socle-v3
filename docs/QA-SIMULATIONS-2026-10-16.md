# SOCLE — contrôle du 16 octobre 2026

Le compte louis.masson@outlook.com a été rétabli et la connexion vérifiée sur Railway.

## Entreprises et simulations

Il existe cinq espaces : une entreprise active et quatre autres choix. Ils utilisent tous le même code. Les deux « Atelier Horizon — Démo V3 » sont des espaces distincts, créés à quinze minutes d’intervalle.

| Espace | Contenu constaté |
|---|---|
| Atelier de recherche | 3 personnes, aucun chantier |
| Entreprise de test terrain | 3 personnes, 1 chantier, 2 documents sécurisés |
| Atelier Horizon, premier espace | 4 personnes, aucun chantier |
| Atelier Horizon, second espace | 2 chantiers à préparer |
| SW3 — Entreprise de simulation | 4 personnes, 1 chantier, affectation, pointage et stock |

SW3 fournit le scénario opérationnel le plus complet. L’espace terrain complète les essais documentaires. Aucun espace n’a été fusionné ou supprimé.

L’affectation SW3 est datée du 9 octobre : elle apparaît dans la semaine précédente, ce qui explique son absence dans la semaine courante.

## Corrections préparées

- Distinguer les deux espaces homonymes par leur date de création dans le menu.
- Empêcher une entreprise sans préférence d’hériter de l’affichage large d’une autre entreprise. Conserver les préférences explicitement enregistrées.
- Ouvrir « Mon espace » avec les anciens dossiers de personnel sans liste de formations.
- Charger le script de production une seule fois.
- Fermer le résumé du chantier avant d’ouvrir son espace complet.
- Conserver l’ajustement de l’en-tête mobile trouvé sur Railway.

## Vérifications

48 captures de la version en ligne et 48 de la version corrigée couvrent les accueils des cinq entreprises et la navigation dans les 19 rubriques de SW3, sur ordinateur et en largeur téléphone. Les neuf contrôles ciblés du navigateur passent, dont les transitions entre entreprises et l’ouverture du chantier. La suite générale de 147 fichiers de tests a passé avant la dernière correction du résumé ; cette dernière a aussi passé ses tests ciblés et une nouvelle compilation.

Les empreintes de 85 tables métier et de configuration sont identiques avant et après le contrôle en ligne. Seules les opérations d’authentification demandées et les sessions sont exclues de cette comparaison.

## Points restant à améliorer

- Les tableaux de droits sont denses sur téléphone et leur défilement horizontal manque d’indication.
- Certains statuts de planning et de stock restent en anglais.
- « Mon espace » est long et contient du contenu de démonstration à clarifier.
- L’accès au chantier passe par un résumé assez long.

Ces vérifications portent sur Edge, avec affichage ordinateur et émulation tactile. Elles ne constituent pas un contrôle sur un iPhone physique ou Safari, ni une validation de toutes les saisies métier. Les captures d’origine conservent les défauts observés ; le dossier `candidate` contient les vues après correction. Les corrections du code ne sont pas encore déployées sur Railway à la rédaction de ce rapport.
