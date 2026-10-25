import test from 'node:test';
import assert from 'node:assert/strict';
import {GraphicsDiagnostics} from '../src/core/GraphicsDiagnostics.js';
test('diagnostico conserva argumentos y resultados, limita eventos y restaura el backend',()=>{
 const backend={createProgram(x){return x+1;},createRenderPipeline(x){return x*2;}},original=backend.createProgram,d=new GraphicsDiagnostics();d.attach(backend);
 assert.equal(backend.createProgram(2),3);assert.equal(backend.createRenderPipeline(3),6);assert.equal(d.programs,1);assert.equal(d.pipelines,1);
 for(let i=0;i<1000;i++)d.record('test',i);assert.equal(d.events.length,128);d.dispose();assert.equal(backend.createProgram,original);
});
