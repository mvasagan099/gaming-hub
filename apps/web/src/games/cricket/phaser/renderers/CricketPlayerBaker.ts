import * as THREE from 'three';

type Point = [number, number, number];

/** Bake lit, posed athletes once; gameplay still draws inexpensive Phaser sprites. */
export class CricketPlayerBaker {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 2.2, -0.05, 0.1, 30);
  private athlete = new THREE.Group();
  private sphere = new THREE.SphereGeometry(1, 16, 12);
  private cylinder = new THREE.CylinderGeometry(0.8, 1, 1, 12);
  private box = new THREE.BoxGeometry(1, 1, 1);
  private materials = new Map<string, THREE.MeshStandardMaterial>();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x505443, 2));
    const key = new THREE.DirectionalLight(0xfff1d9, 3.2);
    key.position.set(-3, 5, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ac9ff, 1.5);
    rim.position.set(3, 3, -4);
    this.scene.add(rim, this.athlete);
  }

  private material(color: string, metallic = false) {
    const key = `${color}:${metallic}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: metallic ? 0.3 : 0.72, metalness: metallic ? 0.65 : 0 });
      this.materials.set(key, material);
    }
    return material;
  }

  private shape(parent: THREE.Group, position: Point, scale: Point, color: string, box = false) {
    const mesh = new THREE.Mesh(box ? this.box : this.sphere, this.material(color));
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }

  private limb(parent: THREE.Group, start: Point, end: Point, radius: number, color: string) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const mesh = new THREE.Mesh(this.cylinder, this.material(color));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius * 0.9);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    parent.add(mesh);
    this.shape(parent, start, [radius * 0.85, radius * 0.85, radius * 0.8], color);
    return mesh;
  }

  render(canvas: HTMLCanvasElement, key: string) {
    this.athlete.clear();
    const batting = /batsman|non_striker|keeper/.test(key);
    const running = key.includes('run');
    const rear = key.includes('rear') || key.includes('away');
    const slide = key.includes('slide');
    const pick = key.includes('pick');
    const throwing = /throw|release|catch/.test(key);
    const gather = /gather|leap/.test(key);
    const swing = /drive|pull|loft|straight|defend|backlift|celebrate/.test(key);
    const follow = key.includes('follow');
    const phase = key.endsWith('_2') ? -1 : 1;
    const jersey = batting ? '#087eb8' : '#b51f38';
    const pants = batting ? '#0872a3' : '#223239';
    const skin = '#a76542';
    const root = this.athlete;
    root.rotation.set(0, rear ? Math.PI - 0.15 : batting && !running ? 2.35 : -0.28, 0);
    root.position.set(0, 0, 0);

    const torso = new THREE.Group();
    torso.position.set(0, pick || slide ? 0.93 : 1.12, 0);
    torso.rotation.x = pick ? 0.8 : running ? 0.17 : 0.07;
    torso.rotation.z = swing ? (follow ? -0.22 : 0.14) : 0;
    root.add(torso);
    this.shape(torso, [0, 0.25, 0], [0.235, 0.33, 0.13], jersey);
    this.shape(torso, [0, 0.02, 0], [0.19, 0.13, 0.12], pants);
    // Shoulder yoke, collar, side panels and fabric seams.
    this.shape(torso, [0, 0.45, 0], [0.24, 0.1, 0.135], batting ? '#f69b18' : '#d93e4f');
    this.shape(torso, [0, 0.54, 0], [0.095, 0.035, 0.095], '#e7edf0');
    for (const side of [-1, 1]) {
      this.shape(torso, [side * 0.19, 0.22, 0.018], [0.028, 0.21, 0.115], batting ? '#075081' : '#801a2a');
      for (let i = 0; i < 3; i++) {
        this.shape(torso, [side * 0.08, 0.12 + i * 0.07, 0.126], [0.08, 0.004, 0.005], batting ? '#1493c3' : '#c33348');
      }
    }
    // Original team number built from raised jersey strips, visible from behind.
    for (const x of [-0.055, 0.055]) {
      this.shape(torso, [x, 0.29, -0.132], [0.018, 0.12, 0.006], '#f4f2e9', true);
      this.shape(torso, [x - 0.015, 0.345, -0.133], [0.045, 0.015, 0.006], '#f4f2e9', true);
    }

    const head = new THREE.Group();
    head.position.set(0, 0.66, 0);
    head.rotation.y = batting && !running ? -0.65 : 0;
    torso.add(head);
    this.limb(torso, [0, 0.5, 0], [0, 0.64, 0], 0.065, skin);
    this.shape(head, [0, 0.05, 0], [0.104, 0.14, 0.10], skin);
    this.shape(head, [0, -0.025, 0.068], [0.078, 0.072, 0.055], '#262020');
    this.shape(head, [0, 0.06, 0.105], [0.025, 0.04, 0.024], skin);
    for (const side of [-1, 1]) {
      this.shape(head, [side * 0.043, 0.093, 0.09], [0.025, 0.009, 0.015], '#241c19');
      this.shape(head, [side * 0.041, 0.079, 0.096], [0.016, 0.006, 0.008], '#eeede4');
      this.shape(head, [side * 0.042, 0.079, 0.102], [0.007, 0.006, 0.004], '#231e1c');
      this.shape(head, [side * 0.103, 0.04, 0], [0.023, 0.039, 0.022], skin);
    }
    if (batting) {
      this.shape(head, [0, 0.14, -0.01], [0.125, 0.1, 0.123], '#0976c5');
      this.shape(head, [0, 0.115, 0.095], [0.125, 0.012, 0.08], '#07517e');
      for (const side of [-1, 1]) this.shape(head, [side * 0.10, 0.033, -0.018], [0.028, 0.074, 0.076], '#09649a');
      for (const y of [-0.04, 0.0, 0.04]) this.limb(head, [-0.095, y, 0.13], [0.095, y, 0.13], 0.005, '#b7c5ce');
      for (const x of [-0.095, 0.095]) this.limb(head, [x, -0.04, 0.13], [x, 0.10, 0.10], 0.005, '#b7c5ce');
    } else {
      this.shape(head, [0, 0.154, -0.01], [0.109, 0.065, 0.105], '#231d1c');
      this.shape(head, [-0.02, 0.187, 0.015], [0.09, 0.038, 0.08], '#211b19');
    }

    for (const side of [-1, 1]) {
      const stride = running ? phase * side : 0;
      const hip: Point = [side * 0.105, torso.position.y + 0.015, 0];
      const knee: Point = [side * (swing ? 0.20 : 0.12), 0.59 + (gather && side > 0 ? 0.24 : 0), stride * 0.22 + (pick ? 0.16 : 0)];
      const ankle: Point = [side * (swing || slide ? 0.29 : 0.14), 0.105 + (stride > 0 ? 0.19 : 0), -stride * 0.28];
      this.limb(root, hip, knee, 0.105, pants);
      this.limb(root, knee, ankle, 0.074, pants);
      this.shape(root, [ankle[0], ankle[1] - 0.025, ankle[2] + 0.035], [0.089, 0.055, 0.15], '#e5e9e8');
      this.shape(root, [ankle[0], ankle[1] - 0.057, ankle[2] + 0.035], [0.088, 0.015, 0.15], '#38424a');
      for (let i = 0; i < 3; i++) this.shape(root, [ankle[0], ankle[1] + 0.014, ankle[2] + i * 0.035], [0.05, 0.005, 0.006], '#75828b', true);
      if (batting) {
        const pad = this.limb(root, [knee[0], knee[1] + 0.035, knee[2] + 0.074], [ankle[0], ankle[1] + 0.055, ankle[2] + 0.082], 0.09, '#168bbc');
        for (let i = -1; i <= 1; i++) {
          const rib = new THREE.Mesh(this.box, this.material('#7fcef0'));
          rib.position.set(i * 0.38, 0, 0.88);
          rib.scale.set(0.09, 0.85, 0.08);
          pad.add(rib);
        }
        this.shape(root, [knee[0], knee[1], knee[2] + 0.14], [0.083, 0.04, 0.023], '#efa24a');
      }
    }

    let rightWrist: Point = [0.24, 0.08, 0.10];
    for (const side of [-1, 1]) {
      const shoulder: Point = [side * 0.205, 0.43, 0];
      let elbow: Point = [side * 0.29, 0.22, 0.09];
      let wrist: Point = [side * 0.24, 0.04, 0.16];
      if (batting && !running) {
        elbow = [side * 0.25, swing ? 0.38 : 0.20, 0.20];
        wrist = [swing ? (follow ? -0.25 : 0.33) : 0.16, swing ? (follow ? 0.57 : 0.33) : 0.12, 0.37 + side * 0.03];
      }
      if (running) {
        elbow = [side * 0.28, 0.23, phase * side * 0.18];
        wrist = [side * 0.17, 0.37, phase * side * 0.30];
      }
      if ((throwing && side > 0) || gather || key.includes('celebrate')) {
        elbow = [side * 0.25, 0.65, 0.06];
        wrist = [side * 0.12, 0.91, 0.14];
      }
      if (pick) { elbow = [side * 0.2, 0.1, 0.28]; wrist = [side * 0.08, -0.16, 0.5]; }
      const sleeveEnd: Point = shoulder.map((v, i) => v + (elbow[i] - v) * 0.55) as Point;
      this.limb(torso, shoulder, sleeveEnd, 0.092, jersey);
      this.limb(torso, sleeveEnd, elbow, 0.061, skin);
      this.limb(torso, elbow, wrist, 0.049, skin);
      this.shape(torso, wrist, [0.061, 0.064, 0.048], batting ? '#eceee7' : skin);
      if (batting) for (let i = 0; i < 3; i++) this.shape(torso, [wrist[0] - 0.037 + i * 0.032, wrist[1], wrist[2] + 0.047], [0.012, 0.045, 0.009], '#a9c8d4');
      if (side > 0) rightWrist = wrist;
    }
    if (batting) {
      const bat = new THREE.Group();
      bat.position.set(...rightWrist);
      bat.rotation.z = swing ? (follow ? -2.3 : -0.8) : running ? 0.8 : -0.12;
      torso.add(bat);
      this.limb(bat, [0, 0.07, 0], [0, -0.21, 0], 0.018, '#244ba2');
      this.shape(bat, [0, -0.47, 0], [0.103, 0.52, 0.045], '#e1bc79', true);
      this.shape(bat, [0, -0.43, 0.024], [0.054, 0.27, 0.003], '#226cb3', true);
      this.shape(bat, [0, -0.71, 0], [0.103, 0.018, 0.047], '#d88431', true);
    } else if (/release|gather|bowler/.test(key)) {
      this.shape(torso, [rightWrist[0], rightWrist[1] + 0.065, rightWrist[2]], [0.029, 0.029, 0.029], '#a62327');
    }

    // Keep the existing texture dimensions and foot anchors for every animation.
    const width = canvas.width, height = canvas.height;
    const aspect = width / height;
    this.camera.left = -1.14 * aspect;
    this.camera.right = 1.14 * aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width * 2, height * 2, false);
    this.renderer.render(this.scene, this.camera);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    // Directional ground contact shadow matching the references' sunlight.
    ctx.save();
    ctx.fillStyle = 'rgba(13,24,26,0.25)';
    ctx.beginPath();
    ctx.ellipse(width * 0.40, height * 0.956, width * 0.24, height * 0.015, -0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(this.renderer.domElement, 0, 0, width, height);
  }

  destroy() {
    this.sphere.dispose(); this.cylinder.dispose(); this.box.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
