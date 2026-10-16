import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sql=readFileSync(join(root,'drizzle','0019_organization_workspace_state.sql'),'utf8');

let assertions=0;
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};

function makeDb(reverse=false){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE organizations(id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE profiles(id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE roles(
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      code TEXT NOT NULL,
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE organization_members(
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      status TEXT NOT NULL,
      joined_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organization_id) REFERENCES organizations(id),
      FOREIGN KEY(user_id) REFERENCES profiles(id),
      FOREIGN KEY(role_id) REFERENCES roles(id)
    );
    CREATE TABLE workspace_state(
      user_id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES profiles(id)
    );
    INSERT INTO organizations(id) VALUES('org-a'),('org-b');
    INSERT INTO profiles(id) VALUES('owner-a-a'),('owner-a-b'),('owner-b-a');
    INSERT INTO roles(id,organization_id,code)
      VALUES('role-a-owner','org-a','OWNER'),('role-b-owner','org-b','OWNER');
  `);

  const rows=reverse
    ? [
        ['member-a-b','org-a','owner-a-b','role-a-owner'],
        ['member-a-a','org-a','owner-a-a','role-a-owner']
      ]
    : [
        ['member-a-a','org-a','owner-a-a','role-a-owner'],
        ['member-a-b','org-a','owner-a-b','role-a-owner']
      ];

  for(const [id,org,user,role] of rows){
    db.prepare(`
      INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at)
      VALUES(?,?,?,?, 'active','2026-01-01','2026-01-01','2026-01-01')
    `).run(id,org,user,role);
  }

  db.exec(`
    INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at)
    VALUES('member-b-a','org-b','owner-b-a','role-b-owner','active','2026-01-01','2026-01-01','2026-01-01');

    INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES
      ('owner-a-a','{"source":"A-A"}',11,'2026-02-01'),
      ('owner-a-b','{"source":"A-B"}',22,'2026-03-01'),
      ('owner-b-a','{"source":"B-A"}',33,'2026-04-01');
  `);
  return db;
}

for(const reverse of [false,true]){
  const db=makeDb(reverse);
  equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,'les FK doivent être actives');

  const legacyBefore=db.prepare('SELECT COUNT(*) AS n FROM workspace_state').get().n;
  db.exec(sql);

  equal(
    db.prepare("SELECT COUNT(*) AS n FROM organization_workspace_state").get().n,
    2,
    '0019 doit produire un seul workspace canonique par organisation'
  );
  equal(
    db.prepare("SELECT source_user_id FROM organization_workspace_state WHERE organization_id='org-a'").get().source_user_id,
    'owner-a-a',
    'à date égale, le choix doit être déterministe via user_id'
  );
  equal(
    db.prepare("SELECT payload FROM organization_workspace_state WHERE organization_id='org-a'").get().payload,
    '{"source":"A-A"}',
    'org-a doit reprendre le payload du OWNER déterministe de org-a'
  );
  equal(
    db.prepare("SELECT source_user_id FROM organization_workspace_state WHERE organization_id='org-b'").get().source_user_id,
    'owner-b-a',
    'org-b doit conserver sa propre source'
  );
  equal(
    db.prepare("SELECT payload FROM organization_workspace_state WHERE organization_id='org-b'").get().payload,
    '{"source":"B-A"}',
    'aucun payload de org-a ne doit contaminer org-b'
  );
  equal(
    db.prepare('SELECT COUNT(*) AS n FROM workspace_state').get().n,
    legacyBefore,
    'les anciens workspace_state doivent être conservés'
  );

  const snapshot=db.prepare('SELECT organization_id,payload,revision,source_user_id FROM organization_workspace_state ORDER BY organization_id').all();
  db.exec(sql);
  const replay=db.prepare('SELECT organization_id,payload,revision,source_user_id FROM organization_workspace_state ORDER BY organization_id').all();
  equal(JSON.stringify(replay),JSON.stringify(snapshot),'rejouer 0019 ne doit pas modifier le canon existant');

  equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'foreign_key_check doit être vide');
  equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity_check doit être ok');
  db.close();
}

console.log(`migrations-workspace-0019: ${assertions} assertions réussies.`);
