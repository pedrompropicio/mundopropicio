/** LOCAL ONLY: prepare/receive reviewed bundle. No connection, SQL dispatch or auth. */
import {readFile,mkdir} from 'node:fs/promises';
import {bundle71} from './select-bundle71';
import {ControllerCheckpoint71} from './controller-checkpoint71';
import {ControllerMessage69,request69} from './controller-message69';
const [action,directory,id,rawPath,metadataPath]=process.argv.slice(2);
if(!directory?.startsWith('/tmp/'))throw Error('Private directory required');
const contract=bundle71.find(c=>c.id===id);if(!contract)throw Error('Reviewed bundle id required');
await mkdir(directory,{recursive:true,mode:0o700});
if(action==='prepare'){
 const {writeFile}=await import('node:fs/promises');
 await new ControllerMessage69(directory).prepare(request69(contract.id,contract.query,contract.expectedKeys));
 await writeFile(`${directory}/${id}.contract.json`,JSON.stringify(contract),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({request:id,contract:`${directory}/${id}.contract.json`,noPendingSelect:true}));
}else if(action==='receive'){
 if(!rawPath?.startsWith('/tmp/')||!metadataPath?.startsWith('/tmp/'))throw Error('Private original envelope and upstream metadata required');
 const raw=await readFile(rawPath),metadata=JSON.parse(await readFile(metadataPath,'utf8'));
 const result=await new ControllerCheckpoint71(directory,'bundle',()=>contract.schema).receive(id,raw,metadata);
 console.log(JSON.stringify(result.receipt));
}else throw Error('Explicit prepare or receive action required');