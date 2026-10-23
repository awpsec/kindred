import {character,newAvatarProfile} from './characters.js';
// A still-life collage, with deliberate overlaps rather than rows of icons.
// Theme treatment belongs to CSS so open settings recolors without remounting.
const composition=[
 ['cloud','violet',3,-30,100,-26],
 ['wedge','blue',34,-48,114,31],
 ['tablet','orange',72,-29,104,-19],
 ['heart','red',13,33,91,18],
 ['hex','green',48,28,96,-34],
 ['teardrop','cyan',81,34,90,27],
 ['squircle','yellow',27,-2,78,-12],
 ['pebble','magenta',59,-2,94,21],
];
export function settingsHeaderArt(){
 const art=document.createElement('span');art.className='settings-header-art';art.setAttribute('aria-hidden','true');
 for(const [body,palette,left,top,size,angle] of composition){
  const p=newAvatarProfile();p.avatar={...p.avatar,body,palette};p.animated=false;
  const slot=character(p,size);
  Object.assign(slot.style,{position:'absolute',left:left+'%',top:top+'px',transform:`rotate(${angle}deg)`});
  art.append(slot);
 }
 return art;
}
