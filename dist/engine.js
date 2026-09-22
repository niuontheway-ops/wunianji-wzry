(function (root) {
  'use strict';
  const subjects = ['语文', '数学', '奥数', '英语'];
  const types = ['choice', 'boolean', 'reading', 'number'];
  const plain = (v, max, label) => {
    if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${label}需为 1–${max} 字的文字。`);
    return v.trim();
  };
  const identifier = value => {
    const id=plain(value,100,'编号');
    if(!/^[a-zA-Z0-9_-]+$/.test(id)||['__proto__','constructor','prototype'].includes(id))throw new Error('编号格式不正确。');
    return id;
  };
  function numeric(v) {
    const s = String(v).replace(/[０-９．－＋]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0)).trim();
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
  }
  function validateQuestion(q, fallbackId) {
    if (!q || typeof q !== 'object' || !types.includes(q.type)) throw new Error('题型须为 choice、boolean、reading 或 number。');
    const out = {id: identifier(fallbackId || q.id), type:q.type, prompt:plain(q.prompt, 2000, '题目'),
      hint:plain(q.hint || '再读一遍题目，找出已知条件。', 2000, '提示'),
      explanation:plain(q.explanation, 6000, '解析'), skill:plain(q.skill || '课文练习', 100, '知识点')};
    if (q.passage) out.passage = plain(q.passage, 30000, '阅读材料');
    if (q.type === 'reading' && !out.passage) throw new Error('阅读题需要阅读材料。');
    if (q.type === 'number') {
      if (numeric(q.answer) === null) throw new Error('数字题答案须为有效数字，不带单位。');
      out.answer=String(numeric(q.answer));
    } else {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) throw new Error('每题需要 2–6 个选项。');
      out.options=q.options.map(x=>plain(x, 2000, '选项'));
      if (new Set(out.options).size !== out.options.length) throw new Error('选项不可重复。');
      if (q.type==='boolean' && (out.options.length!==2 || out.options[0]!=='正确' || out.options[1]!=='错误')) throw new Error('判断题选项固定为“正确”“错误”。');
      if (!Number.isInteger(q.answer) || q.answer<0 || q.answer>=out.options.length) throw new Error('正确答案编号超出选项范围。');
      out.answer=q.answer;
    }
    return out;
  }
  function validateChapter(c, id) {
    if (!c || !subjects.includes(c.subject)) throw new Error('课程学科须为语文、数学、奥数或英语。');
    if (!Array.isArray(c.questions) || c.questions.length<1 || c.questions.length>30) throw new Error('每个课程需要 1–30 道题。');
    const out={id:identifier(id || c.id),title:plain(c.title,100,'课程名称'),subject:c.subject,
      hero:plain(c.hero || '李白',30,'英雄'),region:plain(c.region || '我的教材',100,'地点'),
      story:plain(c.story || '带着课本知识，开始新的远征。',30000,'故事'),
      ending:plain(c.ending || '新的知识已收入行囊，继续前进吧。',6000,'结语'),
      knowledge:(Array.isArray(c.knowledge) && c.knowledge.length ? c.knowledge : ['理解题目，讲清思路。']).slice(0,20).map(x=>plain(x,2000,'知识要点'))};
    if (c.passage) out.passage=plain(c.passage,30000,'教材原文');
    for(const field of ['readingTitle','readingSource','semester'])if(c[field])out[field]=plain(c[field],2000,'阅读信息');
    if(c.sourceUrl){const url=new URL(plain(c.sourceUrl,2000,'原文链接'));if(url.protocol!=='https:')throw new Error('原文链接须使用 HTTPS。');out.sourceUrl=url.href;}
    if(Number.isInteger(c.lessonNumber)&&c.lessonNumber>0&&c.lessonNumber<=100)out.lessonNumber=c.lessonNumber;
    out.questions=c.questions.map((q,i)=>validateQuestion(q,id ? `${id}-q${i+1}` : undefined));
    if(new Set(out.questions.map(q=>q.id)).size!==out.questions.length)throw new Error('题目编号重复。');
    return out;
  }
  function isCorrect(q, answer) {
    return q.type === 'number' ? numeric(answer)!==null && Math.abs(numeric(answer)-numeric(q.answer)) < 1e-9 : answer === q.answer;
  }
  const answerText = q => q.type === 'number' ? q.answer : q.options[q.answer];
  const newState = () => ({version:1,earned:[],cleared:{},wrong:{},custom:[],texts:{},session:null,hero:null,sound:true,voiceVersion:2,volume:.45,activity:{}});
  function scoreSession(state, session, q, answer, day) {
    if(session.checked) return null;
    const correct=isCorrect(q,answer),fresh=correct && !state.earned.includes(q.id);
    if(state.activity.date!==day)state.activity={date:day,answered:0,completed:0,reviewed:0};
    state.activity.answered++;
    if(correct){if(fresh)state.earned.push(q.id);delete state.wrong[q.id];session.correct++;if(session.mode==='review')state.activity.reviewed++;}
    else state.wrong[q.id]={question:q,hero:session.hero,subject:session.subject,chapterTitle:session.title};
    session.checked=true;session.selection=answer;session.feedback=correct;session.gained+=fresh?10:0;
    return {correct,fresh};
  }
  function completeSession(state,s) {
    if(s.finished)return;
    s.finished=true;s.phase='result';
    s.passed=s.correct>=Math.ceil(s.questions.length*.6);
    s.stars=s.correct===s.questions.length?3:s.correct>=Math.ceil(s.questions.length*.8)?2:s.passed?1:0;
    if(s.mode==='story' && s.passed){const old=state.cleared[s.chapterId];state.cleared[s.chapterId]={stars:Math.max(s.stars,old?.stars||0),score:Math.max(s.correct,old?.score||0),total:s.questions.length};}
    if(s.passed)state.activity.completed=(state.activity.completed||0)+1;
  }
  function makePractice(subject,count=6,random=Math.random) {
    const int=(a,b)=>Math.floor(random()*(b-a+1))+a;
    const qs=[];
    for(let i=0;i<count;i++){
      let a,b,n,answer,prompt,hint,explanation,skill,id;
      const kind=i%6;
      if(subject==='数学') {
        a=int(12,85);b=int(2,9);
        if(kind===0){answer=a*b/10;prompt=`每本练习册 ${a/10} 元，买 ${b} 本共需多少元？（只填数字）`;hint='先按整数相乘，再确定小数点的位置。';explanation=`${a/10} × ${b} = ${answer}（元）。可先算 ${a} × ${b}，再把结果缩小到十分之一。`;skill='小数乘法';id=`g5-decimalmul-${a}-${b}`;}
        else if(kind===1){answer=a/10;prompt=`${b} 本同样的练习册共 ${a*b/10} 元，每本多少元？（只填数字）`;hint='总价除以数量，商的小数点和被除数对齐。';explanation=`${a*b/10} ÷ ${b} = ${answer}（元）。验算：${answer} × ${b} = ${a*b/10}。`;skill='小数除法';id=`g5-decimaldiv-${a}-${b}`;}
        else if(kind===2){n=int(3,18);answer=n;prompt=`解方程 ${b}x + ${a} = ${b*n+a}，x 等于多少？`;hint='等式两边先同时减去同一个数，再除以 x 的系数。';explanation=`两边减 ${a}，得 ${b}x = ${b*n}；再同时除以 ${b}，得 x = ${n}。`;skill='简易方程';id=`g5-equation-${a}-${b}-${n}`;}
        else if(kind===3){answer=a*b/10;prompt=`平行四边形花圃的底为 ${a/10} 米，对应的高为 ${b} 米。面积是多少平方米？`;hint='要用底乘它对应的高，不能用邻边代替高。';explanation=`平行四边形面积 = 底 × 高 = ${a/10} × ${b} = ${answer}（平方米）。`;skill='平行四边形面积';id=`g5-parallelogram-${a}-${b}`;}
        else if(kind===4){answer=a*b/20;prompt=`三角形旗面的底为 ${a/10} 分米，对应的高为 ${b} 分米。面积是多少平方分米？`;hint='两个完全一样的三角形能拼成一个平行四边形。';explanation=`三角形面积 = 底 × 高 ÷ 2 = ${a/10} × ${b} ÷ 2 = ${answer}（平方分米）。`;skill='三角形面积';id=`g5-triangle-${a}-${b}`;}
        else {a=int(3,12);n=int(2,8);answer=(a+a+b)*n/2;prompt=`梯形花圃上底 ${a} 米、下底 ${a+b} 米，高 ${n} 米。面积是多少平方米？`;hint='两条底边的和乘高，最后别忘了除以 2。';explanation=`梯形面积 =（${a} + ${a+b}）× ${n} ÷ 2 = ${answer}（平方米）。`;skill='梯形面积';id=`g5-trapezoid-${a}-${b}-${n}`;}
      } else {
        a=int(5,16);b=int(2,9);
        if(kind===0){answer=a+b;prompt=`两箱晶石共 ${2*a+b} 颗，甲箱比乙箱多 ${b} 颗。甲箱有多少颗？（只填数字）`;hint='先从总数中拿走多出的部分，再平均分。';explanation=`乙箱 =（${2*a+b} − ${b}）÷ 2 = ${a}（颗）；甲箱 = ${a} + ${b} = ${answer}（颗）。`;skill='和差问题';id=`sumdiff-${a}-${b}`;}
        else if(kind===1){answer=b;prompt=`机关园里有鸡和兔共 ${a+b} 只，共 ${2*a+4*b} 条腿。兔有多少只？（只填数字）`;hint='先假设全是鸡。每把一只鸡换成兔，多出 2 条腿。';explanation=`全是鸡时有 ${(a+b)*2} 条腿，实际多 ${2*b} 条。兔有 ${2*b} ÷ 2 = ${b}（只）。`;skill='鸡兔同笼';id=`rabbit-${a}-${b}`;}
        else if(kind===2){n=int(4,10);answer=n+1;prompt=`一条长 ${n*b} 米的直路，从一端开始每隔 ${b} 米种一棵树，两端都种。需要多少棵？（只填数字）`;hint='画一段路：1 个间隔的两端要种 2 棵树。';explanation=`间隔数 = ${n*b} ÷ ${b} = ${n}，两端都种时棵数 = 间隔数 + 1 = ${answer}（棵）。`;skill='植树问题';id=`trees-${n}-${b}`;}
        else if(kind===3){n=int(12,40);answer=(n-1)%3+1;prompt=`灯牌按 1、2、3、1、2、3……排列，第 ${n} 个灯牌上的数字是多少？`;hint='每 3 个一组，除以 3 看余数；余数为 0 时是每组第 3 个。';explanation=`${n} ÷ 3 的余数是 ${n%3}，所以第 ${n} 个是 ${answer}。余数为 0 对应数字 3。`;skill='周期规律';id=`cycle-${n}`;}
        else if(kind===4){n=int(4,10);answer=n*(n-1)/2;prompt=`${n} 位小伙伴，每两人互相击掌一次。一共击掌多少次？（只填数字）`;hint='每人和另外的人击掌；直接相乘会把同一次算两遍。';explanation=`${n} × ${n-1} ÷ 2 = ${answer}（次）。也可以数 ${Array.from({length:n-1},(_,j)=>j+1).join(' + ')}。`;skill='有序计数';id=`pairs-${n}`;}
        else {n=int(3,8);answer=n;prompt=`两辆机关车从相距 ${(a+b)*n} 千米的两地同时出发，相向而行，速度分别是每小时 ${a} 千米和 ${b} 千米。几小时后相遇？`;hint='两车每小时共同缩短的距离等于速度和。';explanation=`速度和 = ${a} + ${b} = ${a+b}（千米/时）；相遇时间 = ${(a+b)*n} ÷ ${a+b} = ${n}（时）。`;skill='相遇问题';id=`g5-meeting-${a}-${b}-${n}`;}
      }
      qs.push({id:`practice-${id}`,type:'number',prompt,answer:String(answer),hint,explanation,skill});
    }
    return qs;
  }
  function backup(state) {
    return {kind:'jixia-save',version:1,exportedAt:new Date().toISOString(),state:{...state,session:null}};
  }
  function restore(data) {
    if(!data || data.kind!=='jixia-save' || data.version!==1 || !data.state)throw new Error('这不是有效的稷下学习存档。');
    const src=data.state,s=newState();
    if(!Array.isArray(src.custom) || src.custom.length>50)throw new Error('自定义课程过多或格式错误。');
    s.custom=src.custom.map(c=>validateChapter(c));
    if(src.texts!==undefined){if(!src.texts||typeof src.texts!=='object'||Array.isArray(src.texts)||Object.keys(src.texts).length>100)throw new Error('课文原文存档格式错误。');for(const [id,text]of Object.entries(src.texts))s.texts[identifier(id)]=plain(text,30000,'本机课文原文');}
    if(s.custom.some(c=>!c.id.startsWith('custom-')))throw new Error('自建课程编号应以 custom- 开头。');
    if(new Set(s.custom.map(c=>c.id)).size!==s.custom.length)throw new Error('存档中课程编号重复。');
    if(!Array.isArray(src.earned) || src.earned.length>50000)throw new Error('星辉记录格式错误。');
    s.earned=[...new Set(src.earned.map(x=>plain(x,100,'答题记录')))];
    if(!src.cleared || typeof src.cleared!=='object' || Array.isArray(src.cleared))throw new Error('闯关记录格式错误。');
    for(const [key,value] of Object.entries(src.cleared)){
      if(['__proto__','constructor','prototype'].includes(key) || key.length>100)throw new Error('无效课程编号。');
      if(!value || !Number.isInteger(value.stars)||value.stars<0||value.stars>3 || !Number.isInteger(value.total)||value.total<1||value.total>30 || !Number.isInteger(value.score)||value.score<0||value.score>value.total)throw new Error('闯关成绩格式错误。');
      s.cleared[key]={stars:value.stars,total:value.total,score:value.score};
    }
    if(!src.wrong || typeof src.wrong!=='object' || Array.isArray(src.wrong) || Object.keys(src.wrong).length>5000)throw new Error('错题格式错误。');
    for(const entry of Object.values(src.wrong)){
      const q=validateQuestion(entry?.question);
      if(['__proto__','constructor','prototype'].includes(q.id))throw new Error('无效题目编号。');
      s.wrong[q.id]={question:q,hero:plain(entry.hero||'李白',30,'英雄'),subject:subjects.includes(entry.subject)?entry.subject:'数学',chapterTitle:plain(entry.chapterTitle||'复习',100,'课程')};
    }
    s.hero=typeof src.hero==='string'?src.hero.slice(0,30):null;
    s.sound=src.voiceVersion===2?src.sound===true:true;s.voiceVersion=2;s.volume=typeof src.volume==='number'&&Number.isFinite(src.volume)?Math.max(0,Math.min(1,src.volume)):.45;
    if(src.activity && /^\d{4}-\d{2}-\d{2}$/.test(src.activity.date) && ['answered','completed','reviewed'].every(k=>Number.isInteger(src.activity[k])&&src.activity[k]>=0))s.activity={date:src.activity.date,answered:src.activity.answered,completed:src.activity.completed,reviewed:src.activity.reviewed};
    return s;
  }
  const api={subjects,types,numeric,validateQuestion,validateChapter,isCorrect,answerText,newState,scoreSession,completeSession,makePractice,backup,restore};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  root.LearningEngine=api;
})(globalThis);
