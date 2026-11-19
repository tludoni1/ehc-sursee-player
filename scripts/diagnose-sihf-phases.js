// Read-only test: enumerate SIHF phase filters and check EHC Sursee team IDs.
const teams=[["Senioren",37,105810],["1 Mannschaft",10,103941],["2 Mannschaft",19,104319],["Damen",43,103700]];
let errors=0;
for(const [name,league,id] of teams){
 for(const alias of ["results","player","goalkeeper"]){
  const u=new URL("https://data.sihf.ch/statistic/api/cms/table");
  u.searchParams.set("alias",alias);u.searchParams.set("searchQuery",`1//${league}`);
  u.searchParams.set("language","de");
  u.searchParams.set("filterBy","Season,Phase"+(alias==="results"?",Date":""));
  u.searchParams.set("filterQuery","2027/"+(alias==="results"?"/01.07.2026-30.06.2027":""));
  try {
   const res=await fetch(u,{signal:AbortSignal.timeout(12000)});
   if(!res.ok)throw new Error(`HTTP ${res.status}`);
   const q=await res.json();
   const opts=(q.filters||[]).map(f=>({alias:f.alias,selected:f.selected,entries:(f.entries||[]).map(v=>({alias:v.alias,name:v.name})).slice(0,35)}));
   const rows=Array.isArray(q.data)?q.data:[];
   const matching=rows.filter(row=>Array.isArray(row)&&row.some(cell=>cell&&typeof cell==="object"&&cell.id!=null&&String(cell.id)===String(id))).length;
   console.log(JSON.stringify({name,league,alias,rows:rows.length,matches:matching,filters:opts}).slice(0,8000));
  }catch(e){errors++;console.error(JSON.stringify({name,alias,error:e.message}))}
  await new Promise(r=>setTimeout(r,850));
 }
}
if(errors)process.exitCode=1;
