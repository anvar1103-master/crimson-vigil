// Высотный туман: стелется у земли, медленно дрейфует.
// Подменяем стандартные fog-чанки Three.js, так что эффект получают все материалы с fog: true.
// Общие uniform-ы подключает хук withFog(material).
import * as THREE from 'three';

export const fogUniforms = {
  fogTime: { value: 0 },
  fogMistColor: { value: new THREE.Color(0.07, 0.04, 0.045) },
  fogGround: { value: 0.09 },   // плотность у земли
  fogFalloff: { value: 0.75 },  // как быстро редеет с высотой (1/м)
};

THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif`;

THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  uniform float fogTime;
  uniform vec3 fogMistColor;
  uniform float fogGround;
  uniform float fogFalloff;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float fogHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  float fogNoise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( fogHash( i ), fogHash( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( fogHash( i + vec2( 0.0, 1.0 ) ), fogHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
  }
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  if ( fogGround > 0.0 ) {
    vec3 fogRay = vFogWorldPos - cameraPosition;
    float fogDist = length( fogRay );
    float hc = cameraPosition.y, hp = max( vFogWorldPos.y, -2.0 );
    float dh = hp - hc;
    float eC = exp( - fogFalloff * hc ), eP = exp( - fogFalloff * hp );
    float hInt = abs( dh ) > 0.01 ? ( eC - eP ) / ( fogFalloff * dh ) : eC;
    vec2 fp = vFogWorldPos.xz * 0.12 + vec2( fogTime * 0.05, fogTime * 0.025 );
    float fn = fogNoise( fp ) * 0.6 + fogNoise( fp * 2.7 + 7.1 - fogTime * 0.04 ) * 0.4;
    float mist = 1.0 - exp( - fogGround * fogDist * hInt * ( 0.25 + 1.5 * fn ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogMistColor, mist );
  }
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

function fogHook(shader) {
  Object.assign(shader.uniforms, fogUniforms);
}

// Подключает общие uniform-ы тумана к материалу (если у него ещё нет своего хука).
export function withFog(material) {
  if (!Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile')) material.onBeforeCompile = fogHook;
  return material;
}

export function withFogTree(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) withFog(m);
  });
}
