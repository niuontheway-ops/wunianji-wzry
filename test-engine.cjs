const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const E=require('./dist/engine.js');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(__dirname+'/dist/curriculum.js','utf8'),context);
const chapters=JSON.parse(JSON.stringify(context.window.CURRICULUM.chapters));
assert.equal(chapters.length,12);
assert.equal(chapters.flatMap(c=>c.questions).length,60);
for(const c of chapters)E.validateChapter(c);
assert.equal(new Set(chapters.flatMap(c=>c.questions.map(q=>q.id))).size,60);
const state=E.newState(),q=chapters[0].questions[0];
const makeSession=()=>({mode:'story',chapterId:chapters[0].id,hero:'李白',title:'测试',subject:'语文',questions:[q],correct:0,gained:0,checked:false});
const failed=makeSession();E.scoreSession(state,failed,q,(q.answer+1)%q.options.length,'2026-09-22');assert.equal(Object.keys(state.wrong).length,1);assert.equal(state.earned.length,0);
assert.equal(E.scoreSession(state,failed,q,q.answer,'2026-09-22'),null,'same answer cannot be scored twice');
E.completeSession(state,failed);assert.equal(state.cleared[chapters[0].id],undefined,'failed chapter remains incomplete');
const pass=makeSession();E.scoreSession(state,pass,q,q.answer,'2026-09-22');assert.equal(Object.keys(state.wrong).length,0);assert.equal(state.earned.length,1);E.completeSession(state,pass);assert.equal(state.cleared[chapters[0].id].stars,3);
const replay=makeSession();E.scoreSession(state,replay,q,q.answer,'2026-09-22');assert.equal(replay.gained,0,'no duplicated rewards');
assert.equal(E.numeric(' ３０５ '),305);assert.equal(E.numeric('5 apples'),null);assert.equal(E.numeric(''),null);assert.equal(E.numeric('0x10'),null);
for(const subject of ['数学','奥数'])for(let seed=0;seed<100;seed++){
  let value=seed+1;const random=()=>((value=(value*16807)%2147483647)-1)/2147483646;
  const qs=E.makePractice(subject,6,random);assert.equal(qs.length,6);
  for(const p of qs){E.validateQuestion(p);assert.equal(E.isCorrect(p,p.answer),true);assert.equal(E.isCorrect(p,'not a number'),false);assert.ok(Number(p.answer)>=0);}
  if(subject==='数学'){
    const multiplication=qs[0].prompt.match(/册 ([\d.]+) 元，买 (\d+) 本/);assert.ok(Math.abs(Number(qs[0].answer)-Number(multiplication[1])*Number(multiplication[2]))<1e-9);
    const equation=qs[2].prompt.match(/(\d+)x \+ (\d+) = (\d+)/);assert.equal(Number(equation[1])*Number(qs[2].answer)+Number(equation[2]),Number(equation[3]));
    const triangle=qs[4].prompt.match(/底为 ([\d.]+) 分米.*高为 (\d+) 分米/);assert.ok(Math.abs(Number(qs[4].answer)-Number(triangle[1])*Number(triangle[2])/2)<1e-9);
  }else{
    const sumdiff=qs[0].prompt.match(/共 (\d+) 颗.*多 (\d+) 颗/);assert.equal(Number(qs[0].answer),(Number(sumdiff[1])+Number(sumdiff[2]))/2);
    const rabbit=qs[1].prompt.match(/共 (\d+) 只，共 (\d+) 条腿/);const r=Number(qs[1].answer);assert.equal(4*r+2*(Number(rabbit[1])-r),Number(rabbit[2]));
    const tree=qs[2].prompt.match(/长 (\d+) 米.*每隔 (\d+) 米/);assert.equal(Number(qs[2].answer),Number(tree[1])/Number(tree[2])+1);
    const meeting=qs[5].prompt.match(/相距 (\d+) 千米.*小时 (\d+) 千米和 (\d+) 千米/);assert.equal(Number(qs[5].answer)*(Number(meeting[2])+Number(meeting[3])),Number(meeting[1]));
  }
}
assert.deepEqual(E.restore(E.backup(state)).earned,state.earned);
assert.throws(()=>E.restore({kind:'other'}));
assert.throws(()=>E.validateChapter({...chapters[0],questions:[{...q,answer:100}]}));
assert.throws(()=>E.validateQuestion({...q,type:'reading',passage:''}));
assert.throws(()=>E.validateQuestion({...q,options:['same','same']}));
vm.runInNewContext(fs.readFileSync(__dirname+'/dist/assets.js','utf8'),context);
assert.equal(context.window.HEROES.length,6);
for(const h of context.window.HEROES)for(const role of ['entry','praise','encourage']){assert.ok(h.voiceRoles[role].text);assert.ok(fs.statSync(__dirname+'/dist/assets/'+h.voiceRoles[role].file).size>1000);}
assert.equal(E.newState().sound,true);
assert.equal(E.restore(E.backup({...E.newState(),sound:false})).sound,false);
console.log('PASS: 60 curriculum questions, scoring, wrong-answer removal, reward deduplication, 1200 grade-five generated questions, backup validation and 18 voice-role assets.');
