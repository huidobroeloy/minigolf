import * as THREE from 'three';
import { THEMES, TEX } from '../course/themes.js';
import { Post } from './post.js';

const SEA_COLORS = { fortune: ['#2a0650', '#b04dff'], sector5: ['#071a5c', '#6f8dff'], default: ['#062a7a', '#3fa0ff'] };

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 900);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = clamp(vP.y*0.5+0.5,0.0,1.0); vec3 c = mix(bottom, top, smoothstep(0.35,0.95,h)); gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.skyMat);
    this.scene.add(this.sky);

    // the Digital Sea: scrolling binary, slow swells, a faint grid
    const bin = TEX.digitalSea();
    bin.wrapS = bin.wrapT = THREE.RepeatWrapping;
    this.seaMat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        map: { value: null }, t: { value: 0 },
        deep: { value: new THREE.Color(SEA_COLORS.default[0]) }, glow: { value: new THREE.Color(SEA_COLORS.default[1]) },
      }]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform sampler2D map; uniform float t; uniform vec3 deep; uniform vec3 glow;
        varying vec3 vW;
        void main(){
          vec2 p = vW.xz;
          float a = texture2D(map, p * 0.035 + vec2(t * 0.012, t * 0.007)).b;
          float b = texture2D(map, p * 0.018 - vec2(t * 0.006, t * 0.01)).b;
          float swell = 0.5 + 0.5 * sin(p.x * 0.08 + t * 0.7) * sin(p.y * 0.06 - t * 0.5);
          float grid = max(smoothstep(0.97, 1.0, abs(sin(p.x * 0.25))), smoothstep(0.97, 1.0, abs(sin(p.y * 0.25)))) * 0.25;
          vec3 c = mix(deep, glow, clamp(a * 0.5 + b * 0.3 + swell * 0.25 + grid, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    });
    this.seaMat.uniforms.map.value = bin;
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), this.seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.scene.add(this.sea);

    // data streams rising out of the sea in the distance
    this.streams = new THREE.Group();
    const sMat = new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 26; i++) {
      const h = 20 + Math.random() * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + Math.random() * 1.2, h), sMat.clone());
      const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 160;
      m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      m.userData = { speed: 0.2 + Math.random() * 0.6, phase: Math.random() * 6 };
      this.streams.add(m);
    }
    this.scene.add(this.streams);

    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    const touch = matchMedia('(pointer: coarse)').matches;
    const high = q === 'high';
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, touch ? 1.5 : 2) : 1);
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.post = high ? (this.post || new Post(this.renderer, this.scene, this.camera)) : null;
    this.scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.resize();
  }

  applyTheme(key, course) {
    const th = THEMES[key];
    this.sector = key;
    this.skyMat.uniforms.top.value.set(th.sky[0]);
    this.skyMat.uniforms.bottom.value.set(th.sky[1]);
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogDensity * 0.6);
    this.hemi.color.set(th.hemi[0]);
    this.hemi.groundColor.set(th.hemi[1]);
    this.hemi.intensity = th.hemi[2];
    this.sun.color.set(th.sun.color);
    this.sun.intensity = th.sun.intensity;
    if (course) {
      const c = course.center, s = course.size;
      const R = Math.max(s.x, s.z) * 0.6 + 6;
      const d = new THREE.Vector3(...th.sun.dir).normalize();
      this.sun.position.copy(c).addScaledVector(d, 60);
      this.sun.target.position.copy(c);
      const cam = this.sun.shadow.camera;
      cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
      cam.near = 1; cam.far = 140;
      cam.updateProjectionMatrix();
      this.sea.position.set(c.x, course.bounds.min.y - 30, c.z);
      this.sky.position.copy(c);
      this.streams.position.set(c.x, course.bounds.min.y - 30, c.z);
    }
    const sc = SEA_COLORS[key] || SEA_COLORS.default;
    this.seaMat.uniforms.deep.value.set(sc[0]);
    this.seaMat.uniforms.glow.value.set(sc[1]);
    this.post?.setSector(key);
  }

  render(dt) {
    const t = (this.seaMat.uniforms.t.value += dt);
    for (const m of this.streams.children) {
      m.rotation.y = Math.atan2(this.camera.position.x - (m.position.x + this.streams.position.x), this.camera.position.z - (m.position.z + this.streams.position.z));
      m.material.opacity = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * m.userData.speed + m.userData.phase));
    }
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
