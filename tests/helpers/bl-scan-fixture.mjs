const stamp='2026-10-06T16:00:00.000Z';
export function seedBlScanFixture(db){
  for(const org of ['org-a','org-b'])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,\'BE\',\'EUR\',?,?)').run(org,org,org,stamp,stamp);
  const users=[
    ['owner-a','org-a','OWNER',[]],['owner-b','org-b','OWNER',[]],
    ['receiver','org-a','TEAM_LEAD',['purchase_orders.view','deliveries.receive','projects.view.assigned']],
    ['no-view','org-a','USER_NO_VIEW',['deliveries.receive','projects.view.assigned']],
    ['no-receive','org-a','USER_NO_RECEIVE',['purchase_orders.view','projects.view.assigned']],
    ['out-of-scope','org-a','USER_OUT_OF_SCOPE',['purchase_orders.view','deliveries.receive','projects.view.assigned','documents.secure.view']],
    ['worker','org-a','WORKER',['documents.secure.view']],
    ['accounting','org-a','ACCOUNTING',['accounting.view','purchase_orders.view','documents.secure.view']],
    ['documents-only','org-a','USER_DOCUMENTS_ONLY',['documents.secure.view','documents.secure.manage','projects.view.all']]
  ];
  for(const [uid,org,code,permissions] of users){
    db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(uid,uid,'Fixture',uid+'@example.test',stamp,stamp);
    db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,org,code,code,stamp);
    db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,'active',?,?,?)").run('member-'+uid,org,uid,'role-'+uid,stamp,stamp,stamp);
    for(const permission of permissions)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+uid,permission);
    if(['receiver','no-view','no-receive'].includes(uid))db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,uid,'project-a','owner-a',stamp);
  }
  for(const org of ['org-a','org-b']){
    const project=org==='org-a'?'project-a':'project-b';
    const state={version:3,company:{name:org},people:[],teams:[],jobs:[{id:project,name:'Fixture chantier',reference:'FIXTURE'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],stockItems:[],purchaseOrders:[{id:'shared-order',number:'FIXTURE-BC',supplierId:'',job:project,status:'commandée',date:'2026-10-06',lines:[{id:'line-a',reference:'PIR-140',label:'Panneau isolant',quantity:10,unit:'panneau',unitPrice:12}]},{id:'other-order',number:'FIXTURE-BC-2',job:0,status:'commandée',lines:[]}],deliveryNotes:[]};
    db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),1,org==='org-a'?'owner-a':'owner-b',stamp,stamp);
  }
}
