import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
function setup(run){const root=mkdtempSync(join(tmpdir(),'teaching-cli-'));try{run(root)}finally{rmSync(root,{recursive:true,force:true})}}
function invoke(root,data,extra=[]){const input=join(root,'input.json'),output=join(root,'summary.json');writeFileSync(input,JSON.stringify(data));return {output,run:spawnSync('python3',['-B','public/systems/log_cli.py','--input',input,'--output',output,...extra],{encoding:'utf8',timeout:5000})};}
test('file CLI keeps machine stdout separate and reports the documented threshold boundary',()=>setup(root=>{
 const {output,run}=invoke(root,[{id:0,ms:0,ok:true},{id:1,ms:20,ok:false},{id:2,ms:100,ok:true}]);assert.equal(run.status,0,run.stderr);
 assert.equal(JSON.parse(run.stdout).status,'completed');assert.match(run.stderr,/Read 3 records/);
 const data=JSON.parse(readFileSync(output,'utf8'));assert.equal(data.successful,2);assert.equal(data.failed,1);assert.equal(data.mean_success_ms,50);assert.equal(data.p95_success_ms,100);assert.equal(data.over_budget,0);assert.equal(data.source,'provided-input-statistics-not-device-measurement');
 const before=readFileSync(output,'utf8');const repeat=invoke(root,[{id:0,ms:1,ok:true}]);assert.equal(repeat.run.status,2);assert.equal(readFileSync(output,'utf8'),before);
}));
test('malformed records fail with diagnostic and no result file',()=>{
 for(const data of [[],[{id:0,ms:true,ok:true}],[{id:0,ms:'20',ok:true}],[{id:0,ms:-1,ok:true}],[{id:0,ms:1,ok:true},{id:0,ms:2,ok:false}]])setup(root=>{const {output,run}=invoke(root,data);assert.equal(run.status,2);assert.match(run.stderr,/ValueError/);assert.equal(existsSync(output),false);assert.equal(run.stdout,'')});
});
test('no successful requests keeps errors and expresses unavailable statistics as null',()=>setup(root=>{
 const {output,run}=invoke(root,[{id:1,ms:5,ok:false}]);assert.equal(run.status,0,run.stderr);const data=JSON.parse(readFileSync(output,'utf8'));assert.equal(data.failed,1);assert.equal(data.p95_success_ms,null);assert.equal(data.mean_success_ms,null);
}));
