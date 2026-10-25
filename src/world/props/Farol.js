// src/world/props/Farol.js
import * as THREE from 'three';
import { COLORS } from '../../utils/constants.js';
import { createImportedModel, disposeImportedInstance } from '../../utils/ImportedModels.js';

export class Farol {
  constructor(position, opts = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    const metalMat = new THREE.MeshLambertMaterial({
      color: 0x2a2a30,
      flatShading: true
    });

    // Poste
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4, 6);
    const pole = new THREE.Mesh(poleGeo, metalMat);
    pole.position.y = 2;
    pole.castShadow = true;
    this.group.add(pole);

    // Brazo
    const armGeo = new THREE.BoxGeometry(0.6, 0.08, 0.08);
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.position.set(0.3, 4, 0);
    this.group.add(arm);

    // Lámpara
    const lampGeo = new THREE.BoxGeometry(0.2, 0.15, 0.25);
    const lampMat = new THREE.MeshBasicMaterial({ color: COLORS.ACCENT_AMBER });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0.6, 3.9, 0);
    this.group.add(lamp);

    // Luz (solo si no es de día — la controla el World)
    if (opts.addLight !== false) {
      this.light = new THREE.PointLight(COLORS.ACCENT_AMBER, 0, 8);
      this.light.position.set(0.6, 3.8, 0);
      this.group.add(this.light);
    }
  }

  /** Enciende/apaga la luz según hora */
  preloadModel() {
    return this._modelPromise ??= createImportedModel('lampara').then(model => {
      this._removePlaceholder();
      this.model = model;
      this.group.add(model);
      this.group.matrixAutoUpdate = true;
      if (this.light) {
        this.light.matrixAutoUpdate = this.light.matrixWorldAutoUpdate = true;
        this.light.position.set(1.65, 3.95, 0);
      }
    });
  }

  /**
   * El modelo lo dibuja un lote instanciado de la ciudad: el farol queda solo con su luz y deja
   * de ser un dibujo propio en la vista y en las sombras.
   */
  useInstancedModel() {
    this._modelPromise ??= Promise.resolve();
    this._removePlaceholder();
    this.group.matrixAutoUpdate = true;
    if (this.light) {
      this.light.matrixAutoUpdate = this.light.matrixWorldAutoUpdate = true;
      this.light.position.set(1.65, 3.95, 0);
    }
  }

  _removePlaceholder() {
    for (const child of [...this.group.children]) {
      if (child === this.light || child === this.model) continue;
      this.group.remove(child);
      child.geometry?.dispose(); child.material?.dispose();
    }
  }

  dispose() { if (this.model) disposeImportedInstance(this.model); }

  setNight(isNight) {
    if (this.light) {
      this.light.intensity = isNight ? 1.2 : 0;
    }
  }
}
