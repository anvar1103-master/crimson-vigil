// Биом собора: двор собора и склеп чередуются; логово Звонаря — во дворе.
import { registerBiome } from '../biomes.js';
import { buildCathedralYard } from '../cathedralYard.js';
import { buildCrypt } from './crypt.js';

registerBiome('cathedral', (scene, seed, zone) =>
  (zone && zone.kind !== 'boss' && zone.index % 2 === 1 ? buildCrypt(scene, seed) : buildCathedralYard(scene, seed)));
registerBiome('crypt', (scene, seed) => buildCrypt(scene, seed));
