export const VEHICLE_TYPES=Object.freeze({
 sedan:{length:4.3,width:1.76,height:1.75},
 taxi:{length:4.3,width:1.76,height:1.45},
 suv:{length:4.9,width:1.94,height:1.85},
 police:{length:4.3,width:1.76,height:1.75},
 bus:{length:11.56,width:2.6,height:3.05}
});
export function trafficVariant(random=Math.random){const n=random();return n<.30?'taxi':n<.75?'sedan':n<.91?'suv':n<.97?'police':'bus';}
