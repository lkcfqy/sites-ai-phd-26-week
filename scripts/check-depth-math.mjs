// Independent numerical oracles for selected, fixed depth-v1 teaching cases.
// This supplements content review; it does not verify every derivation or question.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const questions=new Map();
for(const group of ['foundations','models','vision','timeseries','language','research']){
 const content=JSON.parse(readFileSync(new URL(`../data/depth-${group}.json`,import.meta.url),'utf8'));
 for(const lesson of Object.values(content))for(const question of lesson.questions)questions.set(question.id,question);
}
let checks=0;
function numbers(id){const question=questions.get(id);assert(question,`Missing ${id}`);return (question.options[question.answer].replaceAll('−','-').match(/-?\d+(?:\.\d+)?/g)??[]).map(Number)}
function near(id,expected,tolerance=1e-10){const actual=numbers(id);assert.equal(actual.length,1,`${id}: a numerical answer`);assert(Math.abs(actual[0]-expected)<=tolerance,`${id}: expected ${expected}, got ${actual[0]}`);checks++}
near('w07-d2-depth-1',12/(8+4));
near('w14-vision-d2-depth-3',(1-.2)*4+.2*10);
assert.deepEqual(numbers('w14-vision-d2-depth-1'),[1,3].map(value=>(value-2)/Math.sqrt(((1-2)**2+(3-2)**2)/2)));checks++;
near('w15-vision-d3-depth-1',(1-.5)**2*(-Math.log(.5)),.00005);
near('w15-vision-d3-depth-5',3);
near('w14-language-d4-depth-1',12/Math.sqrt(9));
near('w14-timeseries-d4-depth-1',15-4);
assert.deepEqual(numbers('w10-d2-depth-1'),[3,4]);checks++;
near('w10-d2-depth-2',[2,-1].reduce((sum,value)=>sum+value,0));
const differences=[.04,.02,-.01,.03,.02],mean=differences.reduce((sum,value)=>sum+value,0)/differences.length;
const sd=Math.sqrt(differences.reduce((sum,value)=>sum+(value-mean)**2,0)/(differences.length-1));
near('w26-d3-depth-1',mean);
near('w26-d3-depth-2',sd,.00005);
near('w24-d2-depth-1',.201-.196);
near('w24-d2-depth-2',(.201-.196)/.201*100,.0051);
console.log(`Depth math spot checks: ${checks} independent numerical answers passed (ridge, BN, focal, attention, release times, matrix shapes, shared gradients, paired statistics and relative effects).`);
