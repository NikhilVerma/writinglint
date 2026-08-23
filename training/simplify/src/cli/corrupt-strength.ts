// Does the corruption pass actually make text dirtier, and dirty enough?
//
//   npx tsx src/cli/corrupt-strength.ts runs/corrupt-full.jsonl
//
// The v15 corpus exists because the benchmark's hard prose sits at 39.9
// weighted findings per 1k and the training pool sat at 21.1. A corruption
// pass that only reaches 25 would leave the same gap in place, so measure it
// before spending GPU hours sampling rewrites of it. Watch the length ratio
// too: corruption that shortens text is deleting content, not spoiling style.
import { loadConfig } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { readFileSync } from 'node:fs';
const config = loadConfig();
const rows = readFileSync(process.argv[2] ?? 'runs/corrupt-partial.jsonl','utf8').split('\n').filter(Boolean).map((l)=>JSON.parse(l) as {source:string;outputs:string[]});
const w=(t:string)=>t.split(/\s+/).filter(Boolean).length;
const S:number[]=[],O:number[]=[],R:number[]=[];
for(let i=0;i<rows.length;i+=50){
  const b=rows.slice(i,i+50); const m=new Map<string,string>();
  b.forEach((r,j)=>{m.set(`s-${i+j}`,r.source);m.set(`o-${i+j}`,(r.outputs[0]??'').trim())});
  const f=await lintTexts(m,config);
  b.forEach((r,j)=>{const out=(r.outputs[0]??'').trim(); if(!out)return;
    const sw=w(r.source),ow=w(out); if(!sw||!ow)return;
    S.push(weighFindings(f.get(`s-${i+j}`)??[],config.reward.levelWeights,config.reward.scoredRules,config.reward.unscoredRules)*1000/sw);
    O.push(weighFindings(f.get(`o-${i+j}`)??[],config.reward.levelWeights,config.reward.scoredRules,config.reward.unscoredRules)*1000/ow);
    R.push(ow/sw);});
}
const mean=(x:number[])=>x.reduce((a,b)=>a+b,0)/x.length;
const q=(x:number[],p:number)=>[...x].sort((a,b)=>a-b)[Math.floor(x.length*p)];
console.log(`n=${S.length}  seed ${mean(S).toFixed(1)}/1k -> corrupted ${mean(O).toFixed(1)}/1k   p25 ${q(O,.25).toFixed(1)} p50 ${q(O,.5).toFixed(1)} p75 ${q(O,.75).toFixed(1)}`);
console.log(`length ratio ${mean(R).toFixed(3)}   shorter than seed: ${(100*R.filter(x=>x<1).length/R.length).toFixed(0)}%   corrupted CLEANER than seed: ${(100*O.filter((o,i)=>o<S[i]).length/O.length).toFixed(0)}%`);
console.log(`benchmark hard-prose target is 39.9/1k`);
