# Runtime de production Railway

Base d'implémentation : `main`, `6cd2e641f078526ddd944262e18f37c372bf97b1`.

## Décision : SQLite sur volume, une instance

Le worker utilise l'API D1 (`prepare/bind/first/all/run/batch`). Les migrations
SQLite existantes contiennent les contraintes et triggers métier, notamment
isolation tenant, stock, paiements et documents. PostgreSQL demanderait un
portage du schéma, des triggers et de l'adapter ; ce changement dépasse la mise
en route Railway. Aucune migration historique ou logique BatiNova n'est réécrite.

Le runtime utilise `node:sqlite` et conserve les migrations cumulatives. Les
clés étrangères sont activées avant les migrations ; les migrations et batches
sont transactionnels, sans attente au milieu d'une transaction. L'ouverture
vérifie `foreign_key_check` et `integrity_check`, active WAL, `synchronous=FULL`
et `busy_timeout=5000`. Une corruption ou une migration invalide refuse le
démarrage. Le registre `local_migrations` permet aussi une reprise d'une base
existante déjà migrée. Aucun seed n'est exécuté.

**Contraintes d'exploitation :** un volume attaché au service, un seul processus
Node et une seule réplique. Le disque du conteneur sans volume n'est pas un
stockage acceptable. Les fichiers SQLite, WAL et SHM restent sur le même volume.
Les volumes Railway ne supportent pas les répliques ; les redéploiements peuvent
introduire une brève indisponibilité. Une évolution vers plusieurs instances
nécessitera une mission PostgreSQL distincte.

Sources officielles : [volumes Railway](https://docs.railway.com/volumes),
[contraintes des volumes](https://docs.railway.com/volumes/reference),
[détection Node par Railpack](https://railpack.com/languages/node/).

## Configuration du service

Railpack détecte le package npm (`npm@10.9.9`), Node `22.x`, `npm run build` et
`npm run start`. `start` appelle exclusivement `node scripts/production.mjs`.
Node 22.13 minimum est contrôlé au démarrage ; aucune dépendance n'a été ajoutée
et le lockfile est conservé. Le Release Gate existant reste inchangé.

1. Attacher un volume persistant au service, par exemple `/app/data`.
2. Configurer une seule réplique et le healthcheck `/health`.
3. Configurer les variables suivantes avant le démarrage :

| Variable | Valeur / obligation |
| --- | --- |
| `PORT` | Port fourni par Railway ; obligatoire, entre 1 et 65535. |
| `SOCLE_PUBLIC_URL` | Origine HTTPS publique exacte, par exemple `https://socle.example.be`, sans chemin. |
| `SOCLE_SESSION_SECRET` | Secret aléatoire de 32 octets minimum, encodé base64url, stocké comme variable secrète. |
| `RAILWAY_VOLUME_MOUNT_PATH` | Fourni par Railway pour le volume attaché ; répertoire existant absolu. |
| `SOCLE_DB_PATH` | Optionnel : chemin absolu dans le volume ; défaut `<volume>/socle.sqlite`. |
| `SOCLE_ALLOW_BOOTSTRAP` | Absent ou `0` ; la création automatique d'entreprise est refusée dans ce runtime. |

Hors Railway, `SOCLE_DATA_DIR` peut désigner explicitement un répertoire de
stockage persistant à la place de `RAILWAY_VOLUME_MOUNT_PATH`. Il n'existe aucun
repli vers le disque du conteneur : lorsqu'un identifiant d'environnement/projet
Railway est présent, `RAILWAY_VOLUME_MOUNT_PATH` est obligatoirement requis. Aucun
repli vers `data/`, `/tmp` ou `:memory:`. Une variable `LOCAL_TEST_MODE`, même
`0`, ou un `DATABASE_URL` PostgreSQL refusent ce démarrage pour éviter un mode
ou un stockage ambigu. Les chemins sortant du volume, y compris par lien
symbolique, sont refusés. `SOCLE_DB_PATH` doit avoir un parent existant.

Génération du secret, sur le poste de l'opérateur (ne pas publier sa sortie) :

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Le volume n'est disponible qu'au démarrage du service : les migrations ont lieu
dans le runtime, jamais pendant le build ou une commande de pre-deploy.

## Comptes et connexion

Ce dépôt utilisait les en-têtes d'identité de son hébergeur et des identités de
simulation locale ; Railway ne fournit pas cette authentification. Le nouveau
transport utilise donc des identifiants de production provisionnés explicitement
et des sessions opaques persistantes. La migration `0033_production_auth.sql`
crée seulement deux tables vides ; aucun profil ou rôle n'est créé.

L'opérateur doit disposer d'une base réelle préparée, avec des profils et des
adhésions actives aux entreprises. Ce runtime ne fournit pas d'inscription
publique ni de création automatique du premier propriétaire. Une base neuve
démarre et répond au healthcheck, mais aucun utilisateur ne peut s'y connecter
tant que ces données réelles et ses identifiants ne sont pas provisionnés.
Ne pas importer une fixture BatiNova comme base de production.

Après préparation explicite d'un profil réel, définir son mot de passe depuis
le service ayant accès au volume et aux mêmes variables/secrets :

```sh
node scripts/production-account.mjs EXISTING_PROFILE_ID < /chemin/prive/mot-de-passe
```

Le mot de passe entre uniquement par stdin, jamais en argument ; protéger puis
retirer le fichier temporaire. Minimum 15 caractères, maximum 1024 octets.
La commande refuse un profil inconnu, une adhésion inactive et tout profil
référencé dans `local_test_identities`. Elle ne crée/modifie ni entreprise,
profil, rôle, permission ni donnée métier. Une nouvelle provision révoque les
anciennes sessions. Pour retirer l'accès, désactiver l'adhésion ou renseigner
`production_credentials.disabled_at` ; les requêtes suivantes sont refusées.

Connexion : `/login`, formulaire e-mail/mot de passe ; `POST /auth/login` et
`POST /auth/logout`. Les mots de passe sont dérivés avec scrypt
(`N=32768,r=8,p=3`, sel aléatoire et secret hors base), un réglage documenté par
[OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
Maximum deux vérifications concurrentes, trente tentatives globales par minute,
verrouillage persistant du compte dix minutes après cinq échecs. Les erreurs
ne révèlent pas l'existence d'un compte.

Les sessions expirent après huit heures et ne conservent que le HMAC du jeton.
Cookie `__Host-socle_session` avec `Path=/; HttpOnly; Secure; SameSite=Lax`, sans
Domain. Toute mutation exige l'Origin HTTPS configurée, y compris login/logout.
Le secret sert aussi à protéger les mots de passe : sa rotation invalide les
sessions **et nécessite de reprovisionner les mots de passe**. Le conserver
durablement hors du volume et hors Git.

## Autorité et séparation de la simulation

Les en-têtes `oai-*` reçus du client sont retirés ; seules les identités de la
session serveur sont transmises au build du worker. Les en-têtes proxy/Host ne
déterminent ni l'identité ni l'origine d'autorité. L'entreprise demandée reste
revalidée par le worker à chaque requête, avec les permissions et périmètres
actuels. Aucune matrice RBAC n'est dupliquée dans le runtime.

Toutes les routes `/__local-test*` sont 404, même avec encodage du nom. Le serveur
n'importe jamais `scripts/local.mjs`, ne transmet pas `LOCAL_TEST_MODE` au worker
et ne provisionne aucune identité ou donnée BatiNova. Un drapeau chargé avant
l'application désactive les enrichissements automatiques de démonstration
(finance, RH, matériel, migration BatiNova et sélecteur local), tout en conservant
les fonctions métier et le fonctionnement du serveur de simulation.

`GET/HEAD /health` est public et teste l'accès SQLite sans exposer de secret ou
donnée métier. Les autres API exigent une session. `SIGTERM/SIGINT` arrêtent
l'écoute, laissent terminer les requêtes puis ferment SQLite. Aucun fichier de
base n'est supprimé au démarrage ou à l'arrêt.

## Vérification et exploitation

```sh
npm ci
npm run build
npm test
npm start
```

Les suites `production-db-77`, `production-runtime-78` et `production-ui-79`
exécutent les migrations réelles sur bases jetables, les refus de configuration,
l'authentification et les protections tenant/RBAC, le redémarrage et les
injections de démonstration. Le Gate Core/Browser existant reste requis avant
tout merge. La présence de `start` n'est pas une preuve de déploiement Railway :
contrôler également le build Railway et `/health` sur le domaine après publication.

Sauvegarder le volume et le secret ; pour une sauvegarde SQLite à chaud, utiliser
l'API backup SQLite ou `VACUUM INTO` vers une destination distincte, puis vérifier
et tester une restauration. Une copie du seul fichier `.sqlite` pendant des
écritures WAL n'est pas une sauvegarde complète. Prévoir la rotation des
sauvegardes et un test de restauration avant utilisation de données réelles.
