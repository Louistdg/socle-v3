# Projets IA — état commun

Dernière mise à jour : 19 octobre 2026.

Ce fichier est la source commune que toutes les IA peuvent lire. Il ne remplace
pas les dépôts : il donne le contexte, l’état et le prochain point de contrôle.

## 1. PTS — Pastatchi

- **État** : alpha v0.3.
- **Audit** : 19/10/2026, 137 tests au vert, aucun secret détecté.
- **Points ouverts** : licence, verrouillage automatique du coffre,
  `requires-python`.

## 2. Socle.v3

- **État** : audit complet reçu le 19/10/2026.
- **CI** : revenue au vert après suppression de `sessionStorage` du frontend.
- **Reste à faire** : resserrer la CSP (`unsafe-inline`), hygiène du dépôt
  (doublons et rapports), accès Railway pour vérifier volume, variables et
  sauvegardes réelles.
- **Dépôt** : `Louistdg/socle-v3`.

## 3. Dioptre

- **État** : v2.6.1.
- **Audit** : 2.5.3 soldé.
- **Renommage** : BM318D → DIOPTRE vérifié.
- **En attente** : test du bac à sable WSL.

## 4. Berceau

- **État** : arbre généalogique HTML autonome, démo en ligne.
- **Sécurité** : CSP et en-têtes validés le 19/10/2026.

## 5. Écho

- **État** : M1 « écriture indestructible » livrée.
- **Prochaine étape** : M2 — capture audio fiable en WAV 16 kHz mono.

## 6. Socle. (entrée historique)

- Entrée existante conservée telle quelle.
- Reliée à **Socle.v3**.
- Ne pas modifier sans demande explicite.

## Règle commune

Chaque fiche doit contenir :

1. vue d’ensemble ;
2. état actuel ;
3. points ouverts / prochaines étapes ;
4. liens vers le dépôt GitHub ;
5. date du dernier changement.

## Accès des IA

- **Lecture seule recommandée** pour toutes les IA.
- **GitHub** est le point d’entrée commun : les IA lisent ce fichier et les
  dépôts autorisés.
- **Notion** reste la vue de travail de Louis ; les IA n’ont pas besoin d’un
  accès direct si les fiches sont exportées ou synchronisées vers GitHub.
- **Railway** et **O2switch** ne sont jamais partagés via un token dans un
  document : accès nominatif, moindre privilège, secrets hors dépôt.
