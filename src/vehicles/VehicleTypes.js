export const VEHICLE_TYPES=Object.freeze({
 sedan:{length:4.3,width:1.76,height:1.75},
 taxi:{length:4.3,width:1.76,height:1.45},
 suv:{length:4.9,width:1.94,height:1.85},
 police:{length:4.3,width:1.76,height:1.75},
 pickup:{length:5.68,width:2.124,height:1.99},
 van:{length:5.96,width:2.024,height:2.64},
 minivan:{length:5.17,width:2,height:1.764},
 police_suv:{length:4.9,width:1.94,height:1.85},
 bus:{length:11.56,width:2.6,height:3.05}
});
export function trafficVariant(random=Math.random){const n=random();return n<.30?'taxi':n<.54?'sedan':n<.75?'suv':n<.83?'van':n<.89?'minivan':n<.93?'pickup':n<.96?'police':n<.98?'police_suv':'bus';}
