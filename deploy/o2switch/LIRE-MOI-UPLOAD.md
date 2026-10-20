# Page d’accueil O2switch — mode d’emploi

## Fichier

`index.html`

## Où le déposer

### Pour remplacer la page d’accueil du domaine

```text
public_html/index.html
```

Adresse : https://socle-construction.be/

### Pour garder la page actuelle et créer une page « outils »

```text
public_html/outils/index.html
```

Adresse : https://socle-construction.be/outils/

## À ne pas toucher

- `public_html/berceau/`
- `public_html/ptshield/`
- `public_html/dioptre/`
- ne pas envoyer de `.htaccess` : O2switch a déjà renvoyé des erreurs 500
  avec certains fichiers de ce type.

## Vérifications après upload

1. https://socle-construction.be/ répond en HTTPS.
2. Les quatre cartes ouvrent :
   - SOCLE V3 ;
   - Berceau ;
   - PTShield ;
   - Dioptre.
3. Tester sur téléphone 390 px.
4. Vérifier que les sous-domaines existants fonctionnent toujours :
   - https://berceau.socle-construction.be
   - https://ptshield.socle-construction.be
   - https://dioptre.socle-construction.be

## Liens à donner

- Accueil outils : https://socle-construction.be/
- SOCLE V3 : https://socle-v3-preview.up.railway.app
- Berceau : https://berceau.socle-construction.be
- PTShield : https://ptshield.socle-construction.be
- Dioptre : https://dioptre.socle-construction.be
- Statut SOCLE : https://socle-v3-preview.up.railway.app/status
