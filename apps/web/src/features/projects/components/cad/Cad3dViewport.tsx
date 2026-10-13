/**
 * True-3D CAD viewport (WebGL / Three.js).
 *
 * Renders the survey model (points, linework, TIN surfaces, text) in an
 * orbitable, hardware-accelerated 3D scene using survey coordinates:
 *   X = Easting (survey `e`), Y = Northing (survey `n`), Z = Elevation/RL.
 *
 * Features:
 * - Perspective / orthographic projection toggle and top-down view.
 * - Soft-shadow directional lighting on surfaces.
 * - Layer visibility, point labels, contour elevation, and text annotation.
 * - Selection highlighting without rebuilding geometry.
 * - 3D distance / bearing / grade measurement tool.
 * - Per-project camera state persistence.
 *
 * Coordinates are recentred on the model centroid before upload to the GPU so
 * large Gauss/UTM values (millions of metres) keep full float precision.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CadModelState, CadSelection, CadToolId } from "./cadModel.ts";
import { isSelected, resolveColor } from "./cadModel.ts";
import { axisLabels, type AxisConvention } from "./cadSettings.ts";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface Cad3dViewportProps {
  model: CadModelState;
  /** Elevation exaggeration factor (1 = true scale). */
  zScale?: number;
  /** Decimal places for the on-canvas coordinate readout. */
  coordDecimals?: number;
  /** Axis-label convention for the coordinate readout / axis legend. */
  axisConvention?: AxisConvention;
  /** Show point number/code labels next to survey points. */
  showPointLabels?: boolean;
  /** Bumping this re-frames the camera to the model extents. */
  fitSignal?: number;
  /** Current CAD selection; selected items are highlighted in 3D. */
  selection?: CadSelection;
  /** Active CAD tool; used to enable 3D measurement. */
  tool?: CadToolId;
  /** Project id used for persisting per-project 3D view state. */
  projectId?: string;
  onCursorMove?: (world: { n: number; e: number; z: number }) => void;
}

interface Bounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  /** Bounding-sphere radius of the (z-scaled) model. */
  radius: number;
}

interface SurveyHit {
  point: THREE.Vector3;
  onSurface: boolean;
}

const HIGHLIGHT_COLOR = 0xfacc15;
const MEASURE_COLOR = 0x38bdf8;
const VIEW_STATE_KEY = "sitesurveyorCad3dView";

function viewStateKey(projectId: string) {
  return `${VIEW_STATE_KEY}:${projectId}`;
}

/**
 * Cut/fill colour ramp. `t` in [-1, 1]: -1 = maximum fill (blue), 0 = balanced
 * (pale neutral), +1 = maximum cut (red). Matches the 2D earthworks palette.
 */
function cutFillColor(t: number): THREE.Color {
  const x = Math.max(-1, Math.min(1, t));
  const lerp = (a: number, b: number, f: number) => (a + (b - a) * f) / 255;
  if (x >= 0) {
    const f = x;
    return new THREE.Color(lerp(232, 224, f), lerp(232, 59, f), lerp(208, 59, f));
  }
  const f = -x;
  return new THREE.Color(lerp(232, 43, f), lerp(232, 123, f), lerp(208, 214, f));
}

/**
 * Build a camera-facing text label as a `THREE.Sprite` backed by a canvas
 * texture. Sprites always face the camera and keep a constant pixel size.
 * The returned sprite carries its texture so callers can dispose it.
 */
function makeLabelSprite(text: string): THREE.Sprite {
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2);
  const fontPx = 15;
  const padX = 6;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontPx}px Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif`;
  const textW = Math.ceil(ctx.measureText(text).width);
  const w = textW + padX * 2;
  const h = fontPx + padX;
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  ctx.scale(dpr, dpr);
  ctx.font = `${fontPx}px Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif`;
  ctx.textBaseline = "middle";
  // Subtle backing plate for contrast against both light TIN and dark canvas.
  ctx.fillStyle = "rgba(12, 12, 24, 0.72)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(text, padX, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(w / h, 1, 1);
  sprite.renderOrder = 10;
  sprite.userData.aspect = w / h;
  return sprite;
}

function isOrthographicCamera(
  camera: THREE.Camera,
): camera is THREE.OrthographicCamera {
  return (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
}

const Cad3dViewportComponent = memo(function Cad3dViewport({
  model,
  zScale = 1,
  coordDecimals = 3,
  axisConvention = "yx",
  showPointLabels = true,
  fitSignal = 0,
  selection,
  tool,
  projectId,
  onCursorMove,
}: Cad3dViewportProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Long-lived Three.js objects, created once and reused across renders.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const selectionRef = useRef<THREE.Group | null>(null);
  const measureRef = useRef<THREE.Group | null>(null);
  const offsetRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const groundRef = useRef<THREE.Mesh | null>(null);

  const [hasGeometry, setHasGeometry] = useState(false);
  const [hasCutFill, setHasCutFill] = useState(false);
  const [readout, setReadout] = useState<{ n: number; e: number; z: number; onSurface: boolean } | null>(null);
  const [orthographic, setOrthographic] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [measureReadout, setMeasureReadout] = useState<string | null>(null);

  const layerColor = useCallback(
    (layerId: string) => model.layers.find((l) => l.id === layerId)?.color,
    [model.layers],
  );
  const layerVisible = useCallback(
    (layerId: string) => {
      const l = model.layers.find((x) => x.id === layerId);
      return !l || l.visible;
    },
    [model.layers],
  );

  const bounds = useMemo<Bounds | null>(() => {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const acc = (x: number, y: number, z: number) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    };
    for (const p of model.points) acc(p.e, p.n, p.z ?? 0);
    for (const lw of model.linework) for (const v of lw.vertices) acc(v.e, v.n, 0);
    for (const t of model.texts) acc(t.e, t.n, 0);
    for (const s of model.surfaces) {
      if (!Array.isArray(s.points)) continue;
      for (const v of s.points) acc(v.e, v.n, v.z);
    }
    for (const a of model.arcs) {
      acc(a.center.e + a.radius, a.center.n, 0);
      acc(a.center.e - a.radius, a.center.n, 0);
      acc(a.center.e, a.center.n + a.radius, 0);
      acc(a.center.e, a.center.n - a.radius, 0);
    }
    for (const c of model.circles) {
      acc(c.center.e + c.radius, c.center.n, 0);
      acc(c.center.e - c.radius, c.center.n, 0);
      acc(c.center.e, c.center.n + c.radius, 0);
      acc(c.center.e, c.center.n - c.radius, 0);
    }
    for (const el of model.ellipses) {
      const rot = el.rotation * (Math.PI / 180);
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        const x = el.semiMajor * Math.cos(t);
        const y = el.semiMinor * Math.sin(t);
        acc(el.center.e + x * cosR - y * sinR, el.center.n + x * sinR + y * cosR, 0);
      }
    }
    for (const d of model.dimensions) {
      for (const v of d.defPoints) acc(v.e, v.n, 0);
      acc(d.textPosition.e, d.textPosition.n, 0);
    }
    for (const h of model.hatches) {
      for (const v of h.vertices) acc(v.e, v.n, 0);
      for (const hole of h.holes ?? []) for (const v of hole) acc(v.e, v.n, 0);
    }
    if (!Number.isFinite(minX)) return null;
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      ((minZ + maxZ) / 2) * zScale,
    );
    return {
      min: new THREE.Vector3(minX, minY, minZ * zScale),
      max: new THREE.Vector3(maxX, maxY, maxZ * zScale),
      center,
      radius: Math.max(Math.hypot(maxX - minX, maxY - minY, (maxZ - minZ) * zScale) / 2, 1),
    };
  }, [model.points, model.linework, model.texts, model.surfaces, model.arcs, model.circles, model.ellipses, model.dimensions, model.hatches, zScale]);

  // One-time renderer / scene / camera / controls setup.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(
      45,
      wrap.clientWidth / Math.max(wrap.clientHeight, 1),
      0.1,
      1e7,
    );
    camera.up.set(0, 0, 1);
    camera.position.set(1, -1, 1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x30323e, 0.85);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(-0.4, -0.5, 1).normalize();
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const grid = new THREE.GridHelper(10, 10, 0x3a3a52, 0x2a2a3e);
    grid.rotation.x = Math.PI / 2;
    grid.name = "datumGrid";
    scene.add(grid);

    const axes = new THREE.AxesHelper(1);
    axes.name = "axesGizmo";
    scene.add(axes);

    const content = new THREE.Group();
    scene.add(content);
    const selectionGroup = new THREE.Group();
    scene.add(selectionGroup);
    const measureGroup = new THREE.Group();
    scene.add(measureGroup);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    contentRef.current = content;
    selectionRef.current = selectionGroup;
    measureRef.current = measureGroup;

    let raf = 0;
    const animate = () => {
      const currentControls = controlsRef.current ?? controls;
      currentControls.update();
      // Always render through the ref so projection/camera switches are reflected
      // without restarting the animation loop.
      const currentCam = cameraRef.current ?? camera;
      renderer.render(scene, currentCam);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const ro = new ResizeObserver(() => {
      const currentCam = cameraRef.current;
      if (!currentCam) return;
      const w = wrap.clientWidth;
      const h = Math.max(wrap.clientHeight, 1);
      renderer.setSize(w, h);
      if (isOrthographicCamera(currentCam)) {
        const viewSize = currentCam.top;
        const aspect = w / h;
        currentCam.left = -viewSize * aspect;
        currentCam.right = viewSize * aspect;
        currentCam.top = viewSize;
        currentCam.bottom = -viewSize;
      } else {
        currentCam.aspect = w / h;
      }
      currentCam.updateProjectionMatrix();
    });
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === wrap) {
        wrap.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      contentRef.current = null;
      selectionRef.current = null;
      measureRef.current = null;
    };
  }, []);

  // ── (Re)build the model geometry when the actual geometry changes ───────────
  // Layer visibility and selection are handled in separate, cheaper effects so
  // toggling a layer or selecting an item does not recreate every mesh and label.
  useEffect(() => {
    const content = contentRef.current;
    const scene = sceneRef.current;
    if (!content || !scene) return;

    disposeGroup(content);
    groundRef.current = null;

    const offset = bounds ? bounds.center.clone() : new THREE.Vector3();
    offsetRef.current = offset;
    const local = (e: number, n: number, z: number) =>
      new THREE.Vector3(e - offset.x, n - offset.y, z * zScale - offset.z);

    let cutFillPresent = false;

    // TIN surfaces.
    for (const srf of model.surfaces) {
      if (!srf.visible) continue;
      if (!Array.isArray(srf.points) || !Array.isArray(srf.triangles)) continue;
      const base = resolveColor(undefined, layerColor(srf.layerId), "#3a6ea5");
      const baseColor = new THREE.Color(base);
      const cf = srf.cutFill;
      if (cf) cutFillPresent = true;
      const cfScale = cf ? Math.max(cf.maxCut, cf.maxFill, 1e-6) : 0;
      const cfByKey = new Map<string, number>();
      if (cf && Array.isArray(cf.triangles)) for (const ct of cf.triangles) cfByKey.set(`${ct.a},${ct.b},${ct.c}`, ct.delta);
      const ss = srf.slopeShade;
      const ssByKey = new Map<string, string>();
      if (ss && Array.isArray(ss.triangles)) for (const st of ss.triangles) ssByKey.set(`${st.a},${st.b},${st.c}`, st.color);

      const positions: number[] = [];
      const colors: number[] = [];
      for (const t of srf.triangles) {
        const va = srf.points[t.a];
        const vb = srf.points[t.b];
        const vc = srf.points[t.c];
        if (!va || !vb || !vc) continue;
        const pa = local(va.e, va.n, va.z);
        const pb = local(vb.e, vb.n, vb.z);
        const pc = local(vc.e, vc.n, vc.z);
        const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
        if (cross < 0) {
          positions.push(pa.x, pa.y, pa.z, pc.x, pc.y, pc.z, pb.x, pb.y, pb.z);
        } else {
          positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z);
        }
        let col = baseColor;
        if (cf) col = cutFillColor((cfByKey.get(`${t.a},${t.b},${t.c}`) ?? 0) / cfScale);
        else if (ss) {
          const hex = ssByKey.get(`${t.a},${t.b},${t.c}`);
          if (hex) col = new THREE.Color(hex);
        }
        for (let i = 0; i < 3; i++) colors.push(col.r, col.g, col.b);
      }
      if (positions.length === 0) continue;

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geom.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = 0;
      mesh.userData = { layerId: srf.layerId, entityType: "surface", id: srf.id };
      content.add(mesh);

      const solid = cf != null || ss != null;
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geom),
        new THREE.LineBasicMaterial({
          color: solid ? 0x222233 : baseColor.clone().multiplyScalar(0.6).getHex(),
          transparent: true,
          opacity: 0.3,
        }),
      );
      wire.renderOrder = 1;
      wire.userData = { layerId: srf.layerId, entityType: "surface", id: srf.id };
      content.add(wire);
    }

    // Linework.
    const isContourLayer = (id: string) => id === "CONTOURS" || id === "CONTOURS_INDEX";
    for (const lw of model.linework) {
      const color = new THREE.Color(resolveColor(lw.color, layerColor(lw.layerId), "#a0b0c8"));
      const vs = lw.vertices;
      if (vs.length < 2) continue;
      const lwZ = isContourLayer(lw.layerId) && lw.label ? parseFloat(lw.label) || 0 : 0;
      const pts: THREE.Vector3[] = vs.map((v) => local(v.e, v.n, lwZ));
      if (lw.closed) pts.push(pts[0].clone());
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: lw.layerId === "CONTOURS_INDEX" ? 1 : 0.85,
        }),
      );
      line.renderOrder = 2;
      line.userData = { layerId: lw.layerId, entityType: "linework", id: lw.id };
      content.add(line);
    }

    // Annotation text labels.
    for (const t of model.texts) {
      const text = t.text?.trim();
      if (!text) continue;
      const sprite = makeLabelSprite(text);
      const c = new THREE.Color(resolveColor(t.color, layerColor(t.layerId), "#e2e8f0"));
      const mat = sprite.material.clone();
      mat.color.set(c);
      mat.color.multiplyScalar(1.15);
      sprite.material = mat;
      const aspect = (sprite.userData.aspect as number) || 1;
      const s = bounds ? Math.max(bounds.radius * 0.014, 0.35) : 0.5;
      sprite.scale.set(s * aspect, s, 1);
      const v = local(t.e, t.n, 0);
      sprite.position.set(v.x, v.y, v.z + s * 0.6);
      sprite.renderOrder = 10;
      sprite.userData = { layerId: t.layerId, entityType: "text", id: t.id };
      content.add(sprite);
    }

    // Survey points — grouped per layer so visibility toggles are cheap.
    const labelSize = bounds ? Math.max(bounds.radius * 0.015, 0.3) : 0.5;
    const pointsByLayer = new Map<string, typeof model.points>();
    for (const p of model.points) {
      const arr = pointsByLayer.get(p.layerId);
      if (arr) arr.push(p);
      else pointsByLayer.set(p.layerId, [p]);
    }
    const MAX_LABELS = 500;
    const totalPointCount = model.points.length;
    const drawLabels = showPointLabels && totalPointCount <= MAX_LABELS;

    for (const [layerId, pts] of pointsByLayer) {
      const positions: number[] = [];
      const colors: number[] = [];
      for (const p of pts) {
        const c = new THREE.Color(resolveColor(p.color, layerColor(layerId), "#e2e8f0"));
        const v = local(p.e, p.n, p.z ?? 0);
        positions.push(v.x, v.y, v.z);
        colors.push(c.r, c.g, c.b);

        if (drawLabels) {
          const text = [p.pointNo, p.code].filter((s) => s && s.trim()).join(" ");
          if (text) {
            const sprite = makeLabelSprite(text);
            const aspect = (sprite.userData.aspect as number) || 1;
            sprite.scale.set(labelSize * aspect, labelSize, 1);
            sprite.position.set(v.x, v.y, v.z + labelSize * 0.75);
            sprite.renderOrder = 10;
            sprite.userData = { layerId, entityType: "point-label", id: p.id };
            content.add(sprite);
          }
        }
      }
      if (positions.length === 0) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true });
      const cloud = new THREE.Points(geom, mat);
      cloud.userData = { layerId, entityType: "points" };
      content.add(cloud);
    }

    // Datum grid / pick plane tied to the model base.
    if (bounds) {
      const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, 10) * 1.3;
      const groundZ = bounds.min.z - offset.z;
      const grid = scene.getObjectByName("datumGrid") as THREE.GridHelper | null;
      if (grid) {
        grid.scale.setScalar(span / 10);
        grid.position.set(0, 0, groundZ);
      }
      const axes = scene.getObjectByName("axesGizmo") as THREE.AxesHelper | null;
      if (axes) axes.scale.setScalar(bounds.radius * 0.25);

      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(span, span),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      g.position.set(0, 0, groundZ);
      groundRef.current = g;
      content.add(g);
    }

    setHasGeometry(!!bounds);
    setHasCutFill(cutFillPresent);
  }, [model, layerColor, bounds, zScale, showPointLabels]);

  // ── Update visibility of existing content when layer visibility changes ─────
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.traverse((obj) => {
      const layerId = (obj.userData as { layerId?: string }).layerId;
      if (typeof layerId === "string") {
        obj.visible = layerVisible(layerId);
      }
    });
  }, [model.layers, layerVisible]);

  // ── Selection highlight overlay (rebuilt only when geometry or selection changes)
  useEffect(() => {
    const selGroup = selectionRef.current;
    if (!selGroup) return;
    disposeGroup(selGroup);
    if (!selection?.items?.length || !bounds) return;

    const offset = offsetRef.current;
    const local = (e: number, n: number, z: number) =>
      new THREE.Vector3(e - offset.x, n - offset.y, z * zScale - offset.z);
    const markerSize = Math.max(bounds.radius * 0.012, 0.25);
    const sphereGeo = new THREE.SphereGeometry(markerSize * 0.7, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color: HIGHLIGHT_COLOR });
    const lineMat = new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR, transparent: true, opacity: 0.95 });

    // Selected points.
    for (const p of model.points) {
      if (!isSelected(selection, "point", p.id)) continue;
      const mesh = new THREE.Mesh(sphereGeo, sphereMat);
      const v = local(p.e, p.n, p.z ?? 0);
      mesh.position.copy(v);
      mesh.renderOrder = 20;
      selGroup.add(mesh);
    }

    // Selected linework.
    const isContourLayer = (id: string) => id === "CONTOURS" || id === "CONTOURS_INDEX";
    for (const lw of model.linework) {
      if (!isSelected(selection, "linework", lw.id)) continue;
      const lwZ = isContourLayer(lw.layerId) && lw.label ? parseFloat(lw.label) || 0 : 0;
      const pts = lw.vertices.map((v) => local(v.e, v.n, lwZ));
      if (lw.closed) pts.push(pts[0].clone());
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geom, lineMat);
      line.renderOrder = 20;
      selGroup.add(line);

      for (const v of pts.slice(0, lw.closed ? -1 : undefined)) {
        const node = new THREE.Mesh(sphereGeo, sphereMat);
        node.position.copy(v);
        node.renderOrder = 21;
        selGroup.add(node);
      }
    }

    // Selected surfaces.
    for (const srf of model.surfaces) {
      if (!isSelected(selection, "surface", srf.id)) continue;
      if (!Array.isArray(srf.points) || !Array.isArray(srf.triangles)) continue;
      const positions: number[] = [];
      for (const t of srf.triangles) {
        const va = srf.points[t.a];
        const vb = srf.points[t.b];
        const vc = srf.points[t.c];
        if (!va || !vb || !vc) continue;
        const pa = local(va.e, va.n, va.z);
        const pb = local(vb.e, vb.n, vb.z);
        const pc = local(vc.e, vc.n, vc.z);
        const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
        if (cross < 0) {
          positions.push(pa.x, pa.y, pa.z, pc.x, pc.y, pc.z, pb.x, pb.y, pb.z);
        } else {
          positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z);
        }
      }
      if (positions.length === 0) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geom),
        new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR, transparent: true, opacity: 0.9 }),
      );
      wire.renderOrder = 20;
      selGroup.add(wire);
    }

    // Selected text labels.
    const highlightSpriteMat = new THREE.SpriteMaterial({
      color: new THREE.Color(HIGHLIGHT_COLOR),
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
      depthWrite: false,
    });
    for (const t of model.texts) {
      if (!isSelected(selection, "text", t.id)) continue;
      const v = local(t.e, t.n, 0);
      const s = bounds ? Math.max(bounds.radius * 0.022, 0.55) : 0.7;
      const sprite = new THREE.Sprite(highlightSpriteMat.clone());
      sprite.scale.set(s * 2.2, s, 1);
      sprite.position.set(v.x, v.y, v.z + s * 0.3);
      sprite.renderOrder = 20;
      selGroup.add(sprite);
    }
  }, [model.points, model.linework, model.texts, model.surfaces, bounds, zScale, selection]);

  // ── Fit camera to extents on first geometry and on the fit signal ───────────
  const didInitialFit = useRef(false);
  const lastFitRadius = useRef(0);
  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    if (!bounds) {
      didInitialFit.current = false;
      lastFitRadius.current = 0;
      return;
    }

    const r = bounds.radius;
    const firstGeometry = !didInitialFit.current;
    const radiusChanged =
      lastFitRadius.current > 0 &&
      Math.abs(r - lastFitRadius.current) / lastFitRadius.current > 0.2;
    const explicit = fitSignal !== 0;
    if (!firstGeometry && !radiusChanged && !explicit) return;

    controls.target.set(0, 0, 0);
    if (isOrthographicCamera(camera)) {
      const wrap = wrapRef.current;
      const aspect = wrap ? wrap.clientWidth / Math.max(wrap.clientHeight, 1) : 1;
      const viewSize = r * 1.35;
      camera.left = -viewSize * aspect;
      camera.right = viewSize * aspect;
      camera.top = viewSize;
      camera.bottom = -viewSize;
      camera.near = 0.1;
      camera.far = 1e7;
      if (!didInitialFit.current) {
        const dir = new THREE.Vector3(0.7, -0.7, 0.6).normalize();
        camera.position.copy(dir.multiplyScalar(Math.max(viewSize * 2, 1)));
      }
    } else {
      const dist = (r / Math.sin((camera.fov * Math.PI) / 180 / 2)) * 1.3;
      const dir = new THREE.Vector3(0.7, -0.7, 0.6).normalize();
      camera.position.copy(dir.multiplyScalar(dist));
      camera.near = Math.max(dist / 1000, 0.01);
      camera.far = dist * 100;
    }
    camera.updateProjectionMatrix();
    controls.update();
    didInitialFit.current = true;
    lastFitRadius.current = r;
  }, [bounds, fitSignal, orthographic]);

  // ── Switch between perspective and orthographic projection ──────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const scene = sceneRef.current;
    const controls = controlsRef.current;
    const oldCam = cameraRef.current;
    if (!wrap || !scene || !controls || !oldCam) return;

    const aspect = wrap.clientWidth / Math.max(wrap.clientHeight, 1);
    const target = controls.target.clone();
    const pos = oldCam.position.clone();
    let zoom = 1;
    if (isOrthographicCamera(oldCam)) zoom = oldCam.zoom;

    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (orthographic) {
      camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 1e7);
      camera.zoom = zoom;
    } else {
      camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1e7);
    }
    camera.position.copy(pos);
    camera.up.set(0, 0, 1);
    scene.remove(oldCam);
    scene.add(camera);
    controls.object = camera;
    controls.target.copy(target);
    cameraRef.current = camera;
    controls.update();
    didInitialFit.current = false;
  }, [orthographic]);

  // ── Load and persist per-project camera state ───────────────────────────────
  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    const wrap = wrapRef.current;
    if (!controls || !camera || !wrap || !projectId) return;

    let orthoTimeoutId: number | undefined;

    // Load saved view once geometry (and therefore bounds) is available.
    if (bounds) {
      const raw = localStorage.getItem(viewStateKey(projectId));
      if (raw) {
        try {
          const saved = JSON.parse(raw) as {
            orthographic?: boolean;
            px?: number; py?: number; pz?: number;
            tx?: number; ty?: number; tz?: number;
            zoom?: number;
          };
          if (
            saved.orthographic !== undefined &&
            typeof saved.px === "number" &&
            typeof saved.tx === "number"
          ) {
            orthoTimeoutId = window.setTimeout(() => setOrthographic(Boolean(saved.orthographic)), 0);
            if (saved.orthographic && isOrthographicCamera(camera)) {
              const aspect = wrap.clientWidth / Math.max(wrap.clientHeight, 1);
              const r = bounds.radius;
              const viewSize = r * 1.35;
              camera.left = -viewSize * aspect;
              camera.right = viewSize * aspect;
              camera.top = viewSize;
              camera.bottom = -viewSize;
              camera.zoom = typeof saved.zoom === "number" ? saved.zoom : 1;
              camera.near = 0.1;
              camera.far = 1e7;
            }
            camera.position.set(saved.px ?? 0, saved.py ?? 0, saved.pz ?? 0);
            controls.target.set(saved.tx ?? 0, saved.ty ?? 0, saved.tz ?? 0);
            camera.updateProjectionMatrix();
            controls.update();
            didInitialFit.current = true;
            lastFitRadius.current = bounds.radius;
          }
        } catch {
          // Ignore malformed storage.
        }
      }
    }

    let saveTimer = 0;
    const save = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        const cam = cameraRef.current;
        const ctrl = controlsRef.current;
        if (!cam || !ctrl) return;
        const payload = {
          orthographic: isOrthographicCamera(cam),
          px: cam.position.x,
          py: cam.position.y,
          pz: cam.position.z,
          tx: ctrl.target.x,
          ty: ctrl.target.y,
          tz: ctrl.target.z,
          zoom: isOrthographicCamera(cam) ? cam.zoom : 1,
        };
        localStorage.setItem(viewStateKey(projectId), JSON.stringify(payload));
      }, 500);
    };

    controls.addEventListener("change", save);
    return () => {
      controls.removeEventListener("change", save);
      window.clearTimeout(saveTimer);
      if (orthoTimeoutId) window.clearTimeout(orthoTimeoutId);
    };
  }, [projectId, bounds]);

  // ── Hover readout: report the true survey coordinate under the cursor ─────────
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;

    const raycaster = raycasterRef.current;

    const pick = (clientX: number, clientY: number): SurveyHit | null => {
      const content = contentRef.current;
      const ground = groundRef.current;
      if (!content) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.params.Points = { threshold: Math.max(bounds ? bounds.radius * 0.01 : 1, 0.25) };
      raycaster.params.Line = { threshold: Math.max(bounds ? bounds.radius * 0.01 : 1, 0.25) };
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);

      const meshes: THREE.Object3D[] = [];
      content.traverse((obj) => {
        if (obj === ground) return;
        if (obj instanceof THREE.Sprite) return;
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.Line ||
          obj instanceof THREE.Points
        ) {
          meshes.push(obj);
        }
      });

      let hit = raycaster.intersectObjects(meshes, false)[0];
      if (hit) return { point: hit.point, onSurface: true };
      if (ground) {
        hit = raycaster.intersectObject(ground, false)[0];
        if (hit) return { point: hit.point, onSurface: false };
      }
      return null;
    };

    const onMove = (ev: PointerEvent) => {
      const hit = pick(ev.clientX, ev.clientY);
      if (!hit) {
        setReadout(null);
        return;
      }
      const off = offsetRef.current;
      const e = hit.point.x + off.x;
      const n = hit.point.y + off.y;
      const z = zScale !== 0 ? (hit.point.z + off.z) / zScale : 0;
      setReadout({ n, e, z, onSurface: hit.onSurface });
      onCursorMove?.({ e, n, z });
    };
    const el = renderer.domElement;
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, [onCursorMove, hasGeometry, zScale, bounds]);

  // ── Tool-aware OrbitControls mapping ────────────────────────────────────────────
  // Pan tool → left-drag pans (matching the 2D canvas). Measure tool → left-drag
  // is reserved for picking points, so rotation is disabled; zoom and right-drag
  // pan remain available.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const DEFAULT_BUTTONS = {
      LEFT: THREE.MOUSE.ROTATE as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.DOLLY as THREE.MOUSE,
      RIGHT: THREE.MOUSE.PAN as THREE.MOUSE,
    };
    if (tool === "pan") {
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.enableRotate = false;
    } else if (tool === "measure") {
      controls.mouseButtons = {
        LEFT: undefined as unknown as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.enableRotate = false;
    } else {
      controls.mouseButtons = DEFAULT_BUTTONS;
      controls.enableRotate = true;
    }
  }, [tool]);

  // ── 3D measurement tool ─────────────────────────────────────────────────────
  const measureStartRef = useRef<THREE.Vector3 | null>(null);
  const measureLineRef = useRef<THREE.Line | null>(null);
  const measureEndMarkerRef = useRef<THREE.Mesh | null>(null);
  useEffect(() => {
    const measureGroup = measureRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!measureGroup || !renderer || !camera || tool !== "measure") {
      // Clean up any active measure visuals when switching away from measure.
      if (measureGroup) {
        disposeGroup(measureGroup);
      }
      measureStartRef.current = null;
      measureLineRef.current = null;
      measureEndMarkerRef.current = null;
      setMeasureReadout(null);
      return;
    }
    disposeGroup(measureGroup);
    measureStartRef.current = null;
    measureLineRef.current = null;
    measureEndMarkerRef.current = null;
    setMeasureReadout(null);

    const lineGeo = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({ color: MEASURE_COLOR, linewidth: 2 });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 30;
    line.visible = false;
    measureGroup.add(line);
    measureLineRef.current = line;

    const markerGeo = new THREE.SphereGeometry(
      bounds ? Math.max(bounds.radius * 0.01, 0.15) : 0.3,
      12,
      12,
    );
    const markerMat = new THREE.MeshBasicMaterial({ color: MEASURE_COLOR });
    const endMarker = new THREE.Mesh(markerGeo, markerMat);
    endMarker.renderOrder = 31;
    endMarker.visible = false;
    measureGroup.add(endMarker);
    measureEndMarkerRef.current = endMarker;

    const raycaster = raycasterRef.current;

    const pick = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const content = contentRef.current;
      const ground = groundRef.current;
      if (!content) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const meshes: THREE.Object3D[] = [];
      content.traverse((obj) => {
        if (obj instanceof THREE.Sprite) return;
        if (obj === ground) return;
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.Line ||
          obj instanceof THREE.Points
        ) {
          meshes.push(obj);
        }
      });
      let hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit && ground) {
        hit = raycaster.intersectObject(ground, false)[0];
      }
      return hit ? hit.point : null;
    };

    const updateReadout = (a: THREE.Vector3, b: THREE.Vector3) => {
      const off = offsetRef.current;
      const ea = a.x + off.x, na = a.y + off.y, za = (a.z + off.z) / zScale;
      const eb = b.x + off.x, nb = b.y + off.y, zb = (b.z + off.z) / zScale;
      const de = eb - ea, dn = nb - na, dz = zb - za;
      const dist = Math.hypot(de, dn, dz);
      const horiz = Math.hypot(de, dn);
      const bearing = (Math.atan2(de, dn) * 180) / Math.PI;
      const normBearing = ((bearing % 360) + 360) % 360;
      const grade = horiz > 0.001 ? (dz / horiz) * 100 : 0;
      setMeasureReadout(
        `Dist ${dist.toFixed(coordDecimals)} · Bearing ${normBearing.toFixed(1)}° · Grade ${grade.toFixed(1)}%`,
      );
    };

    const onPointerMove = (ev: PointerEvent) => {
      const start = measureStartRef.current;
      if (!start) return;
      const end = pick(ev.clientX, ev.clientY);
      if (!end) return;
      const line = measureLineRef.current;
      const marker = measureEndMarkerRef.current;
      if (line) {
        line.geometry.setFromPoints([start, end]);
        line.visible = true;
      }
      if (marker) {
        marker.position.copy(end);
        marker.visible = true;
      }
      updateReadout(start, end);
    };

    const onPointerDown = (ev: PointerEvent) => {
      const pt = pick(ev.clientX, ev.clientY);
      if (!pt) return;
      const start = measureStartRef.current;
      if (!start) {
        measureStartRef.current = pt;
        const marker = measureEndMarkerRef.current;
        if (marker) {
          marker.position.copy(pt);
          marker.visible = true;
        }
        setMeasureReadout("Move cursor to second point…");
      } else {
        const line = measureLineRef.current;
        if (line) {
          line.geometry.setFromPoints([start, pt]);
          line.visible = true;
        }
        updateReadout(start, pt);
        measureStartRef.current = null;
      }
    };

    // Right-click / Esc cancels the active measure.
    const onContextMenu = (ev: MouseEvent) => {
      if (measureStartRef.current) {
        ev.preventDefault();
        measureStartRef.current = null;
        const line = measureLineRef.current;
        const marker = measureEndMarkerRef.current;
        if (line) line.visible = false;
        if (marker) marker.visible = false;
        setMeasureReadout(null);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && measureStartRef.current) {
        measureStartRef.current = null;
        const line = measureLineRef.current;
        const marker = measureEndMarkerRef.current;
        if (line) line.visible = false;
        if (marker) marker.visible = false;
        setMeasureReadout(null);
      }
    };

    const el = renderer.domElement;
    el.style.cursor = "crosshair";
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      el.style.cursor = "";
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [tool, bounds, zScale, coordDecimals]);

  // ── Camera framing helpers ──────────────────────────────────────────────────
  const handleZoomIn3d = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    if (isOrthographicCamera(camera)) {
      camera.zoom *= 1.4;
      camera.updateProjectionMatrix();
    } else {
      const controls = controlsRef.current;
      if (!controls) return;
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
      dir.multiplyScalar(0.7);
      camera.position.copy(controls.target).add(dir);
      controls.update();
    }
  }, []);

  const handleZoomOut3d = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    if (isOrthographicCamera(camera)) {
      camera.zoom /= 1.4;
      camera.updateProjectionMatrix();
    } else {
      const controls = controlsRef.current;
      if (!controls) return;
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
      dir.multiplyScalar(1.4);
      camera.position.copy(controls.target).add(dir);
      controls.update();
    }
  }, []);

  const frameCamera = useCallback((topDown: boolean) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const wrap = wrapRef.current;
    if (!camera || !controls || !bounds || !wrap) return;
    controls.target.set(0, 0, 0);
    if (isOrthographicCamera(camera)) {
      const aspect = wrap.clientWidth / Math.max(wrap.clientHeight, 1);
      const viewSize = bounds.radius * (topDown ? 1.1 : 1.35);
      camera.left = -viewSize * aspect;
      camera.right = viewSize * aspect;
      camera.top = viewSize;
      camera.bottom = -viewSize;
      camera.zoom = 1;
      camera.near = 0.1;
      camera.far = 1e7;
      if (topDown) {
        camera.position.set(0, 0, Math.max(viewSize * 2, 1));
        camera.up.set(0, 1, 0);
      } else {
        const dir = new THREE.Vector3(0.7, -0.7, 0.6).normalize();
        camera.position.copy(dir.multiplyScalar(Math.max(viewSize * 2, 1)));
        camera.up.set(0, 0, 1);
      }
    } else {
      const dist =
        (bounds.radius / Math.sin((camera.fov * Math.PI) / 180 / 2)) *
        (topDown ? 1.15 : 1.3);
      if (topDown) {
        camera.position.set(0, 0, dist);
        camera.up.set(0, 1, 0);
      } else {
        const dir = new THREE.Vector3(0.7, -0.7, 0.6).normalize();
        camera.position.copy(dir.multiplyScalar(dist));
        camera.up.set(0, 0, 1);
      }
      camera.near = Math.max(dist / 1000, 0.01);
      camera.far = dist * 100;
    }
    camera.updateProjectionMatrix();
    controls.update();
  }, [bounds]);

  const handleZoomExtents3d = useCallback(() => frameCamera(false), [frameCamera]);
  const handleTopDown3d = useCallback(() => frameCamera(true), [frameCamera]);

  const ax = axisLabels(axisConvention);
  const fmt = (v: number) => v.toFixed(coordDecimals);

  return (
    <div
      ref={wrapRef}
      className="cad-canvas-grid cad-3d-viewport"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        cursor: isDragging ? "grabbing" : tool === "measure" ? "crosshair" : "grab",
        touchAction: "none",
      }}
      onPointerDown={() => setIsDragging(true)}
      onPointerUp={() => setIsDragging(false)}
      onPointerLeave={() => setIsDragging(false)}
    >
      <div className="cad-viewport-hud" aria-hidden="true">
        <span className="cad-hud-tool">3D</span>
        <span className="cad-hud-divider" />
        <span>
          {tool === "measure"
            ? "Click first point, then second point. Right-click / Esc to cancel."
            : "Drag to orbit · right/two-finger drag to pan · wheel to zoom"}
        </span>
      </div>

      {readout && (
        <div className="cad-3d-readout" aria-hidden="true">
          {ax.easting}: {fmt(readout.e)} · {ax.northing}: {fmt(readout.n)}
          {readout.onSurface && <> · Z: {fmt(readout.z)}</>}
        </div>
      )}

      {measureReadout && (
        <div className="cad-3d-measure-readout" aria-hidden="true">
          {measureReadout}
        </div>
      )}

      {!hasGeometry && (
        <div className="cad-3d-empty">No geometry to display in 3D yet.</div>
      )}

      <div className="cad-3d-axes-legend" aria-hidden="true">
        <span><i style={{ background: "#3bb46e" }} />{ax.northing} (N)</span>
        <span><i style={{ background: "#e06c75" }} />{ax.easting} (E)</span>
        <span><i style={{ background: "#5cc3ff" }} />Z (RL)</span>
      </div>

      {hasCutFill && (
        <div className="cad-3d-cutfill-legend" aria-hidden="true">
          <span className="cad-3d-cutfill-title">Cut / Fill</span>
          <span className="cad-3d-cutfill-ramp" />
          <span className="cad-3d-cutfill-ends">
            <span style={{ color: "#e03b3b" }}>Cut</span>
            <span style={{ color: "#2b7bd6" }}>Fill</span>
          </span>
        </div>
      )}

      <div className="cad-3d-view-controls" aria-label="3D view controls">
        <button
          type="button"
          className={`cad-zoom-btn ${orthographic ? "" : "active"}`}
          onClick={() => setOrthographic(false)}
          title="Perspective view"
          aria-label="Switch to perspective view"
          aria-pressed={!orthographic}
        >
          Persp
        </button>
        <button
          type="button"
          className={`cad-zoom-btn ${orthographic ? "active" : ""}`}
          onClick={() => setOrthographic(true)}
          title="Orthographic view"
          aria-label="Switch to orthographic view"
          aria-pressed={orthographic}
        >
          Ortho
        </button>
        <button
          type="button"
          className="cad-zoom-btn"
          onClick={handleTopDown3d}
          title="Top-down plan view"
          aria-label="View from top"
        >
          Top
        </button>
      </div>

      <div className="cad-zoom-controls" aria-label="Zoom controls">
        <button
          type="button"
          className="cad-zoom-btn"
          onClick={handleZoomIn3d}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          className="cad-zoom-btn"
          onClick={handleZoomOut3d}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut size={15} />
        </button>
        <button
          type="button"
          className="cad-zoom-btn"
          onClick={handleZoomExtents3d}
          title="Zoom extents"
          aria-label="Zoom to extents"
        >
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
});

export const Cad3dViewport = Cad3dViewportComponent;

/** Recursively dispose geometries/materials and empty a group. */
function disposeGroup(group: THREE.Group): void {
  const toRemove: THREE.Object3D[] = [];
  for (const child of group.children) {
    child.traverse((obj) => {
      const geom = (obj as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom && typeof geom.dispose === "function") geom.dispose();
      const mat = (obj as { material?: THREE.Material | THREE.Material[] }).material;
      const disposeMat = (m: THREE.Material) => {
        const map = (m as unknown as { map?: THREE.Texture | null }).map;
        if (map && typeof map.dispose === "function") map.dispose();
        m.dispose();
      };
      if (Array.isArray(mat)) mat.forEach(disposeMat);
      else if (mat && typeof mat.dispose === "function") disposeMat(mat);
    });
    toRemove.push(child);
  }
  for (const c of toRemove) group.remove(c);
}
