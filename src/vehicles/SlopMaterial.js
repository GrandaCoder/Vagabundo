// Adapted from Slop New York 1b54e165 (MIT); see THIRD_PARTY_NOTICES.md.
import * as THREE from 'three/webgpu';
import {cityUniforms} from '../graphics/GraphicsState.js';
import {carLayout,CAR_PARTS,BUS_SPEC} from './SlopGeometry.js';
import {
  Fn,
  float,
  vec2,
  color,
  attribute,
  sin,
  cos,
  vec3,
  abs,
  fract,
  floor,
  min,
  max,
  clamp,
  mix,
  step,
  smoothstep,
  length,
  fwidth,
  uniform,
  texture,
  time,
  instanceIndex
} from 'three/tsl';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const roundedRect = Fn(([point, halfSize, radiusNode]) => {
  const pt = vec2(point).toVar();
  const hs = vec2(halfSize).toVar();
  const rad = float(radiusNode).toVar();
  const q = abs(pt).sub(hs).add(rad).toVar();
  const dist = length(max(q, vec2(0.0))).add(min(max(q.x, q.y), 0.0)).sub(rad).toVar();
  const edge = max(fwidth(dist), 0.001).toVar();
  return smoothstep(edge, edge.negate(), dist);
});

// IQ polynomial smooth maximum: rounds the corners of max()-combined half-plane distances
const smax = (a, b, k) => {
  const h = max(float(k).sub(abs(a.sub(b))), 0.0).div(k);
  return max(a, b).add(h.mul(h).mul(k * 0.25));
};

// Signed distance (approximate outside, exact inside) to a convex polygon given as outward half-planes [nx, ny, c]
const polygonDistance = (px, py, planes, k) => {
  let d = null;
  for (const [nx, ny, c] of planes) {
    const e = px.mul(nx).add(py.mul(ny)).sub(c);
    d = d === null ? e : smax(d, e, k);
  }
  return d;
};

// Outward half-planes of a counter-clockwise polygon, each edge moved in by its margin
function polygonPlanes(points, margins) {
  const planes = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const len = Math.hypot(bx - ax, by - ay);
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    planes.push([nx, ny, ax * nx + ay * ny - margins[i]]);
  }
  return planes;
}

const coverage = (d) => {
  const w = max(fwidth(d), 0.0008);
  return smoothstep(w, w.negate(), d);
};


let _carPlateTexture;
let taxiLabel;
const localLabels=new Map();
function localLabel(text){
 if(localLabels.has(text))return localLabels.get(text);
 if(typeof document==='undefined')return new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
 const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#edf1e9';ctx.fillRect(0,0,256,64);ctx.fillStyle='#20502c';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,43);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;localLabels.set(text,t);return t;
}
function taxiTexture(){
  if(taxiLabel)return taxiLabel;
  if(typeof document==='undefined')return taxiLabel=new THREE.DataTexture(new Uint8Array([255,240,190,255]),1,1);
  const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#fff0b8';ctx.fillRect(0,0,256,64);ctx.fillStyle='#151719';ctx.font='900 52px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('TAXI',128,34);
  taxiLabel=new THREE.CanvasTexture(c);taxiLabel.colorSpace=THREE.SRGBColorSpace;return taxiLabel;
}


// One small generated atlas serves every rear plate, with mipmaps for distant traffic.
function carPlateTexture() {
  if (_carPlateTexture) return _carPlateTexture;
  if(typeof document==='undefined')return _carPlateTexture??=new THREE.DataTexture(new Uint8Array([240,180,24,255]),1,1);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2b718';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#17212c';
  ctx.font = 'bold 25px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['BOG 123', 'BTA 319', 'DCB 506', 'COL 842'].forEach((label, row) => ctx.fillText(label, 64, row * 64 + 33));
  _carPlateTexture = new THREE.CanvasTexture(canvas);
  _carPlateTexture.colorSpace = THREE.SRGBColorSpace;
  return _carPlateTexture;
}

/**
 * Creates the TSL material for lofted vehicles.
 * Instanced traffic reads the per-instance `paintColor` (vec3) and `carState` (vec4: brake, left (+x) & right (-x)
 * turn signal, livery: 1 = NYPD) attributes; with a fixed `fixedColorHex` (the player's taxi, wheels) the state is the
 * `material.userData.carState` uniform instead.
 * Every mask is built once and shared by the colour, roughness, metalness & emissive graphs (TSL turns nodes used
 * more than once into temporaries), so the fragment shader evaluates each SDF a single time.
 */
export function createSlopMaterial(spec, fixedColorHex = null) {
  if(spec.name==='bus')return createUrbanBusMaterial(fixedColorHex);


  const night=fixedColorHex!==null?uniform(0):attribute('carNight','float');
  const wheelAngle=fixedColorHex!==null?uniform(0):attribute('wheelAngle','float');
  const L = carLayout(spec);
  const cab = spec.cabin;
  const fixed = fixedColorHex !== null;
  const stateUniform = fixed ? uniform(new THREE.Vector4(0, 0, 0, 0)) : null;
  const state = fixed ? stateUniform : attribute('carState', 'vec4');
  const paint = fixed ? uniform(new THREE.Color(fixedColorHex)) : attribute('paintColor', 'vec3');

  const axleZ = float(spec.wheelZ);
  const wheelR = float(spec.wheelRadius);
  const archR = L.archR;

  // Glass outlines from the glasshouse layout: side windows in side view (z, y), windshield & backlight from above
  // (|x|, z). Each edge is pulled in by its pillar / frame width; the seal outline sits a little further out.
  const bc = L.belt.cowl;
  const bd = L.belt.deck;
  const rf = L.rail.front;
  const rm = L.rail.mid;
  const rr = L.rail.rear;
  const sidePoly = [[cab.cowl, bc.y], [cab.roofFront, rf.y], [L.rail.roofMid, rm.y], [cab.roofRear, rr.y], [cab.deck, bd.y]];
  const sideGlassPlanes = polygonPlanes(sidePoly, [0.05, 0.03, 0.03, 0.065, 0.02]);
  const sideSealPlanes = polygonPlanes(sidePoly, [0.034, 0.016, 0.016, 0.05, 0.004]);
  const frontPoly = [[-1, cab.cowl], [-1, cab.roofFront], [rf.x, cab.roofFront], [bc.x, cab.cowl]];
  const frontGlassPlanes = polygonPlanes(frontPoly, [0, 0.045, 0.06, 0.05]);
  const frontSealPlanes = polygonPlanes(frontPoly, [0, 0.03, 0.045, 0.035]);
  const rearPoly = [[-1, cab.roofRear], [-1, cab.deck], [bd.x, cab.deck], [rr.x, cab.roofRear]];
  const rearGlassPlanes = polygonPlanes(rearPoly, [0, 0.045, 0.065, 0.05]);
  const rearSealPlanes = polygonPlanes(rearPoly, [0, 0.03, 0.05, 0.035]);
  const [hlX, hlY, hlW, hlH] = spec.headlight;
  const [tlX, tlY, tlW, tlH] = spec.taillight;
  const [grY, grW, grH] = spec.grille;
  const [inY, inW, inH] = spec.intake;
  const [plateF, plateR] = spec.plates;
  const frontZone = spec.zFront - 0.55;
  const rearZone = spec.zRear + 0.55;
  const sillY = spec.sill[1][1];
  const rearSill = spec.tail.sill[1];
  const signCab=L.cabin(cab.roofFront+(cab.roofRear-cab.roofFront)*.45);
  const signY=signCab.railY+signCab.h+.105;
  const one = float(1.0);

  const p = attribute('position', 'vec3');
  const n = attribute('normal', 'vec3');
  const partId = attribute('partId', 'float');
  const isPart = (id) => step(abs(partId.sub(id)), 0.25);
  const isBody = isPart(CAR_PARTS.BODY);
  const isWindow = isPart(CAR_PARTS.WINDOW);
  const isTyre = isPart(CAR_PARTS.TYRE);
  const isAlloy = isPart(CAR_PARTS.ALLOY);
  const isTrim = isPart(CAR_PARTS.TRIM);
  const isMirror = isPart(CAR_PARTS.MIRROR);
  const isSign = isPart(CAR_PARTS.SIGN);
  const ax = abs(p.x);
  const isSide = smoothstep(0.45, 0.7, abs(n.x));
  const front = smoothstep(0.12, 0.38, n.z).mul(step(frontZone, p.z)).mul(isBody);
  const rear = smoothstep(0.12, 0.38, n.z.negate()).mul(step(p.z, rearZone)).mul(isBody);
  const under = smoothstep(-0.25, -0.55, n.y).mul(isBody);
  const belt = mix(float(bd.y), float(bc.y), clamp(p.z.sub(cab.deck).div(cab.cowl - cab.deck), 0.0, 1.0));

  // Glasshouse: side windows (minus the B / C pillars), windshield & backlight, their black seals, chrome sill strip
  let sideG = polygonDistance(p.z, p.y, sideGlassPlanes, 0.07);
  for (const zp of cab.pillars) sideG = max(sideG, float(0.036).sub(abs(p.z.sub(zp))));
  const backlight = coverage(polygonDistance(ax, p.z, rearGlassPlanes, 0.09)).mul(isWindow);
  const glass = max(max(coverage(sideG), coverage(polygonDistance(ax, p.z, frontGlassPlanes, 0.09))), backlight.div(max(isWindow, 1e-4)))
    .mul(isWindow);
  const seal = max(
    coverage(polygonDistance(p.z, p.y, sideSealPlanes, 0.07)),
    max(coverage(polygonDistance(ax, p.z, frontSealPlanes, 0.09)), coverage(polygonDistance(ax, p.z, rearSealPlanes, 0.09)))
  ).mul(isWindow);
  const chromeBelt = spec.chrome
    ? smoothstep(0.003, 0.006, p.y.sub(belt))
      .mul(smoothstep(0.016, 0.012, p.y.sub(belt)))
      .mul(smoothstep(0.5, 0.7, abs(n.x)))
      .mul(step(cab.deck + 0.05, p.z))
      .mul(step(p.z, cab.cowl - 0.08))
      .mul(isWindow)
    : float(0.0);
  const chmsl = roundedRect(vec2(p.x, p.z.sub(cab.roofRear - 0.075)), vec2(0.14, 0.012), 0.005).mul(backlight).mul(step(n.z, -0.1));
  const rearWiper = spec.rearWiper
    ? roundedRect(vec2(p.x.add(0.15), p.z.sub(cab.deck + 0.075)), vec2(0.22, 0.006), 0.003).mul(backlight)
    : float(0.0);

  // Wheel arches: distance from the nearest axle in side view (or from the hub of a centred, spinning wheel)
  const isCenteredWheel = step(abs(p.z), wheelR.add(0.05)).mul(max(isTyre, isAlloy));
  const rawWheel = mix(vec2(abs(p.z).sub(axleZ), p.y.sub(wheelR)), vec2(p.z, p.y), isCenteredWheel);
  const wheelVec=vec2(rawWheel.x.mul(cos(wheelAngle)).sub(rawWheel.y.mul(sin(wheelAngle))),rawWheel.x.mul(sin(wheelAngle)).add(rawWheel.y.mul(cos(wheelAngle))));
  const wheelDist = length(wheelVec);

  // Lamps, grilles & plates on the nose and tail (projected along z, so the lamps wrap around the corners)
  const hlUV = vec2(ax.sub(hlX), p.y.sub(hlY));
  const headlight = roundedRect(hlUV, vec2(hlW, hlH), 0.01).mul(smoothstep(0.02, 0.25, n.z)).mul(step(frontZone, p.z)).mul(isBody);
  const turnFront = smoothstep(hlX + hlW * 0.65, hlX + hlW * 0.72, ax).mul(headlight);
  const divider = smoothstep(max(fwidth(ax), 0.007), 0.002, abs(hlUV.x.add(hlW * 0.1)));
  const headlightLens = roundedRect(hlUV, vec2(hlW - 0.012, hlH - 0.012), 0.006)
    .mul(headlight).mul(one.sub(max(divider, turnFront)));
  const drlDist = abs(hlUV.y.add(hlH * 0.6));
  const drlEdge = max(fwidth(drlDist), 0.006);
  const drl = smoothstep(drlEdge, 0.0, drlDist).mul(headlight).mul(one.sub(turnFront));
  const grille = roundedRect(vec2(p.x, p.y.sub(grY)), vec2(grW, grH), 0.015).mul(front);
  const intake = roundedRect(vec2(p.x, p.y.sub(inY)), vec2(inW, inH), 0.04).mul(front);
  const plateFront = roundedRect(vec2(p.x, p.y.sub(plateF)), vec2(0.155, 0.055), 0.008).mul(front);
  const tlUV = vec2(ax.sub(tlX), p.y.sub(tlY));
  const taillight = roundedRect(tlUV, vec2(tlW, tlH), 0.022)
    .mul(smoothstep(0.02, 0.25, n.z.negate()))
    .mul(step(p.z, rearZone))
    .mul(isBody);
  // Sedans use horizontal lenses; taller SUV lamps stack their three sections vertically.
  const tailAxis = tlH > tlW ? tlUV.y.div(tlH) : tlUV.x.div(tlW);
  const tailDivider = coverage(min(abs(tailAxis.sub(0.52)), abs(tailAxis.add(0.55))).sub(0.025));
  const tailLens = roundedRect(tlUV, vec2(tlW - 0.006, tlH - 0.006), 0.017)
    .mul(taillight).mul(one.sub(tailDivider));
  const turnRearSection = smoothstep(0.50, 0.54, tailAxis);
  const reverseRearSection = smoothstep(-0.53, -0.57, tailAxis);
  const turnRear = turnRearSection.mul(tailLens);
  const redLens = tailLens.mul(one.sub(max(turnRearSection, reverseRearSection)));
  const plateRear = roundedRect(vec2(p.x, p.y.sub(plateR)), vec2(0.155, 0.06), 0.008).mul(rear);
  const platePocket = roundedRect(vec2(p.x, p.y.sub(plateR + 0.01)), vec2(0.235, 0.105), 0.03).mul(rear);
  const trunkHandle = roundedRect(vec2(p.x, p.y.sub(plateR + 0.125)), vec2(0.18, 0.012), 0.008).mul(rear);
  const plateRecess = max(
    roundedRect(vec2(p.x, p.y.sub(plateF)), vec2(0.175, 0.072), 0.012).mul(front),
    roundedRect(vec2(p.x, p.y.sub(plateR)), vec2(0.185, 0.082), 0.02).mul(rear)
  );
  const rearValance = smoothstep(rearSill + 0.07, rearSill + 0.015, p.y).mul(rear);
  const reflector = roundedRect(vec2(ax.sub(0.64), p.y.sub(spec.bumpers[1][0] + 0.065)), vec2(0.065, 0.012), 0.006).mul(rear);
  const trunkWidth = mix(float(tlX - tlW - 0.025), float(tlX), smoothstep(tlY - tlH, spec.tail.edge[1], p.y));
  const trunkEdge = max(ax.sub(trunkWidth), float(spec.bumperLine[1]).sub(p.y));
  const panelSeam = max(
    smoothstep(0.006, 0.0025, abs(p.y.sub(spec.bumperLine[0]))).mul(step(ax, hlX - hlW * 0.6)).mul(front),
    coverage(abs(trunkEdge).sub(0.003)).mul(rear)
  );
  const cowlPanel = smoothstep(cab.cowl + 0.085, cab.cowl + 0.07, p.z)
    .mul(smoothstep(cab.cowl - 0.04, cab.cowl - 0.02, p.z))
    .mul(step(0.6, n.y))
    .mul(isBody);
  const signFace = smoothstep(0.55, 0.75, abs(n.z)).mul(isSign);
  const signGlyph = step(0.42, sin(p.x.mul(90.0))).mul(step(ax, 0.17)).mul(smoothstep(0.045, 0.04, abs(p.y.sub(signY))));
  const mirrorGlass = isMirror.mul(step(0.55, n.z.negate()));
  const lamp = max(headlight, taillight);
  const plates = max(plateFront, plateRear);
  const cladding =
    spec.cladding > 0
      ? max(smoothstep(spec.cladding + 0.01, spec.cladding - 0.01, p.y), smoothstep(archR + 0.075, archR + 0.06, wheelDist))
        .mul(isBody)
        .mul(one.sub(lamp))
        .mul(one.sub(plates))
      : float(0.0);

  // 5-spoke alloys (branchless 5-ray star SDF) with rim ring & hub, lug ribs on the tyre tread
  const wDir = wheelVec.div(max(wheelDist, 0.0001));
  let spokes = float(0.0);
  for (let k = 0; k < 5; k++) {
    const ang = (k * Math.PI * 2) / 5;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    const alongSpoke = wDir.x.mul(cs).add(wDir.y.mul(sn));
    const perp = abs(wDir.x.mul(sn).sub(wDir.y.mul(cs))).mul(wheelDist);
    spokes = max(spokes, smoothstep(0.034, 0.018, perp).mul(step(0.0, alongSpoke)));
  }
  const rimRing = smoothstep(wheelR.mul(0.56), wheelR.mul(0.6), wheelDist);
  const centerHub = smoothstep(0.068, 0.042, wheelDist);
  const centerCap = smoothstep(0.03, 0.018, wheelDist);
  const valveDot = smoothstep(0.028, 0.014, length(wheelVec.sub(vec2(0.0, wheelR.mul(-0.48)))));
  const alloyMetal = clamp(max(max(spokes, valveDot), max(rimRing, centerHub)).sub(centerCap.mul(0.85)), 0.0, 1.0);

  // Black plastic & rubber (grilles, seals, trims, tyres, cladding) is matte; lamps, glass & chrome are glossy
  const matte = max(
    max(max(isTyre, isTrim), max(intake, grille)),
    max(max(rearValance, under), max(max(cowlPanel, cladding), max(rearWiper, seal.mul(one.sub(max(glass, chromeBelt))))))
  );

  // ---- Colour ---------------------------------------------------------------------------------------------------
  // Liveries: NYPD (white with blue & light-blue side stripes, lettering on the front doors); the taxi's door badges
  // and medallion number
  const policeBand=smoothstep(.60,.64,p.y).mul(float(1).sub(smoothstep(.90,.94,p.y))).mul(step(.5,abs(n.x)));
  const painted=spec.name==='police'?mix(paint,color(0x4d8038),policeBand):paint;
  // Panel shading: soft occlusion low down & under the arch lips; unpainted cladding (SUVs); door shut lines &
  // handles; trunk / hood shut lines; black cowl panel under the windshield
  const archLip = smoothstep(archR + 0.05, archR - 0.005, wheelDist).mul(smoothstep(0.6, 0.9, ax));
  const ao = smoothstep(0.2, 0.62, p.y).mul(0.22).add(0.78).mul(one.sub(archLip.mul(0.55)));
  const onDoors = isSide.mul(smoothstep(sillY + 0.04, sillY + 0.07, p.y)).mul(smoothstep(0.0, -0.015, p.y.sub(belt)));
  let seams = float(0.0);
  for (const zd of spec.doors) seams = max(seams, smoothstep(0.009, 0.003, abs(p.z.sub(zd))));
  for (const zh of spec.handles) {
    seams = max(seams, roundedRect(vec2(p.z.sub(zh), p.y.sub(belt.sub(0.095))), vec2(0.06, 0.011), 0.008));
  }
  let body = mix(painted.mul(ao), color(0x1e2124), cladding);
  if(spec.name==='police'){
    const mask=step(.5,abs(n.x)).mul(step(.65,p.y)).mul(step(p.y,.90)).mul(step(abs(p.z),.6));
    body=mix(body,texture(localLabel('POLICÍA'),vec2(p.z.mul(n.x.sign()).div(1.2).add(.5),p.y.sub(.65).div(.25))).rgb,mask);
  }
  body = body.mul(one.sub(seams.mul(onDoors).mul(0.55))).mul(one.sub(panelSeam.mul(0.5)));
  body = mix(body, color(0x15181b), cowlPanel);

  // Nose: slatted grilles and broad divided reflectors inside squared lamp housings, with outer amber indicators.
  const slats = step(0.5, fract(p.y.mul(42.0))).mul(0.4).add(0.6);
  body = mix(body, color(0x111417).mul(slats), max(intake, grille));
  const lensShade = smoothstep(0.0, hlH, abs(hlUV.y)).mul(0.35).add(0.65);
  const lampColor = mix(mix(color(0x30383e), color(0xc2ccd2).mul(lensShade), headlightLens), color(0xe4e9eb), drl);
  body = mix(body, mix(lampColor, color(0xc5802b), turnFront), headlight);
  // Tail: thin rubber seals around divided red, amber and clear lenses.
  const tailShade = smoothstep(0.0, tlH, abs(tlUV.y)).mul(-0.3).add(1.0);
  const tailColor = mix(mix(color(0xae1821).mul(tailShade), color(0xc56b18), turnRearSection), color(0xbac4c9), reverseRearSection);
  body = mix(body, color(0x15181b), rearValance);
  body = mix(body, color(0x7a0a10), reflector);
  body = mix(body, color(0x222326), taillight);
  body = mix(body, tailColor, tailLens);
  // Shaded recess and handle sit in the painted trunk / hatch, above the bumper.
  const pocketShade = smoothstep(plateR - 0.09, plateR + 0.115, p.y).mul(-0.25).add(0.9);
  body = mix(body, body.mul(pocketShade), platePocket);
  body = mix(body, color(0x303438), trunkHandle);
  body = mix(body, color(0x24292d), plateRecess);
  body = mix(body, color(0xf2b718), plates);
  const plateVariant = floor(fract(paint.r.mul(7).add(paint.g.mul(13)).add(paint.b.mul(17))).mul(4));
  const plateUV = vec2(p.x.div(-0.31).add(0.5), p.y.sub(plateR).div(0.12).add(0.5));
  const plateColor = texture(carPlateTexture(), vec2(plateUV.x, plateUV.y.add(plateVariant).div(4))).rgb;
  body = mix(body, plateColor, plateRear);
  body = mix(body, color(0x0e1013), under);

  // Glasshouse: tinted glass, black seals & B / C pillars, painted roof & A pillars, chrome sill strip, CHMSL
  const glassCol = mix(color(0x0a1016), color(0x1a2632), smoothstep(0.2, 0.9, n.y));
  let windowCol = mix(mix(mix(mix(paint, color(0x111315), seal), glassCol, glass), color(0xc9ced3), chromeBelt), color(0x6a0a0e), chmsl);
  windowCol = mix(windowCol, color(0x15181b), rearWiper);

  // Mirror caps (paint, glass facing back), taxi roof light, trims, alloys & tyres
  const mirrorCol = mix(paint, color(0x7c8a94), mirrorGlass);
  const signLabel=texture(taxiTexture(),vec2(p.x.mul(n.z.sign()).div(.58).add(.5),p.y.sub(signY).div(.15).add(.5))).rgb;
  const signCol=mix(color(0xf3efe2),signLabel,signFace);
  const alloyCol = mix(color(0x0b0e12), color(0xd8e0e8), alloyMetal);
  const treadZone = smoothstep(wheelR.mul(0.74), wheelR.mul(0.83), wheelDist);
  const tyreBase = smoothstep(wheelR.mul(0.85), wheelR.mul(0.94), wheelDist).mul(0.22).add(0.78);
  const tyreCol = color(0x16181b).mul(tyreBase.add(spokes.mul(treadZone).mul(0.24)));

  let col = mix(body, windowCol, isWindow);
  col = mix(col, mirrorCol, isMirror);
  col = mix(col, signCol, isSign);
  col = mix(col, color(0x1b1e21), isTrim);
  col = mix(col, alloyCol, isAlloy);
  col = mix(col, tyreCol, isTyre);

  // ---- Roughness & metalness ---------------------------------------------------------------------------------------
  const alloySpokes = max(spokes, rimRing).mul(isAlloy);
  const glossy = max(max(max(glass, chromeBelt), mirrorGlass), lamp);
  let rough = mix(float(0.26), float(0.15), glossy);
  rough = mix(rough, float(0.4), plates);
  rough = mix(rough, float(0.35), isSign);
  rough = mix(rough, float(0.82), max(matte, isAlloy.sub(alloySpokes)));

  let metal = mix(float(0.34), float(0.14), glass);
  metal = mix(metal, float(0.6), max(lamp, mirrorGlass));
  metal = mix(metal, float(0.95), chromeBelt);
  metal = mix(metal, float(0.86), alloySpokes);
  metal = mix(metal, float(0.08), plates);
  metal = mix(metal, float(0.04), max(matte, isSign));

  // ---- Emissive: running lights, tail / brake lights & CHMSL, turn signals, taxi roof light -----------------------
  const brake = state.x;
  const blink = max(state.y.mul(step(0.0, p.x)), state.z.mul(step(p.x, 0.0)));
  const nightHeadlamp = night;
  const headlamps = color(0xfff8ec)
    .mul(headlightLens.mul(2.2).add(drl.mul(0.65)))
    .mul(nightHeadlamp)
    .mul(one.sub(turnFront.mul(blink)));
  const tail = color(0xff0a12).mul(redLens.mul(tailShade).mul(brake.mul(2.1).add(nightHeadlamp.mul(0.4))));
  const stop = color(0xff0a12).mul(chmsl.mul(brake).mul(2.1));
  const turn = color(0xff9a14).mul(max(turnFront, turnRear).mul(blink).mul(2.2));
  const sign=signLabel.mul(signFace).mul(night.mul(.65));

  const mat = new THREE.MeshStandardNodeMaterial();
  if (fixed) mat.userData.carState = stateUniform;
  mat.userData.vehicleState={wheelAngle,braking:{value:0},night,paint,labels:{value:carPlateTexture()}};
  mat.userData.vehicleState.braking=stateUniform?{get value(){return stateUniform.value.x;},set value(v){stateUniform.value.x=v;}}:null;
  const angle=mat.userData.vehicleState.wheelAngle;
  const a=attribute('position','vec3');
  const wheel=step(1.5,partId).mul(step(partId,3.5));
  const az=a.z.sub(step(0,a.z).mul(2).sub(1).mul(spec.wheelZ)),ay=a.y.sub(spec.wheelRadius);
  const rotated=vec3(a.x,ay.mul(cos(angle)).sub(az.mul(sin(angle))).add(spec.wheelRadius),ay.mul(sin(angle)).add(az.mul(cos(angle))).add(a.z.sub(az)));
  // Las instancias ya transforman positionLocal; no sobrescribir esa transformación.
  mat.positionNode=fixed?mix(a,rotated,wheel):null;
  mat.colorNode = col;
  mat.roughnessNode = rough;
  mat.metalnessNode = metal;
  mat.emissiveNode = headlamps.add(tail).add(stop).add(turn).add(sign);


  return mat;
}


// Bus urbano adaptado de Slop New York 09361be1, MIT.
const BUS_PARTS={BODY:0,TRIM:1,POD:2};
function createUrbanBusMaterial(fixedColorHex) {

  const s = BUS_SPEC;
  const p = attribute('position', 'vec3');
  const n = attribute('normal', 'vec3');
  const partId = attribute('partId', 'float');
  const fixed=fixedColorHex!==null, state=fixed?uniform(new THREE.Vector4()):attribute('carState','vec4'); const night=fixed?uniform(0):attribute('carNight','float');
  const isBody = step(abs(partId.sub(BUS_PARTS.BODY)), 0.25);
  const isTrim = step(abs(partId.sub(BUS_PARTS.TRIM)), 0.25);
  const isPod = step(abs(partId.sub(BUS_PARTS.POD)), 0.25);
  const ax = abs(p.x);
  const one = float(1.0);

  const front = smoothstep(0.1, 0.35, n.z).mul(step(s.zFront - 0.9, p.z)).mul(isBody);
  const rear = smoothstep(0.1, 0.35, n.z.negate()).mul(step(p.z, s.zRear + 0.9)).mul(isBody);
  const side = smoothstep(0.5, 0.75, abs(n.x)).mul(isBody);
  const curb = step(p.x, 0.0);

  // Windshield (wrapping round the corners), sign band, gasket; rear window & engine louvres
  const frontGlass = roundedRect(vec2(p.x, p.y.sub(1.82)), vec2(1.2, 0.58), 0.14).mul(smoothstep(0.012, 0.024, ax)).mul(front);
  const frontSeal = roundedRect(vec2(p.x, p.y.sub(1.82)), vec2(1.24, 0.62), 0.16).mul(front);
  const signBand = roundedRect(vec2(p.x, p.y.sub(2.55)), vec2(1.02, 0.16), 0.04).mul(front);
  const rearGlass = roundedRect(vec2(p.x, p.y.sub(2.06)), vec2(0.92, 0.36), 0.08).mul(rear);
  const rearSeal = roundedRect(vec2(p.x, p.y.sub(2.06)), vec2(0.96, 0.4), 0.1).mul(rear);
  const louvres = roundedRect(vec2(p.x, p.y.sub(0.98)), vec2(0.78, 0.34), 0.05).mul(rear);
  const slats = step(0.5, fract(p.y.mul(16.0))).mul(0.45).add(0.4);

  // Side window band with mullions; driver's window; curb-side doors (glazed leaves, frames)
  const [wy0, wy1] = s.window;
  const winMid = (wy0 + wy1) / 2;
  const winHalf = (wy1 - wy0) / 2;
  const sideBand = roundedRect(vec2(p.z.add(0.5), p.y.sub(winMid)), vec2(4.82, winHalf), 0.08).mul(side);
  const mullion = smoothstep(0.03, 0.045, abs(fract(p.z.mul(0.8).add(0.35)).sub(0.5).mul(1.25)));
  const sideSeal = roundedRect(vec2(p.z.add(0.5), p.y.sub(winMid)), vec2(4.86, winHalf + 0.04), 0.1).mul(side);
  const driverWin = roundedRect(vec2(p.z.sub(4.86), p.y.sub(winMid + 0.04)), vec2(0.5, winHalf + 0.04), 0.1).mul(side).mul(one.sub(curb));
  const door = (z0, z1) => {
    const zc = (z0 + z1) / 2;
    const hw = (z1 - z0) / 2;
    const frame = roundedRect(vec2(p.z.sub(zc), p.y.sub(1.44)), vec2(hw, 1.0), 0.05);
    const leaves = roundedRect(vec2(abs(p.z.sub(zc)).sub(hw * 0.5), p.y.sub(1.5)), vec2(hw * 0.4, 0.84), 0.035);
    return { frame: frame.mul(side).mul(curb), glass: leaves.mul(side).mul(curb) };
  };
  const d0 = door(s.frontDoor[0], s.frontDoor[1]);
  const d1 = door(s.rearDoor[0], s.rearDoor[1]);
  const doorFrame = max(d0.frame, d1.frame);
  const glass = clamp(max(max(frontGlass, rearGlass), max(max(sideBand.mul(mullion), driverWin), max(d0.glass, d1.glass))), 0.0, 1.0);
  const seal = clamp(max(max(frontSeal, rearSeal), max(max(sideSeal, signBand), doorFrame)), 0.0, 1.0);

  // MTA livery
  const shadeY = smoothstep(0.34, 1.2, p.y).mul(0.2).add(0.8);
  const blueStripe = smoothstep(0.9, 0.93, p.y).mul(smoothstep(1.2, 1.17, p.y));
  const cyanRibbon = smoothstep(0.84, 0.86, p.y).mul(smoothstep(0.885, 0.865, p.y));
  const skirt = smoothstep(0.53, 0.5, p.y);
  const livery = mix(mix(mix(color(0x176eaa), color(0xe4ba36), blueStripe), color(0xc2d5dc), cyanRibbon), color(0x1c2026), skirt).mul(shadeY);

  // Lamps: twin round headlamps & amber turn signals in black pods; red tail / brake light columns, amber turn &
  // white reverse lamps at the rear corners; plates
  const pod = roundedRect(vec2(ax.sub(0.86), p.y.sub(0.8)), vec2(0.27, 0.085), 0.06).mul(front);
  const headLamp = max(
    smoothstep(0.05, 0.04, length(vec2(ax.sub(0.72), p.y.sub(0.8)))),
    smoothstep(0.05, 0.04, length(vec2(ax.sub(0.86), p.y.sub(0.8))))
  ).mul(pod);
  const turnFront = smoothstep(0.045, 0.035, length(vec2(ax.sub(1.02), p.y.sub(0.8)))).mul(pod);
  const tailCol = roundedRect(vec2(ax.sub(1.04), p.y.sub(0.92)), vec2(0.075, 0.27), 0.05).mul(rear);
  const tailLamp = tailCol.mul(smoothstep(0.93, 0.95, p.y));
  const turnRear = tailCol.mul(smoothstep(0.92, 0.9, p.y)).mul(smoothstep(0.76, 0.78, p.y));
  const reverse = tailCol.mul(smoothstep(0.75, 0.73, p.y));
  const plate = roundedRect(vec2(p.x, p.y.sub(0.77)), vec2(0.16, 0.06), 0.008).mul(max(front.mul(step(ax, 0.3)), rear));

  let body = mix(livery, color(0x15191e), seal);
  const destination=texture(localLabel('BOGOTÁ · URBANO'),vec2(p.x.div(1.9).add(.5),p.y.sub(2.415).div(.27))).rgb;
  body=mix(body,destination,signBand);
  body = mix(body, color(0x1a1e23).mul(slats), louvres);
  body = mix(body, color(0x111418), pod);
  body = mix(body, mix(color(0xdcefff), color(0xffa21a), turnFront), max(headLamp, turnFront));
  body = mix(body, color(0x9a0d14), tailLamp);
  body = mix(body, color(0xc8641a), turnRear);
  body = mix(body, color(0xe8eef2), reverse);
  body = mix(body, color(0xf2b718), plate);
  const glassTint = mix(color(0x0e1a26), color(0x1b3046), clamp(p.y.sub(1.3).mul(0.8), 0.0, 1.0));
  body = mix(body, glassTint, glass);

  const col = mix(mix(body, color(0x1b1f24), isTrim), color(0xc9ced3), isPod);

  const mat = new THREE.MeshStandardNodeMaterial();
  mat.colorNode = col;
  mat.roughnessNode = mix(mix(mix(float(0.3), float(0.16), max(glass, max(headLamp, tailCol))), float(0.7), max(isTrim, seal.mul(one.sub(glass)))), float(0.45), isPod);
  mat.metalnessNode = mix(mix(float(0.22), float(0.7), glass), float(0.05), max(isTrim, isPod));

  const brake = state.x;
  const blink = max(state.y.mul(step(0.0, p.x)), state.z.mul(step(p.x, 0.0)));
  const nightHeadlamp = night;
  mat.emissiveNode = color(0xd9efff)
    .mul(pod.mul(0.45).add(headLamp.mul(1.35)))
    .mul(nightHeadlamp)
    .add(color(0xff9a14).mul(max(turnFront, turnRear).mul(blink).mul(2.0)))
    .add(color(0xff0a12).mul(tailLamp.mul(brake.mul(1.5).add(night.mul(.75)))));

  mat.userData.vehicleState={night,wheelAngle:uniform(0),paint:uniform(new THREE.Color('#176eaa')),braking:fixed?{get value(){return state.value.x;},set value(v){state.value.x=v;}}:{value:0}}; mat.userData.carState=fixed?state:null;
  return mat;
}

