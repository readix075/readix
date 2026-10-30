import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
try {console.log('Fabric.js:',require.resolve('fabric'));} catch {console.error('Fabric.js non installé. Exécuter npm install dans public/readox-graphics.');process.exitCode=1;}
