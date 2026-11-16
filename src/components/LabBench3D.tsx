import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Cable, ChevronDown, ChevronUp, Hammer, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { LabApparatusState, OscilloscopeSettings, TuningForkOption } from '../types/lab';
import { evaluateWaveformVoltage, GRID_COLS, GRID_ROWS, TUNING_FORKS } from '../utils/physics';

interface LabBench3DProps {
  apparatus: LabApparatusState;
  scope: OscilloscopeSettings;
  soundEnabled: boolean;
  selectedFork: TuningForkOption;
  onSelectFork: (forkId: string) => void;
  onStrikeHammer: () => void;
  onToggleRunState: () => void;
  onChangeDistance: (cm: number) => void;
  onToggleAmpPower: () => void;
  onChangeAmpGain: (gain: number) => void;
  onToggleMicroCable: () => void;
  onToggleScopeCable: () => void;
  onToggleAmbientNoise: () => void;
  onToggleContinuousMode: () => void;
  onToggleSound: () => void;
  onConnectAll: () => void;
}

type CameraPreset = 'overview' | 'fork_mic' | 'scope';

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [0.3, 3.05, 6.9], target: [0.15, 0.95, 0] },
  fork_mic: { pos: [-2.1, 2.05, 4.1], target: [-1.85, 1.05, 0] },
  scope: { pos: [2.7, 1.9, 3.55], target: [2.5, 0.95, 0] },
};

const _vec3 = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createBenchSurfaceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5B9BF0';
  ctx.fillRect(0, 0, 512, 512);
  // Subtle lab laminate speckle & ruler grid
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 600; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 512;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  return tex;
}

function createAmpFaceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 240);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BỘ KHUẾCH ĐẠI TÍN HIỆU', 256, 58);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 18px monospace';
  ctx.fillText('INPUT (MIC)       GAIN       OUTPUT', 256, 224);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawMiniScopeTexture(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  apparatus: LabApparatusState,
  scope: OscilloscopeSettings,
  fork: TuningForkOption
) {
  ctx.fillStyle = scope.powerOn ? '#0B1220' : '#050811';
  ctx.fillRect(0, 0, w, h);
  if (!scope.powerOn) return;

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = (c / GRID_COLS) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let r = 0; r <= GRID_ROWS; r++) {
    const y = (r / GRID_ROWS) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const totalTimeSec = GRID_COLS * scope.secPerDiv;
  const signalParams = {
    nominalFreqHz: fork.nominalFreqHz,
    distanceCm: apparatus.distanceCm,
    ampPowerOn: apparatus.ampPowerOn,
    ampGain: apparatus.ampGain,
    cableMicroToAmpConnected: apparatus.cableMicroToAmpConnected,
    cableAmpToScopeConnected: apparatus.cableAmpToScopeConnected,
    scopePowerOn: scope.powerOn,
    vibrationStrength: apparatus.isVibrating ? apparatus.vibrationStrength : 0,
    coupling: scope.coupling,
    ambientNoiseEnabled: apparatus.ambientNoiseEnabled,
  };

  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let px = 0; px <= w; px += 3) {
    const t = (px / w) * totalTimeSec;
    const v = evaluateWaveformVoltage(t, signalParams, 0);
    const yDivs = v / scope.voltsPerDiv + scope.verticalOffsetDiv;
    const py = h / 2 - (yDivs / (GRID_ROWS / 2)) * (h / 2);
    const clampedY = Math.max(4, Math.min(h - 4, py));
    if (px === 0) ctx.moveTo(px, clampedY);
    else ctx.lineTo(px, clampedY);
  }
  ctx.stroke();
}

export function LabBench3D({
  apparatus,
  scope,
  soundEnabled,
  selectedFork,
  onSelectFork,
  onStrikeHammer,
  onToggleRunState,
  onChangeDistance,
  onToggleAmpPower,
  onChangeAmpGain,
  onToggleMicroCable,
  onToggleScopeCable,
  onToggleAmbientNoise,
  onToggleContinuousMode,
  onToggleSound,
  onConnectAll,
}: LabBench3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPreset>('overview');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [hoveredPartLabel, setHoveredPartLabel] = useState<string | null>(null);

  // Refs for latest props & callbacks without tearing down the WebGL scene
  const stateRef = useRef({ apparatus, scope, selectedFork });
  stateRef.current = { apparatus, scope, selectedFork };

  const handlersRef = useRef({
    onStrikeHammer,
    onToggleAmpPower,
    onToggleMicroCable,
    onToggleScopeCable,
  });
  handlersRef.current = {
    onStrikeHammer,
    onToggleAmpPower,
    onToggleMicroCable,
    onToggleScopeCable,
  };

  const presetTriggerRef = useRef<((preset: CameraPreset) => void) | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('Trình duyệt không hỗ trợ WebGL để hiển thị mô hình 3D.');
      return;
    }

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 420;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('data-testid', 'lab-3d-canvas');
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('Ngữ cảnh đồ họa WebGL tạm gián đoạn.');
    };
    const handleContextRestored = () => {
      setWebglError(null);
      requestRenderRef.current?.();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xedf2f7);
    scene.fog = new THREE.Fog(0xedf2f7, 13, 30);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.4;
    controls.maxDistance = 12.5;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minPolarAngle = 0.2;
    controls.update();

    // 3-Point Studio Lighting with warm/cool temperature contrast
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.8);
    keyLight.position.set(4.5, 7.5, 5.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 20;
      keyLight.shadow.camera.left = -5.5;
      keyLight.shadow.camera.right = 5.5;
      keyLight.shadow.camera.top = 4;
      keyLight.shadow.camera.bottom = -4;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.85);
    rimLight.position.set(-4.5, 4.2, -4.0);
    scene.add(rimLight);

    // Track disposable resources
    const disposables: Array<{ dispose: () => void }> = [];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposables.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      disposables.push(m);
      return m;
    };
    const trackTex = <T extends THREE.Texture>(t: T): T => {
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      disposables.push(t);
      return t;
    };

    // Shared materials
    const benchTex = trackTex(createBenchSurfaceTexture());
    const contactShadowTex = trackTex(createContactShadowTexture());
    const ampFaceTex = trackTex(createAmpFaceTexture());

    const matCastIron = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78, metalness: 0.35 })
    );
    const matChrome = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.92 })
    );
    const matDarkSteel = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.82 })
    );
    const matWood = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65, metalness: 0.05 })
    );
    const matRubber = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.88, metalness: 0.02 })
    );
    const matScopeShell = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.42, metalness: 0.15 })
    );
    const matScopeBlue = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.38, metalness: 0.2 })
    );
    const matShadowDisc = trackMat(
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    );

    const addShadowDisc = (x: number, z: number, sx: number, sz: number) => {
      const disc = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(1, 24)), matShadowDisc);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.012, z);
      disc.scale.set(sx, sz, 1);
      scene.add(disc);
    };

    // 1. Lab Bench & Surroundings
    const benchTop = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(9.6, 0.24, 3.6)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: benchTex,
          roughness: 0.48,
          metalness: 0.06,
        })
      )
    );
    benchTop.position.set(0.2, -0.12, 0);
    benchTop.receiveShadow = true;
    scene.add(benchTop);

    const benchTrim = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(9.66, 0.08, 3.66)),
      matCastIron
    );
    benchTrim.position.set(0.2, -0.25, 0);
    scene.add(benchTrim);

    // Lab floor below bench
    const floor = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(40, 40)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.9, metalness: 0 }))
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;
    scene.add(floor);

    // Distance Ruler Strip on bench between Fork (x = -2.65) and Mic track (-2.2 .. -0.3)
    const rulerMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5, metalness: 0.1 })
    );
    const rulerStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.5, 0.02, 0.16)), rulerMat);
    rulerStrip.position.set(-1.45, 0.015, 0.55);
    scene.add(rulerStrip);

    // 2. Giá đỡ + Âm thoa (4) + Búa cao su (Composite Group at x = -2.65)
    const interactables: THREE.Object3D[] = [];
    const registerInteractive = (obj: THREE.Object3D, action: string, label: string) => {
      obj.userData.action = action;
      obj.userData.label = label;
      interactables.push(obj);
    };

    const standGroup = new THREE.Group();
    standGroup.position.set(-2.75, 0, 0);
    scene.add(standGroup);
    addShadowDisc(-2.75, 0, 0.65, 0.48);

    const standBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.12, 0.65)), matCastIron);
    standBase.position.set(-0.15, 0.06, 0);
    standBase.castShadow = true;
    standBase.receiveShadow = true;
    standGroup.add(standBase);

    const standRod = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 2.05, 16)),
      matChrome
    );
    standRod.position.set(-0.42, 1.08, 0);
    standRod.castShadow = true;
    standGroup.add(standRod);

    const clampArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.1, 0.12)), matCastIron);
    clampArm.position.set(-0.14, 1.12, 0);
    clampArm.castShadow = true;
    standGroup.add(clampArm);

    const clampCollar = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.18, 16)),
      matRubber
    );
    clampCollar.position.set(0.12, 1.12, 0);
    standGroup.add(clampCollar);

    const clampScrew = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12)),
      matChrome
    );
    clampScrew.rotation.x = Math.PI / 2;
    clampScrew.position.set(-0.42, 1.12, 0.09);
    standGroup.add(clampScrew);

    // Tuning fork assembly
    const forkGroup = new THREE.Group();
    forkGroup.position.set(0.12, 1.2, 0);
    standGroup.add(forkGroup);

    const forkStem = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.038, 0.038, 0.34, 16)),
      matDarkSteel
    );
    forkStem.position.set(0, 0.12, 0);
    forkGroup.add(forkStem);

    const uCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.36, -0.14),
      new THREE.Vector3(0, 0.25, -0.1),
      new THREE.Vector3(0, 0.22, 0),
      new THREE.Vector3(0, 0.25, 0.1),
      new THREE.Vector3(0, 0.36, 0.14),
    ]);
    const uMesh = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(uCurve, 20, 0.036, 12, false)),
      matChrome
    );
    forkGroup.add(uMesh);

    const prongLeft = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.034, 0.034, 0.68, 14)),
      matChrome
    );
    prongLeft.position.set(0, 0.7, -0.14);
    prongLeft.castShadow = true;
    forkGroup.add(prongLeft);

    const prongRight = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.034, 0.034, 0.68, 14)),
      matChrome
    );
    prongRight.position.set(0, 0.7, 0.14);
    prongRight.castShadow = true;
    forkGroup.add(prongRight);

    registerInteractive(prongLeft, 'strike', 'Nhấn để gõ vào âm thoa');
    registerInteractive(prongRight, 'strike', 'Nhấn để gõ vào âm thoa');

    // Rubber hammer (pivoted near bottom-right of fork)
    const hammerPivot = new THREE.Group();
    hammerPivot.position.set(0.46, 0.35, 0.38);
    hammerPivot.rotation.set(0.15, 0, -0.95);
    standGroup.add(hammerPivot);

    const hammerHandle = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.025, 0.032, 0.85, 12)),
      matWood
    );
    hammerHandle.position.set(0, 0.42, 0);
    hammerHandle.castShadow = true;
    hammerPivot.add(hammerHandle);

    const hammerHead = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 16)),
      matRubber
    );
    hammerHead.rotation.z = Math.PI / 2;
    hammerHead.position.set(0, 0.86, 0);
    hammerHead.castShadow = true;
    hammerPivot.add(hammerHead);
    registerInteractive(hammerHead, 'strike', 'Búa cao su — Nhấn để gõ âm thoa');
    registerInteractive(hammerHandle, 'strike', 'Búa cao su — Nhấn để gõ âm thoa');

    // Acoustic wavefront rings between fork & mic
    const waveRingsGroup = new THREE.Group();
    waveRingsGroup.position.set(-2.5, 1.65, 0);
    scene.add(waveRingsGroup);
    const waveRings: THREE.Mesh[] = [];
    const waveMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.45,
      })
    );
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.16 + i * 0.12, 0.012, 8, 28, Math.PI * 0.7)),
        waveMat
      );
      ring.rotation.y = Math.PI / 2;
      ring.rotation.x = -Math.PI * 0.35;
      ring.position.x = 0.15 + i * 0.24;
      waveRingsGroup.add(ring);
      waveRings.push(ring);
    }

    // 3. Micro (2) on sliding stand
    const distanceToWorldX = (cm: number) => -2.15 + ((cm - 5) / 45) * 1.55;
    const micGroup = new THREE.Group();
    micGroup.position.set(distanceToWorldX(stateRef.current.apparatus.distanceCm), 0, 0);
    scene.add(micGroup);

    const micShadow = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.32, 20)), matShadowDisc);
    micShadow.rotation.x = -Math.PI / 2;
    micShadow.position.y = 0.012;
    micGroup.add(micShadow);

    const micBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 0.08, 20)),
      matCastIron
    );
    micBase.position.y = 0.04;
    micBase.castShadow = true;
    micGroup.add(micBase);

    const micPole = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 1.58, 12)),
      matDarkSteel
    );
    micPole.position.y = 0.85;
    micPole.castShadow = true;
    micGroup.add(micPole);

    const micHolder = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.14, 0.1, 0.14)),
      matRubber
    );
    micHolder.position.set(0, 1.64, 0);
    micGroup.add(micHolder);

    const micBody = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.065, 0.055, 0.34, 16)),
      matCastIron
    );
    micBody.rotation.z = Math.PI / 2;
    micBody.position.set(-0.08, 1.64, 0);
    micBody.castShadow = true;
    micGroup.add(micBody);

    const micGrille = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.072, 16, 12)),
      matDarkSteel
    );
    micGrille.position.set(-0.26, 1.64, 0);
    micGroup.add(micGrille);

    // 4. Bộ khuếch đại tín hiệu (3) at x = 0.45
    const ampGroup = new THREE.Group();
    ampGroup.position.set(0.45, 0, 0);
    scene.add(ampGroup);
    addShadowDisc(0.45, 0, 0.72, 0.55);

    const ampChassis = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.12, 0.68, 0.78)),
      matCastIron
    );
    ampChassis.position.y = 0.34;
    ampChassis.castShadow = true;
    ampChassis.receiveShadow = true;
    ampGroup.add(ampChassis);

    const ampFace = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.02, 0.56)),
      trackMat(new THREE.MeshStandardMaterial({ map: ampFaceTex, roughness: 0.55, metalness: 0.2 }))
    );
    ampFace.position.set(0, 0.34, 0.395);
    ampGroup.add(ampFace);

    const ampLedMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      })
    );
    const ampPowerSwitch = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.16, 0.14, 0.08)),
      ampLedMat
    );
    ampPowerSwitch.position.set(-0.32, 0.32, 0.41);
    ampGroup.add(ampPowerSwitch);
    registerInteractive(ampPowerSwitch, 'toggleAmp', 'Công tắc Bộ khuếch đại — Nhấn để Bật/Tắt');

    const ampKnobGroup = new THREE.Group();
    ampKnobGroup.position.set(0.16, 0.32, 0.41);
    ampGroup.add(ampKnobGroup);
    const ampKnobBody = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.13, 0.14, 0.09, 20)),
      matDarkSteel
    );
    ampKnobBody.rotation.x = Math.PI / 2;
    ampKnobGroup.add(ampKnobBody);
    const ampKnobMarker = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.025, 0.09, 0.03)),
      trackMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }))
    );
    ampKnobMarker.position.set(0, 0.06, 0.045);
    ampKnobGroup.add(ampKnobMarker);

    // 5. Máy dao động kí điện tử (1) at x = 2.45
    const scopeGroup = new THREE.Group();
    scopeGroup.position.set(2.45, 0, 0);
    scene.add(scopeGroup);
    addShadowDisc(2.45, 0, 1.35, 0.85);

    const scopeBody = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.25, 1.48, 1.18)),
      matScopeShell
    );
    scopeBody.position.y = 0.78;
    scopeBody.castShadow = true;
    scopeBody.receiveShadow = true;
    scopeGroup.add(scopeBody);

    // Rubber feet
    [
      [-0.9, -0.45],
      [0.9, -0.45],
      [-0.9, 0.45],
      [0.9, 0.45],
    ].forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.09, 0.06, 12)), matRubber);
      foot.position.set(fx, 0.03, fz);
      scopeGroup.add(foot);
    });

    // Top carrying handle
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.7, 1.52, 0),
      new THREE.Vector3(-0.65, 1.72, 0),
      new THREE.Vector3(0.65, 1.72, 0),
      new THREE.Vector3(0.7, 1.52, 0),
    ]);
    const scopeHandle = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(handleCurve, 18, 0.04, 10, false)),
      matDarkSteel
    );
    scopeGroup.add(scopeHandle);

    // Recessed dark bezel & live oscilloscope screen texture
    const scopeBezel = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.28, 1.02, 0.06)),
      matCastIron
    );
    scopeBezel.position.set(-0.36, 0.84, 0.58);
    scopeGroup.add(scopeBezel);

    const miniScopeCanvas = document.createElement('canvas');
    miniScopeCanvas.width = 512;
    miniScopeCanvas.height = 384;
    const miniScopeCtx = miniScopeCanvas.getContext('2d')!;
    drawMiniScopeTexture(
      miniScopeCtx,
      512,
      384,
      stateRef.current.apparatus,
      stateRef.current.scope,
      stateRef.current.selectedFork
    );
    const miniScopeTex = trackTex(new THREE.CanvasTexture(miniScopeCanvas));
    miniScopeTex.colorSpace = THREE.SRGBColorSpace;

    const scopeScreen = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.18, 0.92)),
      trackMat(new THREE.MeshBasicMaterial({ map: miniScopeTex }))
    );
    scopeScreen.position.set(-0.36, 0.84, 0.615);
    scopeGroup.add(scopeScreen);

    // Right control panel on 3D oscilloscope matching Hình 10.1
    const scopePanelPlate = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.68, 1.18, 0.04)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.45, metalness: 0.1 }))
    );
    scopePanelPlate.position.set(0.68, 0.82, 0.585);
    scopeGroup.add(scopePanelPlate);

    const scopeBlueHeader = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.58, 0.22, 0.03)),
      matScopeBlue
    );
    scopeBlueHeader.position.set(0.68, 1.24, 0.605);
    scopeGroup.add(scopeBlueHeader);

    // Tactile knobs on 3D oscilloscope
    [
      [0.56, 0.92, 0.09],
      [0.8, 0.92, 0.09],
      [0.56, 0.62, 0.11],
      [0.8, 0.62, 0.11],
    ].forEach(([kx, ky, kr]) => {
      const knob = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(kr, kr * 1.05, 0.08, 16)),
        matDarkSteel
      );
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, ky, 0.63);
      scopeGroup.add(knob);
    });

    // CH1 BNC Connector
    const bncJack = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.065, 0.065, 0.1, 16)),
      matChrome
    );
    bncJack.rotation.x = Math.PI / 2;
    bncJack.position.set(-0.82, 0.22, 0.62);
    scopeGroup.add(bncJack);

    // 6. Dynamic 3D Cables (Micro -> Amp, Amp -> Scope)
    const microCableMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.45, metalness: 0.15 })
    );
    const scopeCableMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.15 })
    );
    const unpluggedCableMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5, metalness: 0.1 })
    );

    let microCableMesh: THREE.Mesh | null = null;
    let lastMicXForCable = -999;
    let lastMicConnForCable = !stateRef.current.apparatus.cableMicroToAmpConnected;

    const rebuildMicroCable = (micX: number, connected: boolean) => {
      if (microCableMesh) {
        scene.remove(microCableMesh);
        interactables.splice(interactables.indexOf(microCableMesh), 1);
        microCableMesh.geometry.dispose();
      }
      const curve = connected
        ? new THREE.CatmullRomCurve3([
            new THREE.Vector3(micX + 0.06, 0.15, 0.16),
            new THREE.Vector3(micX + 0.35, 0.04, 0.45),
            new THREE.Vector3(0.0, 0.04, 0.56),
            new THREE.Vector3(0.22, 0.22, 0.42),
          ])
        : new THREE.CatmullRomCurve3([
            new THREE.Vector3(micX + 0.06, 0.15, 0.16),
            new THREE.Vector3(micX + 0.24, 0.05, 0.36),
            new THREE.Vector3(micX + 0.4, 0.03, 0.48),
          ]);
      const geo = new THREE.TubeGeometry(curve, 22, 0.025, 8, false);
      microCableMesh = new THREE.Mesh(geo, connected ? microCableMat : unpluggedCableMat);
      registerInteractive(
        microCableMesh,
        'toggleMicroCable',
        connected ? 'Dây Micro → Khuếch đại (Nhấn để rút)' : 'Dây Micro đang hở (Nhấn để cắm)'
      );
      scene.add(microCableMesh);
      lastMicXForCable = micX;
      lastMicConnForCable = connected;
    };

    let scopeCableMesh: THREE.Mesh | null = null;
    let lastScopeConnForCable = !stateRef.current.apparatus.cableAmpToScopeConnected;

    const rebuildScopeCable = (connected: boolean) => {
      if (scopeCableMesh) {
        scene.remove(scopeCableMesh);
        interactables.splice(interactables.indexOf(scopeCableMesh), 1);
        scopeCableMesh.geometry.dispose();
      }
      const curve = connected
        ? new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.88, 0.22, 0.42),
            new THREE.Vector3(1.12, 0.04, 0.65),
            new THREE.Vector3(1.42, 0.05, 0.72),
            new THREE.Vector3(1.63, 0.22, 0.65),
          ])
        : new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.88, 0.22, 0.42),
            new THREE.Vector3(1.06, 0.05, 0.58),
            new THREE.Vector3(1.22, 0.03, 0.64),
          ]);
      const geo = new THREE.TubeGeometry(curve, 20, 0.026, 8, false);
      scopeCableMesh = new THREE.Mesh(geo, connected ? scopeCableMat : unpluggedCableMat);
      registerInteractive(
        scopeCableMesh,
        'toggleScopeCable',
        connected ? 'Dây BNC → CH1 (Nhấn để rút)' : 'Dây CH1 đang hở (Nhấn để cắm)'
      );
      scene.add(scopeCableMesh);
      lastScopeConnForCable = connected;
    };

    rebuildMicroCable(micGroup.position.x, stateRef.current.apparatus.cableMicroToAmpConnected);
    rebuildScopeCable(stateRef.current.apparatus.cableAmpToScopeConnected);

    // Raycaster for direct 3D interaction
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverCheck = 0;

    const updatePointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 6) return; // ignore orbit drag

      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactables, false);
      if (hits.length > 0) {
        const action = hits[0].object.userData.action;
        if (action === 'strike') handlersRef.current.onStrikeHammer();
        else if (action === 'toggleAmp') handlersRef.current.onToggleAmpPower();
        else if (action === 'toggleMicroCable') handlersRef.current.onToggleMicroCable();
        else if (action === 'toggleScopeCable') handlersRef.current.onToggleScopeCable();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;

      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactables, false);
      if (hits.length > 0) {
        renderer.domElement.style.cursor = 'pointer';
        setHoveredPartLabel(hits[0].object.userData.label || null);
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredPartLabel(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // Smooth camera preset transition state
    let camTransition: {
      pos: THREE.Vector3;
      target: THREE.Vector3;
      active: boolean;
    } = {
      pos: new THREE.Vector3(...CAMERA_PRESETS.overview.pos),
      target: new THREE.Vector3(...CAMERA_PRESETS.overview.target),
      active: false,
    };

    controls.addEventListener('start', () => {
      camTransition.active = false;
    });

    // Animation & Pacing loop (follows software-WebGL afterDraw budget!)
    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    let lastFrameTime = performance.now();
    let lastStrikeSeen = 0;
    let hammerAnimTime = 0;
    let lastMiniTexSignature = '';

    function afterDraw(cb: () => void) {
      if (disposed) return;
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
          return;
        }
      } catch {
        // Fallback
      }
      frameId = window.setTimeout(cb, 80);
    }

    const updateSceneState = (dt: number, nowMs: number) => {
      const { apparatus: app, scope: sc, selectedFork: fk } = stateRef.current;

      // Trigger hammer swing when strikeTimestamp changes
      if (app.strikeTimestamp !== lastStrikeSeen && app.strikeTimestamp > 0) {
        lastStrikeSeen = app.strikeTimestamp;
        hammerAnimTime = 0.45;
      }

      if (hammerAnimTime > 0) {
        hammerAnimTime = Math.max(0, hammerAnimTime - dt);
        const swingPhase = Math.sin((hammerAnimTime / 0.45) * Math.PI);
        hammerPivot.rotation.z = -0.95 + swingPhase * 0.72;
      } else {
        hammerPivot.rotation.z = THREE.MathUtils.damp(hammerPivot.rotation.z, -0.95, 10, dt);
      }

      // Tuning fork prong vibration (amplitude decays gradually over time)
      const vibrating = app.isVibrating && app.vibrationStrength > 0.035;
      if (vibrating) {
        const vib = Math.sin(nowMs * 0.08) * 0.032 * app.vibrationStrength;
        prongLeft.position.z = -0.14 - vib;
        prongRight.position.z = 0.14 + vib;
      } else {
        prongLeft.position.z = -0.14;
        prongRight.position.z = 0.14;
      }

      // Acoustic wave rings propagation (scale & opacity decrease with fork amplitude)
      waveRingsGroup.visible = vibrating;
      if (vibrating) {
        const phase = (nowMs * 0.0022) % 1;
        const ampScale = 0.45 + 0.55 * app.vibrationStrength;
        waveRings.forEach((ring, idx) => {
          const p = (phase + idx * 0.25) % 1;
          ring.position.x = 0.12 + p * (0.45 + 0.85 * app.vibrationStrength);
          const scRing = (0.75 + p * 0.75) * ampScale;
          ring.scale.set(scRing, scRing, scRing);
        });
        waveMat.opacity = Math.min(0.65, app.vibrationStrength * 0.62);
      }

      // Smooth microphone distance motion
      const targetMicX = distanceToWorldX(app.distanceCm);
      micGroup.position.x = THREE.MathUtils.damp(micGroup.position.x, targetMicX, 10, dt);

      if (
        Math.abs(micGroup.position.x - lastMicXForCable) > 0.015 ||
        app.cableMicroToAmpConnected !== lastMicConnForCable
      ) {
        rebuildMicroCable(micGroup.position.x, app.cableMicroToAmpConnected);
      }
      if (app.cableAmpToScopeConnected !== lastScopeConnForCable) {
        rebuildScopeCable(app.cableAmpToScopeConnected);
      }

      // Amplifier LED & Gain knob
      ampLedMat.color.setHex(app.ampPowerOn ? 0x10b981 : 0x475569);
      ampLedMat.emissive.setHex(app.ampPowerOn ? 0x10b981 : 0x000000);
      ampKnobGroup.rotation.z = -((app.ampGain - 1) / 9) * 4.2 + 2.1;

      // Update 3D Oscilloscope screen texture when relevant state changes
      const sig = `${fk.nominalFreqHz}|${app.distanceCm}|${app.ampPowerOn}|${app.ampGain}|${app.cableMicroToAmpConnected}|${app.cableAmpToScopeConnected}|${sc.powerOn}|${sc.coupling}|${sc.voltsPerDiv}|${sc.secPerDiv}|${sc.verticalOffsetDiv}|${app.isVibrating}|${app.vibrationStrength.toFixed(2)}|${app.ambientNoiseEnabled}`;
      if (sig !== lastMiniTexSignature) {
        lastMiniTexSignature = sig;
        drawMiniScopeTexture(miniScopeCtx, 512, 384, app, sc, fk);
        miniScopeTex.needsUpdate = true;
      }

      // Smooth camera preset interpolation
      if (camTransition.active) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camTransition.pos.x, 7, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camTransition.pos.y, 7, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, camTransition.pos.z, 7, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, camTransition.target.x, 7, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, camTransition.target.y, 7, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, camTransition.target.z, 7, dt);
        if (
          _vec3.copy(camera.position).distanceTo(camTransition.pos) < 0.02 &&
          controls.target.distanceTo(camTransition.target) < 0.02
        ) {
          camTransition.active = false;
        }
      }

      controls.update();

      const needsMoreFrames =
        vibrating ||
        hammerAnimTime > 0 ||
        camTransition.active ||
        Math.abs(micGroup.position.x - targetMicX) > 0.01;
      return needsMoreFrames;
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = window.requestAnimationFrame((nowMs) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.001, (nowMs - lastFrameTime) / 1000));
        lastFrameTime = nowMs;

        const needsMore = updateSceneState(dt, nowMs);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || needsMore)) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    };

    requestRenderRef.current = requestRender;
    presetTriggerRef.current = (preset: CameraPreset) => {
      const cfg = CAMERA_PRESETS[preset];
      camTransition.pos.set(...cfg.pos);
      camTransition.target.set(...cfg.target);
      camTransition.active = true;
      requestRender();
    };

    controls.addEventListener('change', requestRender);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 960;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // Initial frame
    requestRender();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      disposables.forEach((d) => d.dispose());
      if (microCableMesh) microCableMesh.geometry.dispose();
      if (scopeCableMesh) scopeCableMesh.geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Trigger re-render when React props update
  useEffect(() => {
    requestRenderRef.current?.();
  }, [apparatus, scope, selectedFork]);

  const isChainComplete =
    apparatus.cableMicroToAmpConnected &&
    apparatus.cableAmpToScopeConnected &&
    apparatus.ampPowerOn &&
    scope.powerOn;

  const handleSelectPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    presetTriggerRef.current?.(preset);
  };

  return (
    <section
      aria-label="Mô hình thí nghiệm 3D theo Hình 10.4"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Mô hình thí nghiệm 3D tương tác (Hình 10.4 SGK)
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Xoay/thu phóng góc nhìn 3D · Nhấn trực tiếp vào Búa cao su, Công tắc Bộ KĐ hoặc Dây nối để thao tác
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onStrikeHammer}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Hammer className="w-4 h-4" />
            Gõ búa cao su
          </button>

          <button
            type="button"
            data-testid="bench-run-stop-btn"
            onClick={onToggleRunState}
            aria-pressed={scope.runState === 'STOP'}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              scope.runState === 'RUN'
                ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
            }`}
          >
            {scope.runState === 'RUN' ? (
              <>
                <Pause className="w-4 h-4" />
                Dừng sóng (STOP)
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Chạy tiếp (RUN)
              </>
            )}
          </button>

          {!isChainComplete && (
            <button
              type="button"
              onClick={onConnectAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Cable className="w-4 h-4" />
              Nối dây &amp; Bật nguồn nhanh
            </button>
          )}

          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              soundEnabled
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {soundEnabled ? 'Âm thanh: Bật' : 'Âm thanh: Tắt'}
          </button>
        </div>
      </div>

      {/* 3D Viewport Container (unobstructed center, no backdrop-filter over WebGL) */}
      <div className="relative mt-3 h-[330px] sm:h-[380px] rounded-lg border border-slate-200 bg-slate-100 overflow-hidden">
        {webglError ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-sm text-slate-700">
            <p className="font-semibold text-slate-900 mb-1">{webglError}</p>
            <p className="text-xs text-slate-500">
              Bạn vẫn có thể điều chỉnh các thông số thí nghiệm và sử dụng Dao động kí điện tử bên dưới.
            </p>
          </div>
        ) : (
          <div ref={mountRef} className="w-full h-full" />
        )}

        {/* Top-left Camera View Selector (compact single bar, solid bg, no backdrop-blur) */}
        <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1 bg-white/95 border border-slate-200 rounded-lg p-1 shadow-sm">
          {(
            [
              { id: 'overview', label: 'Toàn cảnh' },
              { id: 'fork_mic', label: 'Âm thoa & Micro' },
              { id: 'scope', label: 'Dao động kí' },
            ] as const
          ).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset.id)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activePreset === preset.id
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleSelectPreset('overview')}
            aria-label="Đặt lại góc nhìn 3D"
            className="p-1 text-slate-600 hover:text-slate-900 rounded cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Bottom-left static legend / hover feedback */}
        <div className="absolute bottom-3 left-3 z-10 bg-slate-900/90 text-slate-100 text-[11px] font-medium px-3 py-1.5 rounded-md pointer-events-none">
          {hoveredPartLabel
            ? hoveredPartLabel
            : `(4) Âm thoa ${selectedFork.nominalFreqHz} Hz (Biên độ ${Math.round((apparatus.isVibrating ? apparatus.vibrationStrength : 0) * 100)}%) · (2) Micro ${apparatus.distanceCm} cm · (3) Bộ KĐ ×${apparatus.ampGain}`}
        </div>

        {/* Collapse / Expand toggle for parameter strip */}
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-white/95 border border-slate-200 text-slate-800 rounded-md hover:bg-slate-50 cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Hiện thông số
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Thu gọn thông số
            </>
          )}
        </button>
      </div>

      {/* Collapsible Apparatus Parameter Strip */}
      {!dockCollapsed && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Tuning Fork */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <label htmlFor="fork-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Chọn âm thoa chuẩn (4)
            </label>
            <select
              id="fork-select"
              value={apparatus.selectedForkId}
              onChange={(e) => onSelectFork(e.target.value)}
              className="w-full px-2.5 py-2 text-sm font-medium bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {TUNING_FORKS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Microphone Distance d (cm) */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="distance-slider" className="text-xs font-semibold text-slate-700">
                Khoảng cách Micro – Âm thoa
              </label>
              <span className="text-xs font-mono font-bold text-sky-700 tabular-nums">
                {apparatus.distanceCm} cm
              </span>
            </div>
            <input
              id="distance-slider"
              type="range"
              min={5}
              max={50}
              step={1}
              value={apparatus.distanceCm}
              onChange={(e) => onChangeDistance(Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-500 mt-0.5 font-mono">
              <span>5 cm</span>
              <span>Chuẩn SGK: 20 cm</span>
              <span>50 cm</span>
            </div>
          </div>

          {/* 3. Amplifier Gain & Power */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="amp-gain-slider" className="text-xs font-semibold text-slate-700">
                Bộ khuếch đại (3) · Độ lợi
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 tabular-nums">
                  ×{apparatus.ampGain}
                </span>
                <button
                  type="button"
                  onClick={onToggleAmpPower}
                  aria-pressed={apparatus.ampPowerOn}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded border cursor-pointer ${
                    apparatus.ampPowerOn
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {apparatus.ampPowerOn ? 'Bật' : 'Tắt'}
                </button>
              </div>
            </div>
            <input
              id="amp-gain-slider"
              type="range"
              min={1}
              max={10}
              step={1}
              value={apparatus.ampGain}
              onChange={(e) => onChangeAmpGain(Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
              <button
                type="button"
                onClick={onToggleMicroCable}
                className="underline hover:text-slate-900 cursor-pointer"
              >
                Dây Micro: {apparatus.cableMicroToAmpConnected ? 'Đã nối' : 'Đang hở'}
              </button>
              <button
                type="button"
                onClick={onToggleScopeCable}
                className="underline hover:text-slate-900 cursor-pointer"
              >
                Dây CH1: {apparatus.cableAmpToScopeConnected ? 'Đã nối' : 'Đang hở'}
              </button>
            </div>
          </div>

          {/* 4. Damping / Sustain & Ambient Noise */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">Dao động âm thoa</span>
              <span
                data-testid="fork-amplitude-pct"
                className="text-xs font-mono font-bold text-amber-700 tabular-nums"
              >
                {Math.round((apparatus.isVibrating ? apparatus.vibrationStrength : 0) * 100)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-[width] duration-100"
                style={{
                  width: `${Math.round((apparatus.isVibrating ? apparatus.vibrationStrength : 0) * 100)}%`,
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onToggleContinuousMode}
                aria-pressed={apparatus.continuousMode}
                className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  apparatus.continuousMode
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {apparatus.continuousMode ? 'Đang duy trì sóng' : 'Tắt dần tự nhiên'}
              </button>

              <button
                type="button"
                onClick={onToggleAmbientNoise}
                aria-pressed={apparatus.ambientNoiseEnabled}
                className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  apparatus.ambientNoiseEnabled
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {apparatus.ambientNoiseEnabled ? 'Nhiễu nền: Bật' : 'Nhiễu nền: Tắt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
