import * as THREE from 'three';
import { parseJsonText, validateGraphDocument } from '../../src/lib/graphValidation.js';
import { buildIndexedGraph, releaseIndexedGraph, searchIndexed } from '../../src/lib/indexedGraph.js';
import {
  buildHierarchy,
  createHierarchyNav,
  expandNavToGroup,
  releaseHierarchy,
  selectSceneView,
} from '../../src/lib/hierarchy.js';

const out = document.getElementById('out');
const fileInput = document.getElementById('file');
const runButton = document.getElementById('run');
const profileSelect = document.getElementById('profile');
const canvas = document.getElementById('gl');

let selectedFile = null;

fileInput.addEventListener('change', () => {
  selectedFile = fileInput.files?.[0] || null;
  runButton.disabled = !selectedFile;
  out.textContent = selectedFile
    ? `Listo: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`
    : 'Esperando archivo…';
});

function mem() {
  const m = performance.memory;
  if (!m) return null;
  return {
    usedJsHeapMb: Number((m.usedJSHeapSize / (1024 * 1024)).toFixed(2)),
    totalJsHeapMb: Number((m.totalJSHeapSize / (1024 * 1024)).toFixed(2)),
    jsHeapLimitMb: Number((m.jsHeapSizeLimit / (1024 * 1024)).toFixed(2)),
  };
}

async function measureFps(renderer, scene, camera, durationMs = 2000) {
  let frames = 0;
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = (now) => {
      frames += 1;
      camera.position.x = Math.sin(now * 0.001) * 0.2;
      renderer.render(scene, camera);
      if (now - start >= durationMs) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const elapsed = performance.now() - start;
  return Number(((frames / elapsed) * 1000).toFixed(1));
}

function setupScene(view) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 100);
  camera.position.z = 4.2;

  const geometry = new THREE.SphereGeometry(0.02, 6, 6);
  const material = new THREE.MeshBasicMaterial({ color: 0x39e97e });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, view.nodes.length));
  const dummy = new THREE.Object3D();
  view.nodes.forEach((node, index) => {
    const phi = ((90 - (node.lat || 0)) * Math.PI) / 180;
    const theta = (((node.lon || 0) + 180) * Math.PI) / 180;
    dummy.position.set(
      -1.5 * Math.sin(phi) * Math.cos(theta),
      1.5 * Math.cos(phi),
      1.5 * Math.sin(phi) * Math.sin(theta),
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.count = view.nodes.length;
  scene.add(mesh);
  return { renderer, scene, camera, mesh, geometry, material };
}

runButton.addEventListener('click', async () => {
  if (!selectedFile) return;
  runButton.disabled = true;
  const report = {
    profile: profileSelect.value,
    userAgent: navigator.userAgent,
    fileName: selectedFile.name,
    fileBytes: selectedFile.size,
    timings: {},
    memory: { start: mem() },
    error: null,
  };

  let indexed = null;
  let hierarchy = null;
  let resources = null;

  try {
    const readStart = performance.now();
    const text = await selectedFile.text();
    report.timings.readMs = Number((performance.now() - readStart).toFixed(2));
    report.memory.afterRead = mem();

    const parseStart = performance.now();
    const raw = parseJsonText(text);
    report.timings.parseMs = Number((performance.now() - parseStart).toFixed(2));

    const validateStart = performance.now();
    const validated = validateGraphDocument(raw);
    report.timings.validationMs = Number((performance.now() - validateStart).toFixed(2));

    const indexStart = performance.now();
    indexed = buildIndexedGraph(validated);
    report.timings.indexingMs = Number((performance.now() - indexStart).toFixed(2));

    const hierarchyStart = performance.now();
    hierarchy = buildHierarchy(indexed);
    const nav = createHierarchyNav(indexed, hierarchy);
    report.timings.hierarchyMs = Number((performance.now() - hierarchyStart).toFixed(2));

    const viewStart = performance.now();
    const view = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 900,
      maxEdges: 2400,
      maxAnimatedEdges: 42,
    });
    report.timings.viewSelectMs = Number((performance.now() - viewStart).toFixed(2));
    report.timings.firstVisualizationMs = Number((
      report.timings.readMs
      + report.timings.parseMs
      + report.timings.validationMs
      + report.timings.indexingMs
      + report.timings.hierarchyMs
      + report.timings.viewSelectMs
    ).toFixed(2));
    report.view = {
      renderedNodes: view.nodes.length,
      renderedEdges: view.edges.length,
      mode: view.mode,
      tier: view.tier,
      indexedNodes: indexed.nodeCount,
    };

    resources = setupScene(view);
    const fpsMove = await measureFps(resources.renderer, resources.scene, resources.camera, 2000);
    report.fpsDuringMotion = fpsMove;
    report.timings.stabilizationMs = Number((report.timings.firstVisualizationMs + 2000).toFixed(2));

    const searchStart = performance.now();
    const results = searchIndexed(indexed, indexed.labels[0] || 'Type', { limit: 18 });
    report.timings.searchMs = Number((performance.now() - searchStart).toFixed(2));
    report.searchResults = results.length;

    if (nav.mode === 'hierarchy' && hierarchy.roots.length) {
      const expandStart = performance.now();
      const next = expandNavToGroup(nav, hierarchy, hierarchy.roots[0]);
      selectSceneView(indexed, hierarchy, next, { maxNodes: 900, maxEdges: 2400, maxAnimatedEdges: 42 });
      report.timings.expandGroupMs = Number((performance.now() - expandStart).toFixed(2));
    }

    const releaseStart = performance.now();
    resources.mesh.removeFromParent();
    resources.geometry.dispose();
    resources.material.dispose();
    resources.renderer.dispose();
    releaseHierarchy(hierarchy);
    releaseIndexedGraph(indexed);
    report.timings.releaseMs = Number((performance.now() - releaseStart).toFixed(2));
    report.memory.afterRelease = mem();
  } catch (error) {
    report.error = { name: error.name, message: error.message };
  }

  out.textContent = JSON.stringify(report, null, 2);
  runButton.disabled = false;
});
