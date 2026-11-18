// 3D-сцена: рідке ядро, орбіта карток-робіт, боке-частинки, підлога-сітка, пост-обробка.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ACCENT = new THREE.Color('#FED7A5');   // кремовий
const TERRA = new THREE.Color('#9E6752');    // теракота
const BLUE = new THREE.Color('#2D4354');     // глибокий синій
const ACCENT2 = new THREE.Color('#5d86a3');  // світліший відтінок #2D4354 для відблисків

const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const ease = t => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 4);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export async function createScene({ canvas, works, state, isTouch, reduced, onOpen, onHover, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const DPR = Math.min(devicePixelRatio || 1, isTouch ? 1.4 : 1.6);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#20212B');
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(0, 2, 26);

  const world = new THREE.Group(); scene.add(world);

  // ---------- небо-градієнт з палітри: синій → сливовий → теракотова смуга → графіт ----------
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: BLUE }, uMid: { value: new THREE.Color('#534145') }, uBand: { value: TERRA }, uCream: { value: ACCENT }, uLow: { value: new THREE.Color('#73766A') }, uBot: { value: new THREE.Color('#20212B') } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uBand, uCream, uLow, uBot; varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 c = mix(uMid, uTop, smoothstep(0.05, 0.75, y));
        c = mix(c, uBand, smoothstep(0.22, 0.0, abs(y - 0.02)) * 0.85);
        c += uCream * smoothstep(0.06, 0.0, abs(y - 0.0)) * 0.22;
        c = mix(c, mix(uLow, uBot, smoothstep(-0.05, -0.5, y)), smoothstep(0.0, -0.12, y));
        gl_FragColor = vec4(c * 0.62, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), skyMat);
  scene.add(sky);

  // ---------- рідке ядро ----------
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmp: { value: 0.32 }, uPulse: { value: 0 }, uMouse: { value: new THREE.Vector3(0, 0, 2) },
      uCamPos: { value: new THREE.Vector3() }, uAccent: { value: TERRA }, uAccent2: { value: ACCENT2 }, uCream: { value: ACCENT } },
    vertexShader: NOISE + /* glsl */`
      uniform float uTime, uAmp, uPulse; uniform vec3 uMouse;
      varying vec3 vN; varying vec3 vPos; varying float vNoise;
      float disp(vec3 p){
        float n = snoise(p*0.85 + vec3(0.0, uTime*0.16, uTime*0.1));
        float n2 = snoise(p*2.3 - vec3(uTime*0.28)) * 0.22;
        float m = smoothstep(1.7, 0.0, distance(p, uMouse)) * 0.22;
        return (n + n2) * uAmp + m + uPulse * 0.18 * sin(p.y*7.0 + uTime*9.0);
      }
      void main(){
        vec3 n = normalize(position);
        float r = length(position);
        float d = disp(position);
        vec3 p = position + n*d;
        vec3 t = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
        vec3 b = cross(n, t);
        vec3 pt = normalize(position + t*0.02)*r; pt += normalize(pt)*disp(pt);
        vec3 pb = normalize(position + b*0.02)*r; pb += normalize(pb)*disp(pb);
        vec3 nn = normalize(cross(pt - p, pb - p));
        if (dot(nn, n) < 0.0) nn = -nn;
        vNoise = d;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * nn);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCamPos, uAccent, uAccent2, uCream; uniform float uTime;
      varying vec3 vN; varying vec3 vPos; varying float vNoise;
      void main(){
        vec3 V = normalize(uCamPos - vPos);
        vec3 N = normalize(vN);
        float ndv = max(dot(N, V), 0.0);
        float fres = pow(1.0 - ndv, 2.4);
        vec3 film = 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + fres*0.8 + vNoise*0.9 + uTime*0.025));
        vec3 tint = mix(uAccent, uAccent2, 0.5 + 0.5*sin(vNoise*5.0 + uTime*0.3));
        vec3 irid = mix(film, tint, 0.8);
        vec3 L = normalize(vec3(-0.6, 0.9, 0.7));
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 90.0);
        float spec2 = pow(max(dot(N, normalize(normalize(vec3(0.9,-0.2,0.5)) + V)), 0.0), 24.0);
        vec3 L2 = normalize(vec3(0.9, -0.35, -0.5));
        float back = pow(max(dot(N, L2), 0.0), 2.0) * fres;
        vec3 col = vec3(0.012, 0.013, 0.02);
        col += max(dot(N, L), 0.0) * 0.03;
        col += irid * pow(fres, 1.6) * 0.7;
        col += spec * uCream * 1.6 + spec2 * uCream * 0.3;
        col += back * uAccent * 2.4;
        float band = smoothstep(0.0, 0.02, abs(fract(vNoise*4.0 + fres*1.5) - 0.5) - 0.47);
        col += band * irid * 0.25 * fres;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, isTouch ? 48 : 80), coreMat);
  world.add(core);

  // ---------- 3D-мозок (models/brain.glb). Поки модель вантажиться або якщо її немає — показуємо рідке ядро ----------
  const brain = new THREE.Group(); brain.visible = false; world.add(brain);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const brainMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#c27d68'), roughness: 0.5, metalness: 0,
    clearcoat: 0.45, clearcoatRoughness: 0.28,
    sheen: 0.6, sheenColor: new THREE.Color('#FED7A5'), sheenRoughness: 0.5,
    envMap: envTex, envMapIntensity: 0.28
  });
  // фресенель-кайма в кольорах палітри (як у ядра)
  brainMat.onBeforeCompile = sh => {
    sh.uniforms.uRimA = { value: TERRA }; sh.uniforms.uRimB = { value: ACCENT2 };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimA, uRimB;')
      .replace('#include <opaque_fragment>', `
        float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.6);
        outgoingLight += mix(uRimA * 1.6, uRimB * 1.2, saturate(normalize(vViewPosition).y * 0.5 + 0.5)) * rimF;
        #include <opaque_fragment>`);
  };
  const key = new THREE.DirectionalLight('#FED7A5', 3.4); key.position.set(-4, 5, 3);
  const rim = new THREE.DirectionalLight('#9E6752', 3.5); rim.position.set(4, -1, -5);
  const fill = new THREE.HemisphereLight('#5d86a3', '#534145', 0.35);
  world.add(key, rim, fill);
  let brainReady = false;
  const brainLoad = new Promise(res => {
    const gl = new GLTFLoader();
    const draco = new DRACOLoader(); draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
    gl.setDRACOLoader(draco);
    gl.load(new URL('../models/brain.glb', import.meta.url).href, g => {
      const m = g.scene;
      m.traverse(o => {
        if (!o.isMesh) return;
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        o.material = brainMat;
      });
      // центруємо й масштабуємо під розмір ядра
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      m.position.sub(c);
      const s = 3.0 / Math.max(size.x, size.y, size.z);
      const pivot = new THREE.Group(); pivot.add(m); pivot.scale.setScalar(s);
      brain.add(pivot);
      brain.visible = true; core.visible = false; brainReady = true;
      res();
    }, undefined, () => res());
  });

  // тонкі орбіти навколо ядра
  const orbitMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const orbit1 = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.006, 6, 220), orbitMat);
  const orbit2 = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.004, 6, 220), new THREE.MeshBasicMaterial({ color: ACCENT2, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  orbit1.rotation.set(1.25, 0.2, 0); orbit2.rotation.set(1.9, -0.5, 0.3);
  world.add(orbit1, orbit2);

  // ---------- картки робіт ----------
  // YouTube-обкладинки не мають CORS, тож у 3D-кільце беремо лише власні файли
  const own = works.filter(w => w.media[0].type !== 'youtube');
  const src = own.filter(w => w.featured).length >= 4 ? own.filter(w => w.featured) : own;
  let ringWorks = src.slice(0, 14);
  if (ringWorks.length) while (ringWorks.length < 8) ringWorks = ringWorks.concat(ringWorks).slice(0, 8);
  const N = ringWorks.length;
  const R = clamp(N * 1.7 / (Math.PI * 2), 4.1, 6.2);
  const ring = new THREE.Group(); ring.rotation.set(0.2, 0, -0.12);
  world.add(ring);

  const cardVS = /* glsl */`
    uniform float uBend, uHover;
    varying vec2 vUv; varying float vDepth;
    void main(){
      vUv = uv;
      vec3 p = position;
      p.z -= p.x*p.x*uBend;
      p.z += uHover*0.25;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const cardFS = /* glsl */`
    uniform sampler2D uMap; uniform vec2 uSize; uniform float uImgAspect, uOpacity, uHover, uFocus, uLoaded, uDof; uniform vec3 uAccent;
    varying vec2 vUv; varying float vDepth;
    float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    void main(){
      vec2 p = (vUv - 0.5) * uSize;
      float d = sdRound(p, uSize*0.5, 0.11);
      float aa = fwidth(d) * 1.2;
      float mask = 1.0 - smoothstep(-aa, aa, d);
      if (mask < 0.01) discard;
      float planeA = uSize.y / uSize.x;
      vec2 uv = vUv;
      if (uImgAspect > planeA) uv.y = (uv.y - 0.5) * planeA / uImgAspect + 0.5;
      else uv.x = (uv.x - 0.5) * uImgAspect / planeA + 0.5;
      float blur = clamp(abs(vDepth - uFocus) * uDof, 0.0, 4.5) * (1.0 - uHover);
      vec3 col = texture2D(uMap, uv, blur).rgb;
      col = mix(vec3(0.05, 0.05, 0.07), col, uLoaded);
      if (!gl_FrontFacing) col = col * 0.18 + vec3(0.02);
      col *= 0.78 + uHover * 0.32;
      float edge = smoothstep(aa * 2.5, 0.0, abs(d + 0.006));
      col += edge * mix(vec3(0.18), uAccent * 1.8, uHover);
      gl_FragColor = vec4(col, mask * uOpacity);
    }`;

  const loader = new THREE.TextureLoader();
  const blank = new THREE.DataTexture(new Uint8Array([12, 12, 16, 255]), 1, 1); blank.needsUpdate = true;
  const cards = [];
  let loaded = 0;
  const loads = ringWorks.map((w, i) => new Promise(res => {
    const m = w.media[0];
    let a = m.w && m.h ? m.h / m.w : 16 / 9;
    a = clamp(a, 0.62, 1.78);
    const H = 2.05, W = H / a;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: blank }, uSize: { value: new THREE.Vector2(W, H) }, uImgAspect: { value: m.w && m.h ? m.h / m.w : a },
        uOpacity: { value: 0 }, uHover: { value: 0 }, uFocus: { value: 10 }, uLoaded: { value: 0 }, uBend: { value: 0.06 }, uDof: { value: isTouch ? 0 : 0.55 }, uAccent: { value: ACCENT } },
      vertexShader: cardVS, fragmentShader: cardFS, transparent: true, side: THREE.DoubleSide, depthWrite: true
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 16, 1), mat);
    mesh.userData = { work: w, i, hover: 0, base: i / N * Math.PI * 2, seed: Math.random() * 10 };
    ring.add(mesh); cards.push(mesh);
    loader.load(m.poster || m.src, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      mat.uniforms.uMap.value = tex; mesh.userData.poster = tex;
      mat.uniforms.uLoaded.value = 1;
      onProgress?.(++loaded / N); res();
    }, undefined, () => { onProgress?.(++loaded / N); res(); });
  }));

  // ---------- боке-частинки ----------
  const PC = isTouch ? 700 : 1600;
  const pPos = new Float32Array(PC * 3), pSize = new Float32Array(PC), pSeed = new Float32Array(PC);
  for (let i = 0; i < PC; i++) {
    const r = 3 + Math.pow(Math.random(), 0.7) * 26, th = Math.random() * Math.PI * 2;
    pPos.set([Math.cos(th) * r, (Math.random() - 0.5) * 20, Math.sin(th) * r], i * 3);
    pSize[i] = 0.6 + Math.pow(Math.random(), 3) * 3.2; pSeed[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: DPR }, uFocus: { value: 10 }, uRise: { value: 0 }, uA: { value: TERRA }, uB: { value: ACCENT2 } },
    vertexShader: /* glsl */`
      attribute float aSize, aSeed; uniform float uTime, uPR, uFocus, uRise;
      varying float vAlpha, vSeed, vCoc;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + uTime*(0.12 + aSeed*0.25) + uRise + 10.0, 20.0) - 10.0;
        p.x += sin(uTime*0.23 + aSeed*31.0)*0.35;
        p.z += cos(uTime*0.19 + aSeed*17.0)*0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = max(-mv.z, 0.1);
        float coc = clamp(abs(depth - uFocus) * 0.22, 0.0, 3.5);
        vCoc = coc;
        gl_PointSize = min(aSize * uPR * (1.0 + coc*1.6) * (16.0 / depth), 46.0 * uPR);
        vAlpha = (0.85 / (1.0 + coc*coc*1.4)) * smoothstep(42.0, 14.0, depth) * smoothstep(0.5, 2.0, depth);
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uA, uB; varying float vAlpha, vSeed, vCoc;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float disc = smoothstep(0.5, 0.42 - min(vCoc,1.0)*0.12, d);
        float ring = smoothstep(0.5, 0.44, d) * smoothstep(0.3, 0.46, d) * min(vCoc, 1.0) * 0.6;
        vec3 c = vSeed < 0.12 ? uA : vSeed < 0.22 ? uB : vec3(1.0, 0.86, 0.68);
        gl_FragColor = vec4(c * (disc*0.7 + ring), vAlpha * (disc*0.7 + ring));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(pGeo, pMat); scene.add(points);

  // ---------- підлога-сітка ----------
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: TERRA } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uA; varying vec3 vW;
      void main(){
        vec2 g = vW.xz / 1.4;
        vec2 f = abs(fract(g - 0.5) - 0.5) / fwidth(g);
        float line = 1.0 - min(min(f.x, f.y), 1.0);
        float r = length(vW.xz);
        float fade = smoothstep(26.0, 2.0, r);
        float glow = smoothstep(7.0, 0.0, r);
        float wave = 0.5 + 0.5*sin(r*1.4 - uTime*1.6);
        vec3 col = vec3(0.07, 0.075, 0.07) * line * fade + uA * glow * glow * 0.05 + uA * line * glow * wave * 0.22;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3.6;
  world.add(floor);

  // ---------- пост-обробка ----------
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (!isTouch) { bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.65, 0.72); composer.addPass(bloom); }
  const finalPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uStrength: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: innerWidth / innerHeight } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uStrength, uAspect; uniform vec2 uCenter; varying vec2 vUv;
      void main(){
        vec2 dir = vUv - uCenter;
        float edge = length(dir * vec2(uAspect, 1.0));
        float ca = 0.0015 + uStrength*0.004;
        vec3 col = vec3(0.0); float tot = 0.0;
        for (int i = 0; i < 10; i++){
          float t = float(i) / 9.0;
          float s = 1.0 - uStrength * t * 0.09 * edge;
          float w = 1.0 - t*0.6;
          col.r += texture2D(tDiffuse, uCenter + dir*(s + ca*edge)).r * w;
          col.g += texture2D(tDiffuse, uCenter + dir*s).g * w;
          col.b += texture2D(tDiffuse, uCenter + dir*(s - ca*edge)).b * w;
          tot += w;
        }
        col /= tot;
        float vig = smoothstep(1.35, 0.25, edge);
        col *= mix(0.25, 1.0, vig);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  composer.addPass(finalPass);
  composer.addPass(new OutputPass());

  // ---------- компоновка під екран ----------
  const layout = { ox: 0, oy: 0, s: 1, cam: 1 };
  let lastW = 0, lastH = 0;
  function resize() {
    const w = innerWidth, h = innerHeight, a = w / h;
    if (!w || !h) return;
    lastW = w; lastH = h;
    camera.aspect = a;
    camera.fov = a < 0.8 ? 62 : a < 1.2 ? 50 : 40;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom?.setSize(w / 2, h / 2);
    finalPass.uniforms.uAspect.value = a;
    // зсув кадру: на десктопі сцена праворуч від заголовка, на телефоні — вище
    layout.ox = a > 1.2 ? -w * 0.17 : 0;
    layout.oy = a < 0.8 ? h * 0.16 : a < 1.2 ? h * 0.08 : h * 0.02;
    layout.s = 1;
    // на вузьких екранах камера відходить, щоб кільце вміщалося по ширині
    const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * a;
    layout.cam = Math.max(1, 0.58 / halfW * 0.82);
    camera.setViewOffset(w, h, layout.ox, layout.oy, w, h);
  }
  resize(); addEventListener('resize', resize);

  // ---------- взаємодія ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
  let hovered = null, ringAngle = 0, ringVel = 0, drag = null, pointerOnCanvas = false;
  canvas.addEventListener('pointermove', e => {
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    pointerOnCanvas = true;
    if (drag) { const dx = e.clientX - drag.x; drag.moved += Math.abs(dx); ringVel += dx * 0.0032; drag.x = e.clientX; }
  });
  canvas.addEventListener('pointerleave', () => { pointerOnCanvas = false; ndc.set(9, 9); });
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, moved: 0 }; ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
  addEventListener('pointerup', () => {
    if (drag && drag.moved < 8) {
      const hit = pick();
      if (hit) { pulse(1); onOpen?.(hit.userData.work.id); }
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => (drag = null));
  function pick() {
    if (state.scrollY > innerHeight * 0.85) return null;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(cards, false);
    for (const h of hits) { if (h.object.material.uniforms.uOpacity.value > 0.5) return h.object; }
    return null;
  }

  // відео на картці при наведенні
  let vid = null, vidTimer = 0;
  function setHover(m) {
    if (hovered === m) return;
    if (hovered) { stopVideo(hovered); }
    hovered = m;
    onHover?.(!!m);
    canvas.style.cursor = m ? 'pointer' : '';
    clearTimeout(vidTimer);
    if (m && m.userData.work.media[0].type === 'video' && !isTouch) vidTimer = setTimeout(() => startVideo(m), 220);
  }
  function startVideo(m) {
    const md = m.userData.work.media[0];
    vid = document.createElement('video');
    Object.assign(vid, { muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', src: md.src });
    vid.play().then(() => {
      if (hovered !== m) return;
      const vt = new THREE.VideoTexture(vid); vt.colorSpace = THREE.SRGBColorSpace;
      m.material.uniforms.uMap.value = vt; m.userData.vtex = vt;
    }).catch(() => {});
  }
  function stopVideo(m) {
    if (m.userData.vtex) { m.material.uniforms.uMap.value = m.userData.poster || blank; m.userData.vtex.dispose(); m.userData.vtex = null; }
    if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); vid = null; }
  }

  // ---------- анімація ----------
  let pulseV = 0, introStart = -1, velS = 0;
  const pulse = v => (pulseV = Math.max(pulseV, v));
  const cam = { theta: -0.15, radius: 26, height: 2.2, look: new THREE.Vector3() };
  const clock = new THREE.Clock();
  const lb = document.querySelector('.lb');
  const tmp = new THREE.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    if (!lb.hidden && lb.classList.contains('is-open')) return; // економимо GPU під лайтбоксом
    if (!innerWidth || !innerHeight) return;
    if (innerWidth !== lastW || innerHeight !== lastH) resize();
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const vh = innerHeight;
    const maxS = Math.max(1, document.documentElement.scrollHeight - vh);
    const hp = clamp(state.scrollY / vh, 0, 1.4);
    const sp = clamp(state.scrollY / maxS, 0, 1);
    const he = ease(hp / 1.2);

    // швидкість скролу → радіальне розмиття/хроматика
    velS = damp(velS, state.vel / Math.max(dt, 0.008) / 60, 6, dt); state.vel = 0;
    const speed = clamp(Math.abs(velS) / 70, 0, 1.4);

    const intro = introStart < 0 ? 0 : ease((t - introStart) / 2.6);
    const introCards = introStart < 0 ? 0 : (t - introStart);

    // ядро
    coreMat.uniforms.uTime.value = t;
    coreMat.uniforms.uPulse.value = pulseV;
    coreMat.uniforms.uAmp.value = 0.3 + speed * 0.12 + pulseV * 0.1;
    coreMat.uniforms.uMouse.value.set(state.mouseX * 1.6, state.mouseY * 1.6, 1.3);
    coreMat.uniforms.uCamPos.value.copy(camera.position);
    core.rotation.y = t * 0.08; core.rotation.x = Math.sin(t * 0.13) * 0.2;
    core.scale.setScalar((0.35 + 0.65 * intro) * (1 - he * 0.12));
    if (brainReady) {
      // повільне обертання, нахил за мишею, «дихання» та імпульс при кліку
      brain.rotation.y = damp(brain.rotation.y, t * 0.12 + state.mouseX * 0.5, 3, dt);
      brain.rotation.x = damp(brain.rotation.x, -0.12 - state.mouseY * 0.25 + Math.sin(t * 0.2) * 0.05, 3, dt);
      brain.rotation.z = Math.sin(t * 0.15) * 0.04;
      brain.position.y = Math.sin(t * 0.7) * 0.06;
      const breathe = 1 + Math.sin(t * 1.3) * 0.012 + pulseV * 0.06;
      brain.scale.setScalar((0.35 + 0.65 * intro) * (1 - he * 0.12) * breathe);
    }
    orbit1.rotation.z = t * 0.21; orbit2.rotation.z = -t * 0.15;
    orbit1.scale.setScalar(0.4 + 0.6 * intro); orbit2.scale.setScalar(0.3 + 0.7 * intro);

    // кільце карток
    if (!drag) ringVel *= Math.exp(-2.2 * dt);
    ringAngle += (reduced ? 0 : 0.07) * dt + ringVel * dt * 4 + velS * 0.0005;
    ring.rotation.x = 0.2 - he * 0.28 + state.mouseY * 0.05;
    ring.rotation.z = -0.12 + Math.sin(t * 0.2) * 0.04;
    const spread = 1 + he * 0.35;
    const hit = (!drag && pointerOnCanvas) ? pick() : null;
    setHover(hit);
    const camDist = camera.position.distanceTo(world.position);
    cards.forEach(m => {
      const u = m.userData, mu = m.material.uniforms;
      const k = ease((introCards - 0.35 - u.i * 0.06) / 1.4);
      const a = u.base + ringAngle;
      const r = R * spread * (0.15 + 0.85 * k);
      u.hover = damp(u.hover, hovered === m ? 1 : 0, 10, dt);
      m.position.set(Math.sin(a) * r, Math.sin(a * 2 + t * 0.6 + u.seed) * 0.22 + (1 - k) * 0.3, Math.cos(a) * r);
      m.rotation.set(Math.sin(t * 0.5 + u.seed) * 0.04, a + (1 - k) * 2.5, Math.sin(t * 0.37 + u.seed) * 0.05);
      m.scale.setScalar((0.25 + 0.75 * k) * (1 + u.hover * 0.12));
      mu.uOpacity.value = k * (1 - clamp((hp - 0.6) * 1.2, 0, 0.6));
      mu.uHover.value = u.hover;
      mu.uFocus.value = camDist - R * 0.75;
      mu.uBend.value = 0.06 + speed * 0.05;
    });

    // камера: безперервний рух — облет, дихання, паралакс, наїзд при скролі
    // на героє — близько до кільця; далі камера здіймається і дивиться згори, кільце стає фоном
    const tTheta = -0.18 + he * 0.9 + sp * 2.4 + Math.sin(t * 0.11) * 0.08 + state.mouseX * 0.1;
    const tRadius = (10.8 + he * 1.8 + Math.sin(sp * Math.PI) * 2.5) * layout.cam + (1 - intro) * 16;
    const tHeight = 0.5 + he * 4.2 - Math.sin(sp * Math.PI) * 1.5 + Math.sin(t * 0.17) * 0.18 + state.mouseY * 0.35 + (1 - intro) * 3;
    cam.theta = damp(cam.theta, tTheta, 2.6, dt);
    cam.radius = damp(cam.radius, tRadius, intro < 1 ? 5 : 2.6, dt);
    cam.height = damp(cam.height, tHeight, 2.6, dt);
    // після героя кадр плавно центрується
    const k2 = 1 - he;
    camera.setViewOffset(lastW, lastH, layout.ox * k2, layout.oy * k2, lastW, lastH);
    world.position.set(0, -he * 0.5, 0);
    world.scale.setScalar(layout.s);
    const c = world.position;
    camera.position.set(c.x + Math.sin(cam.theta) * cam.radius, c.y + cam.height, Math.cos(cam.theta) * cam.radius);
    cam.look.lerp(tmp.set(c.x, c.y - 0.2 + sp * 0.4, 0), 1 - Math.exp(-4 * dt));
    const roll = Math.sin(t * 0.09) * 0.025 + clamp(velS * 0.0008, -0.05, 0.05) + ringVel * 0.02;
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(cam.look);

    // частинки та підлога
    pMat.uniforms.uTime.value = t;
    pMat.uniforms.uRise.value += velS * 0.002;
    pMat.uniforms.uFocus.value = camDist;
    floorMat.uniforms.uTime.value = t;

    // центр радіального розмиття — там, де ядро на екрані
    tmp.copy(world.position).project(camera);
    finalPass.uniforms.uCenter.value.set(clamp(tmp.x * 0.5 + 0.5, 0.2, 0.8), clamp(tmp.y * 0.5 + 0.5, 0.2, 0.8));
    pulseV = damp(pulseV, 0, 2.5, dt);
    finalPass.uniforms.uStrength.value = reduced ? 0 : speed + pulseV * 0.8 + Math.abs(ringVel) * 0.6 + (1 - intro) * 1.2;
    if (bloom) bloom.strength = 0.5 + pulseV * 0.4 + (hovered ? 0.12 : 0);

    composer.render(dt);
  }

  await Promise.race([Promise.all([...loads, brainLoad]), new Promise(r => setTimeout(r, 7000))]);
  frame();

  return {
    intro() { introStart = clock.elapsedTime; },
    pulse
  };
}
