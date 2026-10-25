import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './test-ts-loader.mjs';
const {stages}=loadTS('data/mlsystems-curriculum.ts'),{learningBridges}=loadTS('data/systems-learning-bridges.ts'),{default:Bridge}=loadTS('app/systems/foundation-bridge.tsx');
let directory;before(()=>{directory=mkdtempSync(join(tmpdir(),'mlsys-foundation-'))});after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
test('all 55 existing lessons have specific bridge focus, prerequisite answers, worked guidance and original independent tasks',()=>{
 assert.equal(stages.flatMap(s=>s.lessons).length,55);assert.equal(Object.keys(learningBridges).length,11);
 const ids=new Set();
 for(const stage of stages){const bridge=learningBridges[stage.id];assert.ok(bridge);assert.equal(bridge.focus.length,stage.lessons.length);assert.ok(bridge.readiness.length>=2);assert.ok(bridge.guided.length>=4);
  for(const [i,lesson]of stage.lessons.entries()){assert.ok(!ids.has(lesson.id));ids.add(lesson.id);assert.ok(lesson.workedExample&&lesson.exercise&&lesson.transfer&&lesson.acceptance.length>=3);
   const html=renderToStaticMarkup(React.createElement(Bridge,{stageId:stage.id,lessonIndex:i}));assert.ok(html.includes(renderToStaticMarkup(React.createElement(React.Fragment,null,bridge.focus[i]))));assert.match(html,/参考示范/);assert.match(html,/失败例与排查/);
  }
 }
});
test('all eleven executable CPU bridges run and refuse output overwrite',()=>{
 for(let i=0;i<11;i++){const path=join(directory,`s${i}.json`);execFileSync('python3',['-B','public/systems/foundation_lab.py',`s${i}`,'--output',path],{timeout:10000});const data=JSON.parse(readFileSync(path,'utf8'));assert.equal(data.source_kind,'reference');assert.equal(data.stage,`s${i}`);if(i===6)assert.match(data.result.evidence,/no CUDA/)}
 assert.throws(()=>execFileSync('python3',['-B','public/systems/foundation_lab.py','s0','--output',join(directory,'s0.json')],{timeout:10000,stdio:'pipe'}));
});
test('RAII exception and bounded C++ threads compile, link and execute on the current toolchain',()=>{
 const object=join(directory,'raii.o'),raii=join(directory,'raii'),threads=join(directory,'threads');
 execFileSync('c++',['-std=c++17','-Wall','-Wextra','-pedantic','-c','public/systems/foundation_raii.cpp','-o',object],{timeout:30000});execFileSync('c++',[object,'-o',raii],{timeout:30000});
 assert.match(execFileSync(raii,[],{timeout:10000,encoding:'utf8'}),/alive=0/);
 execFileSync('c++',['-std=c++17','-Wall','-Wextra','-pedantic','-pthread','public/systems/foundation_threads.cpp','-o',threads],{timeout:30000});
 assert.match(execFileSync(threads,[],{timeout:10000,encoding:'utf8'}),/20 shape\/thread cases/);
});
