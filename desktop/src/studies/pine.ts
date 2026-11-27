/** Bounded interpreter for GMT's indicator-only Pine subset. Source only becomes typed data. */
import type {Candle} from '../types';

export const maxSourceLength = 8192;
const maxBars = 8000;
type Scalar = number | string | boolean | null;
type ValueType = 'number' | 'color' | 'bool' | 'text' | 'missing';
type Token = {text:string; line:number; column:number};
type Node = {type:ValueType; op:string; args:number[]; constant?:Scalar; value?:Scalar};
type Plot = {name:string; value:number; color:number; width:1|2|3|4; hline:boolean};
type Fill = {left:number; right:number; color:number};
export type PineProgram = {version:4|5|6; title:string; overlay:boolean; nodes:Node[]; plots:Plot[]; fills:Fill[]};
type Argument = {key?:string; ref:number; at:Token};
type SymbolRef = {ref:number; handle?:boolean};

export class PineDiagnostic extends Error {
  constructor(readonly line:number, readonly column:number, message:string) {
    super(`Line ${line}, column ${column}: ${message}`);
  }
}

const colors = new Map(Object.entries({
  aqua:'#00bcd4', black:'#363a45', blue:'#2196f3', fuchsia:'#e040fb', gray:'#787b86',
  green:'#4caf50', lime:'#00e676', maroon:'#880e4f', navy:'#311b92', olive:'#808000',
  orange:'#ff9800', purple:'#9c27b0', red:'#f23645', silver:'#b2b5be', teal:'#089981',
  white:'#ffffff', yellow:'#fdd835',
}));
const sources = new Set(['open','high','low','close','volume','hl2','hlc3','ohlc4']);
const precedence = new Map(Object.entries({or:1,and:2,'==':3,'!=':3,'<':4,'<=':4,'>':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6}));
const arithmetic = new Set(['+','-','*','/','%']);
const moving = new Set(['sma','ema','wma','rsi']);
const tokenPattern = /\/\/[^\n]*|[ \t]+|\n|"[^"\\\n]*"|'[^'\\\n]*'|#[\da-fA-F]{6}(?:[\da-fA-F]{2})?\b|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*|==|!=|<=|>=|[()+*/%,?=:<>-]|./gy;
const alpha = (color:string, percent:number) => color.slice(0,7)+Math.round(255*(1-percent/100)).toString(16).padStart(2,'0');
const fail = (token:Token, message:string):never => {throw new PineDiagnostic(token.line,token.column,message);};

function tokenize(source:string) {
  if(source.length>maxSourceLength) throw new PineDiagnostic(1,1,`Use at most ${maxSourceLength} characters.`);
  const input=source.replaceAll('\r\n','\n').replaceAll('\r','\n');
  const directive=/^\s*\/\/@version\s*=\s*(\S+)[^\n]*/.exec(input);
  const version=Number(directive?.[1]??'6');
  if(version!==4&&version!==5&&version!==6) throw new PineDiagnostic(1,1,'Supported version declarations are 4, 5 and 6.');
  const tokens:Token[]=[];
  let line=1,column=1,parens=0;
  for(const match of input.matchAll(tokenPattern)) {
    const text=match[0], token={text,line,column};
    if(text==='\n'){line++;column=1;if(parens===0)tokens.push(token);continue;}
    column+=text.length;
    if(text.startsWith('//')||/^[ \t]/.test(text))continue;
    if(text==='(')parens++;
    if(text===')')parens--;
    tokens.push(token);
    if(parens>24||tokens.length>1200)fail(token,'Script exceeds the expression complexity limit.');
  }
  tokens.push({text:'',line,column});
  return {tokens,version:version as PineProgram['version']};
}

class Compiler {
  private index=0;
  private variables=new Map<string,SymbolRef>();
  private declared=false;
  private result:PineProgram;
  constructor(private tokens:Token[],version:PineProgram['version']){
    this.result={version,title:'',overlay:false,nodes:[],plots:[],fills:[]};
  }
  private peek(){return this.tokens[this.index];}
  private take(){return this.tokens[this.index++];}
  private accept(value:string){if(this.peek().text!==value)return false;this.take();return true;}
  private require(value:string){if(!this.accept(value))fail(this.peek(),`Expected ${value}.`);}
  private add(node:Node,at:Token){if(this.result.nodes.length>=112)fail(at,'Use at most 112 calculation nodes.');return this.result.nodes.push(node)-1;}
  private literal(type:ValueType,value:Scalar,at:Token){return this.add({type,op:'const',constant:value,args:[]},at);}
  private operation(type:ValueType,op:string,args:number[],at:Token){
    const values=args.map(ref=>this.get(ref).constant);
    if(values.every(value=>value!==undefined)){
      return this.literal(type,calculatePoint(op,values[0]??null,values[1]??null,values[2]??null),at);
    }
    return this.add({type,op,args},at);
  }
  private get(ref:number){return this.result.nodes[ref];}
  private checked(ref:number,type:ValueType,at:Token){
    if(this.get(ref).type!==type&&this.get(ref).type!=='missing')fail(at,`Expected ${type}.`);
    return ref;
  }
  private constant(ref:number,type:ValueType,at:Token){
    this.checked(ref,type,at);
    const value=this.get(ref).constant;
    if(value===undefined||value===null)fail(at,`Expected a constant ${type}.`);
    return value;
  }
  private unary():number {
    const at=this.take();
    const text=at.text;
    if(text==='-'||text==='+'||text==='not'){
      const type=text==='not'?'bool':'number';
      const v=this.checked(this.unary(),type,at);
      return this.operation(type,'unary'+text,[v],at);
    }
    if(text==='('){const ref=this.expression();this.require(')');return ref;}
    if(/^["']/.test(text)&&text.length>=2)return this.literal('text',text.slice(1,-1),at);
    if(/^#(?:[a-f\d]{6}|[a-f\d]{8})$/i.test(text))return this.literal('color',text,at);
    if(/^(?:\d|\.\d)/.test(text)&&Number.isFinite(Number(text)))return this.literal('number',Number(text),at);
    if(text==='na'&&this.peek().text!=='(')return this.literal('missing',null,at);
    if(text==='true'||text==='false')return this.literal('bool',text==='true',at);
    if(!/^[a-z_]\w*(?:\.[a-z_]\w*)*$/i.test(text))return fail(at,'Expected an expression.');
    if(this.peek().text==='(')return this.valueCall(at);
    const saved=this.variables.get(text);
    if(saved){if(saved.handle)fail(at,'A plot handle is only available to fill().');return saved.ref;}
    if(sources.has(text))return this.add({type:'number',op:'source',value:text,args:[]},at);
    if(this.result.version===4&&['input.integer','input.float','input.source'].includes(text))return this.literal('text',text,at);
    if(text.startsWith('color.')||(this.result.version===4&&colors.has(text))){
      const color=colors.get(text.replace(/^color\./,''));
      if(color)return this.literal('color',color,at);
    }
    return fail(at,`Unknown variable ${text}.`);
  }
  private expression(min=0):number {
    let left=this.unary();
    while(true){
      const at=this.peek(), priority=precedence.get(at.text);
      if(priority===undefined||priority<min)break;
      const op=this.take().text;
      const type=op==='and'||op==='or'?'bool':'number';
      const right=this.expression(priority+1);
      this.checked(left,type,at);this.checked(right,type,at);
      left=this.operation(arithmetic.has(op)?'number':'bool',op,[left,right],at);
    }
    if(min===0&&this.accept('?')){
      const at=this.tokens[this.index-1];
      this.checked(left,'bool',at);
      const yes=this.expression();
      this.require(':');
      const no=this.expression();
      const type=this.get(yes).type==='missing'?this.get(no).type:this.get(yes).type;
      this.checked(no,type,at);
      left=this.operation(type,'select',[left,yes,no],at);
    }
    return left;
  }
  private arguments(at:Token, names:string[], handles=0){
    this.require('(');
    const values=new Map<string,Argument>();
    let position=0, sawNamed=false;
    if(this.accept(')'))return values;
    do {
      const start=this.peek();
      const named=this.tokens[this.index+1]?.text==='=';
      const key=named?this.take().text:names[position++];
      if(named){this.require('=');sawNamed=true;}
      else if(sawNamed)fail(start,'Positional arguments must precede named arguments.');
      if(!key||!names.includes(key)||values.has(key))fail(start,`Unsupported or duplicate argument for ${at.text}().`);
      let ref;
      if(names.indexOf(key)<handles){
        const identifier=this.take(), symbol=this.variables.get(identifier.text);
        if(!symbol?.handle)fail(identifier,'Expected a named plot or hline handle.');
        ref=symbol!.ref;
      }else ref=this.expression();
      values.set(key,{ref,key,at:start});
    }while(this.accept(','));
    this.require(')');
    return values;
  }
  private required(args:Map<string,Argument>, name:string, at:Token){
    return args.get(name)?.ref ?? fail(at,`Missing ${name}.`);
  }
  private valueCall(at:Token){
    const v4=this.result.version===4;
    const original=at.text;
    const name=original.replace(/^ta\./,'');
    if(moving.has(name)&&(original.startsWith('ta.')||v4)){
      const args=this.arguments(at,['source','length']);
      const value=this.checked(this.required(args,'source',at),'number',at);
      const length=Number(this.constant(this.required(args,'length',at),'number',at));
      if(!Number.isInteger(length)||length<1||length>500)fail(at,'Length must be an integer from 1 to 500.');
      return this.add({type:'number',op:name,args:[value],value:length},at);
    }
    if(['input.int','input.float','input.source'].includes(original)||(v4&&original==='input')){
      const args=this.arguments(at,original==='input'?['defval','title','type','minval','maxval','step']:['defval','title','minval','maxval','step']);
      const value=this.checked(this.required(args,'defval',at),'number',at);
      const node=this.get(value);
      const legacyType=args.has('type')?this.constant(this.required(args,'type',at),'text',at):undefined;
      if(legacyType!==undefined&&!['input.integer','input.float','input.source'].includes(String(legacyType)))fail(at,'Unsupported v4 input type.');
      const source=original==='input.source'||legacyType==='input.source'||(original==='input'&&!legacyType&&node.op==='source');
      if(args.has('title'))this.constant(this.required(args,'title',at),'text',at);
      if(source){
        if(node.op!=='source'||args.has('minval')||args.has('maxval')||args.has('step'))fail(at,'Source inputs require an OHLCV source.');
        return value;
      }
      const number=Number(this.constant(value,'number',at));
      const bound=(key:string,fallback:number)=>args.has(key)?Number(this.constant(this.required(args,key,at),'number',at)):fallback;
      if(((original==='input.int'||legacyType==='input.integer')&&!Number.isInteger(number))||number<bound('minval',-Infinity)||number>bound('maxval',Infinity)||bound('step',1)<=0)fail(at,'Invalid input default or bounds.');
      return value;
    }
    if(original==='color.new'){
      const args=this.arguments(at,['color','transp']);
      const color=this.checked(this.required(args,'color',at),'color',at);
      const percent=Number(this.constant(this.required(args,'transp',at),'number',at));
      if(percent<0||percent>100)fail(at,'Transparency must be between 0 and 100.');
      return this.add({type:'color',op:'alpha',args:[color],value:percent},at);
    }
    if(original==='na'||original==='nz'){
      const args=this.arguments(at,original==='na'?['x']:['source','replacement']);
      const value=this.required(args,original==='na'?'x':'source',at);
      if(original==='na')return this.add({type:'bool',op:'missing',args:[value]},at);
      this.checked(value,'number',at);
      return this.add({type:'number',op:'replace',args:[value,this.checked(args.get('replacement')?.ref??this.literal('number',0,at),'number',at)]},at);
    }
    return fail(at,`Unsupported function ${original}().`);
  }
  private visual(at:Token){
    const name=at.text;
    if(name==='fill'){
      if(this.result.fills.length>=4)fail(at,'Use at most four fills.');
      const args=this.arguments(at,['plot1','plot2','color','title','transp'],2);
      const left=this.required(args,'plot1',at),right=this.required(args,'plot2',at);
      if(this.result.plots[left].hline!==this.result.plots[right].hline)fail(at,'Use two plots or two hlines for a fill.');
      if(args.has('title'))this.constant(this.required(args,'title',at),'text',at);
      this.result.fills.push({left,right,color:this.visualColor(args,at)});
      return;
    }
    if(this.result.plots.length>=8)fail(at,'Use at most eight plots and levels.');
    const level=name==='hline';
    const valueName=level?'price':'series';
    const args=this.arguments(at,[valueName,'title','color','linewidth','transp']);
    const value=this.checked(this.required(args,valueName,at),'number',at);
    if(level)this.constant(value,'number',at);
    const title=args.has('title')?String(this.constant(this.required(args,'title',at),'text',at)):name;
    const width=args.has('linewidth')?Number(this.constant(this.required(args,'linewidth',at),'number',at)):1;
    if(![1,2,3,4].includes(width))fail(at,'Line width must be 1, 2, 3 or 4.');
    return this.result.plots.push({name:title.slice(0,64),value,color:this.visualColor(args,at),width:width as Plot['width'],hline:level})-1;
  }
  private visualColor(args:Map<string,Argument>,at:Token){
    let color=this.checked(args.get('color')?.ref??this.literal('color','#7f9feb',at),'color',at);
    if(args.has('transp')){
      if(this.result.version!==4)fail(at,'Use color.new() for transparency with this version.');
      const value=Number(this.constant(this.required(args,'transp',at),'number',at));
      if(value<0||value>100)fail(at,'Transparency must be between 0 and 100.');
      color=this.add({type:'color',op:'alpha',args:[color],value},at);
    }
    return color;
  }
  compile(){
    while(this.peek().text){
      if(this.accept('\n'))continue;
      const at=this.peek();
      if(!this.declared){
        const allowed=at.text==='indicator'||(at.text==='study'&&this.result.version===4);
        if(!allowed)fail(at,'Start with indicator() or the supported v4 study() declaration.');
        this.take();
        const args=this.arguments(at,['title','shorttitle','overlay']);
        this.result.title=String(this.constant(this.required(args,'title',at),'text',at)).trim().slice(0,64);
        if(!this.result.title)fail(at,'Enter an indicator title.');
        if(args.has('shorttitle'))this.constant(this.required(args,'shorttitle',at),'text',at);
        if(args.has('overlay'))this.result.overlay=Boolean(this.constant(this.required(args,'overlay',at),'bool',at));
        this.declared=true;
      }else{
        let type:ValueType|undefined;
        const types=new Map<string,ValueType>([['float','number'],['int','number'],['bool','bool'],['color','color']]);
        if(types.has(this.peek().text)&&/^[a-z_]\w*$/i.test(this.tokens[this.index+1]?.text??''))type=types.get(this.take().text);
        const name=this.peek();
        let target:Token|undefined;
        if(this.tokens[this.index+1]?.text==='='){
          if(!/^[a-z_]\w*$/i.test(name.text)||sources.has(name.text)||this.variables.has(name.text)||['na','true','false'].includes(name.text))fail(name,'Use a unique variable name.');
          target=this.take();this.take();
        }else if(type)fail(name,'Expected a variable assignment.');
        const expression=this.peek();
        if(['plot','hline','fill'].includes(expression.text)){
          const handle=this.visual(this.take());
          if(target){
            if(handle===undefined||type)fail(target,'Invalid visual assignment.');
            this.variables.set(target.text,{ref:handle!,handle:true});
          }
        }else if(target){
          const ref=this.expression();
          if(type)this.checked(ref,type,target);
          this.variables.set(target.text,{ref});
        }else fail(expression,`Unsupported statement ${expression.text}.`);
      }
      if(this.peek().text&&this.peek().text!=='\n')fail(this.peek(),'Expected the end of the statement.');
    }
    if(!this.result.plots.length)fail(this.peek(),'Add at least one plot() or hline().');
    return this.result;
  }
}

export function compilePine(source:string):PineProgram {
  const {tokens,version}=tokenize(source);
  return new Compiler(tokens,version).compile();
}

function numeric(value:Scalar){return typeof value==='number'&&Number.isFinite(value)?value:null;}
const finite=(value:number)=>Number.isFinite(value)?value:null;

function movingAverage(op:string, source:Scalar[], length:number):Scalar[] {
  const buffer=Array<number>(length);
  let sum=0, weighted=0, count=0, cursor=0, previous:number|null=null;
  let avg:number|null=null, gain=0, loss=0;
  const alpha=2/(length+1);
  return source.map(value=>{
    const x=numeric(value);
    if(x===null)return null;
    if(op==='ema'){avg=avg===null?x:avg+alpha*(x-avg);return finite(avg);}
    if(op==='rsi'){
      if(previous===null){previous=x;return null;}
      const delta=x-previous;previous=x;
      const up=Math.max(0,delta),down=Math.max(0,-delta);
      if(count<length){gain+=up/length;loss+=down/length;count++;}
      else {gain+=(up-gain)/length;loss+=(down-loss)/length;}
      return count<length?null:loss===0?100:gain===0?0:100-100/(1+gain/loss);
    }
    if(count<length){count++;sum+=x;weighted+=count*x;}
    else {weighted+=length*x-sum;sum+=x-buffer[cursor];}
    buffer[cursor]=x;cursor=(cursor+1)%length;
    return count<length?null:finite(op==='wma'?weighted/(length*(length+1)/2):sum/length);
  });
}

function calculatePoint(op:string, a:Scalar, b:Scalar, c:Scalar, parameter?:Scalar):Scalar {
  if(op==='select')return a===true?b:c;
  if(op==='missing')return a===null;
  if(op==='replace')return a??b;
  if(op==='alpha')return typeof a==='string'?alpha(a,Number(parameter)):null;
  if(op==='unarynot')return a!==true;
  if(op==='and')return a===true&&b===true;
  if(op==='or')return a===true||b===true;
  const left=numeric(a),right=numeric(b);
  if(left===null)return null;
  if(op==='unary-'||op==='unary+')return op==='unary-'?-left:left;
  if(right===null)return null;
  switch(op){
    case '+':return finite(left+right);
    case '-':return finite(left-right);
    case '*':return finite(left*right);
    case '/':return finite(left/right);
    case '%':return finite(left%right);
    case '==':return left===right;
    case '!=':return left!==right;
    case '<':return left<right;
    case '<=':return left<=right;
    case '>':return left>right;
    case '>=':return left>=right;
    default:return null;
  }
}

export function runPine(program:PineProgram, history:readonly Candle[]){
  const rows=history.length>maxBars?history.slice(-maxBars):history;
  const values:Scalar[][]=[];
  for(const node of program.nodes){
    const [a,b,c]=node.args.map(ref=>values[ref]);
    if(node.op==='const')values.push(Array<Scalar>(rows.length).fill(node.constant??null));
    else if(node.op==='source')values.push(rows.map(row=>{
      if(node.value==='hl2')return (row.high+row.low)/2;
      if(node.value==='hlc3')return (row.high+row.low+row.close)/3;
      if(node.value==='ohlc4')return (row.open+row.high+row.low+row.close)/4;
      return numeric(row[node.value as 'open'|'high'|'low'|'close'|'volume']??null);
    }));
    else if(moving.has(node.op))values.push(movingAverage(node.op,a,Number(node.value)));
    else values.push(a.map((point,i)=>calculatePoint(node.op,point,b?.[i]??null,c?.[i]??null,node.value)));
  }
  return {
    plots:program.plots.map(plot=>({...plot,points:rows.map((row,i)=>({
      time:row.time,value:numeric(values[plot.value][i]),color:values[plot.color][i] as string|null,
    }))})),
    fills:program.fills.map(fill=>({...fill,colors:values[fill.color] as (string|null)[]})),
  };
}
