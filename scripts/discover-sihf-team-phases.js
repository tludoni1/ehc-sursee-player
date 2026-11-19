// Discover the exact Phase IDs of EHC Sursee teams using SIHF results.
const teams=[["Senioren",37,105810],["1 Mannschaft",10,103941],["2 Mannschaft",19,104319],["Damen",43,103700]];
const range="01.07.2026-30.06.2027";
const get=async(alias,league,phase)=>{
 const url=new URL("https://data.sihf.ch/statistic/api/cms/table");
 url.searchParams.set("alias",alias);url.searchParams.set("searchQuery",`1//${league}`);
 url.searchParams.set("language","de");
 url.searchParams.set("filterBy",alias==="results"?"Season,Phase,Date":"Season,Phase");
 url.searchParams.set("filterQuery",alias==="results"?`2027/${phase}/${range}`:`2027/${phase}`);
 const resp=await fetch(url,{signal:AbortSignal.timeout(12000)});
 if(!resp.ok)throw Error("HTTP "+resp.status);
 const body=await resp.json();
 for(const [field,wanted] of [["Season","2027"],["Phase",phase]]){
  const f=body.filters?.find(x=>x.alias===field);
  if(!f||String(f.selected)!==String(wanted))throw Error(`Bad SIHF echo ${field} for ${league} ${phase}: ${f?.selected}`);
 }
 return body;
};
let fail=0;
for(const [name,league,teamId] of teams){
 try{
  const all=await get("results",league,"all");
  const phases=all.filters?.find(f=>f.alias==="Phase")?.entries?.filter(p=>p.alias!=="all")||[];
  const matched=[];
  for(const phase of phases){
   const result=await get("results",league,String(phase.alias));
   const n=result.data.filter(row=>Array.isArray(row)&&row.some(cell=>cell&&typeof cell==="object"&&String(cell.id)===String(teamId))).length;
   if(n>0){
    const stats=[];
    for(const alias of ["player","goalkeeper"]){
      const q=await get(alias,league,String(phase.alias));
      const rows=q.data.filter(row=>Array.isArray(row)&&row[2]&&String(row[2].id)===String(teamId));
      stats.push({alias,totalRows:q.data.length,matchingRows:rows.length,header:q.header?.map(h=>h.alias)});
    }
    matched.push({id:phase.alias,name:phase.name,games:n,stats});
   }
   await new Promise(r=>setTimeout(r,350));
  }
  console.log(JSON.stringify({team:name,league,teamId,matched}));
  if(!matched.length || !matched.some(m=>m.stats.some(s=>s.matchingRows>0)))fail++;
 }catch(e){fail++;console.error(JSON.stringify({team:name,error:e.message}))}
}
if(fail)process.exitCode=1;
