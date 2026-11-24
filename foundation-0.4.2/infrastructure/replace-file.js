import {rename} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
// Windows readers/sync clients may briefly deny replacement. Never remove the destination.
export async function replaceFile(source,destination,{renameFile=rename,wait=delay}={}){for(let attempt=0;;attempt++){try{return await renameFile(source,destination);}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=20)throw error;await wait(Math.min(20*2**attempt,250));}}}
