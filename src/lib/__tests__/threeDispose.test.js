import { describe, expect, it } from 'vitest';
import { clearGraphSceneResources } from '../threeDispose.js';

describe('clearGraphSceneResources', () => {
  it('no dispone geometrías/materiales compartidos y limpia mapeos LOD', () => {
    const sharedGeometry = { dispose: () => {}, disposed: false };
    sharedGeometry.dispose = () => {
      sharedGeometry.disposed = true;
    };
    const sharedMaterial = { dispose: () => {}, disposed: false };
    sharedMaterial.dispose = () => {
      sharedMaterial.disposed = true;
    };
    const ownedGeometry = { dispose: () => {}, disposed: false };
    ownedGeometry.dispose = () => {
      ownedGeometry.disposed = true;
    };
    const ownedMaterial = { dispose: () => {}, disposed: false };
    ownedMaterial.dispose = () => {
      ownedMaterial.disposed = true;
    };

    const selection = { name: 'selection' };
    const sharedChild = {
      geometry: sharedGeometry,
      material: sharedMaterial,
      traverse(cb) {
        cb(this);
      },
    };
    const ownedChild = {
      geometry: ownedGeometry,
      material: ownedMaterial,
      traverse(cb) {
        cb(this);
      },
    };
    const instanceMatrix = { dispose: () => { instanceMatrix.disposed = true; }, disposed: false };
    const instanceColor = { dispose: () => { instanceColor.disposed = true; }, disposed: false };
    const instancedChild = {
      isInstancedMesh: true,
      instanceMatrix,
      instanceColor,
      dispose() {
        instanceMatrix.dispose();
        instancedChild.disposed = true;
      },
      disposed: false,
      geometry: ownedGeometry,
      material: ownedMaterial,
      traverse(cb) {
        cb(this);
      },
    };

    const children = [selection, sharedChild, ownedChild, instancedChild];
    const context = {
      shared: {
        nodeGeometry: sharedGeometry,
        nodeMaterial: sharedMaterial,
      },
      dataGroup: {
        children,
        remove(child) {
          const index = children.indexOf(child);
          if (index >= 0) children.splice(index, 1);
        },
      },
      selection,
      sourceToRender: new Map([[0, 0]]),
      renderIndexToSource: [0],
      renderNodes: [{ id: 'a' }],
    };

    clearGraphSceneResources(context);

    expect(sharedGeometry.disposed).toBe(false);
    expect(sharedMaterial.disposed).toBe(false);
    expect(ownedGeometry.disposed).toBe(true);
    expect(ownedMaterial.disposed).toBe(true);
    expect(instanceMatrix.disposed).toBe(true);
    expect(instanceColor.disposed).toBe(true);
    expect(instancedChild.disposed).toBe(true);
    expect(context.nodesMesh).toBeNull();
    expect(context.sourceToRender.size).toBe(0);
    expect(context.renderIndexToSource).toEqual([]);
    expect(children).toEqual([selection]);
  });
});
