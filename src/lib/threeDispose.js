function disposeMaterial(material) {
  if (!material) return;
  const textureKeys = [
    "map",
    "lightMap",
    "bumpMap",
    "normalMap",
    "specularMap",
    "envMap",
    "alphaMap",
    "aoMap",
    "displacementMap",
    "emissiveMap",
    "metalnessMap",
    "roughnessMap"
  ];
  for (const key of textureKeys) {
    const texture = material[key];
    if (texture && typeof texture.dispose === "function") {
      texture.dispose();
      material[key] = null;
    }
  }
  material.dispose?.();
}
function disposeObject(object) {
  if (!object) return;
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose?.();
      child.geometry = null;
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => disposeMaterial(material));
      } else {
        disposeMaterial(child.material);
      }
      child.material = null;
    }
  });
}
function isSharedResource(context, resource) {
  const shared = context?.shared;
  if (!shared || !resource) return false;
  return resource === shared.nodeGeometry || resource === shared.nodeMaterial || resource === shared.edgeMaterial || resource === shared.particleMaterial;
}
function clearGraphSceneResources(context) {
  if (!context?.dataGroup) return;
  for (const child of [...context.dataGroup.children]) {
    if (child === context.selection) continue;
    context.dataGroup.remove(child);
    child.traverse((node) => {
      if (node.isInstancedMesh) {
        node.instanceColor?.dispose?.();
        node.instanceColor = null;
        node.dispose?.();
      }
      if (node.geometry) {
        if (!isSharedResource(context, node.geometry)) {
          node.geometry.dispose?.();
        }
        node.geometry = null;
      }
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (!isSharedResource(context, material)) {
            disposeMaterial(material);
          }
        }
        node.material = null;
      }
    });
  }
  context.nodesMesh = null;
  context.nodeVectors = [];
  context.particleData = [];
  context.particles = null;
  context.edgeLines = null;
  context.focusGroup = null;
  context.focusParticleData = [];
  context.focusParticles = null;
  context.baseColors = [];
  context.focusQuaternion = null;
  context.renderIndexToSource = [];
  context.renderNodes = [];
  context.sourceToRender = /* @__PURE__ */ new Map();
  if (context.selection) context.selection.visible = false;
}
function disposeRenderer(renderer) {
  if (!renderer) return;
  try {
    renderer.dispose();
  } catch {
  }
  try {
    renderer.forceContextLoss?.();
  } catch {
  }
  const canvas = renderer.domElement;
  if (canvas?.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
}
export {
  clearGraphSceneResources,
  disposeMaterial,
  disposeObject,
  disposeRenderer
};
