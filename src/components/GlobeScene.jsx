import { jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { WORLD_COUNTRIES } from "../data/world-data.js";
import { createFpsMonitor } from "../lib/progressiveRender.js";
import {
  chooseAutomaticProfile,
  computeLodLevel,
  getProfileLimits,
  resolveRenderProfile
} from "../lib/renderQuality.js";
import {
  arcPoint,
  disposeSharedSceneResources,
  lonLatToVector,
  resolvePickNode,
  startGraphBuild
} from "../lib/sceneGraphBuilder.js";
import {
  disposeObject,
  disposeRenderer
} from "../lib/threeDispose.js";
const RADIUS = 1.5;
const SELECTED_COLOR = 16056313;
const OUTGOING_COLOR = 16731576;
const INCOMING_COLOR = 3661823;
const BIDIRECTIONAL_COLOR = 16765286;
const DIMMED_COLOR = 730137;
function makeStars() {
  const count = 1800;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 7 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 8172188,
    size: 0.013,
    transparent: true,
    opacity: 0.62,
    sizeAttenuation: true,
    depthWrite: false
  });
  return new THREE.Points(geometry, material);
}
function createGraticule() {
  const vertices = [];
  const pushLine = (points) => {
    for (let index = 0; index < points.length - 1; index += 1) {
      vertices.push(...points[index].toArray(), ...points[index + 1].toArray());
    }
  };
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = [];
    for (let lon = -180; lon <= 180; lon += 4) {
      points.push(lonLatToVector(lon, lat, RADIUS * 1.001));
    }
    pushLine(points);
  }
  for (let lon = -150; lon <= 180; lon += 30) {
    const points = [];
    for (let lat = -88; lat <= 88; lat += 4) {
      points.push(lonLatToVector(lon, lat, RADIUS * 1.001));
    }
    pushLine(points);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({
    color: 1526586,
    transparent: true,
    opacity: 0.24
  });
  return new THREE.LineSegments(geometry, material);
}
function collectRings(value, output) {
  if (!Array.isArray(value) || value.length === 0) return;
  const first = value[0];
  if (Array.isArray(first) && first.length >= 2 && Number.isFinite(Number(first[0])) && Number.isFinite(Number(first[1]))) {
    output.push(value);
    return;
  }
  for (const child of value) collectRings(child, output);
}
function createCountryOutlines() {
  const vertices = [];
  for (const country of WORLD_COUNTRIES) {
    const rings = [];
    collectRings(country.p, rings);
    for (const ring of rings) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const [lonA, latA] = ring[index];
        const [lonB, latB] = ring[index + 1];
        if (Math.abs(lonA - lonB) > 170) continue;
        vertices.push(
          ...lonLatToVector(lonA, latA, RADIUS * 1.003).toArray(),
          ...lonLatToVector(lonB, latB, RADIUS * 1.003).toArray()
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({
    color: 5933942,
    transparent: true,
    opacity: 0.34
  });
  return new THREE.LineSegments(geometry, material);
}
function toRenderIndex(context, sourceIndex) {
  if (!Number.isInteger(sourceIndex)) return -1;
  if (context.sourceToRender?.has(sourceIndex)) {
    return context.sourceToRender.get(sourceIndex);
  }
  if (!context.renderIndexToSource?.length) return sourceIndex;
  return -1;
}
function clearFocusOverlay(context) {
  if (!context.focusGroup) return;
  context.dataGroup.remove(context.focusGroup);
  disposeObject(context.focusGroup);
  context.focusGroup = null;
  context.focusParticles = null;
  context.focusParticleData = [];
}
function applySelectionHighlight(context, selectedIndex, graph) {
  clearFocusOverlay(context);
  const selectedRender = toRenderIndex(context, selectedIndex);
  const node = graph?.nodes?.[selectedIndex];
  if (!node || selectedRender < 0) {
    context.selection.visible = false;
    context.focusQuaternion = null;
    if (context.nodesMesh && context.baseColors.length) {
      context.baseColors.forEach((color, index) => context.nodesMesh.setColorAt(index, color));
      if (context.nodesMesh.instanceColor) context.nodesMesh.instanceColor.needsUpdate = true;
    }
    if (context.edgeLines?.material) context.edgeLines.material.opacity = 0.19;
    if (context.particles?.material) context.particles.material.opacity = 0.88;
    return;
  }
  context.selection.position.copy(lonLatToVector(node.lon, node.lat, RADIUS * 1.028));
  context.selection.visible = true;
  const selectedVector = context.nodeVectors[selectedRender] || lonLatToVector(node.lon, node.lat, RADIUS * 1.022);
  context.focusQuaternion = new THREE.Quaternion().setFromUnitVectors(
    selectedVector.clone().normalize(),
    new THREE.Vector3(0, 0, 1)
  );
  const focusEdges = [];
  const relationStates = /* @__PURE__ */ new Map();
  for (const edge of graph.edges) {
    if (edge.source !== selectedIndex && edge.target !== selectedIndex) continue;
    focusEdges.push(edge);
    const neighborIndex = edge.source === selectedIndex ? edge.target : edge.source;
    const neighborRender = toRenderIndex(context, neighborIndex);
    if (neighborRender < 0) continue;
    const state = relationStates.get(neighborRender) || { incoming: false, outgoing: false };
    if (edge.source === selectedIndex) state.outgoing = true;
    if (edge.target === selectedIndex) state.incoming = true;
    relationStates.set(neighborRender, state);
  }
  if (context.nodesMesh && context.baseColors.length) {
    const dimmed = new THREE.Color(DIMMED_COLOR);
    const selectedColor = new THREE.Color(SELECTED_COLOR);
    const outgoingColor = new THREE.Color(OUTGOING_COLOR);
    const incomingColor = new THREE.Color(INCOMING_COLOR);
    const bidirectionalColor = new THREE.Color(BIDIRECTIONAL_COLOR);
    context.baseColors.forEach((baseColor, index) => {
      if (index === selectedRender) {
        context.nodesMesh.setColorAt(index, selectedColor);
        return;
      }
      const state = relationStates.get(index);
      if (!state) {
        context.nodesMesh.setColorAt(index, dimmed);
      } else if (state.incoming && state.outgoing) {
        context.nodesMesh.setColorAt(index, bidirectionalColor);
      } else if (state.incoming) {
        context.nodesMesh.setColorAt(index, incomingColor);
      } else {
        context.nodesMesh.setColorAt(index, outgoingColor);
      }
    });
    if (context.nodesMesh.instanceColor) context.nodesMesh.instanceColor.needsUpdate = true;
  }
  if (context.edgeLines?.material) context.edgeLines.material.opacity = 0.035;
  if (context.particles?.material) context.particles.material.opacity = 0.16;
  const focusGroup = new THREE.Group();
  context.dataGroup.add(focusGroup);
  context.focusGroup = focusGroup;
  const incomingVertices = [];
  const outgoingVertices = [];
  const particleData = [];
  for (const edge of focusEdges) {
    const startRender = toRenderIndex(context, edge.source);
    const endRender = toRenderIndex(context, edge.target);
    const start = context.nodeVectors[startRender];
    const end = context.nodeVectors[endRender];
    if (!start || !end) continue;
    const target = edge.source === selectedIndex ? outgoingVertices : incomingVertices;
    const lift = edge.confidence === "INFERRED" ? 0.155 : 0.12;
    let previous = arcPoint(start, end, 0, lift);
    for (let segment = 1; segment <= 24; segment += 1) {
      const current = arcPoint(start, end, segment / 24, lift);
      target.push(...previous.toArray(), ...current.toArray());
      previous = current;
    }
    if (particleData.length < 180) {
      particleData.push({
        start,
        end,
        phase: particleData.length * 0.38196601125 % 1,
        speed: 0.18 + particleData.length % 6 * 0.017,
        lift,
        incoming: edge.target === selectedIndex
      });
    }
  }
  const addLines = (vertices, color) => {
    if (!vertices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 8;
    focusGroup.add(lines);
  };
  addLines(outgoingVertices, OUTGOING_COLOR);
  addLines(incomingVertices, INCOMING_COLOR);
  const glowPositions = [];
  const glowColors = [];
  const addGlow = (renderIndex, colorValue) => {
    const vector = context.nodeVectors[renderIndex];
    if (!vector) return;
    const color = new THREE.Color(colorValue);
    glowPositions.push(vector.x, vector.y, vector.z);
    glowColors.push(color.r, color.g, color.b);
  };
  addGlow(selectedRender, SELECTED_COLOR);
  relationStates.forEach((state, index) => {
    if (state.incoming && state.outgoing) addGlow(index, BIDIRECTIONAL_COLOR);
    else if (state.incoming) addGlow(index, INCOMING_COLOR);
    else addGlow(index, OUTGOING_COLOR);
  });
  if (glowPositions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(glowPositions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(glowColors, 3));
    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.072,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    const glows = new THREE.Points(geometry, material);
    glows.renderOrder = 9;
    focusGroup.add(glows);
  }
  if (particleData.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(particleData.length * 3), 3));
    const colors = new Float32Array(particleData.length * 3);
    particleData.forEach((particle, index) => {
      const color = new THREE.Color(particle.incoming ? INCOMING_COLOR : OUTGOING_COLOR);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    });
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.058,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(geometry, material);
    particles.renderOrder = 10;
    focusGroup.add(particles);
    context.focusParticles = particles;
    context.focusParticleData = particleData;
  }
}
function applyPixelRatio(renderer, host, importQuality, observedFps, graph) {
  const profile = resolveRenderProfile(importQuality);
  let limits = getProfileLimits(profile);
  if (profile === "automatico") {
    const chosen = chooseAutomaticProfile({
      nodeCount: graph?.nodes?.length || 0,
      edgeCount: graph?.edges?.length || 0,
      viewportPixels: Math.max(1, host.clientWidth * host.clientHeight),
      devicePixelRatio: window.devicePixelRatio || 1,
      observedFps,
      deviceMemoryGb: typeof navigator !== "undefined" ? navigator.deviceMemory : null,
      saveData: typeof navigator !== "undefined" ? Boolean(navigator.connection?.saveData) : false
    });
    limits = getProfileLimits(chosen);
  }
  const ratio = Math.min(window.devicePixelRatio || 1, limits.maxPixelRatio || 2);
  renderer.setPixelRatio(ratio);
  return limits;
}
function GlobeScene({
  graph,
  autoRotate,
  selectedIndex,
  resetToken,
  onNodeSelect,
  onNodeHover,
  quality = "equilibrado",
  searchActive = false,
  searchIds = null,
  onRenderInfo
}) {
  const hostRef = useRef(null);
  const reducedMotionRef = useRef(false);
  const sceneRef = useRef(null);
  const graphRef = useRef(graph);
  const autoRotateRef = useRef(autoRotate);
  const onSelectRef = useRef(onNodeSelect);
  const onHoverRef = useRef(onNodeHover);
  const selectedRef = useRef(selectedIndex);
  const qualityRef = useRef(quality);
  const searchActiveRef = useRef(searchActive);
  const searchIdsRef = useRef(searchIds);
  const onRenderInfoRef = useRef(onRenderInfo);
  const lodTimerRef = useRef(0);
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);
  useEffect(() => {
    onSelectRef.current = onNodeSelect;
  }, [onNodeSelect]);
  useEffect(() => {
    onHoverRef.current = onNodeHover;
  }, [onNodeHover]);
  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);
  useEffect(() => {
    searchActiveRef.current = searchActive;
  }, [searchActive]);
  useEffect(() => {
    searchIdsRef.current = searchIds;
  }, [searchIds]);
  useEffect(() => {
    onRenderInfoRef.current = onRenderInfo;
  }, [onRenderInfo]);
  useEffect(() => {
    selectedRef.current = selectedIndex;
    const context = sceneRef.current;
    if (!context?.nodesMesh) return;
    applySelectionHighlight(context, selectedIndex, graphRef.current);
  }, [selectedIndex]);
  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;
    context.camera.position.set(0, 0, 4.45);
    context.globe.rotation.set(-0.12, -0.45, 0);
    context.cameraMovedAt = performance.now();
  }, [resetToken]);
  useEffect(() => {
    const host = hostRef.current;
    reducedMotionRef.current = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const onMotionChange = (event) => {
      reducedMotionRef.current = event.matches;
    };
    motionQuery?.addEventListener?.("change", onMotionChange);
    if (!host) return void 0;
    let alive = true;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(66819, 0.052);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 4.45);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    applyPixelRatio(renderer, host, qualityRef.current, 60, graphRef.current);
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = -1;
    renderer.domElement.setAttribute("aria-hidden", "true");
    const globe = new THREE.Group();
    globe.rotation.set(-0.12, -0.45, 0);
    scene.add(globe);
    scene.add(makeStars());
    const ambient = new THREE.AmbientLight(8763299, 1.1);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(12189667, 2.2);
    keyLight.position.set(-2, 3, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(556117, 1.8);
    rimLight.position.set(3, -1, -3);
    scene.add(rimLight);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 463117,
        emissive: 200971,
        specular: 1989958,
        shininess: 38,
        transparent: true,
        opacity: 0.98
      })
    );
    globe.add(sphere);
    globe.add(createGraticule());
    globe.add(createCountryOutlines());
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(max(0.0, 0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.15);
          gl_FragColor = vec4(0.03, 0.55, 0.34, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.1, 64, 64),
      atmosphereMaterial
    );
    scene.add(atmosphere);
    const dataGroup = new THREE.Group();
    globe.add(dataGroup);
    const selection = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 16777215,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    selection.visible = false;
    dataGroup.add(selection);
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const dragState = {
      active: false,
      moved: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0
    };
    const fpsMonitor = createFpsMonitor();
    const particlePoint = new THREE.Vector3();
    const context = {
      scene,
      camera,
      renderer,
      globe,
      dataGroup,
      selection,
      nodesMesh: null,
      nodeVectors: [],
      particleData: [],
      particles: null,
      edgeLines: null,
      focusGroup: null,
      focusParticleData: [],
      focusParticles: null,
      baseColors: [],
      focusQuaternion: null,
      animationFrame: 0,
      clock: new THREE.Clock(),
      shared: null,
      progressToken: null,
      cancelGraphBuild: null,
      sourceToRender: /* @__PURE__ */ new Map(),
      renderIndexToSource: [],
      renderNodes: [],
      lastLodLevel: -1,
      lastBuildCameraZ: camera.position.z,
      cameraMovedAt: 0,
      idleParticleSkip: true,
      maxRaycastCandidates: 280,
      fpsMonitor
    };
    sceneRef.current = context;
    const rebuildGraph = (reason = "update") => {
      if (!alive) return;
      const currentGraph = graphRef.current;
      startGraphBuild(context, {
        graph: currentGraph,
        importQuality: qualityRef.current,
        cameraZ: camera.position.z,
        selectedIndex: selectedRef.current,
        searchActive: searchActiveRef.current,
        searchIds: searchIdsRef.current,
        observedFps: fpsMonitor.fps,
        onInfo: (info) => onRenderInfoRef.current?.(info, reason),
        onComplete: () => {
          if (!alive) return;
          applySelectionHighlight(context, selectedRef.current, graphRef.current);
        }
      });
    };
    context.rebuildGraph = rebuildGraph;
    const scheduleLodRebuild = () => {
      if (lodTimerRef.current) window.clearTimeout(lodTimerRef.current);
      lodTimerRef.current = window.setTimeout(() => {
        lodTimerRef.current = 0;
        if (!alive || !graphRef.current?.nodes?.length) return;
        const nextLod = computeLodLevel({
          cameraZ: camera.position.z,
          selectedIndex: selectedRef.current,
          searchActive: searchActiveRef.current,
          hierarchyActive: Boolean(graphRef.current.hierarchyActive),
          expandedGroup: Boolean(graphRef.current.contextGroupId),
          profile: resolveRenderProfile(qualityRef.current),
          observedFps: fpsMonitor.fps
        });
        const zoomDelta = Math.abs(camera.position.z - (context.lastBuildCameraZ || 0));
        if (nextLod !== context.lastLodLevel || zoomDelta > 0.45) {
          rebuildGraph("lod");
        }
      }, 220);
    };
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyPixelRatio(renderer, host, qualityRef.current, fpsMonitor.fps, graphRef.current);
      renderer.setSize(width, height, false);
    };
    const hitTest = (event, select = false) => {
      if (!context.nodesMesh || !graphRef.current) {
        onHoverRef.current?.(null, null);
        return null;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = (event.clientX - rect.left) / rect.width * 2 - 1;
      pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const [hit] = raycaster.intersectObject(context.nodesMesh, false);
      const node = Number.isInteger(hit?.instanceId) ? resolvePickNode(context, graphRef.current, hit.instanceId) : null;
      renderer.domElement.style.cursor = node ? "pointer" : dragState.active ? "grabbing" : "grab";
      if (select) onSelectRef.current?.(node);
      else onHoverRef.current?.(node, node ? { x: event.clientX, y: event.clientY } : null);
      return node;
    };
    const onPointerDown = (event) => {
      host.focus?.({ preventScroll: true });
      dragState.active = true;
      context.focusQuaternion = null;
      dragState.moved = false;
      dragState.startX = event.clientX;
      dragState.startY = event.clientY;
      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;
      context.cameraMovedAt = performance.now();
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerMove = (event) => {
      if (dragState.active) {
        const dx = event.clientX - dragState.lastX;
        const dy = event.clientY - dragState.lastY;
        if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) {
          dragState.moved = true;
        }
        globe.rotation.y += dx * 52e-4;
        globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + dy * 42e-4, -1.15, 1.15);
        dragState.lastX = event.clientX;
        dragState.lastY = event.clientY;
        context.cameraMovedAt = performance.now();
        onHoverRef.current?.(null, null);
      } else {
        hitTest(event, false);
      }
    };
    const onPointerUp = (event) => {
      if (!dragState.active) return;
      const shouldSelect = !dragState.moved;
      dragState.active = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = "grab";
      if (shouldSelect) hitTest(event, true);
    };
    const onPointerLeave = () => {
      if (!dragState.active) onHoverRef.current?.(null, null);
    };
    const onWheel = (event) => {
      event.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 28e-4, 3.1, 6.3);
      context.cameraMovedAt = performance.now();
      scheduleLodRebuild();
    };
    const onHostKeyDown = (event) => {
      const step = event.shiftKey ? 0.12 : 0.055;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        globe.rotation.y -= step;
        context.cameraMovedAt = performance.now();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        globe.rotation.y += step;
        context.cameraMovedAt = performance.now();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x - step, -1.15, 1.15);
        context.cameraMovedAt = performance.now();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + step, -1.15, 1.15);
        context.cameraMovedAt = performance.now();
      } else if (event.key === "+" || event.key === "=" || event.key === "PageUp") {
        event.preventDefault();
        camera.position.z = THREE.MathUtils.clamp(camera.position.z - 0.22, 3.1, 6.3);
        context.cameraMovedAt = performance.now();
        scheduleLodRebuild();
      } else if (event.key === "-" || event.key === "_" || event.key === "PageDown") {
        event.preventDefault();
        camera.position.z = THREE.MathUtils.clamp(camera.position.z + 0.22, 3.1, 6.3);
        context.cameraMovedAt = performance.now();
        scheduleLodRebuild();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onSelectRef.current?.(null);
      }
    };
    host.addEventListener("keydown", onHostKeyDown);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    const animate = () => {
      if (!alive) return;
      context.animationFrame = requestAnimationFrame(animate);
      const now = performance.now();
      fpsMonitor.sample(now);
      const elapsed = context.clock.getElapsedTime();
      const cameraIdle = now - (context.cameraMovedAt || 0) > 180 && !dragState.active && !context.focusQuaternion;
      const reduceMotion = reducedMotionRef.current;
      if (context.focusQuaternion && !dragState.active) {
        if (reduceMotion) {
          globe.quaternion.copy(context.focusQuaternion);
          context.focusQuaternion = null;
        } else {
          globe.quaternion.slerp(context.focusQuaternion, 0.075);
          if (globe.quaternion.angleTo(context.focusQuaternion) < 2e-3) context.focusQuaternion = null;
        }
        context.cameraMovedAt = now;
      } else if (autoRotateRef.current && !dragState.active && !reduceMotion) {
        globe.rotation.y += 115e-5;
      }
      if (!reduceMotion) atmosphere.rotation.y -= 2e-4;
      if (selection.visible) {
        if (reduceMotion) {
          selection.scale.setScalar(1);
          selection.material.opacity = 0.7;
        } else {
          const pulse = 1 + Math.sin(elapsed * 5.2) * 0.22;
          selection.scale.setScalar(pulse);
          selection.material.opacity = 0.55 + Math.sin(elapsed * 5.2) * 0.25;
        }
      }
      const skipParticles = reduceMotion || context.idleParticleSkip && cameraIdle && !context.focusParticles;
      if (!skipParticles && context.particles && context.particleData.length) {
        const attribute = context.particles.geometry.getAttribute("position");
        for (let index = 0; index < context.particleData.length; index += 1) {
          const particle = context.particleData[index];
          const t = (particle.phase + elapsed * particle.speed) % 1;
          arcPoint(particle.start, particle.end, t, particle.lift, particlePoint);
          attribute.setXYZ(index, particlePoint.x, particlePoint.y, particlePoint.z);
        }
        attribute.needsUpdate = true;
      }
      if (context.focusParticles && context.focusParticleData.length) {
        const attribute = context.focusParticles.geometry.getAttribute("position");
        for (let index = 0; index < context.focusParticleData.length; index += 1) {
          const particle = context.focusParticleData[index];
          const t = (particle.phase + elapsed * particle.speed) % 1;
          arcPoint(particle.start, particle.end, t, particle.lift, particlePoint);
          attribute.setXYZ(index, particlePoint.x, particlePoint.y, particlePoint.z);
        }
        attribute.needsUpdate = true;
      }
      if (resolveRenderProfile(qualityRef.current) === "automatico" && graphRef.current?.nodes?.length && now - (context.lastAutoAdaptAt || 0) > 2500) {
        context.lastAutoAdaptAt = now;
        const nextLod = computeLodLevel({
          cameraZ: camera.position.z,
          selectedIndex: selectedRef.current,
          searchActive: searchActiveRef.current,
          hierarchyActive: Boolean(graphRef.current.hierarchyActive),
          expandedGroup: Boolean(graphRef.current.contextGroupId),
          profile: "automatico",
          observedFps: fpsMonitor.fps
        });
        if (nextLod < (context.lastLodLevel ?? 3)) {
          rebuildGraph("fps");
        }
      }
      renderer.render(scene, camera);
    };
    animate();
    if (graphRef.current?.nodes?.length) {
      rebuildGraph("init");
    }
    return () => {
      alive = false;
      cancelAnimationFrame(context.animationFrame);
      context.animationFrame = 0;
      if (lodTimerRef.current) window.clearTimeout(lodTimerRef.current);
      resizeObserver.disconnect();
      motionQuery?.removeEventListener?.("change", onMotionChange);
      host.removeEventListener("keydown", onHostKeyDown);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("wheel", onWheel);
      disposeSharedSceneResources(context);
      disposeObject(scene);
      disposeRenderer(renderer);
      sceneRef.current = null;
    };
  }, []);
  useEffect(() => {
    graphRef.current = graph;
    const context = sceneRef.current;
    if (!context) return;
    applyPixelRatio(context.renderer, hostRef.current, qualityRef.current, context.fpsMonitor?.fps || 60, graph);
    context.rebuildGraph?.("graph");
  }, [graph]);
  useEffect(() => {
    const context = sceneRef.current;
    if (!context || !graphRef.current?.nodes?.length) return;
    applyPixelRatio(context.renderer, hostRef.current, quality, context.fpsMonitor?.fps || 60, graphRef.current);
    context.rebuildGraph?.("quality");
  }, [quality]);
  useEffect(() => {
    const context = sceneRef.current;
    if (!context || !graphRef.current?.nodes?.length) return;
    context.rebuildGraph?.("search");
  }, [searchActive, searchIds]);
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: hostRef,
      className: "globe-host",
      tabIndex: 0,
      "aria-label": "Globo 3D del grafo. Flechas para rotar, más/menos o AvPág/RePág para zoom, Escape para limpiar selección. Usa el panel de búsqueda y las conexiones para elegir nodos sin ratón."
    }
  );
}
export {
  GlobeScene as default
};
