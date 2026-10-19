# Projets IA — état commun

Dernière mise à jour : 19 octobre 2026.

Source commune en lecture pour les IA. Les dépôts liés restent les références du code.

## 1. PTS — Pastatchi

- **État** : alpha v0.3, prototype fonctionnel.
- **Audit** : 19/10/2026, 137 tests au vert, aucun secret détecté.
- **Points ouverts** : choisir une licence, verrouillage automatique du coffre, ajouter `requires-python` (Python 3.14 exigé); pas de CI configurée.
- **Dépôt** : [Louistdg/Pastatchi](https://github.com/Louistdg/Pastatchi).

## 2. Socle.v3

- **État** : audit complet reçu le 19/10/2026; CI au vert après retrait de `sessionStorage`.
- **Runtime preview** : service Railway Online; `/health` répond 200; volume `socle-v3-data` monté sur `/app/data`; sauvegarde `backup.lastAt=2026-10-19T19:43:19.809Z`, `backup.lastError` vide. 16 variables applicatives existent (noms seulement consultés).
- **Points ouverts** : resserrer la CSP (`unsafe-inline`), hygiène du dépôt. Blocage d’invitation Railway IA documenté dans `ACCES-IA.md`.
- **Dépôt** : [Louistdg/socle-v3](https://github.com/Louistdg/socle-v3).

## 3. Dioptre

- **État** : v2.6.1; renommage BM318D → DIOPTRE vérifié; audit 2.5.3 soldé.
- **Points ouverts** : test dynamique du bac à sable WSL en conditions Windows réelles.
- **Dépôt** : [Louistdg/DIOPTRE](https://github.com/Louistdg/DIOPTRE).

## 4. Berceau

- **État** : arbre généalogique HTML autonome; démo publique avec données fictives.
- **Sécurité** : CSP et en-têtes validés le 19/10/2026.
- **Points ouverts** : dépôt privé, tous droits réservés.
- **Dépôt** : [Louistdg/berceau](https://github.com/Louistdg/berceau).

## 5. Écho

- **État** : M1 « écriture indestructible » livrée; preuve de récupération 100/100.
- **Prochaine étape** : M2 — capture audio fiable en WAV 16 kHz mono, sans transcription.
- **Dépôt** : [Louistdg/echo](https://github.com/Louistdg/echo).

## 6. Socle. (entrée historique)

Entrée historique préservée et reliée à Socle.v3. Ne pas modifier sans demande explicite. La fiche Notion n’a pas été modifiée pendant cette mission.

## Accès commun

- GitHub est la source commune. Ce dépôt est public; lien à transmettre : [PROJETS-IA.md](https://github.com/Louistdg/socle-v3/blob/main/docs/PROJETS-IA.md).
- Ne jamais publier de secrets ou partager des identifiants racine.