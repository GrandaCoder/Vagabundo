import { createImportedModel,disposeImportedInstance } from '../utils/ImportedModels.js';

export async function createVehicleVisual(mode,options) {
  if(['suv','police','bus'].includes(options.variant))mode='slop';
  if(mode==='slop') {
    const {createSlopVehicle}=await import('./SlopVehicle.js');
    return createSlopVehicle(options);
  }
  if(mode!=='actual')throw new Error('Representación de vehículo no válida');
  const group=await createImportedModel(options.variant==='taxi'?'car2':'car1');
  return {group,wheels:[],tailMat:null,dispose(){disposeImportedInstance(group);}};
}
