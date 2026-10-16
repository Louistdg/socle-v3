# SOCLE V3 — Recherche et première implémentation

## Objectif produit

Créer un projet Railway séparé pour expérimenter une expérience PC et mobile centrée sur le chantier. Cette version de recherche hérite des fonctions et des API de SOCLE V2 ; elle n’est pas présentée comme une réécriture complète de tous les modules ni comme une version certifiée pour des données réelles.

## Base vérifiée

Service V2 observé : projet `7605d504-dd03-4ba0-9356-98c3e857e3ee`, service `4cc43494-611e-4108-b06c-957a2f40c6a5`, source épinglée à `64e8d4afc6fb4c6da16ea60c5030a21591faf911`. Copie Git indépendante dans ce dossier, branche `socle-v3`. Aucun travail dans le checkout des autres agents. Aucun changement des services, variables ou volumes V2.

Projet V3 : `7a1eaac4-1d0d-469d-bab2-94dc4493c5e8`, service `a506a83c-ce7b-4b77-b30f-f02ee4d12421`, environnement `preview`. Volume indépendant `/app/data`, base `socle-v3.sqlite`. Accès par session authentifiée, secret V3 distinct, création initiale explicite du compte de Louis dans une base vide. Aucun fallback vers OWNER. Aucun compte bancaire externe connecté.

## Recherche effectuée

Le point de départ est l’audit des 19 vues SOCLE et de leurs formulaires, réalisé sur PC et mobile dans cette conversation. Les références suivantes ont été consultées pour structurer les expériences :

- [GOV.UK — Details](https://design-system.service.gov.uk/components/details/) : réserver les informations secondaires à une section dépliable, sans y cacher des informations essentielles.
- [GOV.UK — Check answers](https://design-system.service.gov.uk/patterns/check-answers/) : présenter une étape de vérification et permettre de corriger les informations avant de les soumettre.
- [GOV.UK — Complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/) : séparer les étapes d’un travail et rendre leur état compréhensible. Les exemples administratifs inspirent le mécanisme ; ils ne définissent pas le métier du bâtiment.
- [Railway — Déploiement local](https://docs.railway.com/cli/up) et [volumes](https://docs.railway.com/volumes) : code téléversé depuis la copie V3, stockage persistant monté au démarrage.

Ces références orientent le prototype ; elles ne remplacent pas une observation d’utilisateurs en entreprise.

## Décisions appliquées

1. Conserver le serveur et les migrations de la base certifiée pour éviter une réimplémentation improvisée des contrôles d’accès.
2. Créer une couche UX dédiée `web/v3.js` et `web/v3.css`, chargée après les modules existants. Le build embarque les sources ; aucun patch permanent du build généré.
3. Présentation claire : surfaces blanches, fond gris léger, accent vert profond, navigation organisée en cinq groupes. Cinq thèmes V3 cohérents (Atelier, Ardoise, Terre, Nuit, Contraste), choix local mémorisé, menu accessible au clavier, réduction des animations selon la préférence système.
4. Accès rapides et chantiers actifs à l’accueil ; conservation des parcours serveur autorisés.
5. Comptabilité découpée en Vue d’ensemble / Clients / Fournisseurs et dépenses / Banque / Réserves et réglages. Suppression des empilements de panneaux issus des anciens assemblages dans cette vue.
6. Les indicateurs financiers permettent d’ouvrir la vue correspondante. Les soldes bancaires et le disponible ne montrent pas un zéro si le compte est absent.
7. Compte et transaction bancaires saisis dans des formulaires SOCLE. Sélection du compte par son nom, sens du mouvement explicite, opération idempotente, confirmation après la réponse serveur. Conversion du montant en centimes sans calcul décimal flottant.
8. Créations personne / chantier / contact / bien : informations essentielles d’abord, détails dépliables. Les validations ouvrent le groupe contenant le champ invalide.
9. Devis organisé en étapes, avec récapitulatif avant enregistrement. Les calculs et droits sur les prix restent côté serveur.
10. Document : sélection de relation par nom pour les types disposant d’un catalogue serveur. Aucun identifiant technique demandé dans ce parcours. Les autres types exigent encore l’ouverture depuis le contexte métier ; ce point reste à étendre.
11. Fiche entreprise présentée par sections lorsque le renderer fournit des sections distinctes ; champs et enregistrement existants conservés.
12. Explication de la marge projetée et différence avec l’encaissement ; les calculs hérités ne sont pas présentés comme une nouvelle autorité financière.
13. Fermeture propre du runtime et conservation de la base au redéploiement. Le provisionnement initial ne réinitialise ni comptes ni données.
14. Dans le dossier chantier, ajout d’une lecture de rentabilité calculée par l’API autorisée : marché HTVA, coûts constatés, coût prévu à la fin, marge estimée et complétude. Les valeurs inconnues restent « à compléter » ; la vue distingue explicitement la marge des encaissements.
15. Navigation chantier mobile affinée : onglets lisibles et persistants sous l’entête, zone d’onglets défilable horizontalement, contenu limité à la vue choisie. Dans Terrain, le portail rassemble équipe, pointages, tâches, remarques/photos, matériaux, matériel, documents et devis technique en sept sections repliables ; dans Achats & rentabilité, les éléments historiques redondants sont masqués pour éviter la confusion. Les actions terrain restent dans le flux de lecture, sans recouvrir les onglets.

## Ce qui reste à développer pour la vision complète

- Détail financier avec origine de chaque montant et navigation exacte vers les pièces sélectionnées.
- Détail par catégorie et ouverture des pièces à l’origine de chaque montant de la marge chantier.
- Dossier chantier unifié et retours de navigation sans perte de contexte dans tous les modules.
- Création d’un contact depuis un devis sans perte des champs ni double fiche.
- Essai dans une entreprise réelle avec comptes Patron et Ouvrier distincts, notamment la validation des pointages ; l’environnement V3 actuel ne contient encore qu’un compte Patron. Les tests ci-dessous utilisent des identités séparées dans une base isolée et ne remplacent pas cet essai.
- Refonte du planning et parcours tactiles complets ; aucun nouveau glisser-déposer livré.
- Cartes mobiles pour tous les tableaux ; comparaison équipe et paramétrage des permissions à simplifier davantage.
- Distinction métier complète tâches / alertes : les fonctions héritées demeurent disponibles, sans prétendre qu’un changement de libellé réalise cette refonte.
- Liens canoniques entre achat / réception / facture / stock et suppression des présentations ambiguës de l’annuaire.
- Tous les types de relations documentaires avec recherche par nom, aperçu et tests d’accès détaillés.
- Portail ouvrier réel, tests sous autres rôles, téléphone physique, accessibilité mesurée et validation indépendante de sécurité.

## Stratégie de validation

Build et 125 suites hermétiques de la base exécutés sur la base de la V3. Tests V3 spécifiques au parsing monétaire : 20 cas. Vérification navigateur authentifiée de la connexion, navigation, création de chantier, rechargement, création bancaire et mouvement fictif. Les cinq thèmes ont été parcourus sur PC et mobile ; les ratios de contraste des textes principaux sont supérieurs à 4,5:1 avec fonds clairs adoucis. La rentabilité du chantier de démonstration a été vérifiée dans le dossier chantier sur mobile : budgets manquants signalés, montant de marge laissé à compléter, aucune erreur JavaScript ni largeur débordante. Pour cette itération mobile, test authentifié sur Microsoft Edge à 375×667, 390×844 et 430×844 : aucun débordement horizontal ; l’onglet reste à 66 px sous l’entête fixe après défilement, les vues Terrain et Rentabilité n’affichent que leur contenu, les sept accordéons répondent au toucher et aucune erreur JavaScript n’a été observée. Contrôle `/health` : HTTP 200. Le navigateur utilisé émule un téléphone ; aucune validation sur appareil physique n’a été faite. Pointages : 53 assertions des routes (arrivée/départ, pauses, correction demandée puis validée, visibilité individuelle/équipe, chantier hors périmètre, anti-doublon et rollback transactionnel), 69 assertions opérations/planning (3 h 35 nettes après 45 min de pause), test du portail terrain et contrôle de portée, plus rejeu du scénario BatiNova : 412 pointages et 9 corrections inchangés après rejeu. Ces identités patron/ouvrier sont simulées dans les suites isolées ; le parcours réel de deux comptes V3 et la validation sur téléphone physique restent à faire. Captures et résultats conservés dans `reports/` (hors Git). Aucune donnée V2 copiée.

Les extensions doivent continuer à satisfaire les invariants : serveur autoritaire, aucune session aucun droit, relations validées dans l’organisation, absence de doublon d’encodage, intégrité des migrations, audit des changements sensibles. Aucune invitation, relance, connexion bancaire, transmission fournisseur ou activation Peppol n’est effectuée pendant la R&D.
