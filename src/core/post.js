// Пост-обработка: мир → оружие → bloom → тонмаппинг → цветокоррекция/виньетка/зерно.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uLowHealth: { value: 0 },
    uHeal: { value: 0 },
    uRes: { value: new THREE.Vector2(1280, 720) },
    uVignette: { value: 0.55 },
    uSaturation: { value: 0.9 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uDamage, uLowHealth, uHeal, uVignette, uSaturation, uFlash;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot( c, c );
      float ca = 0.006 * r2 + uDamage * 0.006;
      vec3 col;
      col.r = texture2D( tDiffuse, vUv + c * ca ).r;
      col.g = texture2D( tDiffuse, vUv ).g;
      col.b = texture2D( tDiffuse, vUv - c * ca ).b;

      float l = dot( col, vec3( 0.299, 0.587, 0.114 ) );
      // Тени уходят в холодный пурпур, света — в тёплое золото.
      col = mix( col, col * vec3( 0.95, 0.92, 1.12 ), ( 1.0 - smoothstep( 0.0, 0.45, l ) ) * 0.6 );
      col = mix( col, col * vec3( 1.08, 1.0, 0.88 ), smoothstep( 0.45, 1.0, l ) * 0.45 );
      col = mix( vec3( l ), col, uSaturation );
      // Лёгкий S-контраст.
      col = mix( col, col * col * ( 3.0 - 2.0 * col ), 0.25 );

      float vig = smoothstep( 0.95, 0.25, length( c * vec2( 1.0, 0.8 ) ) * 1.15 );
      col *= mix( 1.0, vig, uVignette );

      float edge = smoothstep( 0.2, 0.75, length( c ) * 1.25 );
      float pulse = uLowHealth * 0.5 * ( 0.7 + 0.3 * sin( uTime * 5.5 ) );
      col = mix( col, vec3( 0.3, 0.0, 0.02 ), edge * clamp( uDamage * 0.9 + pulse, 0.0, 0.85 ) );
      col = mix( col, vec3( 0.9, 0.75, 0.4 ), edge * uHeal * 0.35 );
      col += vec3( 1.0, 0.95, 0.9 ) * uFlash;

      float g = hash( floor( vUv * uRes ) + fract( uTime * 7.13 ) * 113.0 ) - 0.5;
      col += g * 0.04;
      gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
    }`,
};

export function createPost(renderer, scene, camera, vmScene, vmCamera, { samples = 4, bloom: useBloom = true } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, target);
  const worldPass = new RenderPass(scene, camera);
  const vmPass = new RenderPass(vmScene, vmCamera);
  vmPass.clear = false;
  vmPass.clearDepth = true;
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.38, 0.95);
  bloom.enabled = useBloom;
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  composer.addPass(worldPass);
  composer.addPass(vmPass);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);
  return {
    composer, bloom, grade: grade.uniforms,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      grade.uniforms.uRes.value.set(w * pr, h * pr);
    },
    render(dt) { composer.render(dt); },
  };
}
