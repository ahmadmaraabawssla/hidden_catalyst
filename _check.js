var pg=require('pg');var K='o2CG0TwWzkqWxU9hz0kb7fW6dCzYXAMx';
async function main(){
var t='ESRT';
// DB
var c=new pg.Client({connectionString:'postgresql://postgres.xrfoyckeohsuexoybbxm:0549496712.AmmA@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'});
await c.connect();
var r=await c.query("SELECT ticker,market_cap,latest_price,attributes FROM securities WHERE ticker='"+t+"'");
if(r.rows[0]){var d=r.rows[0];console.log('DB: cap='+(d.market_cap?(d.market_cap/1e9).toFixed(2)+'B':'NULL')+' price='+d.latest_price+' attrs='+JSON.stringify(d.attributes))}
// SEC XBRL
var xr=await fetch('https://data.sec.gov/api/xbrl/companyfacts/CIK0001541401.json',{headers:{'User-Agent':'HC'}});
var xj=await xr.json();
var namespaces=Object.keys(xj.facts);
namespaces.forEach(function(ns){
var facts=xj.facts[ns];
if(!facts)return;
['EntityCommonStockSharesOutstanding','CommonStockSharesOutstanding','CommonStockSharesIssued'].forEach(function(tag){
if(facts[tag]&&facts[tag].units){
Object.keys(facts[tag].units).forEach(function(u){facts[tag].units[u].slice(0,3).forEach(function(v){console.log('SEC '+ns+'.'+tag+': '+v.end+' = '+v.val+' (form '+v.form+')')})});
}
});
});
// FMP income
for(var period of ['quarter','annual']){
var ir=await fetch('https://financialmodelingprep.com/stable/income-statement?symbol='+t+'&period='+period+'&limit=4&apikey='+K);
var inc=await ir.json();
console.log('\nFMP income ('+period+'):');
if(Array.isArray(inc))inc.slice(0,4).forEach(function(q){console.log('  '+q.date+' '+q.period+' diluted='+q.weightedAverageShsOutDil+' basic='+q.weightedAverageShsOut+' EPS='+q.eps)});
}
// FMP profile
var pr=await fetch('https://financialmodelingprep.com/stable/profile?symbol='+t+'&apikey='+K);
var p=(await pr.json())[0]||{};
console.log('\nFMP profile: mktCap='+((p.mktCap||p.marketCap||0)/1e9).toFixed(2)+'B price='+p.price+' name='+(p.companyName||''));
await c.end();process.exit(0);
}
main().catch(function(e){console.error(e.message);process.exit(1)});
