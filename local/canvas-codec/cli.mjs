import {run} from './codec.mjs';
async function main(){
 try{let data='';for await(const chunk of process.stdin){data+=chunk;if(data.length>32*1024*1024)throw Error('codec_input_too_large');}process.stdout.write(JSON.stringify(run(JSON.parse(data))));}
 catch(error){process.stdout.write(JSON.stringify({error:error.message}));process.exitCode=1;}
}
main();
