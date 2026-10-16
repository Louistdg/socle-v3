# SOCLE — Référentiel de conception

Ce document est la règle de conception de la version vierge. Il transforme le benchmark produit et UX en critères de décision durables.

## Modèle produit

Le chantier est l'objet central : `devis → chantier → planning → équipe → heures → photos → achats → factures → banque → rentabilité`.

Une information est saisie une fois, puis réutilisée. Personnel et équipes sont deux objets distincts. Une fiche chantier doit relier au minimum le résumé, planning, équipe, tâches, journal, photos, documents, heures, achats, devis/avenants, factures, rentabilité et historique.

Les tâches et alertes sont un système unique, avec les états : À faire, À valider, En attente, En retard, Problème signalé, Terminé. Les rôles, exceptions individuelles et périmètres déterminent les accès ; le patron doit pouvoir voir l'interface comme un autre utilisateur.

## Expérience

L'accueil répond d'abord à « que dois-je gérer maintenant ? ». Une page a une action principale explicite et les modifications courantes sont sauvegardées automatiquement avec possibilité d'annuler. Les confirmations sont réservées aux actions destructives ou sensibles.

Sur ordinateur, privilégier la liste à gauche et le détail à droite. Les listes offrent recherche, filtres simples, puces de filtres actifs, vues enregistrées et actions groupées. La recherche globale traverse tous les modules.

Sur mobile, ne pas réduire la version ordinateur : proposer Aujourd'hui, Chantiers, Tâches, Photo et Plus, avec de grandes zones tactiles et les gestes essentiels (photo, problème, tâche, pointage).

## Comptabilité et IA

La comptabilité est reliée au chantier : les factures fournisseurs, dépenses, heures et paiements alimentent ses coûts et sa rentabilité. Prévoir Peppol et la facturation structurée belge ; toute reconnaissance ou proposition reste contrôlable avant validation.

L'IA intervient dans les flux (résumé, dictée vers tâche, avenant, rapprochement, détection de dérive, extraction de dates), propose d'abord et n'exécute jamais seule une action sensible.

## Test de toute nouvelle fonction

Avant de l'ajouter, répondre : quel problème résout-elle, qui l'utilise, à quelle fréquence, combien de clics demande-t-elle, quelles données SOCLE connaît déjà, peut-elle être automatisée, et peut-elle rester cachée aux personnes non concernées ?
