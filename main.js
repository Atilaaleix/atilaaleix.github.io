// alternate. — cabeça 3D ASCII interativa (QR / link-tree)
// motor: three.js (malha 3D real) → sampler ASCII em <canvas> 2D PRÓPRIO.
// por que canvas e não AsciiEffect: a table DOM do AsciiEffect é reescrita todo frame
// (reflow → o rosto "pulsa/aumenta-diminui" + caracteres fogem pro lado). canvas = grade
// fixa, zero reflow, e controlo máscara/threshold/cor/fonte. só a cabeça gira (câmera fixa).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HEAD_SRC = 'assets/head.glb';

// enquadramento do rosto (cabeça INTEIRA visível, centrada) — tunável
// viewport da câmera (fov 30 @ z=12) = ~6.43 unidades de altura → escala > 6.4 CORTA a cabeça
// medido no render (eyes ny 0.33 / chin ny 0.51 @ scale 4.4): pro ROSTO preencher o oval
// (olhos ~0.36, queixo ~0.63) → scale ×1.5 + desce a cabeça (crânio sai pelo topo do oval, mascarado)
const FACE_SCALE = 6.6;   // rosto grande no oval (o topo do crânio fica fora do oval — é mascarado, não corta)
const FACE_Y     = -0.74; // desce a cabeça → olhos/nariz/boca no EIXO do oval, queixo perto da base
const FACE_X     = 0.215; // bbox do modelo puxa pra esquerda (nuca/cabelo) → compensa (calibrado por centroide: 0.285 sobrava +2% à direita)

// rampa de densidade (leve→denso). mais níveis = mais detalhe de superfície ("riqueza")
const RAMP = " .'`^\",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

// paletas — bg / deep(sombra do rosto) / lite(luz do rosto) / glow(varredura do estúdio)
const PALETTES = [
  { bg:'#0C0614', deep:'#3A1D63', lite:'#EBD8FF', glow:'#B98BFF' }, // roxo sinal (default)
  { bg:'#0A0710', deep:'#5A1E52', lite:'#FFE1F4', glow:'#FF74C6' }, // magenta quente
  { bg:'#050D14', deep:'#134152', lite:'#DFFBFF', glow:'#54E6D6' }, // ciano/verde
  { bg:'#0B0B0F', deep:'#3B2B57', lite:'#FFFFFF', glow:'#C77DFF' }, // mono roxo claro
];
let pi = 0;
let colDeep = new THREE.Color(), colLite = new THREE.Color(), colGlow = new THREE.Color();

let camera, scene, renderer, rt, pivot, head;
let out, octx;                       // <canvas> de saída + ctx 2D
let COLS = 0, ROWS = 0, cellW = 0, cellH = 0, dpr = 1;
let pix = null;                      // buffer RGBA lido do render target
let lumGrid = null, labelBuf = null, queueBuf = null;  // p/ manter só o maior componente conexo
let W = window.innerWidth, H = window.innerHeight;
const clock = new THREE.Clock();

// centro do rosto na grade (fração 0..1) — alinha máscara/varredura ao rosto enquadrado
const FACE_CX = 0.5, FACE_CY = 0.42;
// oval da máscara em fração da ALTURA (aspect-corrigido → mesmo tamanho físico no desktop e no mobile;
// funde as bordas → sem "quadrado" na web e apara orelha/ombro que viram códigos soltos)
const MASK_RX = 0.235, MASK_RY = 0.305;
const CHAR_ASPECT = 0.52;            // largura/altura de uma célula (char mais alto que largo)

// alvo de rotação (só a cabeça)
let ptrRX = 0, ptrRY = 0, gyroRX = 0, gyroRY = 0, curRX = 0, curRY = 0;
let gyroOn = false, baseBeta = null, baseGamma = null;

// gesto (tap = troca cor)
let pDown = false, pX = 0, pY = 0, moved = 0, downT = 0;
let bootT = 0;                       // 0..1 revela o rosto ao carregar

const clamp = (v,a,b)=> v<a?a : v>b?b : v;
const smooth = (e0,e1,x)=>{ const t = clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t); };

init();

function init(){
  out  = document.getElementById('ascii-canvas');
  octx = out.getContext('2d', { alpha:false });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);   // fundo preto → luminância 0 → espaço

  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);

  // luz RASANTE frontal-lateral esculpe o relevo. SEM rim atrás (era ele que iluminava a nuca/lateral
  // e gerava os "códigos soltos" à direita). fill mínimo só p/ o lado escuro não sumir de todo.
  pivot = new THREE.Group();
  scene.add(pivot);

  // luz RASANTE presa ao PIVOT → gira junto com o rosto = relevo CONSTANTE (nunca desbota/some ao girar)
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-0.46, 0.22, 1.08);
  pivot.add(key); pivot.add(key.target);
  // fill do lado direito: sem ele metade da cara fica PRETA → lia "torto/virado" mesmo frontal
  const fill = new THREE.DirectionalLight(0xffffff, 1.25); fill.position.set(0.62, 0.08, 0.95);
  pivot.add(fill); pivot.add(fill.target);
  scene.add(new THREE.AmbientLight(0x0e0820, 0.06));

  const nmTex = new THREE.TextureLoader().load('assets/head-normal.jpg');
  nmTex.colorSpace = THREE.NoColorSpace;
  nmTex.flipY = false;

  new GLTFLoader().load(HEAD_SRC, (gltf)=>{
    const root = gltf.scene;
    root.traverse((o)=>{
      if(o.isMesh){
        o.material = new THREE.MeshStandardMaterial({
          color:0xffffff, roughness:0.72, metalness:0.0,
          normalMap:nmTex, normalScale:new THREE.Vector2(0.66,0.66), flatShading:false,
        });
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = FACE_SCALE / size.y;
    root.scale.setScalar(s);
    root.position.set(-center.x*s + FACE_X, -center.y*s + FACE_Y, -center.z*s);
    head = root;
    pivot.add(head);
    clock.start();
    document.body.classList.add('ready');
  }, undefined, (err)=>{
    console.error('falha ao carregar modelo', err);
    const b = document.getElementById('boot');
    if(b) b.textContent = 'erro ao carregar o modelo (assets/head.glb)';
  });

  renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.26;

  applyPalette();
  computeGrid();

  bindPointer(out);
  setupGyro();
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

// grade de amostragem = render target COLS×ROWS; canvas de saída cobre a viewport inteira
function computeGrid(){
  W = window.innerWidth; H = window.innerHeight;
  // mobile: 122 cols (validado). desktop: célula ~4.5px = mesma densidade FÍSICA do mobile —
  // com o rosto centrado menor, 132 cols dava só ~25 chars de largura de rosto (esparso/low-res)
  COLS  = W < 720 ? 122 : Math.min(340, Math.round(W / 4.5));
  cellW = W / COLS;
  cellH = cellW / CHAR_ASPECT;
  ROWS  = Math.ceil(H / cellH);
  dpr   = Math.min(window.devicePixelRatio || 1, 2);

  out.width  = Math.round(W * dpr);
  out.height = Math.round(H * dpr);
  out.style.width = W + 'px'; out.style.height = H + 'px';
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.textBaseline = 'top';
  octx.font = fontSpec();

  if(rt) rt.dispose();
  rt = new THREE.WebGLRenderTarget(COLS, ROWS, { magFilter:THREE.NearestFilter, minFilter:THREE.NearestFilter });
  pix = new Uint8Array(COLS * ROWS * 4);
  lumGrid = new Float32Array(COLS * ROWS);
  labelBuf = new Int32Array(COLS * ROWS);
  queueBuf = new Int32Array(COLS * ROWS);
  renderer.setSize(COLS, ROWS, false);

  camera.aspect = (COLS * cellW) / (ROWS * cellH);
  camera.updateProjectionMatrix();
}
function fontSpec(){ return `700 ${(cellH*1.16).toFixed(2)}px "BlinkMac", ui-monospace, "SFMono-Regular", Menlo, monospace`; }

// ---------- loop ----------
function animate(){
  const src = gyroOn ? { x:gyroRX, y:gyroRY } : { x:ptrRX, y:ptrRY };
  curRX += (src.x - curRX) * 0.08;
  curRY += (src.y - curRY) * 0.08;
  if(pivot){ pivot.rotation.x = curRX; pivot.rotation.y = curRY; }

  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(rt, 0, 0, COLS, ROWS, pix);
  renderer.setRenderTarget(null);

  drawAscii();
}

function drawAscii(){
  const t = clock.getElapsedTime();
  if(bootT < 1) bootT = clamp(bootT + 0.022, 0, 1);

  const N = RAMP.length;
  const p = PALETTES[pi];
  octx.fillStyle = p.bg;
  octx.fillRect(0, 0, W, H);
  octx.font = fontSpec();

  // varredura do estúdio: banda de brilho roxo sobe lentamente (loop ~9s) — nossa assinatura, sutil
  const sweepY = 1 - ((t * 0.36) % 1.06);   // varredura sobe ~3-4x a cada 10s (mais frequente)

  // passada 1 — luminância pós-máscara/threshold na grade
  const G = lumGrid; G.fill(0);
  const AR = W / H;                            // aspect-corrige o eixo x → oval físico constante
  const cxDyn = FACE_CX + curRY * 0.16;        // o oval ACOMPANHA o rosto ao girar → nunca corta/desbota a face
  for(let row = 0; row < ROWS; row++){
    const sy = ROWS - 1 - row;               // WebGL lê de baixo p/ cima
    const ny = (row + 0.5) / ROWS;
    for(let col = 0; col < COLS; col++){
      const i = (sy * COLS + col) * 4;
      let lum = (0.299*pix[i] + 0.587*pix[i+1] + 0.114*pix[i+2]) / 255;
      if(lum < 0.04) continue;
      const nx = (col + 0.5) / COLS;
      const dx = ((nx - cxDyn) * AR) / MASK_RX, dy = (ny - FACE_CY) / MASK_RY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      // feather horizontal EXTRA (|dx|): apara as ORELHAS (ficam a |dx|~0.81, mais largas que a bochecha ~0.57)
      // sem tocar crânio/queixo — o feather radial sozinho só apagava a orelha do lado escuro
      const mask = (1 - smooth(0.9, 1.08, dist)) * (1 - smooth(0.68, 0.84, Math.abs(dx)));
      if(mask <= 0.02) continue;
      lum *= mask;
      if(lum < 0.23) continue;                // threshold quebra pontes fracas → CC isola o rosto
      if(dist > 0.58 && lum < 0.50) continue; // zona externa: só char forte fica → quebra a ponte cabelo/têmpora → CC mata a ORELHA solta inteira
      G[row * COLS + col] = lum;
    }
  }

  // passada 2 — manter só o MAIOR componente conexo → mata qualquer caractere solto do rosto
  keepLargestComponent(G);

  // passada 3 — desenhar
  for(let row = 0; row < ROWS; row++){
    if((1 - row / ROWS) > bootT + 0.06) continue;   // reveal de baixo→cima no boot
    const yPix = row * cellH;
    const ny = (row + 0.5) / ROWS;
    for(let col = 0; col < COLS; col++){
      const v = G[row * COLS + col];
      if(v <= 0) continue;
      const L = clamp((v - 0.23) / 0.77, 0, 1);   // remapeia p/ recuperar contraste após o threshold
      if(L < 0.09) continue;                       // piso: só corta resíduos quase-pretos (rosto fica mais completo)
      const idx = clamp(Math.floor(Math.pow(L, 0.85) * (N - 1)), 0, N - 1);
      const ch = RAMP[idx];
      if(ch === ' ') continue;

      let cr = colDeep.r + (colLite.r - colDeep.r) * L;
      let cg = colDeep.g + (colLite.g - colDeep.g) * L;
      let cb = colDeep.b + (colLite.b - colDeep.b) * L;
      const band = 1 - smooth(0, 0.045, Math.abs(ny - sweepY));
      if(band > 0){
        const k = band * 0.65;
        cr += (colGlow.r - cr) * k; cg += (colGlow.g - cg) * k; cb += (colGlow.b - cb) * k;
      }
      octx.fillStyle = `rgb(${(cr*255)|0},${(cg*255)|0},${(cb*255)|0})`;
      octx.fillText(ch, col * cellW, yPix);
    }
  }
}

// flood-fill 8-conectado: acha o maior blob aceso e zera todo o resto (fragmentos flutuantes)
function keepLargestComponent(G){
  const lab = labelBuf, q = queueBuf, n = COLS * ROWS;
  lab.fill(0);
  let curLabel = 0, bestLabel = 0, bestSize = 0;
  for(let start = 0; start < n; start++){
    if(G[start] <= 0 || lab[start] !== 0) continue;
    curLabel++;
    let head = 0, tail = 0, size = 0;
    q[tail++] = start; lab[start] = curLabel;
    while(head < tail){
      const idx = q[head++]; size++;
      const r = (idx / COLS) | 0, c = idx - r * COLS;
      for(let dr = -1; dr <= 1; dr++){
        const rr = r + dr; if(rr < 0 || rr >= ROWS) continue;
        for(let dc = -1; dc <= 1; dc++){
          if(dr === 0 && dc === 0) continue;
          const cc = c + dc; if(cc < 0 || cc >= COLS) continue;
          const j = rr * COLS + cc;
          if(G[j] > 0 && lab[j] === 0){ lab[j] = curLabel; q[tail++] = j; }
        }
      }
    }
    if(size > bestSize){ bestSize = size; bestLabel = curLabel; }
  }
  if(bestLabel === 0) return;
  for(let i = 0; i < n; i++){ if(lab[i] !== bestLabel) G[i] = 0; }
}

// ---------- ponteiro: hover (desktop) / toque (mobile) → SÓ a cabeça segue ----------
function bindPointer(el){
  window.addEventListener('pointermove', (e)=>{
    const nx = (e.clientX / W) * 2 - 1;
    const ny = (e.clientY / H) * 2 - 1;
    ptrRY = clamp(nx, -1, 1) * 0.27;   // amplitude baixa → o rosto só ACOMPANHA o mouse, nunca vira de perfil (não some)
    ptrRX = clamp(ny, -1, 1) * 0.16;
    if(pDown){ moved += Math.abs(e.clientX - pX) + Math.abs(e.clientY - pY); pX = e.clientX; pY = e.clientY; }
  });
  el.addEventListener('pointerdown', (e)=>{
    pDown = true; pX = e.clientX; pY = e.clientY; moved = 0; downT = performance.now();
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
  });
  const up = ()=>{
    if(pDown){
      const dt = performance.now() - downT;
      if(moved < 9 && dt < 350){ cyclePalette(); }
    }
    pDown = false;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', ()=>{ pDown = false; });
}

// ---------- giroscópio (SEM botão — automático onde dá, 1º toque no iOS) ----------
let gyroArmed = false;
function setupGyro(){
  if(typeof DeviceOrientationEvent === 'undefined') return;               // desktop → rato
  const needsPerm = typeof DeviceOrientationEvent.requestPermission === 'function';
  if(!needsPerm){                                                          // Android/Chrome → automático já
    window.addEventListener('deviceorientation', onOrient);
    gyroOn = true;
    return;
  }
  // iOS 13+ exige 1 gesto do utilizador (regra da Apple, não dá 100% auto).
  // Ativa no PRIMEIRO toque em qualquer sítio da página — sem botão.
  const arm = async ()=>{
    if(gyroArmed) return; gyroArmed = true;
    try{
      const s = await DeviceOrientationEvent.requestPermission();
      if(s === 'granted'){ window.addEventListener('deviceorientation', onOrient); gyroOn = true; }
      else gyroArmed = false;                                             // negou → deixa tentar de novo
    }catch(_){ gyroArmed = false; }
    if(gyroOn){
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('touchend', arm);
    }
  };
  window.addEventListener('pointerdown', arm);
  window.addEventListener('touchend', arm);
}
function onOrient(e){
  if(e.beta == null || e.gamma == null) return;
  if(baseBeta == null){ baseBeta = e.beta; baseGamma = e.gamma; }
  gyroRX = clamp((e.beta  - baseBeta ) / 42, -1, 1) * 0.16;
  gyroRY = clamp((e.gamma - baseGamma) / 42, -1, 1) * 0.27;
}

// ---------- paleta ----------
function applyPalette(){
  const p = PALETTES[pi];
  colDeep.set(p.deep); colLite.set(p.lite); colGlow.set(p.glow);
  const r = document.documentElement.style;
  r.setProperty('--bg', p.bg);
  r.setProperty('--glow', p.glow);
  r.setProperty('--lite', p.lite);
  document.body.style.background = p.bg;
  if(scene) scene.background.set(0x000000);
}
function cyclePalette(){ pi = (pi + 1) % PALETTES.length; applyPalette(); }

// ---------- resize ----------
function onResize(){ computeGrid(); }
