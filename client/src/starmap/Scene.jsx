import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { bodyTexture, cssVar, glowTexture, planetTexture } from './textures.js';

// 3D-сцена зоряної мапи (three.js через react-three-fiber). Два рівні: СЕКТОР — системи
// вузлами, СИСТЕМА — подвійна зоря, орбіти, планети, супутники, станції, поле астероїдів.
// Положення кожного тіла в момент t дає posAt — те саме бачать і меші, і камера, що
// летить за вибраним об'єктом. Кольори — змінні theme.css.

const TAU = Math.PI * 2;

// Атмосфера: сяйво по краю диска (чим ближче нормаль до площини екрана, тим яскравіше).
const ATMO_VERT = 'varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const ATMO_FRAG = 'uniform vec3 c; uniform float k; varying vec3 vN; void main() { float i = pow(max(0.0, 0.78 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.5) * k; gl_FragColor = vec4(c, i); }';
const tmp = new THREE.Vector3();

function useVarColor(name, themeKey) {
  return useMemo(() => new THREE.Color(cssVar(name) || '#888888'), [name, themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Спільний годинник: стоїть, коли paused або вимкнено рух у системі.
function useSimTime(paused) {
  const t = useRef(0);
  const still = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useFrame((_, dt) => {
    if (!paused && !still) t.current += Math.min(dt, 0.1);
  }, -2);
  return t;
}

function makePosAt(system) {
  const byId = new Map(system.objects.map((o) => [o.id, o]));
  const { separation, period } = system.binary;
  return function posAt(id, t, out = new THREE.Vector3()) {
    if (id === system.star.id) return out.set(0, 0, 0);
    const si = system.stars.findIndex((s) => s.id === id);
    if (si >= 0) {
      const a = (TAU * t) / period + si * Math.PI;
      return out.set(Math.cos(a) * separation, 0, Math.sin(a) * separation);
    }
    const o = byId.get(id);
    if (!o) return out.set(0, 0, 0);
    const a = o.phase + (TAU * t) / o.period;
    if (o.parent) {
      posAt(o.parent, t, out);
      return out.set(out.x + Math.cos(a) * o.orbit, out.y, out.z + Math.sin(a) * o.orbit);
    }
    return out.set(Math.cos(a) * o.orbit, 0, Math.sin(a) * o.orbit);
  };
}

function circlePoints(r, seg = 160) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    pts.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  return pts;
}

function Starfield({ count }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1, th = rnd() * TAU, r = 300 + rnd() * 200;
      const q = Math.sqrt(1 - u * u);
      pos.set([q * Math.cos(th) * r, u * r, q * Math.sin(th) * r], i * 3);
      const k = 0.55 + rnd() * 0.45, warm = rnd();
      col.set([k, k * (0.92 + warm * 0.08), k * (0.85 + (1 - warm) * 0.15)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [count]);
  return (
    <points geometry={geo}>
      <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

function Nebula({ themeKey }) {
  const a = useMemo(() => glowTexture('--accent'), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = useMemo(() => glowTexture('--map-ocean'), []);
  return (
    <>
      <sprite position={[-160, 40, -260]} scale={[420, 300, 1]}>
        <spriteMaterial map={a} transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite position={[200, -60, -220]} scale={[380, 340, 1]}>
        <spriteMaterial map={b} transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </>
  );
}

// Шар підписів поверх полотна (DOM, кнопки з data-id рендерить сторінка). Щокадру: проєкція
// під тілом, без накладань — пріоритет у вибраного, його родини, зір, далі ближчих до камери.
// Підпис під елементом з [data-sm-avoid] (плашка, панель) ховається.
function LabelProjector({ labelsRef, posAt, time, system, sel }) {
  const { camera, size } = useThree();
  const byId = useMemo(() => {
    const m = new Map();
    m.set(system.star.id, system.star);
    system.objects.forEach((o) => m.set(o.id, o));
    return m;
  }, [system]);
  const v = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const root = labelsRef?.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const scope = root.parentElement || document;
    const avoid = [];
    scope.querySelectorAll('[data-sm-avoid]').forEach((a) => {
      const r = a.getBoundingClientRect();
      if (r.width) avoid.push([r.left - base.left - 4, r.top - base.top - 4, r.right - base.left + 4, r.bottom - base.top + 4]);
    });
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const selO = sel ? byId.get(sel) : null;
    const list = [];
    root.querySelectorAll('[data-id]').forEach((el) => {
      const id = el.getAttribute('data-id');
      const o = byId.get(id);
      if (!o || !el.offsetWidth) return;
      posAt(id, time.current, v);
      v.addScaledVector(up, -((o.size || 0.3) * 1.5 + 0.12));
      v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      const family = selO && (o.parent === sel || selO.parent === id || (selO.parent && o.parent === selO.parent));
      const pr = id === sel ? 0 : family ? 1 : o.kind === 'binary' ? 2 : 3;
      list.push({ el, x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, z: v.z, vis, pr, w: el.offsetWidth, h: el.offsetHeight });
    });
    list.sort((a, b) => a.pr - b.pr || a.z - b.z);
    const placed = [];
    const hit = (r, q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1];
    for (const L of list) {
      L.x = Math.min(Math.max(L.x, L.w / 2 + 4), size.width - L.w / 2 - 4);
      const r = [L.x - L.w / 2 - 3, L.y - L.h / 2 - 1, L.x + L.w / 2 + 3, L.y + L.h / 2 + 1];
      const ok = L.vis && !placed.some((q) => hit(r, q)) && !avoid.some((q) => hit(r, q));
      if (ok) placed.push(r);
      L.el.style.visibility = ok ? 'visible' : 'hidden';
      L.el.style.transform = `translate(${L.x.toFixed(1)}px, ${L.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

function SelRing({ size, themeKey }) {
  const accent = useVarColor('--accent', themeKey);
  return (
    <Billboard>
      <mesh>
        <ringGeometry args={[size * 1.45, size * 1.45 + Math.max(0.03, size * 0.06), 64]} />
        <meshBasicMaterial color={accent} transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}

function pointer(e) {
  e.stopPropagation();
  document.body.style.cursor = 'pointer';
}
function unpointer() {
  document.body.style.cursor = '';
}

// Тіло, що рухається за posAt. children — його вигляд у локальних координатах.
function Mover({ id, posAt, time, children }) {
  const g = useRef();
  useFrame(() => {
    if (g.current) posAt(id, time.current, g.current.position);
  });
  return <group ref={g}>{children}</group>;
}

// Одна з пари зір; клік вибирає подвійну зорю цілком (pickId).
function Sun({ o, pickId, onSelect, themeKey }) {
  const tex = useMemo(() => bodyTexture(o), [o]);
  const glow = useMemo(() => glowTexture(o.color), [o.color]);
  const color = useVarColor(o.color, themeKey);
  const mesh = useRef();
  useFrame((_, dt) => {
    if (mesh.current) mesh.current.rotation.y += dt * 0.05;
  });
  return (
    <>
      <mesh ref={mesh} onClick={(e) => { e.stopPropagation(); onSelect(pickId); }} onPointerOver={pointer} onPointerOut={unpointer}>
        <sphereGeometry args={[o.size, 64, 32]} />
        <meshBasicMaterial map={tex.texture} toneMapped={false} />
      </mesh>
      <sprite scale={[o.size * 9, o.size * 9, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <pointLight color={color} intensity={1.6} decay={0} distance={0} />
    </>
  );
}

function Planet({ o, sel, onSelect, themeKey }) {
  const tex = useMemo(() => bodyTexture(o), [o]);
  const clouds = useMemo(() => (o.tex === 'terra' ? planetTexture('clouds', o.color, 1024, 7) : null), [o.tex, o.color]);
  const atmo = useVarColor(o.tex === 'gas' ? '--map-gas' : o.tex === 'terra' ? '--map-ocean' : '--map-ice', themeKey);
  const atmoUniforms = useMemo(() => ({ c: { value: atmo }, k: { value: o.tex === 'gas' ? 0.9 : 1.4 } }), [atmo, o.tex]);
  const body = useRef();
  const cl = useRef();
  useFrame((_, dt) => {
    if (body.current) body.current.rotation.y += dt * 0.15;
    if (cl.current) cl.current.rotation.y += dt * 0.19;
  });
  const on = sel === o.id;
  return (
    <>
      <group rotation={[0.35, 0, 0.12]}>
        <mesh ref={body} onClick={(e) => { e.stopPropagation(); onSelect(o.id); }} onPointerOver={pointer} onPointerOut={unpointer}>
          <sphereGeometry args={[o.size, 64, 32]} />
          <meshStandardMaterial map={tex.texture} roughness={0.95} metalness={0} />
        </mesh>
        {clouds && (
          <mesh ref={cl} scale={1.025}>
            <sphereGeometry args={[o.size, 64, 32]} />
            <meshStandardMaterial map={clouds.texture} transparent depthWrite={false} roughness={1} />
          </mesh>
        )}
      </group>
      {o.tex !== 'rock' && (
        <mesh scale={1.09}>
          <sphereGeometry args={[o.size, 48, 24]} />
          <shaderMaterial
            vertexShader={ATMO_VERT}
            fragmentShader={ATMO_FRAG}
            uniforms={atmoUniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      {on && <SelRing size={o.size} themeKey={themeKey} />}
    </>
  );
}

function Station({ o, sel, onSelect, themeKey }) {
  const metal = useVarColor('--map-station', themeKey);
  const accent = useVarColor('--accent', themeKey);
  const g = useRef();
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.4;
  });
  const s = o.size;
  const on = sel === o.id;
  return (
    <>
      <group ref={g} rotation={[0.5, 0, 0.2]} onClick={(e) => { e.stopPropagation(); onSelect(o.id); }} onPointerOver={pointer} onPointerOut={unpointer}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[s, s * 0.13, 12, 48]} />
          <meshStandardMaterial color={metal} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh>
          <boxGeometry args={[s * 2, s * 0.08, s * 0.08]} />
          <meshStandardMaterial color={metal} metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh>
          <boxGeometry args={[s * 0.08, s * 0.08, s * 2]} />
          <meshStandardMaterial color={metal} metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[s * 0.22, s * 0.22, s * 0.9, 16]} />
          <meshStandardMaterial color={metal} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh>
          <sphereGeometry args={[s * 0.14, 16, 8]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[s * 1.6, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {on && <SelRing size={s} themeKey={themeKey} />}
    </>
  );
}

// Поле астероїдів — локальне скупчення каменів, що летить по своїй орбіті як окреме тіло.
function Field({ o, sel, onSelect, themeKey, compact }) {
  const color = useVarColor(o.color, themeKey);
  const ref = useRef();
  const g = useRef();
  const count = compact ? Math.round(o.count * 0.6) : o.count;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let s = 3 + o.id.length * 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      // щільніше до центру, сплюснуте по вертикалі
      const u = rnd() * 2 - 1, th = rnd() * TAU, rr = o.size * Math.pow(rnd(), 0.6), qq = Math.sqrt(1 - u * u);
      p.set(qq * Math.cos(th) * rr * 1.25, u * rr * 0.35, qq * Math.sin(th) * rr);
      e.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
      q.setFromEuler(e);
      const k = 0.02 + Math.pow(rnd(), 3) * 0.11;
      sc.set(k, k * (0.6 + rnd() * 0.5), k * (0.7 + rnd() * 0.4));
      m.compose(p, q, sc);
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [count, o.size, o.id]);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.05;
  });
  const on = sel === o.id;
  return (
    <>
      <group ref={g} onClick={(e) => { e.stopPropagation(); onSelect(o.id); }} onPointerOver={pointer} onPointerOut={unpointer}>
        <instancedMesh ref={ref} args={[undefined, undefined, count]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={color} roughness={1} flatShading />
        </instancedMesh>
        <mesh>
          <sphereGeometry args={[o.size, 12, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {on && <SelRing size={o.size} themeKey={themeKey} />}
    </>
  );
}

function OrbitLine({ r, on, dashed, themeKey }) {
  const base = useVarColor('--map-orbit', themeKey);
  const accent = useVarColor('--accent', themeKey);
  const pts = useMemo(() => circlePoints(r), [r]);
  return (
    <Line
      points={pts}
      color={on ? accent : base}
      lineWidth={on ? 1.8 : 1}
      transparent
      opacity={on ? 0.95 : dashed ? 0.22 : 0.28}
      dashed={dashed}
      dashSize={0.4}
      gapSize={0.35}
      depthWrite={false}
    />
  );
}

// Камера: OrbitControls + політ до вибраного об'єкта. Ціль рухається разом з об'єктом,
// камера зсувається на ту саму відстань, тож вибране тіло лишається в кадрі.
function CameraRig({ focus, focusSize, posAt, time, home }) {
  const { camera, controls } = useThree();
  const goal = useRef(new THREE.Vector3());
  const prev = useRef(new THREE.Vector3());
  const dist = useRef(null);
  useEffect(() => {
    dist.current = focus ? Math.max(2.2, focusSize * 9) : home;
  }, [focus, focusSize, home]);
  useEffect(() => {
    if (!controls) return undefined;
    const stop = () => { dist.current = null; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);
  useFrame((_, dt) => {
    if (!controls) return;
    if (focus) posAt(focus, time.current, goal.current);
    else goal.current.set(0, 0, 0);
    prev.current.copy(controls.target);
    const k = 1 - Math.exp(-dt * 3.5);
    controls.target.lerp(goal.current, k);
    camera.position.add(tmp.subVectors(controls.target, prev.current));
    if (dist.current != null) {
      const dir = tmp.subVectors(camera.position, controls.target);
      const len = dir.length();
      const next = len + (dist.current - len) * k;
      camera.position.copy(controls.target).add(dir.multiplyScalar(next / len));
      if (Math.abs(next - dist.current) < 0.02) dist.current = null;
    }
    controls.update();
  });
  return null;
}

function SystemScene({ system, sel, onSelect, paused, compact, themeKey, labelsRef }) {
  const time = useSimTime(paused);
  const posAt = useMemo(() => makePosAt(system), [system]);
  const selObj = sel === system.star.id ? system.star : system.objects.find((o) => o.id === sel);
  const top = system.objects.filter((o) => !o.parent);
  const kids = system.objects.filter((o) => o.parent);
  const bin = useMemo(() => circlePoints(system.binary.separation, 96), [system]);
  const binColor = useVarColor('--map-star', themeKey);
  const focusSize = selObj ? (selObj.kind === 'field' ? selObj.size * 0.8 : selObj.kind === 'binary' ? selObj.size * 0.7 : selObj.size) : 0;
  return (
    <>
      <ambientLight intensity={0.16} />
      <Starfield count={compact ? 2500 : 5000} />
      <Nebula themeKey={themeKey} />
      <Line points={bin} color={binColor} lineWidth={1} transparent opacity={0.35} dashed dashSize={0.2} gapSize={0.2} depthWrite={false} />
      {system.stars.map((s) => (
        <Mover key={s.id} id={s.id} posAt={posAt} time={time}>
          <Sun o={s} pickId={system.star.id} onSelect={onSelect} themeKey={themeKey} />
        </Mover>
      ))}
      {sel === system.star.id && <SelRing size={system.star.size} themeKey={themeKey} />}
      {top.map((o) => (
        <OrbitLine key={`o-${o.id}`} r={o.orbit} on={sel === o.id} dashed={o.kind === 'field'} themeKey={themeKey} />
      ))}
      {kids.map((o) => (
        <Mover key={`ko-${o.id}`} id={o.parent} posAt={posAt} time={time}>
          <OrbitLine r={o.orbit} on={sel === o.id} themeKey={themeKey} />
        </Mover>
      ))}
      {[...top, ...kids].map((o) => (
        <Mover key={o.id} id={o.id} posAt={posAt} time={time}>
          {o.kind === 'field' ? (
            <Field o={o} sel={sel} onSelect={onSelect} themeKey={themeKey} compact={compact} />
          ) : o.kind === 'station' ? (
            <Station o={o} sel={sel} onSelect={onSelect} themeKey={themeKey} />
          ) : (
            <Planet o={o} sel={sel} onSelect={onSelect} themeKey={themeKey} />
          )}
        </Mover>
      ))}
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={1.5} maxDistance={80} maxPolarAngle={Math.PI * 0.49} />
      <CameraRig focus={sel} focusSize={focusSize} posAt={posAt} time={time} home={compact ? 52 : 38} />
      <LabelProjector labelsRef={labelsRef} posAt={posAt} time={time} system={system} sel={sel} />
    </>
  );
}

function SectorNode({ system, onOpen, themeKey }) {
  const tex = useMemo(() => planetTexture('sun', '--map-star', 256, 5), []);
  const glow = useMemo(() => glowTexture('--map-star'), []);
  const ring = useMemo(() => circlePoints(2.4, 96), []);
  const ring2 = useMemo(() => circlePoints(4.2, 128), []);
  const gold = useVarColor('--gm', themeKey);
  const orbit = useVarColor('--map-orbit', themeKey);
  const pair = useRef();
  useFrame((_, dt) => {
    if (pair.current) pair.current.rotation.y += dt * 0.6;
  });
  const open = (e) => { e.stopPropagation(); onOpen(system.id); };
  return (
    <group position={system.pos}>
      <group ref={pair} onClick={open} onPointerOver={pointer} onPointerOut={unpointer}>
        {[-1, 1].map((k) => (
          <group key={k} position={[k * 0.7, 0, 0]}>
            <mesh>
              <sphereGeometry args={[0.36, 32, 16]} />
              <meshBasicMaterial map={tex.texture} toneMapped={false} />
            </mesh>
            <sprite scale={[4, 4, 1]}>
              <spriteMaterial map={glow} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          </group>
        ))}
        <mesh>
          <sphereGeometry args={[1.6, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <Line points={ring} color={gold} lineWidth={1} transparent opacity={0.5} dashed dashSize={0.25} gapSize={0.2} />
      <Line points={ring2} color={orbit} lineWidth={1} transparent opacity={0.25} dashed dashSize={0.1} gapSize={0.25} />
      <Html center position={[0, -1.6, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'auto' }}>
        <button type="button" className="sm-label lg" onClick={() => onOpen(system.id)}>{system.name}</button>
      </Html>
    </group>
  );
}

function SectorScene({ sector, onOpen, compact, themeKey }) {
  return (
    <>
      <Starfield count={compact ? 2500 : 5000} />
      <Nebula themeKey={themeKey} />
      {sector.systems.map((s) => (
        <SectorNode key={s.id} system={s} onOpen={onOpen} themeKey={themeKey} />
      ))}
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={6} maxDistance={60} maxPolarAngle={Math.PI * 0.49} />
    </>
  );
}

function Background({ themeKey }) {
  const c = useVarColor('--map-space', themeKey);
  return <color attach="background" args={[c]} />;
}

export default function StarMapScene({ view, sector, system, sel, onSelect, onOpenSystem, paused = false, compact = false, themeKey, labelsRef }) {
  return (
    <Canvas
      className="sm-canvas"
      camera={{ position: view === 'sector' ? [0, 9, 16] : compact ? [0, 30, 42] : [0, 20, 32], fov: 45, near: 0.1, far: 2000 }}
      dpr={compact ? [1, 1.5] : [1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={unpointer}
    >
      <Background themeKey={themeKey} />
      {view === 'sector' ? (
        <SectorScene sector={sector} onOpen={onOpenSystem} compact={compact} themeKey={themeKey} />
      ) : (
        <SystemScene system={system} sel={sel} onSelect={onSelect} paused={paused} compact={compact} themeKey={themeKey} labelsRef={labelsRef} />
      )}
    </Canvas>
  );
}
