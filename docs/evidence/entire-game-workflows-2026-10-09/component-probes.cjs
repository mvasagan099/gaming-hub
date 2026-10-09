const fs = require('fs');
const path = require('path');
const {createRequire} = require('module');
const root=process.cwd();
const req=createRequire(root+'/package.json');
const ts=req('typescript');
const React=req('react');
function probe(relative, name, props, state) {
 let slots=[], cursor=0, pending=[], creates=0, destroys=0;
 const hooks={...React,
 useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
 useState(initial){const i=cursor++;if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=v;}];},
 useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((x,j)=>!Object.is(x,old.deps[j])))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}
 };
 const stub=new Proxy({}, {get:()=>()=>null});
 const phaser={AUTO:0,Scale:{FIT:0,CENTER_BOTH:0},Game:class {constructor(){creates++;this.registry={set(){}};this.scale={refresh(){}};} destroy(){destroys++;}}};
 const customRequire=id=>id==='react'?hooks:id==='phaser'?phaser:id.includes('multiplayerStore')?{useMultiplayerStore:selector=>selector(state)}:id.includes('chessAnimationConfig')?{CHESS_DESIGN_CONFIG:{canvasWidth:800,canvasHeight:800}}:stub;
 const source=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports','window',source)(customRequire,mod,mod.exports,{innerWidth:1280,innerHeight:800,addEventListener(){},removeEventListener(){}});
 function attach(node){if(Array.isArray(node))return node.forEach(attach);if(!node?.props)return;if(node.props.ref)node.props.ref.current={};attach(node.props.children);}
 function render(p){cursor=0;pending=[];const tree=mod.exports[name](p);attach(tree);pending.forEach(fn=>fn());return tree;}
 const tree=render(props);
 if(props.names){render({...props,names:[...props.names]});return {component:name,unchangedNamesRerender:{boardCreations:creates,boardDestructions:destroys},expected:{boardCreations:1,boardDestructions:0},reproduced:creates===2&&destroys===1};}
 return {component:name,input:{mySeat:state.mySeat,isSpectator:state.isSpectator},actualChildSeat:tree.props.mySeat,actualChildSpectatorFlag:tree.props.isSpectator??null,reproduced:tree.props.mySeat===0&&tree.props.isSpectator!==true};
}
const results=[
probe('apps/web/src/games/chess/ChessPhaserGame.tsx','ChessPhaserGame',{mode:'pvp',level:2,theme:'classic',online:true,players:2,seat:0,names:['Host','Guest'],onBack(){},onReplay(){}}),
probe('apps/web/src/games/ludo/LudoPhaserGame.tsx','LudoPhaserGame',{mode:'pvp',online:true,players:2,seat:0,names:['Host','Guest']}),
probe('apps/web/src/games/carrom/CarromGame.tsx','CarromGame',{mode:'multiplayer',stake:50,onBack(){}},{mySeat:null,isSpectator:true,room:{players:[{seat:0,displayName:'Host'},{seat:1,displayName:'Guest'}]}})
];
fs.writeFileSync('/tmp/games-recheck-probes.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(r=>!r.reproduced))process.exit(1);
