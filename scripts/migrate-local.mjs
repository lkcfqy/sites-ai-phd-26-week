// Apply only missing schema stages; never recreate or reset a populated DB.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
mkdirSync('.sites-runtime',{recursive:true});
const config=resolve('.sites-runtime/local-database.json');
writeFileSync(config,JSON.stringify({name:'ai-phd-local-db',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}));
function query(sql){return JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config',config,'--local','--persist-to',resolve('.wrangler/state'),'--command',sql,'--json'],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}}))}
function columns(table){return query(`PRAGMA table_info(${table})`)[0].results.map(c=>c.name)}
function apply(name){const sql=readFileSync(resolve('drizzle',name),'utf8');query(sql);console.log('Applied '+name)}
if(!columns('profiles').length)apply('0000_abnormal_khan.sql');
if(!columns('checkpoints').length)apply('0001_volatile_the_twelve.sql');
if(!columns('checkpoints').includes('track'))apply('0002_minor_black_bolt.sql');
const expected={progress:['assistance','practice_evidence','content_version'],projects:['assistance'],attempts:['content_version'],checkpoints:['content_version']};
const present=Object.entries(expected).flatMap(([table,names])=>{const cols=columns(table);return names.map(n=>cols.includes(n))});
if(present.some(Boolean)&&!present.every(Boolean))throw new Error('Partial evidence migration: inspect and repair the schema; this script will not reset records.');
if(!present.every(Boolean))apply('0003_learning_evidence.sql');
if(!columns('code_artifacts').length)apply('0004_autonomous_learning.sql');
if(!columns('research_records').length)apply('0005_research_protocols.sql');
console.log('Schema current; existing records preserved.');
