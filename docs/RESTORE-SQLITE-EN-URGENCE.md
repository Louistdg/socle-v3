# Restaurer la base SOCLE après une perte

Cette procédure remplace une base perdue ou inutilisable par une copie de
sauvegarde vérifiée. Elle s’exécute dans le conteneur SOCLE sur Railway
(Node.js 22.13 ou plus récent).

1. Dans le stockage de sauvegarde indépendant du volume applicatif, récupérez
   la sauvegarde vérifiée la plus récente. Suivez l’emplacement et la méthode
   de récupération fournis par le dispositif de sauvegarde T3 — GARDIEN.
2. Copiez ce fichier dans le conteneur sous `/tmp/socle-backup.sqlite`.
   Vérifiez que le volume persistant est monté sur `/app/data`.
3. Exécutez depuis `/app` :

   ```sh
   node --experimental-sqlite scripts/restore-sqlite.mjs \
     /tmp/socle-backup.sqlite /app/data/socle.sqlite
   ```

   La destination doit être absente. La commande refuse de remplacer une
   base existante. Pour restaurer à nouveau, déplacez d’abord la base
   défectueuse hors du chemin cible, sans la supprimer, puis relancez.
4. Continuez uniquement si la sortie affiche `RESTORE_SQLITE=PASS`, les deux
   contrôles `integrity_check=ok`, les mêmes tables et nombres de lignes pour
   la source et la restauration, et la lecture de l’organisation. Le programme
   contrôle également le fichier installé sur le volume.
5. Si la commande affiche `RESTORE_SQLITE=FAIL`, ne démarrez pas l’application
   avec ce résultat. Conservez la copie source et les journaux, écartez la
   destination partielle si elle a été créée par cette commande, puis demandez
   au responsable de vérifier la sauvegarde et le volume avant un nouvel essai.

La restauration ne modifie pas la copie source. Gardez-la jusqu’à ce que le
service soit revenu et que les données métier aient été contrôlées.
