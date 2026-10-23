import fixture from '../public/systems/tensor_lab/cases.json' with {type:'json'};
export {fixture as tensorFixture};
export function linearModel(x:number[][],w:number[][],b:number[]){
 return x.map(row=>b.map((bias,j)=>bias+row.reduce((sum,value,k)=>sum+value*w[k][j],0)));
}
export function attentionModel(q:number[][],k:number[][],v:number[][],allowed:boolean[][]){
 const scores=q.map(query=>k.map(key=>query.reduce((sum,value,i)=>sum+value*key[i],0)/Math.sqrt(query.length)));
 const probabilities=scores.map((row,i)=>{
  const maximum=Math.max(...row.filter((_,j)=>allowed[i][j]));
  const numerators=row.map((value,j)=>allowed[i][j]?Math.exp(value-maximum):0);
  const denominator=numerators.reduce((sum,value)=>sum+value,0);
  return numerators.map(value=>value/denominator);
 });
 return {scores,probabilities,output:linearModel(probabilities,v,v[0].map(()=>0))};
}
export function tensorExample(causal=true,futureFeature=1){
 const {tokens,weights,bias,upstream}=fixture;
 const y=linearModel(tokens,weights,bias);
 const dx=upstream.map(row=>weights.map(feature=>feature.reduce((sum,value,j)=>sum+value*row[j],0)));
 const dw=weights.map((row,k)=>row.map((_,j)=>tokens.reduce((sum,token,i)=>sum+token[k]*upstream[i][j],0)));
 const db=bias.map((_,j)=>upstream.reduce((sum,row)=>sum+row[j],0));
 const loss=(w:number[][])=>linearModel(tokens,w,bias).reduce((sum,row,i)=>sum+row.reduce((s,value,j)=>s+value*upstream[i][j],0),0);
 const plus=weights.map(row=>[...row]),minus=weights.map(row=>[...row]);plus[0][0]+=1e-5;minus[0][0]-=1e-5;
 const x=tokens.map(row=>[...row]);x[2][0]=futureFeature;
 const q=linearModel(x,fixture.query_weights,[0,0]),k=linearModel(x,fixture.key_weights,[0,0]),v=linearModel(x,fixture.value_weights,[0,0]);
 const allowed=x.map((_,i)=>x.map((_,j)=>!causal||j<=i));
 return {y,dx,dw,db,finiteDifference:(loss(plus)-loss(minus))/2e-5,q,k,v,allowed,...attentionModel(q,k,v,allowed)};
}
