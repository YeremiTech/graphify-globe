import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { WORLD_COUNTRIES } from '../data/world-data.js';

const RADIUS = 1.5;
/** Distancia inicial de la cámara (más lejos = globo más pequeño al cargar). */
const CAMERA_Z_DEFAULT = 5.85;
/** Límites de zoom (rueda del ratón y pellizco con los dedos). */
const CAMERA_Z_MIN = 3.0;
const CAMERA_Z_MAX = 9.2;
const NODE_COLORS = {
  project: '#5ce0a8',
  module: '#9c68ff',
  package: '#9c68ff',
  directory: '#4aa3d8',
  file: '#2d8cff',
  class: '#39e97e',
  interface: '#35dcff',
  function: '#f02ba6',
  method: '#f02ba6',
  type: '#7ad4ff',
  enum: '#c4f06a',
  endpoint: '#ffca4b',
  table: '#e8f12f',
  config: '#ff7a33',
  document: '#8fd4b8',
  image: '#66c2ff',
  external: '#a0b8ad',
  unknown: '#b7dfcf',
  default: '#b7dfcf',
};
const SELECTED_COLOR = 0xf4fff9;
const OUTGOING_COLOR = 0xff4db8;
const INCOMING_COLOR = 0x37dfff;
const BIDIRECTIONAL_COLOR = 0xffd166;
const DIMMED_COLOR = 0x0b2419;
const DEFAULT_YAW = -0.45;
const DEFAULT_PITCH = -0.12;
const WORLD_Y_AXIS = new THREE.Vector3(0, 1, 0);
const AUTO_ROTATE_STEP = new THREE.Quaternion().setFromAxisAngle(WORLD_Y_AXIS, 0.00115);

function applyOrbit(context) {
  context.globe.quaternion.copy(context.orbitQuaternion);
}

function syncOrbit(context) {
  context.orbitQuaternion.copy(context.globe.quaternion);
}

function resetOrbit(context) {
  context.orbitQuaternion.setFromEuler(
    new THREE.Euler(DEFAULT_PITCH, DEFAULT_YAW, 0, 'XYZ'),
  );
  context.globe.quaternion.copy(context.orbitQuaternion);
}

function lonLatToVector(lon, lat, radius = RADIUS) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

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
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x7cb29c,
    size: 0.013,
    transparent: true,
    opacity: 0.62,
    sizeAttenuation: true,
    depthWrite: false,
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
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x174b3a,
    transparent: true,
    opacity: 0.24,
  });
  return new THREE.LineSegments(geometry, material);
}

function collectRings(value, output) {
  if (!Array.isArray(value) || value.length === 0) return;
  const first = value[0];
  if (
    Array.isArray(first) &&
    first.length >= 2 &&
    Number.isFinite(Number(first[0])) &&
    Number.isFinite(Number(first[1]))
  ) {
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
          ...lonLatToVector(lonB, latB, RADIUS * 1.003).toArray(),
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x5a8b76,
    transparent: true,
    opacity: 0.34,
  });
  return new THREE.LineSegments(geometry, material);
}

function arcPoint(start, end, t, lift = 0.12) {
  const a = start.clone().normalize();
  const b = end.clone().normalize();
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const omega = Math.acos(dot);
  let point;

  if (omega < 0.0001) {
    point = a.lerp(b, t).normalize();
  } else {
    const sinOmega = Math.sin(omega);
    point = a
      .multiplyScalar(Math.sin((1 - t) * omega) / sinOmega)
      .add(b.multiplyScalar(Math.sin(t * omega) / sinOmega));
  }

  const altitude = RADIUS * (1.018 + Math.sin(Math.PI * t) * lift);
  return point.normalize().multiplyScalar(altitude);
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
  });
}

export default function GlobeScene({
  graph,
  autoRotate,
  selectedIndex,
  resetToken,
  onNodeSelect,
  onNodeHover,
}) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const graphRef = useRef(graph);
  const autoRotateRef = useRef(autoRotate);
  const onSelectRef = useRef(onNodeSelect);
  const onHoverRef = useRef(onNodeHover);
  const selectedRef = useRef(selectedIndex);

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
    selectedRef.current = selectedIndex;
    const context = sceneRef.current;
    if (!context) return;

    if (context.focusGroup) {
      context.dataGroup.remove(context.focusGroup);
      disposeObject(context.focusGroup);
      context.focusGroup = null;
      context.focusParticles = null;
      context.focusParticleData = [];
    }

    const node = graphRef.current?.nodes[selectedIndex];
    if (!node) {
      context.selection.visible = false;
      context.focusQuaternion = null;
      if (context.nodesMesh && context.baseColors.length) {
        context.baseColors.forEach((color, index) => context.nodesMesh.setColorAt(index, color));
        if (context.nodesMesh.instanceColor) context.nodesMesh.instanceColor.needsUpdate = true;
      }
      if (context.edgeLines) context.edgeLines.material.opacity = 0.19;
      if (context.particles) context.particles.material.opacity = 0.88;
      return;
    }

    context.selection.position.copy(lonLatToVector(node.lon, node.lat, RADIUS * 1.028));
    context.selection.visible = true;
    const selectedVector = context.nodeVectors[selectedIndex] || lonLatToVector(node.lon, node.lat, RADIUS * 1.022);
    context.focusQuaternion = new THREE.Quaternion().setFromUnitVectors(
      selectedVector.clone().normalize(),
      new THREE.Vector3(0, 0, 1),
    );

    const focusEdges = [];
    const relationStates = new Map();
    const directed = graphRef.current?.directed !== false;

    for (const edge of graphRef.current.edges) {
      if (edge.source !== selectedIndex && edge.target !== selectedIndex) continue;
      focusEdges.push(edge);
      const neighborIndex = edge.source === selectedIndex ? edge.target : edge.source;
      const state = relationStates.get(neighborIndex) || { incoming: false, outgoing: false, connected: false };
      if (!directed) {
        state.connected = true;
      } else {
        if (edge.source === selectedIndex) state.outgoing = true;
        if (edge.target === selectedIndex) state.incoming = true;
      }
      relationStates.set(neighborIndex, state);
    }

    if (context.nodesMesh && context.baseColors.length) {
      const dimmed = new THREE.Color(DIMMED_COLOR);
      const selectedColor = new THREE.Color(SELECTED_COLOR);
      const outgoingColor = new THREE.Color(OUTGOING_COLOR);
      const incomingColor = new THREE.Color(INCOMING_COLOR);
      const bidirectionalColor = new THREE.Color(BIDIRECTIONAL_COLOR);

      context.baseColors.forEach((baseColor, index) => {
        if (index === selectedIndex) {
          context.nodesMesh.setColorAt(index, selectedColor);
          return;
        }
        const state = relationStates.get(index);
        if (!state) {
          context.nodesMesh.setColorAt(index, dimmed);
        } else if (!directed || state.connected) {
          context.nodesMesh.setColorAt(index, bidirectionalColor);
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

    if (context.edgeLines) context.edgeLines.material.opacity = 0.035;
    if (context.particles) context.particles.material.opacity = 0.16;

    const focusGroup = new THREE.Group();
    context.dataGroup.add(focusGroup);
    context.focusGroup = focusGroup;

    const incomingVertices = [];
    const outgoingVertices = [];
    const connectedVertices = [];
    const particleData = [];

    for (const edge of focusEdges) {
      const start = context.nodeVectors[edge.source];
      const end = context.nodeVectors[edge.target];
      if (!start || !end) continue;
      const target = !directed
        ? connectedVertices
        : edge.source === selectedIndex
          ? outgoingVertices
          : incomingVertices;
      const lift = edge.confidence === 'INFERRED' ? 0.155 : 0.12;
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
          phase: (particleData.length * 0.38196601125) % 1,
          speed: 0.18 + (particleData.length % 6) * 0.017,
          lift,
          incoming: directed ? edge.target === selectedIndex : false,
          connected: !directed,
        });
      }
    }

    const addLines = (vertices, color) => {
      if (!vertices.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.renderOrder = 8;
      focusGroup.add(lines);
    };

    if (directed) {
      addLines(outgoingVertices, OUTGOING_COLOR);
      addLines(incomingVertices, INCOMING_COLOR);
    } else {
      addLines(connectedVertices, BIDIRECTIONAL_COLOR);
    }

    const glowPositions = [];
    const glowColors = [];
    const addGlow = (index, colorValue) => {
      const vector = context.nodeVectors[index];
      if (!vector) return;
      const color = new THREE.Color(colorValue);
      glowPositions.push(vector.x, vector.y, vector.z);
      glowColors.push(color.r, color.g, color.b);
    };

    addGlow(selectedIndex, SELECTED_COLOR);
    relationStates.forEach((state, index) => {
      if (!directed || state.connected) addGlow(index, BIDIRECTIONAL_COLOR);
      else if (state.incoming && state.outgoing) addGlow(index, BIDIRECTIONAL_COLOR);
      else if (state.incoming) addGlow(index, INCOMING_COLOR);
      else addGlow(index, OUTGOING_COLOR);
    });

    if (glowPositions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(glowColors, 3));
      const material = new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.072,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const glows = new THREE.Points(geometry, material);
      glows.renderOrder = 9;
      focusGroup.add(glows);
    }

    if (particleData.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleData.length * 3), 3));
      const colors = new Float32Array(particleData.length * 3);
      particleData.forEach((particle, index) => {
        const color = new THREE.Color(
          particle.connected
            ? BIDIRECTIONAL_COLOR
            : particle.incoming
              ? INCOMING_COLOR
              : OUTGOING_COLOR,
        );
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      });
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.058,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const particles = new THREE.Points(geometry, material);
      particles.renderOrder = 10;
      focusGroup.add(particles);
      context.focusParticles = particles;
      context.focusParticleData = particleData;
    }
  }, [selectedIndex]);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;
    context.camera.position.set(0, 0, CAMERA_Z_DEFAULT);
    context.focusQuaternion = null;
    resetOrbit(context);
  }, [resetToken]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010503, 0.052);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    // Arranca más alejada para que el globo no ocupe toda la pantalla al inicio.
    camera.position.set(0, 0, CAMERA_Z_DEFAULT);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const globe = new THREE.Group();
    scene.add(globe);

    scene.add(makeStars());

    const ambient = new THREE.AmbientLight(0x85b7a3, 1.1);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xb9ffe3, 2.2);
    keyLight.position.set(-2, 3, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x087c55, 1.8);
    rimLight.position.set(3, -1, -3);
    scene.add(rimLight);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 0x07110d,
        emissive: 0x03110b,
        specular: 0x1e5d46,
        shininess: 38,
        transparent: true,
        opacity: 0.98,
      }),
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
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.1, 64, 64),
      atmosphereMaterial,
    );
    scene.add(atmosphere);

    const dataGroup = new THREE.Group();
    globe.add(dataGroup);

    const selection = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
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
      lastY: 0,
    };

    // Estado del pellizco (pinch-to-zoom) con dos dedos.
    const pinchState = {
      active: false,
      startDistance: 0,
      startZ: CAMERA_Z_DEFAULT,
    };

    const touchDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const applyZoomDelta = (delta) => {
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z + delta,
        CAMERA_Z_MIN,
        CAMERA_Z_MAX,
      );
    };

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
      orbitQuaternion: new THREE.Quaternion(),
      animationFrame: 0,
      clock: new THREE.Clock(),
    };
    sceneRef.current = context;
    resetOrbit(context);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const hitTest = (event, select = false) => {
      if (!context.nodesMesh || !graphRef.current) {
        onHoverRef.current?.(null, null);
        return null;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const [hit] = raycaster.intersectObject(context.nodesMesh, false);
      const node = Number.isInteger(hit?.instanceId)
        ? graphRef.current.nodes[hit.instanceId]
        : null;
      renderer.domElement.style.cursor = node ? 'pointer' : dragState.active ? 'grabbing' : 'grab';
      if (select) onSelectRef.current?.(node);
      else onHoverRef.current?.(node, node ? { x: event.clientX, y: event.clientY } : null);
      return node;
    };

    const onPointerDown = (event) => {
      // Con pellizco activo no iniciar arrastre de rotación.
      if (pinchState.active) return;
      dragState.active = true;
      syncOrbit(context);
      context.focusQuaternion = null;
      dragState.moved = false;
      dragState.startX = event.clientX;
      dragState.startY = event.clientY;
      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onPointerMove = (event) => {
      if (pinchState.active) return;
      if (dragState.active) {
        const dx = event.clientX - dragState.lastX;
        const dy = event.clientY - dragState.lastY;
        if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) {
          dragState.moved = true;
        }
        const pitchAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(context.orbitQuaternion);
        context.orbitQuaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(pitchAxis, dy * 0.0042),
        );
        context.orbitQuaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(WORLD_Y_AXIS, dx * 0.0052),
        );
        applyOrbit(context);
        dragState.lastX = event.clientX;
        dragState.lastY = event.clientY;
        onHoverRef.current?.(null, null);
      } else {
        hitTest(event, false);
      }
    };

    const onPointerUp = (event) => {
      if (!dragState.active) return;
      const shouldSelect = !dragState.moved && !pinchState.active;
      dragState.active = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grab';
      if (shouldSelect) hitTest(event, true);
    };

    const onPointerLeave = () => {
      if (!dragState.active) onHoverRef.current?.(null, null);
    };

    const onWheel = (event) => {
      event.preventDefault();
      applyZoomDelta(event.deltaY * 0.0028);
    };

    // —— Pinch-to-zoom (móvil / trackpad multitáctil) ——
    const onTouchStart = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        dragState.active = false;
        pinchState.active = true;
        pinchState.startDistance = touchDistance(event.touches);
        pinchState.startZ = camera.position.z;
        syncOrbit(context);
        context.focusQuaternion = null;
        onHoverRef.current?.(null, null);
      }
    };

    const onTouchMove = (event) => {
      if (!pinchState.active || event.touches.length !== 2) return;
      event.preventDefault();
      const distance = touchDistance(event.touches);
      if (pinchState.startDistance <= 0) return;
      // Más separación → acercar (z menor); menos separación → alejar.
      const scale = pinchState.startDistance / distance;
      camera.position.z = THREE.MathUtils.clamp(
        pinchState.startZ * scale,
        CAMERA_Z_MIN,
        CAMERA_Z_MAX,
      );
    };

    const onTouchEnd = (event) => {
      if (event.touches.length < 2) {
        pinchState.active = false;
        pinchState.startDistance = 0;
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd);
    renderer.domElement.addEventListener('touchcancel', onTouchEnd);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const animate = () => {
      context.animationFrame = requestAnimationFrame(animate);
      const elapsed = context.clock.getElapsedTime();

      if (context.focusQuaternion && !dragState.active) {
        globe.quaternion.slerp(context.focusQuaternion, 0.075);
        if (globe.quaternion.angleTo(context.focusQuaternion) < 0.002) {
          context.focusQuaternion = null;
          syncOrbit(context);
        }
      } else if (autoRotateRef.current && !dragState.active) {
        context.orbitQuaternion.premultiply(AUTO_ROTATE_STEP);
        applyOrbit(context);
      }
      atmosphere.rotation.y -= 0.0002;

      if (selection.visible) {
        const pulse = 1 + Math.sin(elapsed * 5.2) * 0.22;
        selection.scale.setScalar(pulse);
        selection.material.opacity = 0.55 + Math.sin(elapsed * 5.2) * 0.25;
      }

      if (context.particles && context.particleData.length) {
        const attribute = context.particles.geometry.getAttribute('position');
        for (let index = 0; index < context.particleData.length; index += 1) {
          const particle = context.particleData[index];
          const t = (particle.phase + elapsed * particle.speed) % 1;
          const point = arcPoint(particle.start, particle.end, t, particle.lift);
          attribute.setXYZ(index, point.x, point.y, point.z);
        }
        attribute.needsUpdate = true;
      }

      if (context.focusParticles && context.focusParticleData.length) {
        const attribute = context.focusParticles.geometry.getAttribute('position');
        for (let index = 0; index < context.focusParticleData.length; index += 1) {
          const particle = context.focusParticleData[index];
          const base = (particle.phase + elapsed * particle.speed) % 1;
          const t = particle.incoming ? base : base;
          const point = arcPoint(particle.start, particle.end, t, particle.lift);
          attribute.setXYZ(index, point.x, point.y, point.z);
        }
        attribute.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(context.animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);
      renderer.domElement.removeEventListener('touchcancel', onTouchEnd);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    graphRef.current = graph;
    const context = sceneRef.current;
    if (!context) return;

    for (const child of [...context.dataGroup.children]) {
      if (child === context.selection) continue;
      context.dataGroup.remove(child);
      disposeObject(child);
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
    context.selection.visible = false;

    if (!graph?.nodes?.length) return;

    const nodeRadius = graph.nodes.length > 1400
      ? 0.0115
      : graph.nodes.length > 900
        ? 0.013
        : graph.nodes.length > 500
          ? 0.015
          : 0.018;
    const nodeGeometry = new THREE.SphereGeometry(nodeRadius, 9, 9);
    const nodeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const nodesMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, graph.nodes.length);
    nodesMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    nodesMesh.renderOrder = 4;
    const dummy = new THREE.Object3D();
    const colors = [];

    for (let index = 0; index < graph.nodes.length; index += 1) {
      const node = graph.nodes[index];
      const vector = lonLatToVector(node.lon, node.lat, RADIUS * 1.022);
      context.nodeVectors[index] = vector;
      const scale = 0.82 + Math.min(2.35, Math.log2(node.degree + 2) * 0.29);
      dummy.position.copy(vector);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      nodesMesh.setMatrixAt(index, dummy.matrix);
      const color = new THREE.Color(node.color || NODE_COLORS[node.kind] || NODE_COLORS.default);
      nodesMesh.setColorAt(index, color);
      colors.push(color.clone());
    }
    nodesMesh.instanceMatrix.needsUpdate = true;
    if (nodesMesh.instanceColor) nodesMesh.instanceColor.needsUpdate = true;
    context.dataGroup.add(nodesMesh);
    context.nodesMesh = nodesMesh;
    context.baseColors = colors;

    const edgeVertices = [];
    for (const edge of graph.edges) {
      const start = context.nodeVectors[edge.source];
      const end = context.nodeVectors[edge.target];
      if (!start || !end) continue;
      const segments = edge.confidence === 'AMBIGUOUS' ? 7 : 11;
      const lift = edge.confidence === 'INFERRED' ? 0.105 : 0.075;
      let previous = arcPoint(start, end, 0, lift);
      for (let segment = 1; segment <= segments; segment += 1) {
        const current = arcPoint(start, end, segment / segments, lift);
        edgeVertices.push(...previous.toArray(), ...current.toArray());
        previous = current;
      }
    }
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x2dbd82,
      transparent: true,
      opacity: 0.19,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.renderOrder = 2;
    context.dataGroup.add(edgeLines);
    context.edgeLines = edgeLines;

    const particleCount = Math.min(graph.maxAnimatedEdges || 42, graph.edges.length);
    if (particleCount > 0) {
      const particlePositions = new Float32Array(particleCount * 3);
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
      const particleMaterial = new THREE.PointsMaterial({
        color: 0xb4ffe1,
        size: 0.032,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      particles.renderOrder = 5;
      context.dataGroup.add(particles);
      context.particles = particles;
      context.particleData = Array.from({ length: particleCount }, (_, index) => {
        const edge = graph.edges[(index * 37) % graph.edges.length];
        return {
          start: context.nodeVectors[edge.source],
          end: context.nodeVectors[edge.target],
          phase: (index * 0.61803398875) % 1,
          speed: 0.08 + (index % 7) * 0.012,
          lift: edge.confidence === 'INFERRED' ? 0.105 : 0.075,
        };
      });
    }
  }, [graph]);

  return <div ref={hostRef} className="globe-host" aria-label="Globo 3D del grafo" />;
}
