import * as THREE from "three";
import {
  computeLodLevel,
  frameBudgetMs,
  getProfileLimits,
  resolveRenderProfile,
  selectRenderableSubset
} from "./renderQuality.js";
import { bumpProgressToken, runProgressiveBatches } from "./progressiveRender.js";
import { clearGraphSceneResources } from "./threeDispose.js";
const RADIUS = 1.5;
const NODE_COLORS = {
  class: "#39e97e",
  interface: "#35dcff",
  method: "#f02ba6",
  function: "#f02ba6",
  file: "#2d8cff",
  package: "#9c68ff",
  module: "#9c68ff",
  table: "#e8f12f",
  config: "#ff7a33",
  endpoint: "#ffca4b",
  project: "#5ad4a0",
  workspace: "#5ad4a0",
  folder: "#3ca88a",
  group: "#63b993",
  default: "#b7dfcf"
};
function lonLatToVector(lon, lat, radius = RADIUS) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}
function arcPoint(start, end, t, lift = 0.12, target = null) {
  const a = start.clone().normalize();
  const b = end.clone().normalize();
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const omega = Math.acos(dot);
  let point;
  if (omega < 1e-4) {
    point = a.lerp(b, t).normalize();
  } else {
    const sinOmega = Math.sin(omega);
    point = a.multiplyScalar(Math.sin((1 - t) * omega) / sinOmega).add(b.multiplyScalar(Math.sin(t * omega) / sinOmega));
  }
  const altitude = RADIUS * (1.018 + Math.sin(Math.PI * t) * lift);
  const result = point.normalize().multiplyScalar(altitude);
  if (target) {
    target.copy(result);
    return target;
  }
  return result;
}
function ensureSharedResources(context, limits) {
  if (!context.shared) context.shared = {};
  const segs = limits.sphereSegments || 8;
  if (!context.shared.nodeGeometry || context.shared.sphereSegments !== segs) {
    context.shared.nodeGeometry?.dispose?.();
    context.shared.nodeGeometry = new THREE.SphereGeometry(0.016, segs, segs);
    context.shared.sphereSegments = segs;
  }
  if (!context.shared.nodeMaterial) {
    context.shared.nodeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  }
  if (!context.shared.edgeMaterial) {
    context.shared.edgeMaterial = new THREE.LineBasicMaterial({
      color: 2997634,
      transparent: true,
      opacity: 0.19,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }
  if (!context.shared.particleMaterial) {
    context.shared.particleMaterial = new THREE.PointsMaterial({
      color: 11861985,
      size: 0.032,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }
  return context.shared;
}
function nodeScale(node) {
  if (node.isGroup) {
    return 1.15 + Math.min(2.8, Math.log2((node.nodeCount || 2) + 2) * 0.34);
  }
  return 0.82 + Math.min(2.35, Math.log2((node.degree || 0) + 2) * 0.29);
}
function startGraphBuild(context, {
  graph,
  importQuality = "equilibrado",
  cameraZ = 4.45,
  selectedIndex = -1,
  searchActive = false,
  searchIds = null,
  observedFps = 60,
  onInfo,
  onComplete
}) {
  if (context.cancelGraphBuild) {
    context.cancelGraphBuild();
    context.cancelGraphBuild = null;
  }
  clearGraphSceneResources(context);
  context.renderIndexToSource = [];
  context.sourceToRender = /* @__PURE__ */ new Map();
  context.renderNodes = [];
  if (!graph?.nodes?.length) {
    onInfo?.({
      lodLevel: 0,
      profile: resolveRenderProfile(importQuality),
      simplified: false,
      reasons: [],
      renderNodeCount: 0,
      renderEdgeCount: 0,
      message: ""
    });
    return;
  }
  const profile = resolveRenderProfile(importQuality);
  const effectiveProfile = profile === "automatico" ? observedFps < 36 ? "bajo" : observedFps < 50 ? "medio" : "alto" : profile;
  const effectiveLimits = getProfileLimits(effectiveProfile);
  const lodLevel = computeLodLevel({
    cameraZ,
    selectedIndex,
    searchActive,
    hierarchyActive: Boolean(graph.hierarchyActive),
    expandedGroup: Boolean(graph.contextGroupId),
    profile,
    observedFps
  });
  const subset = selectRenderableSubset(graph, {
    lodLevel,
    profileLimits: effectiveLimits,
    selectedIndex,
    searchIds
  });
  const shared = ensureSharedResources(context, effectiveLimits);
  const capacity = Math.max(1, subset.nodes.length);
  const nodesMesh = new THREE.InstancedMesh(shared.nodeGeometry, shared.nodeMaterial, capacity);
  nodesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  nodesMesh.count = 0;
  nodesMesh.frustumCulled = true;
  nodesMesh.renderOrder = 4;
  context.dataGroup.add(nodesMesh);
  context.nodesMesh = nodesMesh;
  context.baseColors = [];
  context.nodeVectors = [];
  context.renderNodes = subset.nodes;
  context.sourceToRender = subset.sourceToRender;
  context.renderIndexToSource = subset.nodes.map((node) => node.sourceIndex);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const token = context.progressToken ? bumpProgressToken(context.progressToken) : { cancelled: false, generation: 1 };
  context.progressToken = token;
  const budget = frameBudgetMs(effectiveProfile);
  let edgesBuilt = false;
  const finishEdges = () => {
    if (token.cancelled || edgesBuilt) return;
    edgesBuilt = true;
    const segmentsMode = subset.edgeSegments;
    const segmentsFull = effectiveLimits.edgeSegmentsFull;
    const segmentsSimple = effectiveLimits.edgeSegmentsSimple;
    const segmentCount = segmentsMode === "full" ? segmentsFull : segmentsSimple;
    const maxFloats = subset.edges.length * segmentCount * 2 * 3;
    if (!context.edgeScratch || context.edgeScratch.length < maxFloats) {
      context.edgeScratch = new Float32Array(Math.max(maxFloats, 256));
    }
    const scratch = context.edgeScratch;
    let offset = 0;
    const tempA = new THREE.Vector3();
    const tempB = new THREE.Vector3();
    const edgeToken = token;
    const cancelEdges = runProgressiveBatches({
      items: subset.edges,
      batchSize: effectiveLimits.edgeBatch,
      budgetMs: budget,
      token: edgeToken,
      processBatch: (batch) => {
        for (const edge of batch) {
          const start = context.nodeVectors[edge.source];
          const end = context.nodeVectors[edge.target];
          if (!start || !end) continue;
          const lift = edge.confidence === "INFERRED" ? 0.105 : 0.075;
          arcPoint(start, end, 0, lift, tempA);
          for (let segment = 1; segment <= segmentCount; segment += 1) {
            const previous = segment % 2 === 1 ? tempA : tempB;
            const current = segment % 2 === 1 ? tempB : tempA;
            arcPoint(start, end, segment / segmentCount, lift, current);
            scratch[offset] = previous.x;
            scratch[offset + 1] = previous.y;
            scratch[offset + 2] = previous.z;
            scratch[offset + 3] = current.x;
            scratch[offset + 4] = current.y;
            scratch[offset + 5] = current.z;
            offset += 6;
          }
        }
      },
      onComplete: () => {
        if (edgeToken.cancelled) return;
        const positions = scratch.slice(0, offset);
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        edgeGeometry.computeBoundingSphere();
        const edgeLines = new THREE.LineSegments(edgeGeometry, shared.edgeMaterial);
        edgeLines.frustumCulled = true;
        edgeLines.renderOrder = 2;
        context.dataGroup.add(edgeLines);
        context.edgeLines = edgeLines;
        const particleCount = Math.min(subset.maxAnimatedEdges, subset.edges.length);
        if (particleCount > 0) {
          if (!context.particleScratch || context.particleScratch.length < particleCount * 3) {
            context.particleScratch = new Float32Array(particleCount * 3);
          }
          const particleGeometry = new THREE.BufferGeometry();
          particleGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(context.particleScratch.subarray(0, particleCount * 3), 3)
          );
          const particles = new THREE.Points(particleGeometry, shared.particleMaterial);
          particles.frustumCulled = true;
          particles.renderOrder = 5;
          context.dataGroup.add(particles);
          context.particles = particles;
          context.particleData = Array.from({ length: particleCount }, (_, index) => {
            const edge = subset.edges[index * 37 % subset.edges.length];
            return {
              start: context.nodeVectors[edge.source],
              end: context.nodeVectors[edge.target],
              phase: index * 0.61803398875 % 1,
              speed: 0.08 + index % 7 * 0.012,
              lift: edge.confidence === "INFERRED" ? 0.105 : 0.075
            };
          });
        }
        context.lastLodLevel = lodLevel;
        context.lastBuildCameraZ = cameraZ;
        context.idleParticleSkip = Boolean(effectiveLimits.idleParticleSkip);
        context.maxRaycastCandidates = effectiveLimits.maxRaycastCandidates;
        onInfo?.({
          lodLevel,
          profile: effectiveProfile,
          requestedProfile: profile,
          simplified: subset.simplified,
          reasons: subset.reasons,
          renderNodeCount: subset.nodes.length,
          renderEdgeCount: subset.edges.length,
          viewNodeCount: graph.nodes.length,
          viewEdgeCount: graph.edges.length,
          progressive: false,
          message: subset.simplified ? subset.reasons.join(" · ") : ""
        });
        onComplete?.({ lodLevel, subset });
      }
    });
    const prevCancel = context.cancelGraphBuild;
    context.cancelGraphBuild = () => {
      prevCancel?.();
      cancelEdges();
    };
  };
  const cancelNodes = runProgressiveBatches({
    items: subset.nodes,
    batchSize: effectiveLimits.nodeBatch,
    budgetMs: budget,
    token,
    processBatch: (batch, startIndex) => {
      for (let offset = 0; offset < batch.length; offset += 1) {
        const index = startIndex + offset;
        const node = batch[offset];
        const vector = lonLatToVector(node.lon, node.lat, RADIUS * 1.022);
        context.nodeVectors[index] = vector;
        dummy.position.copy(vector);
        dummy.scale.setScalar(nodeScale(node));
        dummy.updateMatrix();
        nodesMesh.setMatrixAt(index, dummy.matrix);
        color.set(NODE_COLORS[node.kind] || NODE_COLORS.default);
        nodesMesh.setColorAt(index, color);
        context.baseColors[index] = color.clone();
      }
      nodesMesh.count = startIndex + batch.length;
      nodesMesh.instanceMatrix.needsUpdate = true;
      if (nodesMesh.instanceColor) nodesMesh.instanceColor.needsUpdate = true;
      onInfo?.({
        lodLevel,
        profile: effectiveProfile,
        requestedProfile: profile,
        simplified: true,
        reasons: [
          ...subset.reasons,
          `Carga progresiva ${nodesMesh.count}/${subset.nodes.length}`
        ],
        renderNodeCount: nodesMesh.count,
        renderEdgeCount: 0,
        viewNodeCount: graph.nodes.length,
        viewEdgeCount: graph.edges.length,
        progressive: true,
        message: `Preparando visualización… ${nodesMesh.count}/${subset.nodes.length}`
      });
    },
    onComplete: () => {
      if (token.cancelled) return;
      nodesMesh.computeBoundingSphere?.();
      finishEdges();
    }
  });
  context.cancelGraphBuild = () => {
    token.cancelled = true;
    cancelNodes();
  };
  onInfo?.({
    lodLevel,
    profile: effectiveProfile,
    requestedProfile: profile,
    simplified: subset.simplified,
    reasons: subset.reasons,
    renderNodeCount: 0,
    renderEdgeCount: 0,
    viewNodeCount: graph.nodes.length,
    viewEdgeCount: graph.edges.length,
    progressive: true,
    message: `LOD ${lodLevel} · iniciando render progresivo`
  });
}
function resolvePickNode(context, graph, instanceId) {
  if (!Number.isInteger(instanceId) || !graph?.nodes) return null;
  const sourceIndex = context.renderIndexToSource?.[instanceId];
  if (Number.isInteger(sourceIndex)) return graph.nodes[sourceIndex] || null;
  const rendered = context.renderNodes?.[instanceId];
  if (rendered && Number.isInteger(rendered.sourceIndex)) {
    return graph.nodes[rendered.sourceIndex] || rendered;
  }
  return graph.nodes[instanceId] || null;
}
function disposeSharedSceneResources(context) {
  if (context.cancelGraphBuild) {
    context.cancelGraphBuild();
    context.cancelGraphBuild = null;
  }
  if (context.progressToken) context.progressToken.cancelled = true;
  clearGraphSceneResources(context);
  if (context.shared) {
    context.shared.nodeGeometry?.dispose?.();
    context.shared.nodeMaterial?.dispose?.();
    context.shared.edgeMaterial?.dispose?.();
    context.shared.particleMaterial?.dispose?.();
    context.shared = null;
  }
  context.edgeScratch = null;
  context.particleScratch = null;
}
export {
  arcPoint,
  disposeSharedSceneResources,
  lonLatToVector,
  resolvePickNode,
  startGraphBuild
};
