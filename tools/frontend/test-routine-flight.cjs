const assert=require('node:assert/strict'),fs=require('node:fs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../../ui/routine-flight.js'),'utf8');
 const {createRoutineFlights}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const routine={id:'daily',bot_id:'one',last_run:{id:'old',status:'completed'}};
 let account='a',calls=0,rows=[routine],resolvePost,failRead=false,errors=0;
 const flights=createRoutineFlights({scope:()=>account,post:()=>{calls++;return new Promise(r=>resolvePost=r)},read:async()=>{if(failRead)throw Error('offline');return rows},failed:()=>errors++,cooldownMs:15,reconcileMs:5,attempts:2});
 const run=flights.run(routine);assert.equal(flights.view(routine).phase,'awaiting');assert.equal(await flights.run(routine),false);assert.equal(calls,1);
 resolvePost({run_id:'new'});await run;await delay(1);assert.equal(flights.view(routine).phase,'reconciling');
 rows=[{...routine,last_run:{id:'new',status:'queued'}}];flights.observe(rows);assert.equal(flights.view(routine).phase,'queued');assert(flights.view(routine).blocked);
 const oldRead=flights.beginRead(),newRead=flights.beginRead();rows=[{...routine,last_run:{id:'new',status:'running'}}];flights.observe(rows,newRead);flights.observe([{...routine,last_run:{id:'new',status:'queued'}}],oldRead);assert.equal(flights.view(routine).phase,'running');
 rows=[{...routine,last_run:{id:'successor',status:'completed'}}];flights.observe(rows);assert.equal(flights.view(routine).phase,'cooldown');flights.observe(rows);await delay(20);assert(!flights.view(routine).blocked);
 // Ack with no visible run is bounded and never labels work completed.
 const second=flights.run(routine);resolvePost({run_id:'absent'});await second;await delay(12);assert.equal(flights.view(routine).phase,'cooldown');assert.match(flights.view(routine).error,/not visible/);assert.equal(errors,1);await delay(20);
 failRead=true;const third=flights.run(routine);resolvePost({run_id:'third'});await third;await delay(2);assert.match(flights.view(routine).error,/Could not check/);assert.equal(errors,2);await delay(20);
 // A stale account response cannot install status into a new workspace.
 failRead=false;const fourth=flights.run(routine),oldResolve=resolvePost;account='b';assert(!flights.view(routine).blocked);oldResolve({run_id:'wrong-account'});await fourth;assert.equal(flights.view(routine).phase,'idle');
 const other={...routine,bot_id:'two'};const fifth=flights.run(routine);assert(!flights.view(other).blocked);resolvePost({run_id:'five'});await fifth;await delay(30);
 // Abort limits pending RPCs; a failed request remains retryable after cooldown.
 const timed=createRoutineFlights({scope:()=>1,post:(r,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')))),read:async()=>[],timeoutMs:5,cooldownMs:5});
 await timed.run(routine);assert.equal(timed.view(routine).phase,'cooldown');await delay(10);assert(!timed.view(routine).blocked);
 console.log('routine flights: duplicate suppression, ack/run separation, queue/running/terminal, stale reads, no-run recovery, refresh failure, scope isolation, timeout passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
