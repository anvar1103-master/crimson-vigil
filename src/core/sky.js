// Небо: багровый градиент, огромная луна с ореолом, облака, звёзды, вспышки молний.
import * as THREE from 'three';

export function createSky({ horizon, zenith, moonDir, moonColor = [1.0, 0.94, 0.86], moonSize = 0.9965 }) {
  const uniforms = {
    uHorizon: { value: new THREE.Color(horizon) },
    uZenith: { value: new THREE.Color(zenith) },
    uMoonDir: { value: moonDir.clone().normalize() },
    uMoonColor: { value: new THREE.Vector3(...moonColor) },
    uMoonCos: { value: moonSize },
    uTime: { value: 0 },
    uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uHorizon, uZenith, uMoonDir, uMoonColor;
      uniform float uMoonCos, uTime, uFlash;
      varying vec3 vDir;
      float hash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
      float noise( vec3 x ) {
        vec3 i = floor( x ), f = fract( x );
        f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( mix( hash( i ), hash( i + vec3( 1, 0, 0 ) ), f.x ), mix( hash( i + vec3( 0, 1, 0 ) ), hash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                    mix( mix( hash( i + vec3( 0, 0, 1 ) ), hash( i + vec3( 1, 0, 1 ) ), f.x ), mix( hash( i + vec3( 0, 1, 1 ) ), hash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
      }
      float fbm( vec3 p ) { float a = 0.5, s = 0.0; for ( int i = 0; i < 5; i ++ ) { s += a * noise( p ); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize( vDir );
        float h = clamp( d.y, -0.3, 1.0 );
        vec3 col = mix( uHorizon, uZenith, pow( smoothstep( -0.05, 0.75, h ), 0.55 ) );
        // Тёмная полоса у самого горизонта под туманом.
        col *= mix( 1.0, 0.75, smoothstep( 0.02, -0.15, h ) );

        vec3 mn = normalize( uMoonDir );
        float md = dot( d, mn );
        // Ореол: красный широкий + бледный узкий.
        float mdp = max( md, 0.0 );
        col += vec3( 0.55, 0.06, 0.05 ) * pow( mdp, 14.0 ) * 0.55;
        col += vec3( 0.9, 0.55, 0.45 ) * pow( mdp, 160.0 ) * 0.3;
        col += uMoonColor * pow( mdp, 1400.0 ) * 0.5;

        // Облака: плоский слой, подсвеченный луной.
        vec2 cp = d.xz / max( d.y + 0.12, 0.04 );
        float cl = fbm( vec3( cp * 0.55 + vec2( uTime * 0.006, uTime * 0.002 ), uTime * 0.008 ) );
        float cloud = smoothstep( 0.42, 0.78, cl ) * smoothstep( -0.04, 0.2, d.y );
        vec3 cloudCol = mix( uHorizon * 0.55, vec3( 0.42, 0.16, 0.14 ), pow( mdp, 6.0 ) );
        cloudCol += vec3( 0.9, 0.7, 0.65 ) * pow( mdp, 60.0 ) * 0.5;

        // Звёзды.
        vec3 sp = d * 220.0;
        vec3 cell = floor( sp );
        float sh = hash( cell );
        float star = step( 0.9965, sh ) * smoothstep( 0.42, 0.0, length( fract( sp ) - 0.5 ) );
        star *= ( 0.6 + 0.4 * sin( uTime * 3.0 + sh * 100.0 ) ) * smoothstep( 0.08, 0.4, d.y );
        col += vec3( 1.0, 0.85, 0.8 ) * star * 0.9 * ( 1.0 - cloud );

        // Луна: диск с кратерами и потемнением к краю.
        vec3 mu = normalize( cross( mn, vec3( 0.0, 1.0, 0.0 ) ) );
        vec3 mv = cross( mu, mn );
        float rr = sqrt( 1.0 - uMoonCos * uMoonCos );
        vec2 mp = vec2( dot( d, mu ), dot( d, mv ) ) / rr;
        float disk = smoothstep( uMoonCos - 0.00012, uMoonCos + 0.00008, md );
        float crater = fbm( vec3( mp * 2.6, 3.7 ) );
        float maria = smoothstep( 0.45, 0.62, fbm( vec3( mp * 1.3 + 4.0, 1.3 ) ) );
        vec3 moon = uMoonColor * ( 0.78 + 0.45 * crater - 0.22 * maria );
        moon *= 0.6 + 0.4 * sqrt( max( 0.0, 1.0 - dot( mp, mp ) ) );
        moon *= 1.25;
        col = mix( col, moon, disk );

        // Облака частично закрывают луну.
        col = mix( col, cloudCol, cloud * mix( 0.85, 0.55, disk ) );

        // Молния.
        col += vec3( 0.75, 0.7, 0.9 ) * uFlash * ( 0.4 + 0.6 * cloud ) * smoothstep( -0.1, 0.3, d.y );
        gl_FragColor = vec4( col, 1.0 );
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// Карта окружения для отражений металла и мокрого камня.
export function createEnvironment(renderer, { horizon, zenith, moonDir, warmDir = new THREE.Vector3(0, 0.1, 1) }) {
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uH: { value: new THREE.Color(horizon) }, uZ: { value: new THREE.Color(zenith) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uH, uZ; varying vec3 vP;
        void main(){ float h = normalize(vP).y; vec3 c = mix(uH, uZ, smoothstep(0.0, 0.8, h)); c *= mix(1.0, 0.15, smoothstep(0.0, -0.4, h)); gl_FragColor = vec4(c * 2.2, 1.0); }`,
    }),
  );
  envScene.add(sky);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5.2) }));
  moon.position.copy(moonDir).normalize().multiplyScalar(40);
  envScene.add(moon);
  const warm = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.55, 0.18) }));
  warm.position.copy(warmDir).normalize().multiplyScalar(40);
  envScene.add(warm);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.035);
  pmrem.dispose();
  return rt.texture;
}
