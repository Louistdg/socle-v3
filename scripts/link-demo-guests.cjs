// Explicit operator utility, never run automatically on application startup.
// stdin: {accounts:[{id,email,role}],organizations:[...]}; no passwords required.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync,backup}=require('node:sqlite');
const {randomUUID,createHash}=require('node:crypto');
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(0,'utf8'));
 const organizations=['org-fe704248-01ff-4b79-a2c0-c14c6b203eef','org-17fd1b7f-e297-4814-aba3-5633d2c19178','e52068dc-64c6-402e-b80b-c0d2737f6b52'];
 if(JSON.stringify(manifest.organizations)!==JSON.stringify(organizations)||manifest.accounts.length!==5)throw Error('Unexpected test scope');
 for(let i=0;i<5;i++){const a=manifest.accounts[i];if(a.email!==`invite0${i+1}@socle-test.invalid`||a.role!==['WORKER','WORKER','TEAM_LEAD','TEAM_LEAD','ACCOUNTING'][i])throw Error('Unexpected test account');}
 const dbPath=process.env.SOCLE_DB_PATH;if(!dbPath)throw Error('Explicit SOCLE_DB_PATH required');
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000');
 const unchanged=()=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().filter(t=>!['organization_workspace_state','organization_members','hr_people','hr_teams','hr_team_members','hr_team_leads','audit_logs'].includes(t.name)).map(t=>[t.name,createHash('sha256').update(db.prepare('SELECT * FROM "'+t.name.replaceAll('"','""')+'"').all().map(r=>JSON.stringify(r)).sort().join('\n')).digest('hex')]));
 const before=unchanged(),stamp=new Date().toISOString(),date=stamp.slice(0,10);
 const dir=path.join(path.dirname(dbPath),'operator-backups');fs.mkdirSync(dir,{recursive:true});await backup(db,path.join(dir,'before-demo-person-links-'+Date.now()+'.sqlite'));
 db.exec('BEGIN IMMEDIATE');let linked=0,createdPeople=0;
 try{
 const owner=db.prepare("SELECT id FROM profiles WHERE lower(email)='louis.masson@outlook.com'").get();if(!owner)throw Error('Owner missing');
 for(const org of organizations){
  if(!db.prepare("SELECT 1 FROM organization_members m JOIN roles r ON r.id=m.role_id WHERE m.organization_id=? AND m.user_id=? AND m.status='active' AND r.code='OWNER'").get(org,owner.id))throw Error('Owner scope missing');
  const row=db.prepare('SELECT * FROM organization_workspace_state WHERE organization_id=?').get(org);if(!row)throw Error('Workspace missing');const state=JSON.parse(row.payload);state.people??=[];state.teams??=[];let changed=false;
  for(let i=0;i<4;i++){
   const a=manifest.accounts[i],personId=910001+i;
   const member=db.prepare("SELECT m.*,r.code role FROM organization_members m JOIN roles r ON r.id=m.role_id WHERE m.organization_id=? AND m.user_id=? AND m.status='active'").get(org,a.id);
   if(!member||member.role!==a.role||!db.prepare('SELECT 1 FROM profiles WHERE id=? AND lower(email)=?').get(a.id,a.email))throw Error('Member mismatch');
   if(member.person_id&&String(member.person_id)!==String(personId))throw Error('Existing person binding must not be overwritten');
   const existing=state.people.find(p=>String(p.id)===String(personId));
   if(existing&&existing.demoAccountId!==a.id)throw Error('Person id collision');
   const name='Invité test '+String(i+1).padStart(2,'0'),role=i<2?'Ouvrier — démonstration':'Chef d’équipe — démonstration';
   if(!existing){state.people.push({id:personId,name,role,category:'Ouvrier',contract:'Simulation',start:date,end:'',birth:'',training:[],demoAccountId:a.id});createdPeople++;changed=true;}
   const hr=db.prepare('SELECT * FROM hr_people WHERE organization_id=? AND id=?').get(org,String(personId));
   if(hr&&hr.source!=='demo_test_account')throw Error('Existing HR person must not be overwritten');
   if(!hr)db.prepare('INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)').run(org,String(personId),name,role,'Ouvrier','demo_test_account',stamp,stamp);
   if(!member.person_id){db.prepare('UPDATE organization_members SET person_id=?,updated_at=? WHERE id=? AND person_id IS NULL').run(String(personId),stamp,member.id);linked++;db.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,new_values,created_at) VALUES(?,?,?,?,?,?,?,?)').run('audit-'+randomUUID(),org,owner.id,'member.demo_person_linked','organization_member',member.id,JSON.stringify({personId,accountId:a.id,release:'pub socle V3'}),stamp);}
  }
  for(let i=0;i<2;i++){
   const teamId=920001+i,name='Équipe de test '+(i+1),members=[910001+i,910003+i];
   const existing=state.teams.find(t=>String(t.id)===String(teamId));if(existing&&existing.demoTestTeam!==true)throw Error('Team collision');
   if(!existing){state.teams.push({id:teamId,name,members,leader:910003+i,demoTestTeam:true});changed=true;}
   const hr=db.prepare('SELECT * FROM hr_teams WHERE organization_id=? AND id=?').get(org,String(teamId));if(hr&&hr.source!=='demo_test_account')throw Error('HR team collision');
   if(!hr)db.prepare('INSERT INTO hr_teams(organization_id,id,name,active,source,created_at,updated_at) VALUES(?,?,?,1,?,?,?)').run(org,String(teamId),name,'demo_test_account',stamp,stamp);
   for(const personId of members){if(!db.prepare('SELECT 1 FROM hr_team_members WHERE organization_id=? AND team_id=? AND person_id=? AND ends_on IS NULL').get(org,String(teamId),String(personId)))db.prepare('INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,'demo-member-'+randomUUID(),String(teamId),String(personId),date,stamp,stamp);}
   if(!db.prepare('SELECT 1 FROM hr_team_leads WHERE organization_id=? AND team_id=? AND person_id=? AND ends_on IS NULL').get(org,String(teamId),String(910003+i)))db.prepare('INSERT INTO hr_team_leads(organization_id,id,team_id,person_id,starts_on,temporary,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,0,?,?,?,?)').run(org,'demo-lead-'+randomUUID(),String(teamId),String(910003+i),date,owner.id,stamp,owner.id,stamp);
  }
  if(changed)db.prepare('UPDATE organization_workspace_state SET payload=?,revision=revision+1,updated_at=? WHERE organization_id=? AND revision=?').run(JSON.stringify(state),stamp,org,row.revision);
 }
 if(JSON.stringify(before)!==JSON.stringify(unchanged()))throw Error('Unrelated tables changed');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key check failed');
 db.exec('COMMIT');console.log(JSON.stringify({linked,createdPeople,organizations:3,unrelatedTablesUnchanged:Object.keys(before).length}));
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
