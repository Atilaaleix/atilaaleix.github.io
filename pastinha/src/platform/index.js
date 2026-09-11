// A fronteira entre o que é do Pastinha e o que é do sistema operacional.
//
// REGRA QUE NÃO SE QUEBRA: nada em src/core/ pode saber se está no Mac ou no
// Windows. Todo comando de sistema, todo caminho com barra invertida, toda
// gambiarra de plataforma mora aqui dentro e sai por esta interface.
//
// É esta linha que evita a reescrita daqui a dois anos. Sem ela, o "if Windows"
// vaza para trinta lugares e aí só resta refazer.
import darwin from './darwin.js';
import win32 from './win32.js';
import linux from './linux.js';

/**
 * @typedef {object} Platform
 * @property {'darwin'|'win32'|'linux'} name
 * @property {string} label
 * @property {(file:string)=>string[]} whereFroms
 *   De onde o arquivo veio. No Mac é o xattr kMDItemWhereFroms; no Windows é o
 *   fluxo alternativo Zone.Identifier. Mesma informação, dois mecanismos.
 * @property {(file:string)=>Date|null} downloadedDate
 * @property {(file:string)=>string|null} indexedText
 *   Texto que o índice do sistema já extraiu. Spotlight no Mac; no Windows, nada
 *   acessível de fora, então volta null e os extratores próprios assumem.
 * @property {(file:string)=>boolean} isBusy
 * @property {(file:string)=>string|null} legacyDocText
 *   Formatos velhos (.doc, .rtf, .webarchive). Mac tem textutil; Windows não tem.
 * @property {(file:string)=>string|null} imageForVision  base64 pronto pro modelo
 * @property {(file:string)=>boolean} open
 * @property {(file:string)=>boolean} reveal
 * @property {(q:string,n:number)=>string[]} systemSearch
 * @property {()=>{downloads:string,desktop:string,documents:string,home:string}} userFolders
 * @property {()=>string[]} forbiddenRoots  pastas que o bicho nunca pode tocar
 * @property {()=>{ok:boolean, hint:string}} permissionCheck
 */

/** @type {Record<string, Platform>} */
const IMPLS = { darwin, win32, linux };

/** @type {Platform} */
export const platform = IMPLS[process.platform] || linux;

export const IS_MAC = process.platform === 'darwin';
export const IS_WIN = process.platform === 'win32';

export default platform;
