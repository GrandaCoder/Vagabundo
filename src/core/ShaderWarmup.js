// Shader programs depend on layout and features, not material UUID, tint or texture identity.
const ignored=new Set(['id','uuid','name','version','userData','opacity','_listeners']);
const exactNumbers=new Set(['side','blending','blendSrc','blendDst','blendEquation','blendSrcAlpha','blendDstAlpha','blendEquationAlpha','depthFunc','stencilFunc','stencilFail','stencilZFail','stencilZPass']);
export function materialShaderKey(material){
  const values=[material.type,material.customProgramCacheKey?.()??'',material.clippingPlanes?.length??0];
  for(const key of Object.keys(material).sort()){
    if(ignored.has(key)||key.startsWith('_')||key.startsWith('is'))continue;
    const value=material[key];
    if(typeof value==='function')continue;
    if(value?.isTexture){values.push(key,[value.mapping,value.channel,value.colorSpace,value.format,value.type,value.magFilter,value.minFilter,value.wrapS,value.wrapT,value.wrapR,!!value.isCubeTexture,!!value.isDepthTexture,!!value.isData3DTexture].join(','));}
    else if(value?.isNode)values.push(key,value.getCacheKey());
    else if(value?.isColor)values.push(key,value.getHex()===0?'zero':'color');
    else if(typeof value==='number')values.push(key,exactNumbers.has(key)?value:Number(value!==0));
    else if(typeof value==='boolean'||typeof value==='string'||value===null)values.push(key,String(value));
  }
  return values.join('|');
}
export function collectShaderWarmupJobs(roots){
  const jobs=new Map();let objects=0;
  for(const root of roots)root.traverse(object=>{
    if(!object.material||!object.geometry||!object.visible)return;
    objects++;
    const materials=[object.material].flat(),geometry=object.geometry;
    const attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([key,a])=>`${key}:${a.itemSize}:${a.normalized}:${!!a.isInstancedBufferAttribute}:${a.array.constructor.name}`).join('|');
    const morphs=Object.entries(geometry.morphAttributes).map(([name,list])=>`${name}:${list.length}`).join('|');
    const key=materials.map(materialShaderKey).join(';')+attributes+`:${!!object.isSkinnedMesh}:${object.skeleton?.bones.length??0}:${!!object.isInstancedMesh}:${object.instanceMatrix?.isStorageInstancedBufferAttribute??false}:${!!object.receiveShadow}:${morphs}:${geometry.index?.array.constructor.name}`;
    if(!jobs.has(key))jobs.set(key,[]);
    if(!jobs.get(key).includes(object))jobs.get(key).push(object);
  });
  return {jobs:[...jobs.values()],objects};
}

/** Slop compiles every binding in a family, not only its first object. */
export async function withoutFrustumCulling(roots, run) {
  const saved=new Map();
  for(const root of roots)root.traverse(o=>{if(!saved.has(o)){saved.set(o,o.frustumCulled);o.frustumCulled=false;}});
  try{return await run();}finally{for(const [o,value] of saved)o.frustumCulled=value;}
}
export async function compileShaderJobs(jobs,compile,{concurrency=4,onProgress=()=>{},yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
  let next=0,done=0,failure;
  const worker=async()=>{while(!failure&&next<jobs.length){const object=jobs[next++];await yieldTask();if(failure)return;try{await compile(object);onProgress(++done,jobs.length);}catch(error){failure=error;}}};
  await Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},worker));
  if(failure)throw failure;
}
