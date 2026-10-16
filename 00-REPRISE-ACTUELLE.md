# SOCLE — reprise actuelle

Dernière mise à jour : **26 septembre 2026**.

Base de référence de cet export : `SOCLE_b990_POINT7_VALIDE_2026-09-26.zip`.

## État rapide

- Points 1–7 : préservés.
- Point 8 / Documents privés et multi-relations : **VALIDÉ dans cet export**.
- Migration finale : `0014_documents_private_relations.sql`.
- Build : réussi.
- Tests automatiques non navigateur : **652 assertions réussies**.
- Local-auth : suite automatique bloquée par `spawn ... ENOENT`, **6/6 contrôles équivalents manuels réussis**.
- Tests navigateur : tentés, **0 assertion**, Chromium/CDP `127.0.0.1:9222` indisponible.
- Point 9 : **NON COMMENCÉ**.

Lire `00-ETAT-ACTUEL-ET-REPRISE.md` puis le rapport Point 8 avant toute suite. Ne jamais rouvrir `/api/state` aux collaborateurs et ne pas déplacer les fichiers privés dans `workspace_state`.
