const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('desktop/popup.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const elements=Object.fromEntries(['word','meaning','context','status','save','sentence','listening','practice-note','settings','close'].map(x=>[x,{value:'',textContent:'',onclick:null}]));
const requests={};let onSelection;
const helper={onSelection:fn=>onSelection=fn,lookup:text=>new Promise(resolve=>requests[text]=resolve),save:async()=>{},openSettings(){},close(){}};
vm.runInNewContext(script,{window:{helper},document:{querySelector:s=>elements[s.slice(1)]}});
(async()=>{const a=onSelection({text:'apple',source:'fixture'});const b=onSelection({text:'banana',source:'fixture'});requests.banana({meanings:['香蕉']});await b;requests.apple({meanings:['苹果']});await a;assert.equal(elements.meaning.value,'香蕉');})();
