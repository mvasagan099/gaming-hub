import { SnakeWormTimeline } from '../../../apps/web/src/games/snake-vs-worms/remoteTimeline';
import { TableTennisTimeline } from '../../../apps/web/src/games/table-tennis/remoteTimeline';
const delays=process.argv.includes('--severe') ? [0,0,180,160,140,120,100,80,60,40,20,0,0,0,0,180,160,140,120,100] : [0,0,65,45,25,5,0,0,80,60,40,20,0,0,0,70,50,30,10,0];
for(const game of ['snake','tennis']) {
 const timeline:any=game==='snake'?new SnakeWormTimeline():new TableTennisTimeline();
 const packets=Array.from({length:80},(_,i)=>({time:1000+i*50,arrival:5000+i*50+delays[i%delays.length],x:100+i*5})).sort((a,b)=>a.arrival-b.arrival);
 let index=0,last:number|undefined;const steps:number[]=[];
 for(let now=5000;now<9000;now+=1000/60){
  while(index<packets.length&&packets[index].arrival<=now){const p=packets[index++]; timeline.receive(game==='snake'?{gameId:'snake-vs-worms',serverTimestamp:p.time,stateVersion:p.time,gridWidth:2000,gridHeight:2000,paused:false,finished:false,players:[{seat:0,status:'active',direction:'right',speed:5,body:[{x:p.x,y:100}]}]}:{serverTimestamp:p.time,matchRemainingMs:100000,paused:false,finished:false,players:[{paddleY:p.x},{paddleY:160}],ball:{x:p.x,y:100,vx:1.6666666667,vy:0,touchCount:0,lastHitSeat:0,inPlay:true}},p.arrival);}
  const x=game==='snake'?timeline.bodies(now).get(0)?.[0]?.x:timeline.paddles(now)[0];
  if(last!=null&&x!=null)steps.push(x-last);last=x;
 }
 const abs=steps.map(Math.abs).sort((a,b)=>a-b);console.log(JSON.stringify({game,maxStep:Math.max(...abs),p95:abs[Math.floor(abs.length*.95)],backward:steps.filter(v=>v<-.01).length,held:steps.filter(v=>Math.abs(v)<.01).length}));
}
