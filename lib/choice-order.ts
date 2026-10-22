// Presentation order is stable within a question; answers always retain source indexes.
export function orderedChoices(options:string[],key:string){
 let seed=2166136261;for(const character of key){seed^=character.charCodeAt(0);seed=Math.imul(seed,16777619)}
 const values=options.map((text,index)=>({text,index}));
 for(let i=values.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[values[i],values[j]]=[values[j],values[i]]}
 return values;
}
