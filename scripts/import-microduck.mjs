// Convert the Apache-2.0 Pollen Robotics MJCF visual assembly, keeping joint frames.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const out = 'public/models/microduck';
const cache = '/private/tmp/microduck-source';
mkdirSync(out, { recursive: true }); mkdirSync(cache, { recursive: true });
const get = url => execFileSync('curl', ['-fsSL', '--retry', '2', '--max-time', '30', url], { maxBuffer: 30e6 });
const commit = '1e79c29c97d8b38aee9eefde77a545860ba7658e';
const checkout = process.argv[2];
const base = `https://raw.githubusercontent.com/pollen-robotics/microduck_rl/${commit}`;
const root = `${base}/src/mjlab_microduck/robot/microduck`;
const localRoot = checkout && `${checkout}/src/mjlab_microduck/robot/microduck`;
const xml = (localRoot ? readFileSync(`${localRoot}/robot_walk.xml`) : get(`${root}/robot_walk.xml`)).toString();
const doc = new DOMParser().parseFromString(xml, 'text/xml');
const children = element => Array.from(element.childNodes).filter(n => n.nodeType === 1);
const numbers = (element, key, fallback) => (element.getAttribute(key) || fallback).trim().split(/\s+/).map(Number);
const materials = new Map();
for (const node of Array.from(doc.getElementsByTagName('material'))) {
  const [r,g,b] = numbers(node, 'rgba', '0.8 0.8 0.8 1');
  const name = node.getAttribute('name');
  materials.set(name, new THREE.MeshStandardMaterial({ name, color: new THREE.Color().setRGB(r,g,b,THREE.SRGBColorSpace), roughness: .5, metalness: /bearing|lens/.test(name) ? .45 : .12 }));
}
const meshes = new Map();
for (const node of Array.from(doc.getElementsByTagName('mesh'))) {
  const file = node.getAttribute('file');
  if (!file) continue;
  const local = `${cache}/${file}`;
  if (!existsSync(local)) writeFileSync(local, localRoot ? readFileSync(`${localRoot}/assets/${file}`) : get(`${root}/assets/${file}`));
  const bytes = readFileSync(local);
  const geometry = mergeVertices(new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), 0.000001);
  meshes.set(node.getAttribute('name') || file.replace(/\.stl$/, ''), geometry);
  console.log(`Converted ${file}`);
}
function transform(object, element) {
  object.position.fromArray(numbers(element, 'pos', '0 0 0'));
  const [w,x,y,z] = numbers(element, 'quat', '1 0 0 0'); object.quaternion.set(x,y,z,w).normalize();
}
function body(element) {
  const group = new THREE.Group(); group.name = element.getAttribute('name'); transform(group, element);
  for (const node of children(element)) {
    if (node.tagName === 'joint') group.userData.joint = { name: node.getAttribute('name'), axis: numbers(node, 'axis', '0 0 1'), range: numbers(node, 'range', '-3.14 3.14') };
    if (node.tagName === 'body') group.add(body(node));
    if (node.tagName === 'geom' && node.getAttribute('class') === 'visual') {
      const geometry = meshes.get(node.getAttribute('mesh')); if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, materials.get(node.getAttribute('material'))); mesh.name = node.getAttribute('mesh'); transform(mesh,node); group.add(mesh);
    }
  }
  return group;
}
const scene = new THREE.Group(); scene.name = 'Microduck';
for (const node of children(doc.getElementsByTagName('worldbody')[0])) if (node.tagName === 'body') scene.add(body(node));
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const document = await io.readBinary(new Uint8Array(glb));
await document.transform(dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(`${out}/microduck.glb`, document);
writeFileSync(`${out}/LICENSE`, checkout ? readFileSync(`${checkout}/LICENSE`) : get(`${base}/LICENSE`));
writeFileSync(`${out}/SOURCE.json`, JSON.stringify({ repository: 'https://github.com/pollen-robotics/microduck_rl', commit, source: 'src/mjlab_microduck/robot/microduck/robot_walk.xml', license: 'Apache-2.0', copyright: 'Copyright 2026 Pollen Robotics', changes: 'Visual meshes converted from STL/MJCF to indexed GLB; joint frames retained. Browser animation is custom, not the learned robot policy.' }, null, 2));
console.log(`Compressed GLB: ${Math.round(readFileSync(`${out}/microduck.glb`).length / 1024)} KiB, commit ${commit}`);
