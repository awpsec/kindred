import {readFile} from 'node:fs/promises';
// In watch mode ask x11vnc to composite its remote cursor into the framebuffer.
// Keep this narrowly checked patch reproducible when upgrading noVNC.
export const remoteCursorPlugin={name:'kindred-remote-cursor',setup(build){
  build.onLoad({filter:/[/\\]@novnc[/\\]novnc[/\\]core[/\\]rfb\.js$/},async({path})=>{
    let contents=await readFile(path,'utf8');
    const original='if (this._fbDepth == 24) {\n            encs.push(encodings.pseudoEncodingVMwareCursor);';
    if(contents.split(original).length!==2)throw new Error('Review remote cursor patch for this noVNC version');
    contents=contents.replace(original,'if (this._fbDepth == 24 && !this._viewOnly) {\n            encs.push(encodings.pseudoEncodingVMwareCursor);');
    return{contents,loader:'js'};
  });
}};
