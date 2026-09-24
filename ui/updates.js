// The notification uses the same pinned signing key as the installer.
const releaseKey = {"kty": "RSA", "n": "y0K3Ir7wVPTI8XC5mYSkpV59MVR5q3iNvKoGWGbERKq6UwHFMqv4FSuTPoe9DTC2gsZk6hEzBU73KK2wmPRikCpjEANAhUJG4Au0Y1BzDpXnUqjJv6gk9vVwyVtOPlICDxXaRNF7XguqJFynjZpmepEHOXin6RXJxj-Wm-gs5GQx8T44n9ftI08wM16b4wt214fb3qhxKqMr-kkdVgyAMyGIigAyp0WlFFeL1tCB4je5MeVXNS3xqaMsymssmHTRHqAjOmEaPb4C2Da5S8TsMmPTx09fPq6gtSw_VgHCjkt_Rn0_wTZV6hL56i9DptdTxRTQopk4K_D1p6Pb4wD8mh_j18AevCbqqURtb2SrIruqOMGAUo35Z5EKImjtAkaklK6H6zk5rjeoIqMyJ_uPs0MPt2cAo1pqVJ8csz3v3shiE8VqBrKasF5ee__quJ_gcwQRUH1_KibdS2Mv4_rxv0kMUu7LppqWWrXs7XZnBgcyP9FgxeB2aon1CfFz2mwP", "e": "AQAB", "alg": "RS256", "ext": true};
export function newerVersion(candidate, installed) {
  if (![candidate,installed].every(v => typeof v === "string" && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(v))) return false;
  const a=candidate.split(".").map(Number), b=installed.split(".").map(Number);
  for (let i=0;i<3;i++) if (a[i]!==b[i]) return a[i]>b[i];
  return false;
}
function bytes(text) { return Uint8Array.from(atob(text),c=>c.charCodeAt(0)); }
async function signedRelease(filename) {
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),6000);
  try {
    const response=await fetch("/updates/"+filename, {cache:"no-store",credentials:"omit",redirect:"error",signal:controller.signal});
    if (!response.ok) return null;
    const reader=response.body.getReader(); let chunks=[],size=0;
    while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>65536) { await reader.cancel(); return null; } chunks.push(value); }
    const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    const envelope=JSON.parse(new TextDecoder().decode(data));
    if(typeof envelope.payload!=="string" || typeof envelope.signature!=="string")return null;
    const payload=bytes(envelope.payload), key=await crypto.subtle.importKey("jwk",releaseKey,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,bytes(envelope.signature),payload))return null;
    const release=JSON.parse(new TextDecoder().decode(payload));
    return release.channel==="stable" ? release : null;
  } catch { return null; } finally { clearTimeout(timeout); }
}
export async function availableRelease(installed, platform) {
  // A Windows manifest cannot announce or supply a Mac/Linux client update.
  // Failed native-feed checks stay on this server rather than becoming a GitHub link.
  if(platform==='macos'||platform==='linux'){
    const current=await signedRelease('client-stable.json');
    const target=platform==='macos'?'macos-aarch64':'linux-x86_64',pkg=current?.platforms?.[target];
    if(current && newerVersion(current.version,installed) && pkg &&
      /^[a-f0-9]{64}$/.test(pkg.sha256) && Number.isSafeInteger(pkg.size) && pkg.size>0 && pkg.size<=536870912)
      return {...current,transport:'server',downloadPath:'/updates/kindred-'+target+'-'+current.version+(platform==='macos'?'.dmg':'.AppImage')};
    return null;
  }
  if(platform!=='windows')return null;
  const release=await signedRelease('stable.json');
  return release && release.platform==='windows-x86_64' && /^[a-f0-9]{64}$/.test(release.sha256) && Number.isSafeInteger(release.size) && release.size>0 && release.size<=67108864 && newerVersion(release.version,installed) ? {...release,transport:'windows'} : null;
}
