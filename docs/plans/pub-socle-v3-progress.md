# Suivi pub socle V3

- Branches locales alignées sur la référence du 16 octobre 2026 ; publication vers GitHub Louistdg/socle-v3.
- V01–V04 : correctifs présents ; navigation Mon espace, résumé de chantier et démarrage unique du runtime contrôlés.
- V05–V43 : corrigés ; contrôles reproduits localement (accessibilité sans violation, formulaire de lignes de commande, grille des droits, chargement à froid).
- Chargement : lecteur de codes-barres retiré du chargement initial et chargé à l'ouverture du scanner ; feuille de styles regroupée et scripts différés.
- Vérification locale : build réussi, 151 suites hermétiques réussies, FCP mobile ramené de 15,3 s à environ 1,8 s.
- Publication : commit, branche `pub-socle-v3`, pull request et fusion dans `main`.
- Déploiement : à déclencher sur Railway, le service `socle-v3` n'étant pas relié au dépôt GitHub.
