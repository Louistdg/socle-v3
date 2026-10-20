# Équipes visuelles — 20 octobre 2026

Accès : Personnel & équipes → Équipes attitrées.

- PC : glisser le bouton Déplacer vers une équipe, ou choisir la destination au clic.
- Mobile : Déplacer ouvre la liste des équipes. Boutons de 44 px minimum.
- La composition est enregistrée côté serveur ; Annuler le déplacement restaure la précédente composition si personne ne l’a modifiée entre-temps.
- Planifier reprend les membres enregistrés, demande chantier/date/horaires, contrôle les conflits et ouvre le planning.
- Les affectations déjà enregistrées restent inchangées.
- La modification d’une affectation utilise désormais les équipes relationnelles du planning.

## Modifications

- `web/team-composer.js`, `web/team-composer.css` : tableau et interactions ; identité visuelle existante conservée.
- `worker/index.js`, `drizzle/0052_team_composition.sql` : déplacement atomique, contrôle des droits/entreprises, conflit de composition, journal et rejeu.
- `web/planning.js` : conserver les nouvelles équipes dans le formulaire d’affectation.
- `web/shortcuts.js` : éviter deux fenêtres d’aide concurrentes et rendre le focus correctement.
- Build : URL des styles et scripts versionnées par leur contenu pour éviter de mélanger ancienne et nouvelle interface dans une PWA déjà installée.
- Index/build et scripts de tests : intégration des ressources et nouvelles suites ; compte de migrations actualisé.

## Vérification locale

164 suites hermétiques réussies, contrôles de contraste inclus (Node 24.22, Linux).
Six suites navigateur réussies : team-composer, planning-board, planning-drag-step2, mobile-navigation, didactic-layer, offline.
Parcours vérifié : véritable geste souris, sauvegarde/rechargement, annulation, affectation/rechargement, réouverture avec la bonne équipe, refus de chevauchement, interactions tactiles aux largeurs Samsung 360 et 412 px.
Le nouveau parcours passe aussi avec une ancienne feuille de style placée dans le cache PWA. Les 67 ressources statiques versionnées répondent avec l’empreinte de contenu attendue.
Le téléphone Samsung physique et la totalité de la Browser Gate ne sont pas certifiés par ce lot.

## Sauvegarde et continuité

Archive initiale vérifiée dans `D:\projet.dev\socle`.
Base Railway sauvegardée avant publication : `daily/socle-2026-10-20T00-34-26-534Z-453832b8-c7ee-4b32-b09e-79eef3bf40fb.sqlite`, 2 416 640 octets, integrity_check=ok, 5 entreprises ; dépôt relu et comparé.
Migration additive : le tableau de reçus et son déclencheur peuvent rester présents en cas de retour au code précédent.
Le prochain lot métier reste le parcours contact → devis → chantier.

Agent : /root — Repérage.
