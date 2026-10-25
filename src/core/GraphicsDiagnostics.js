/** CPU submission timings, not GPU timings. Bounded and opt-in console output. */
export class GraphicsDiagnostics {
  constructor(){this.events=[];this.programs=0;this.pipelines=0;this.maxRenderMs=0;}
  record(name,ms,details={}){this.events.push({name,ms:Math.round(ms*100)/100,...details});if(this.events.length>128)this.events.shift();}
  attach(backend){
    this.restore=[];
    for(const [method,counter] of [['createProgram','programs'],['createRenderPipeline','pipelines']]){
      if(typeof backend[method]!=='function')continue;
      const original=backend[method],stats=this;
      backend[method]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{stats[counter]++;const ms=performance.now()-start;if(ms>25)stats.record(method,ms);}};
      this.restore.push(()=>backend[method]=original);
    }
  }
  dispose(){for(const restore of this.restore??[])restore();}
}
