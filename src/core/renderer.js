import * as THREE from 'three';
import { THEMES, TEX } from '../course/themes.js';

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 900);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
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

    // the Digital Sea far below every course
    const seaTex = TEX.digitalSea();
    seaTex.repeat.set(40, 40);
    this.seaTex = seaTex;
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ map: seaTex, color: '#7fb3ff' }));
    this.sea.rotation.x = -Math.PI / 2;
    this.scene.add(this.sea);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applyTheme(key, course) {
    const th = THEMES[key];
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
    }
    this.sea.material.color.set(key === 'fortune' ? '#b04dff' : key === 'sector5' ? '#6f8dff' : '#7fb3ff');
  }

  render(dt) {
    this.seaTex.offset.x += dt * 0.01;
    this.seaTex.offset.y += dt * 0.006;
    this.renderer.render(this.scene, this.camera);
  }
}
