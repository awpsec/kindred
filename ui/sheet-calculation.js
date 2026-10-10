// Deliberately small spreadsheet formula language. No eval, network, or script
// execution. Kept self-contained so saved sheet previews use the same evaluator.
export function calculateSheet(rows){
 const cache=new Map(),visiting=new Set(),maxCells=10000;let work=0;
 const fail=code=>{throw Error(code);};
 const number=v=>{if(v===''||v==null)return 0;if(typeof v==='boolean')return Number(v);const n=Number(v);if(!Number.isFinite(n))fail('#VALUE!');return n;};
 const scalar=v=>Array.isArray(v)?fail('#VALUE!'):v;
 const ref=s=>{const m=/^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(s);if(!m)fail('#REF!');let col=0;for(const c of m[1].toUpperCase())col=col*26+c.charCodeAt(0)-64;const row=Number(m[2]);if(col>16384||row>1048576)fail('#REF!');return [row-1,col-1];};
 function parse(text){
  let at=0,count=0;
  const tokens=[];while(at<text.length){const m=/^(?:\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|"(?:[^"]|"")*"|\$?[A-Za-z_]+\$?\d*|<=|>=|<>|[+\-*/^%():,=<>])/.exec(text.slice(at));if(!m)fail('#ERROR!');at+=m[0].length;if(m[0].trim())tokens.push(m[0]);if(++count>2000)fail('#ERROR!');}
  let pos=0,depth=0;const peek=()=>tokens[pos],take=()=>tokens[pos++];
  function expr(min=0){if(++depth>100)fail('#ERROR!');let left,t=take();
   if(t==='+'||t==='-')left={op:'unary'+t,args:[expr(4)]};
   else if(t==='('){left=expr();if(take()!==')')fail('#ERROR!');}
   else if(t?.startsWith('"'))left={value:t.slice(1,-1).replace(/""/g,'"')};
   else if(t&&/^(?:\d|\.)/.test(t))left={value:Number(t)};
   else if(t&&/^[A-Za-z_$]/.test(t)){
    if(peek()==='('){take();const args=[];if(peek()!==')'){do{args.push(expr());if(peek()!==',')break;take();}while(true);}if(take()!==')')fail('#ERROR!');left={fn:t.toUpperCase(),args};}
    else if(/^(TRUE|FALSE)$/i.test(t))left={value:t.toUpperCase()==='TRUE'};
    else{ref(t);left={ref:t};if(peek()===':'){take();const end=take();ref(end||'');left={range:[t,end]};}}
   }else fail('#ERROR!');
   while(peek()){const op=peek(),power=({'=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'+':2,'-':2,'*':3,'/':3,'^':4,'%':5})[op];if(!power||power<min)break;take();left=op==='%'?{op,args:[left]}:{op,args:[left,expr(power+(op==='^'?0:1))]};}
   depth--;return left;
  }
  const node=expr();if(pos!==tokens.length)fail('#ERROR!');return node;
 }
 function evaluate(node){
  if(++work>300000)fail('#LIMIT!');
  if(Object.hasOwn(node,'value'))return node.value;
  if(node.ref)return cell(...ref(node.ref));
  if(node.range){const [a,b]=node.range.map(ref),top=Math.min(a[0],b[0]),bottom=Math.max(a[0],b[0]),left=Math.min(a[1],b[1]),right=Math.max(a[1],b[1]);if((bottom-top+1)*(right-left+1)>maxCells)fail('#REF!');const values=[];for(let i=top;i<=bottom;i++)for(let j=left;j<=right;j++){if(++work>300000)fail('#LIMIT!');values.push(cell(i,j));}return values;}
  if(node.fn){
   if(node.fn==='IF'){if(node.args.length<2||node.args.length>3)fail('#VALUE!');return evaluate(number(scalar(evaluate(node.args[0])))?node.args[1]:node.args[2]||{value:false});}
   const values=node.args.flatMap(arg=>{const v=evaluate(arg);return Object.hasOwn(arg,'value')&&typeof v==='string'&&v!==''&&Number.isFinite(Number(v))?[Number(v)]:Array.isArray(v)?v:[v];});
   if(node.fn==='COUNTA')return values.filter(v=>v!==''&&v!=null).length;
   const numbers=values.filter(v=>typeof v==='number'&&Number.isFinite(v));
   switch(node.fn){
    case 'SUM':return numbers.reduce((a,b)=>a+b,0);
    case 'AVERAGE':if(!numbers.length)fail('#DIV/0!');return numbers.reduce((a,b)=>a+b,0)/numbers.length;
    case 'MIN':return numbers.length?Math.min(...numbers):0;
    case 'MAX':return numbers.length?Math.max(...numbers):0;
    case 'COUNT':return numbers.length;
    case 'ABS':if(values.length!==1)fail('#VALUE!');return Math.abs(number(values[0]));
    case 'ROUND':{if(values.length!==2)fail('#VALUE!');const digits=Math.trunc(number(values[1]));if(Math.abs(digits)>15)fail('#NUM!');const scale=10**digits,n=number(values[0]);return Math.sign(n)*Math.round((Math.abs(n)+Number.EPSILON)*scale)/scale;}
    default:fail('#NAME?');
   }
  }
  const a=number(scalar(evaluate(node.args[0])));if(node.op==='unary-')return -a;if(node.op==='unary+')return a;if(node.op==='%')return a/100;
  const b=number(scalar(evaluate(node.args[1])));
  switch(node.op){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':if(!b)fail('#DIV/0!');return a/b;case '^':return a**b;case '=':return a===b;case '<>':return a!==b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;default:fail('#ERROR!');}
 }
 function cell(i,j){const key=i+':'+j;if(cache.has(key)){const v=cache.get(key);if(v instanceof Error)throw v;return v;}if(visiting.has(key))fail('#CYCLE!');if(visiting.size>200)fail('#REF!');
  const raw=String(rows[i]?.[j]??'');if(!raw.startsWith('=')){
   if(raw.startsWith("'"))return raw.slice(1);
   const numeric=raw!==''&&raw.trim()===raw&&!raw.startsWith('+')&&(raw.match(/\d/g)||[]).length<=15&&!/^-?0\d/.test(raw)&&/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)&&Number.isFinite(Number(raw));
   return numeric?Number(raw):raw;
  }
  visiting.add(key);try{const result=scalar(evaluate(parse(raw.slice(1))));if(typeof result==='number'&&!Number.isFinite(result))fail('#NUM!');cache.set(key,result);return result;}catch(e){cache.set(key,e);throw e;}finally{visiting.delete(key);}
 }
 return rows.map((row,i)=>row.map((_,j)=>{try{return cell(i,j);}catch(e){return e.message?.startsWith('#')?e.message:'#ERROR!';}}));
}
