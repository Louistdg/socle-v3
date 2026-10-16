# SOCLE — À reprendre plus tard

Ce registre évite de perdre les fonctions importantes volontairement différées.
Elles ne sont pas abandonnées : elles attendent simplement leur prérequis.

## À faire avant les données sensibles

- Stockage durable et sécurisé des documents et photos : fichiers privés, droits par dossier, liens temporaires, journal de consultation et séparation stricte entreprise / partenaire / travailleur.
- Dossier d'embauche documentaire : carte d'identité, permis, preuve bancaire et contrats uniquement après le stockage sécurisé. Ne jamais demander une photo de carte bancaire ; conserver seulement les informations nécessaires.
- Identité et invitations réelles : comptes professionnels distincts, invitation par e-mail, acceptation, récupération d'accès, révocation et notifications.

## Écosystème partenaires

- Portefeuille multi-entreprises pour un cabinet ou un secrétariat social : une connexion, plusieurs entreprises autorisées, changement de contexte sans partager le compte du patron.
- Espaces partenaires spécialisés : comptable (pièces, banque, TVA, anomalies) et secrétariat social (personnel, prestations, absences, préparation de paie).
- Demandes de documents contextualisées : une demande attachée à une facture, transaction, travailleur ou document, avec réponse et historique.
- Checklist mensuelle automatique : pièces manquantes, rapprochements, TVA, prestations et éléments bloquants.
- Messagerie contextualisée et journal d'audit complet : qui a vu, demandé, validé, corrigé ou transmis une information.
- Contrôle systématique des droits partenaires : accès minimal, révision et révocation par l'entreprise.

## Imports et automatisations à construire après le stockage sécurisé

- Import de factures par photo ou PDF, OCR, proposition de classement et rattachement chantier, toujours confirmé par l'utilisateur.
- Import de transactions bancaires depuis fichiers bancaires, aperçu avant import, détection de doublons et rapprochement contrôlé.
- Tests bancaires ou de paiement : utiliser uniquement un environnement sandbox officiel, des clés de test ou des fichiers bancaires fictifs. Ne jamais utiliser de carte, carte virtuelle à usage unique, identifiants bancaires ou argent réel pour tester SOCLE.
- Assistant : résumé de chantier, brouillon d'avenant, proposition de classement de facture, dérive d'heures et alertes de dates d'expiration. L'assistant propose ; il ne transmet ni ne modifie seul.

## Paie et rentabilité

- Préparation des prestations : heures normales, supplémentaires, absences, congés, intempéries et primes.
- Contrôles avant validation : chevauchements, contrat terminé, journées incohérentes, heures inhabituelles et données travailleur incomplètes.
- Retour des documents de paie et des coûts employeur, classement par personne et répartition du coût réel/moyen dans la rentabilité des chantiers.
- Commencer par exports/imports structurés ; connecter les services externes seulement après stabilisation des données et contrôles.

## Connecteurs externes — point d'arrêt volontaire

- Connecteurs RH réels, notamment PeoplePay.
- Génération Peppol structurée.
- Connexion à un opérateur / point d'accès Peppol.
- API réelles de banques, comptables, secrétariats sociaux ou partenaires.

Avant de commencer un connecteur externe : vérifier la documentation API, le contrat, les autorisations, les données réellement nécessaires, les droits d'accès, la journalisation et un mode de reprise en cas d'erreur.
