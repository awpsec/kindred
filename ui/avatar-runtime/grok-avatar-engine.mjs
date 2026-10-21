// Recovered Grok Bot 0.75.0 avatar declarations. Source SHA-256 5cab5e0c87e139c426cbcbda21339bc825f8bc069520e788109befbb4d02cc75.

// Original declaration contents are unchanged. See engine-extraction.json for source ranges.

import { t as e } from './rolldown-runtime.mjs';

// Original UTF-16 range 147811:147832
var zn=e=>({x:e,v:0,t:e});

// Original UTF-16 range 147833:147957
var Bn=(e,t,n,r)=>{e.v+=(-2*n*t*e.v-t*t*(e.x-e.t))*r,e.x+=e.v*r,(!Number.isFinite(e.x)||!Number.isFinite(e.v))&&(e.x=e.t,e.v=0)};

// Original UTF-16 range 147958:147966
var Vn=1/120;

// Original UTF-16 range 147967:148000
var Hn=e=>Math.max(1,Math.ceil(e/Vn));

// Original UTF-16 range 148001:148037
var F=(e,t,n)=>Math.min(n,Math.max(t,e));

// Original UTF-16 range 148038:148072
var Un=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2;

// Original UTF-16 range 148073:148088
var I=e=>1-(1-e)**3;

// Original UTF-16 range 148089:148130
var Wn=e=>1+2.70158*(e-1)**3+1.70158*(e-1)**2;

// Original UTF-16 range 148131:148148
var Gn=e=>e*e*(3-2*e);

// Original UTF-16 range 148149:148165
var Kn=[.42,0,.58,1];

// Original UTF-16 range 148166:148183
var qn=[.4,.06,.18,1];

// Original UTF-16 range 148184:148190
var Jn=.28;

// Original UTF-16 range 148191:148197
var Yn=.35;

// Original UTF-16 range 148198:148204
var Xn=.26;

// Original UTF-16 range 148205:148215
var Zn=4.25/60;

// Original UTF-16 range 148216:148223
var Qn=2/60;

// Original UTF-16 range 148224:148231
var $n=1.06;

// Original UTF-16 range 148232:148294
function er(e,t,n){let r=1-e;return 3*r*r*e*t+3*r*e*e*n+e*e*e}

// Original UTF-16 range 148294:148362
function tr(e,t,n){let r=1-e;return 3*r*r*t+6*r*e*(n-t)+3*e*e*(1-n)}

// Original UTF-16 range 148362:148542
function nr(e,t){let[n,r,i,a]=t,o=e;for(let t=0;t<8;t++){let t=er(o,n,i)-e,r=tr(o,n,i);if(Math.abs(t)<1e-6||Math.abs(r)<1e-6)break;o=Math.min(1,Math.max(0,o-t/r))}return er(o,r,a)}

// Original UTF-16 range 148542:148608
function rr(e){let t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)}

// Original UTF-16 range 148608:148703
function ir(e,t){let n=Math.min(.28,(e?Qn:Zn)/Math.max(t,.05)),r=(1-n)*.42;return{u1:r,u2:r+n}}

// Original UTF-16 range 148703:148839
function ar(e){let t=Math.min(1,Math.max(0,e));if(t<.7){let e=t/.7;return(1-(1-e)*(1-e))*$n}return $n+-.06000000000000005*rr((t-.7)/.3)}

// Original UTF-16 range 148839:148923
function or(e,{u1:t,u2:n}){return e<t?rr(e/t):e<=n?1:1-rr((e-n)/Math.max(1e-6,1-n))}

// Original UTF-16 range 148927:148941
var sr=Math.PI/180;

// Original UTF-16 range 148942:149127
function cr(e,t){return[e[0]*t[0]-e[1]*t[1]-e[2]*t[2]-e[3]*t[3],e[0]*t[1]+e[1]*t[0]+e[2]*t[3]-e[3]*t[2],e[0]*t[2]-e[1]*t[3]+e[2]*t[0]+e[3]*t[1],e[0]*t[3]+e[1]*t[2]-e[2]*t[1]+e[3]*t[0]]}

// Original UTF-16 range 149127:149207
function lr(e,t){let n=Math.sin(t/2);return[Math.cos(t/2),e[0]*n,e[1]*n,e[2]*n]}

// Original UTF-16 range 149207:149299
function ur(e){let t=Math.hypot(e[0],e[1],e[2],e[3])||1;return[e[0]/t,e[1]/t,e[2]/t,e[3]/t]}

// Original UTF-16 range 149299:149423
function dr(e,t){return ur([1+(e[0]*t[0]+e[1]*t[1]+e[2]*t[2]),e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]])}

// Original UTF-16 range 149423:149575
function fr(e){let[t,n,r,i]=e;return[1-2*(r*r+i*i),2*(n*r-t*i),2*(n*i+t*r),2*(n*r+t*i),1-2*(n*n+i*i),2*(r*i-t*n),2*(n*i-t*r),2*(r*i+t*n),1-2*(n*n+r*r)]}

// Original UTF-16 range 149575:149651
function pr(e,t,n){return cr(lr([0,0,1],n),cr(lr([0,1,0],t),lr([1,0,0],e)))}

// Original UTF-16 range 149651:149850
function mr(e){let t=e[0],n=e[3],r=e[5],i=e[4],a=e[6],o=e[7],s=e[8],c=Math.max(-1,Math.min(1,-a)),l=Math.asin(c);return Math.abs(c)>.999999?[Math.atan2(-r,i),l,0]:[Math.atan2(o,s),l,Math.atan2(n,t)]}

// Original UTF-16 range 149850:149882
function hr(e){return mr(fr(e))}

// Original UTF-16 range 149882:149996
function L(e,t){return[e[0]*t[0]+e[1]*t[1]+e[2]*t[2],e[3]*t[0]+e[4]*t[1]+e[5]*t[2],e[6]*t[0]+e[7]*t[1]+e[8]*t[2]]}

// Original UTF-16 range 150000:150008
var gr=.1305;

// Original UTF-16 range 150009:150166
var _r=[{A:[.01722,.45638,.88962],B:[.186,.20949,.95996],N:[.82924,.4906,-.26773]},{A:[.48863,.67924,.54762],B:[.65674,.43195,.61815],N:[.60389,.18972,-.77416]}];

// Original UTF-16 range 150167:150247
function vr(e){let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]}

// Original UTF-16 range 150251:150389
var yr=(()=>{let e=[0,0,0];for(let{A:t,B:n}of _r){let r=vr([t[0]+n[0],t[1]+n[1],t[2]+n[2]]);e=[e[0]+r[0],e[1]+r[1],e[2]+r[2]]}return vr(e)})();

// Original UTF-16 range 150390:150620
var br=(()=>{let e=dr(yr,[0,0,1]),t=fr(e),n=0,r=0;for(let{A:e,B:i}of _r){let a=L(t,[i[0]-e[0],i[1]-e[1],i[2]-e[2]]);n+=a[0],r+=a[1]}return cr(lr([0,0,1],((Math.PI/2-Math.atan2(r,n)+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2),e)})();

// Original UTF-16 range 150621:150709
var xr=(()=>{let e=fr(br);return _r.map(({A:t,B:n,N:r})=>({A:L(e,t),B:L(e,n),N:L(e,r)}))})();

// Original UTF-16 range 150710:150741
var Sr=[br[0],-br[1],-br[2],-br[3]];

// Original UTF-16 range 150742:151157
var Cr=(()=>{let e=({A:e,B:t})=>{let n=vr([e[0]+t[0],e[1]+t[1],e[2]+t[2]]),r=t[0]*n[0]+t[1]*n[1]+t[2]*n[2],i=vr([t[0]-r*n[0],t[1]-r*n[1],t[2]-r*n[2]]);i[1]<0&&(i=[-i[0],-i[1],-i[2]]);let a=[n[1]*i[2]-n[2]*i[1],n[2]*i[0]-n[0]*i[2],n[0]*i[1]-n[1]*i[0]];return a[0]*n[0]<0&&(a=[-a[0],-a[1],-a[2]]),{M:n,T:i,C:a}},[t,n]=xr;if(t==null||n==null)throw Error(`Motion Lab defines exactly two eye capsules`);return[e(t),e(n)]})();

// Original UTF-16 range 151158:151353
var wr=`sphere.cloud.square.sparkle.clover.heartChubby.starFlower.teardrop.tablet.wedge.house.star6.pebble.bean.egg.squircle.capsule.cylinder.hex.gem.crystal.shield.dome.arch.leaf.pumpkin`.split(`.`);

// Original UTF-16 range 151354:151377
var Tr=new Set([`pumpkin`]);

// Original UTF-16 range 151378:151469
var Er=[`neutral`,`happy`,`surprised`,`sad`,`sleepy`,`squinted`,`calm`,`inspecting`,`confused`];

// Original UTF-16 range 151470:151476
var Dr=.26;

// Original UTF-16 range 151477:151482
var Or=18;

// Original UTF-16 range 151483:151663
var kr=new Map([[`thinking`,`sad`],[`strange`,`inspecting`],[`angry`,`neutral`],[`inspect`,`inspecting`],[`squint`,`squinted`],[`idle`,`neutral`],[`smile`,`happy`],[`sleep`,`sleepy`]]);

// Original UTF-16 range 151664:151722
var Ar=new Set([`sad`,`happy`,`confused`,`squinted`,`sleepy`]);

// Original UTF-16 range 151723:151764
function jr(e,t){return[e[t*6],e[t*6+1]]}

// Original UTF-16 range 151764:151839
function Mr(e,t,n){let r=n?4:2;return[e[t*6]+e[t*6+r],e[t*6+1]+e[t*6+r+1]]}

// Original UTF-16 range 151839:152117
function Nr(e){let t=[],n=(e,n,r,i,a)=>{for(let o=a;o<11;o++){let a=o/10,s=1-a,c=s*s*s,l=3*s*s*a,u=3*s*a*a,d=a*a*a;t.push([c*e[0]+l*n[0]+u*r[0]+d*i[0],c*e[1]+l*n[1]+u*r[1]+d*i[1]])}};return n(jr(e,0),Mr(e,0,!0),Mr(e,1,!1),jr(e,1),0),n(jr(e,1),Mr(e,1,!0),Mr(e,2,!1),jr(e,2),1),t}

// Original UTF-16 range 152117:153375
function Pr({p0:e,p1:t,p2:n,isArc:r}){let[i,a]=e,[o,s]=t,[c,l]=n,u=Array(Or).fill(0),d=(e,t)=>{u[e*6]=t[0],u[e*6+1]=t[1]},f=(e,t)=>{u[e*6+2]=t[0]-u[e*6],u[e*6+3]=t[1]-u[e*6+1]},p=(e,t)=>{u[e*6+4]=t[0]-u[e*6],u[e*6+5]=t[1]-u[e*6+1]};if(r){let e=2*(i*(s-l)+o*(l-a)+c*(a-s));if(Math.abs(e)>1e-9){let t=i*i+a*a,n=o*o+s*s,r=c*c+l*l,m=(t*(s-l)+n*(l-a)+r*(a-s))/e,h=(t*(c-o)+n*(i-c)+r*(o-i))/e,g=Math.hypot(i-m,a-h),_=Math.atan2(a-h,i-m),v=Math.atan2(l-h,c-m),y=Math.atan2(s-h,o-m),b=Math.PI*2,x=(v-_+b)%b,S=(y-_+b)%b<=x?x:x-b,C=e=>[m+g*Math.cos(e),h+g*Math.sin(e)],w=e=>[-Math.sin(e),Math.cos(e)],T=S/2,E=4/3*Math.tan(T/4)*g,D=[_,_+T,_+S];for(let e=0;e<3;e++){let t=C(D[e]),n=w(D[e]);d(e,t),e>0&&f(e,[t[0]-E*n[0],t[1]-E*n[1]]),e<2&&p(e,[t[0]+E*n[0],t[1]+E*n[1]])}return u}let t=[(i+c)/2,(a+l)/2];return d(0,[i,a]),d(1,t),d(2,[c,l]),p(0,[i+(t[0]-i)/3,a+(t[1]-a)/3]),f(1,[t[0]-(t[0]-i)/3,t[1]-(t[1]-a)/3]),p(1,[t[0]+(c-t[0])/3,t[1]+(l-t[1])/3]),f(2,[c-(c-t[0])/3,l-(l-t[1])/3]),u}let m=[(i+o)/2,(a+s)/2],h=[(o+c)/2,(s+l)/2],g=[(m[0]+h[0])/2,(m[1]+h[1])/2];return d(0,[i,a]),d(1,g),d(2,[c,l]),p(0,[i+2/3*(m[0]-i),a+2/3*(m[1]-a)]),f(1,[g[0]+2/3*(m[0]-g[0]),g[1]+2/3*(m[1]-g[1])]),p(1,[g[0]+2/3*(h[0]-g[0]),g[1]+2/3*(h[1]-g[1])]),f(2,[c+2/3*(h[0]-c),l+2/3*(h[1]-l)]),u}

// Original UTF-16 range 153375:153492
function Fr(e,t,n,r,i){let a=Pr(r);return{off:e,tilt:t,wid:n,lidY:1,oval:i,ovalMix:0,pts:Nr(a),path:a,fillRing:null}}

// Original UTF-16 range 153492:153654
function Ir(e,t,n,r,i){let a=Math.max(0,(t-e)/2),o=n*Math.PI/180,s=Math.sin(o)*a,c=Math.cos(o)*a;return Fr(r,i,e/2,{p0:[-s,-c],p1:[0,0],p2:[s,c],isArc:!1},[0,0])}

// Original UTF-16 range 153654:153700
function Lr(e,t,n,r){return Ir(e,t,n,[r,0],0)}

// Original UTF-16 range 153700:153793
function Rr(e,t,n){let r={p0:[-e,0],p1:[0,0],p2:[e,0],isArc:!1};return Fr([n,0],0,t,r,[e,t])}

// Original UTF-16 range 153793:153820
function zr(e){return[e,e]}

// Original UTF-16 range 153824:154280
var Br={neutral:zr(Lr(Dr,.57,0,0)),happy:zr(Fr([.03,.03],0,gr,{p0:[.16,-.04],p1:[0,.12],p2:[-.16,-.04],isArc:!0},[0,0])),surprised:zr(Lr(.42,.86,0,.03)),inspecting:[Lr(.54,.54,0,.04),Lr(.36,.36,0,.04)],sad:zr(Lr(Dr,.5,-28,-.05)),sleepy:zr(Fr([.01,0],0,Dr/2,{p0:[-.11,.025],p1:[0,-.05],p2:[.11,.025],isArc:!1},[0,0])),squinted:zr(Lr(Dr,.5,90,.01)),calm:zr(Rr(.296,.247,.05)),confused:zr(Fr([-.1,0],0,gr,{p0:[.01,.16],p1:[-.17,0],p2:[.01,-.16],isArc:!1},[0,0]))};

// Original UTF-16 range 154281:154321
function Vr(e){return Er.some(t=>t===e)}

// Original UTF-16 range 154321:154405
function Hr(e){let t=e.trim().toLowerCase(),n=kr.get(t)??t;return Vr(n)?n:`neutral`}

// Original UTF-16 range 154405:154437
function Ur(e){return Ar.has(e)}

// Original UTF-16 range 154437:154482
function Wr(e){return!Ur(e)&&!Br[e].some(Kr)}

// Original UTF-16 range 154482:154526
function R(e,t){return[t(e[0],0),t(e[1],1)]}

// Original UTF-16 range 154526:154564
function Gr(e){return{...e,ovalMix:0}}

// Original UTF-16 range 154564:154617
function Kr(e){return e.oval[0]>1e-4&&e.oval[1]>1e-4}

// Original UTF-16 range 154617:154918
function qr(e){if(Kr(e)||e.pts.length<3)return!1;let t=e.pts[0],n=e.pts[e.pts.length-1],r=n[0]-t[0],i=n[1]-t[1],a=r*r+i*i;if(a<1e-8)return!1;let o=0;for(let n of e.pts){let e=((n[0]-t[0])*r+(n[1]-t[1])*i)/a,s=t[0]+e*r,c=t[1]+e*i,l=Math.hypot(n[0]-s,n[1]-c);l>o&&(o=l)}return o>Math.max(.012,e.wid*.2)}

// Original UTF-16 range 154922:154928
var Jr=.03;

// Original UTF-16 range 154929:154935
var Yr=.42;

// Original UTF-16 range 154936:154941
var Xr=20;

// Original UTF-16 range 154942:154978
function Zr(e,t,n){return e+(t-e)*n}

// Original UTF-16 range 154978:155037
function Qr(e,t,n){return[Zr(e[0],t[0],n),Zr(e[1],t[1],n)]}

// Original UTF-16 range 155037:155209
function $r(e,t,n){if(e.length===0)return[0,0];if(e.length===1||n<=1)return e[0];let r=t/(n-1)*(e.length-1),i=Math.min(Math.floor(r),e.length-2);return Qr(e[i],e[i+1],r-i)}

// Original UTF-16 range 155209:155646
function ei(e,t,n){let r={off:Qr(e.off,t.off,n),tilt:Zr(e.tilt,t.tilt,n),wid:Zr(e.wid,t.wid,n),lidY:Zr(e.lidY,t.lidY,n),oval:Qr(e.oval,t.oval,n),ovalMix:0,fillRing:null};if(e.path&&t.path&&e.path.length===t.path.length){let i=t.path,a=e.path.map((e,t)=>Zr(e,i[t],n));return{...r,path:a,pts:Nr(a)}}let i=Math.max(e.pts.length,t.pts.length,2),a=[];for(let r=0;r<i;r++)a.push(Qr($r(e.pts,r,i),$r(t.pts,r,i),n));return{...r,path:null,pts:a}}

// Original UTF-16 range 155646:156067
function ti(e){if(Kr(e)){let[t,n]=e.oval;return{cx:e.off[0],cy:e.off[1],ang:t>=n?Math.PI/2:0,halfLen:Math.max(t,n),halfW:Math.min(t,n)}}let t=e.wid;if(e.pts.length<2)return{cx:e.off[0],cy:e.off[1],ang:e.tilt,halfLen:t,halfW:t};let n=e.pts[0],r=e.pts[e.pts.length-1];return{cx:e.off[0]+(n[0]+r[0])/2,cy:e.off[1]+(n[1]+r[1])/2,ang:Math.atan2(r[0]-n[0],r[1]-n[1])+e.tilt,halfLen:Math.hypot(r[0]-n[0],r[1]-n[1])/2+t,halfW:t}}

// Original UTF-16 range 156067:156170
function ni(e,t){let n=t.ang-e.ang;for(;n>Math.PI/2;)n-=Math.PI;for(;n<-Math.PI/2;)n+=Math.PI;return n}

// Original UTF-16 range 156170:156534
function ri(e,t,n){let r=Math.max(0,e-t),i=Math.max(0,Math.min(1,n)),a=[];for(let n=0;n<48;n++){let o=n/48*Math.PI*2,s=Math.cos(o),c=Math.sin(o),l=t*s,u=e*c,d=t/Math.max(Math.abs(s),1e-6),f;if(d*Math.abs(c)<=r+1e-6&&Number.isFinite(d))f=d;else{let e=(c>=0?1:-1)*r*c,n=Math.max(0,e*e-r*r+t*t);f=e+Math.sqrt(n)}let p=f*s,m=f*c;a.push([p+(l-p)*i,m+(u-m)*i])}return a}

// Original UTF-16 range 156534:156603
function ii(e,t,n,r){return Ir(Math.max(e,1e-4),Math.max(t,e),0,r,n)}

// Original UTF-16 range 156603:156994
function ai(e,t,n){if(n<=1e-4)return Gr(e);if(n>=.995)return Gr(t);let r=ti(e),i=ti(t),a=ni(r,i),o=Kr(t),s=o?1-(1-n)**3:n*n*n,c=r.ang+a*n,l=Math.max(r.halfLen+(i.halfLen-r.halfLen)*n,1e-4),u=Math.max(r.halfW+(i.halfW-r.halfW)*n,1e-4),d=+!!Kr(e),f=d+(+!!o-d)*s,p=ii(2*u,2*l,c,[r.cx+(i.cx-r.cx)*n,r.cy+(i.cy-r.cy)*n]),m=f>1e-4;return{...p,oval:m?[u,l]:p.oval,ovalMix:m?f:0,fillRing:ri(l,u,f)}}

// Original UTF-16 range 156994:157274
function oi(e,t,n){if(n>=.9999)return Gr(t);let r=ti(e),i=ti(t),a=r.ang+ni(r,i)*n,o=Math.max(1e-4,r.halfW+(i.halfW-r.halfW)*n),s=Math.max(0,r.halfLen-r.halfW)*(1-n)+Math.max(0,i.halfLen-i.halfW)*n,c=[r.cx+(i.cx-r.cx)*n,r.cy+(i.cy-r.cy)*n];return Ir(2*o,2*(s+o),a*180/Math.PI,c,0)}

// Original UTF-16 range 157274:157691
function si(e){let t=Kr(e);if(!(e.wid>0)&&!t)return null;let n=e.lidY,r=e.tilt*(180/Math.PI);if(t)return{width:2*e.oval[0],height:2*e.oval[1]*n,tilt:r,cx:e.off[0],cy:e.off[1]};if(e.pts.length<2)return null;let i=e.pts[0],a=e.pts[e.pts.length-1],o=a[0]-i[0],s=a[1]-i[1],c=Math.hypot(o,s),l=2*e.wid;return{width:l,height:(c+l)*n,tilt:180/Math.PI*Math.atan2(o,s)+r,cx:e.off[0]+(i[0]+a[0])/2,cy:e.off[1]+(i[1]+a[1])/2*n}}

// Original UTF-16 range 157691:157915
function ci(e){let t=si(e);if(t==null)return{w:Dr,h:.57,cx:e.off[0],cy:e.off[1]};let n=t.tilt*Math.PI/180,r=Math.abs(Math.cos(n)),i=Math.abs(Math.sin(n));return{w:t.width*r+t.height*i,h:t.width*i+t.height*r,cx:t.cx,cy:t.cy}}

// Original UTF-16 range 157915:157988
function li(e,t,n,r){return t>=e?ii(e,t,0,[n,r]):ii(t,e,Math.PI/2,[n,r])}

// Original UTF-16 range 157988:158125
function ui(e,t){if(t<=0)return e;let n=Math.min(1,t),r=ci(e),i=Math.max(r.w,1e-4),a=Math.max(r.h,i);return li(i,a+(i*Yr-a)*n,r.cx,r.cy)}

// Original UTF-16 range 158125:158170
function di(e){return{...e,wid:0,oval:[0,0]}}

// Original UTF-16 range 158170:158340
function fi(e){let t,n;if(Kr(e))t=-e.oval[1],n=e.oval[1];else{let r=1e9,i=-1e9;for(let t of e.pts)t[1]<r&&(r=t[1]),t[1]>i&&(i=t[1]);t=r-e.wid,n=i+e.wid}return t+.4*(n-t)}

// Original UTF-16 range 158340:158639
function pi(e){if(e.pts.length<2)return e;let t=e.pts[0],n=e.pts[e.pts.length-1],r=n[0]-t[0],i=n[1]-t[1];if(Math.abs(i)<Math.abs(r))return e;let a=Math.atan2(r,i);if(Math.abs(a)<1e-5)return e;let o=Math.cos(a),s=Math.sin(a);return{...e,tilt:e.tilt+a,pts:e.pts.map(e=>[e[0]*o-e[1]*s,e[0]*s+e[1]*o])}}

// Original UTF-16 range 158639:158818
function mi(e,t){if(t===0)return e;let n=pi(e),r=Math.max(Jr,1-t),i=fi(n)*(1-r),a=Math.cos(-n.tilt),o=Math.sin(-n.tilt);return{...n,off:[n.off[0]-o*i,n.off[1]+a*i],lidY:n.lidY*r}}

// Original UTF-16 range 158818:159129
function hi(e,t,n,r){if(t<.001)return e;let i=n.isFollowingTurn?Math.min(1,Math.max(-1,r/Xr)):n.bias,[a,o]=Br.inspecting,s=Math.max(1e-4,a.wid),c=Math.max(1e-4,o.wid),l=(1+i)/2,u=(e,n)=>{let r=1+(n-1)*t;return{...Gr(e),wid:e.wid*r,pts:e.pts.map(e=>[e[0]*r,e[1]*r])}};return[u(e[0],(c/s)**+l),u(e[1],(s/c)**+l)]}

// Original UTF-16 range 159129:159170
function gi(e){return+(e===`inspecting`)}

// Original UTF-16 range 159170:159274
function _i(e,t,n){return!(e.some(qr)||t.some(qr))&&(e.some(Kr)||t.some(Kr))?`oval`:n?`spine`:`stadium`}

// Original UTF-16 range 159274:159337
function vi(e){return nr(Math.min(Math.max(e.t/e.dur,0),1),qn)}

// Original UTF-16 range 159337:161152
function yi(){let e=`neutral`,t=R(Br.neutral,Gr),n=0,r=null,i=()=>{if(r==null)return t;if(r.kind===`blink`)return r.from;if(r.kind===`morph`){let e=Math.max(0,Math.min(1,vi(r))),{from:t,to:n,path:i}=r;return i===`oval`?R(t,(t,r)=>ai(t,n[r],e)):i===`spine`?R(t,(t,r)=>ei(t,n[r],e)):R(t,(t,r)=>oi(t,n[r],e))}let e=Math.min(r.t/r.dur,1),{u1:n,u2:i}=ir(!1,r.dur);if(e<n)return R(r.from,t=>mi(t,rr(e/n)));if(e<=i)return R(r.to,di);let a=ar((e-i)/Math.max(1e-6,1-i));return R(r.to,e=>mi(e,1-a))},a=()=>{if(r==null)return n;if(r.kind===`blink`)return r.fromInspect;let e=r.fromInspect,t=gi(r.toName);if(r.kind===`morph`)return e+(t-e)*vi(r);let i=Math.min(r.t/r.dur,1),{u1:a,u2:o}=ir(!1,r.dur);return i<=a?e:i<o?0:t},o=t=>{let n=R(i(),Gr),o=Br[t];r={kind:`morph`,path:_i(n,o,n.some(qr)||o.some(qr)||e===`sleepy`||t===`sleepy`),fromInspect:a(),toName:t,from:n,to:o,t:0,dur:Jn,isHeld:!1},e=t},s=t=>{r={kind:`lidMorph`,fromInspect:a(),toName:t,from:R(i(),Gr),to:Br[t],t:0,dur:Yn,isHeld:!1},e=t},c=()=>{(r==null||r.isHeld)&&(r={kind:`blink`,fromInspect:n,toName:e,from:R(t,Gr),to:Br[e],t:0,dur:Xn,isHeld:!1})},l=t=>{(t.name!==e||r!=null&&r.toName!==t.name)&&(t.isThroughBlink&&!Ur(t.name)&&!Ur(e)?s(t.name):o(t.name))},u=(e,i)=>{i>=e.dur?(t=R(e.to,Gr),n=gi(e.toName),r=null):r=i<0?null:{...e,t:i}},d=e=>{r!=null&&(r={...r,isHeld:e})};return{get name(){return e},get isMorphing(){return r!=null&&r.kind!==`blink`&&!r.isHeld},eyes:i,inspectWeight:a,blinkAmount(){if(r?.kind!==`blink`||r.isHeld)return null;let e=Math.min(r.t/r.dur,1);return Math.min(1,Math.max(0,or(e,ir(!0,r.dur))))},morph:o,lidMorph:s,blink:c,play:l,step(e){r!=null&&!r.isHeld&&u(r,r.t+e)},release(){d(!1)},seek(i,a){e=`neutral`,t=R(Br.neutral,Gr),n=0,r=null;let o=0,s=e=>{r!=null&&u(r,e-o)};for(let e of i){if(e.t>a+1e-9)break;s(e.t),l(e),o=e.t}s(a),d(!0)}}}

// Original UTF-16 range 161183:161188
var xi=.9;

// Original UTF-16 range 161189:161194
var Si=.4;

// Original UTF-16 range 161195:161201
var Ci=.62;

// Original UTF-16 range 161202:161207
var wi=.3;

// Original UTF-16 range 161208:161213
var Ti=.5;

// Original UTF-16 range 161214:161219
var Ei=16;

// Original UTF-16 range 161220:161386
function Di({poke:e,turns:t}){switch(e){case`spin`:return xi+Si*(t-1);case`bounce`:return Ci;case`nod`:return Ti;default:throw Error(`Unhandled case: ${String(e)}`)}}

// Original UTF-16 range 161386:161758
function Oi(e){let t=0,n=0,r=0,i=1,a=1;for(let o of e){let e=Math.min(1,o.t/Di(o));switch(o.poke){case`spin`:n+=180*o.turns*(1-Math.cos(Math.PI*e));break;case`nod`:t+=Ei*ki(e,0,1);break;case`bounce`:{let t=ki(e,0,.18)+ki(e,.82,1),n=ki(e,.18,.82);r+=wi*Math.sin(Math.PI*F((e-.14)/.72,0,1)),i*=1+.08*t-.04*n,a*=1-.1*t+.06*n;break}}}return{pitch:t,yaw:n,lift:r,squash:[i,a]}}

// Original UTF-16 range 161758:161830
function ki(e,t,n){return e<=t||e>=n?0:Math.sin(Math.PI*(e-t)/(n-t))**2}

// Original UTF-16 range 161834:161841
var Ai=1/60;

// Original UTF-16 range 161842:161848
var ji=.55;

// Original UTF-16 range 161849:161878
var Mi={heartChubby:.6,wedge:.55};

// Original UTF-16 range 161879:161883
var Ni=2;

// Original UTF-16 range 161884:161920
function Pi(e){return 1-.86**(e/Ai)}

// Original UTF-16 range 161920:162048
function Fi(e,t,n){let r=e!==`sphere`,i=Mi[e]??1;return{rx:-(r?19:14)*i*n,ry:(r?26:18)*i*t,px:(r?.07:.03)*t,py:(r?.055:.024)*n}}

// Original UTF-16 range 162048:162199
function Ii(e,t,n=Ni){let r=Math.max(e.width,1)*n,i=e=>Math.max(-1,Math.min(1,e));return[i((t.x-(e.left+e.width/2))/r),i(-(t.y-(e.top+e.height/2))/r)]}

// Original UTF-16 range 162203:162433
var Li={thinking:`dots`,orbit:`orbit`,radar:`radar`,progress:`progress`,spawning:`gather`,dictating:`wave`,sending:`send`,receiving:`receive`,uploading:`dock`,bouncing:`ball`,writing:`pencil`,alerting:`bang`,"powering-down":`standby`};

// Original UTF-16 range 162434:162444
var Ri=Math.PI;

// Original UTF-16 range 162445:162450
var zi=.1;

// Original UTF-16 range 162451:162464
var Bi=2654435769;

// Original UTF-16 range 162465:162500
var Vi=new Set([`progress`,`spawning`]);

// Original UTF-16 range 162501:162529
var Hi={progress:2.5,spawning:2};

// Original UTF-16 range 162530:162536
var Ui=1.5;

// Original UTF-16 range 162537:162685
function Wi(e){let t=e|0;return()=>{t=t+1831565813|0;let e=Math.imul(t^t>>>15,t|1);return e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}

// Original UTF-16 range 162685:162718
function Gi(e){return Hi[e]??2.5}

// Original UTF-16 range 162718:163734
function Ki(e={}){let t=e.isReducedMotion??!1,n=Wi(e.seed??Bi),r=zn(0),i=zn(1),a=zn(0),o=null,s=null,c=null,l=null,u=!1,d=0,f=0,p=1,m=!1,h=0,g=0,_=0,v=0,y=0,b=()=>{let e=o==null?null:Li[o],b=_;o!==s&&(s=o,o!=null&&(_=h,u=!1));let x=e!=null;o!=null&&Vi.has(o)&&(!u&&h-_>Gi(o)?(u=!0,d=h):u&&h-d>Ui&&(u=!1,_=h),x=!u),r.t=+!!x,e!=null&&e!==c&&(c!=null&&r.x>.02?(l=c,v=g,y=b,i.x=+!!t):(l=null,i.x=1),i.v=0,i.t=1,c=e,g=h),e==null&&r.x<.004&&(c=null,l=null),i.x>.996&&(l=null),x!==m&&(x&&!t&&(p=n()<.5?1:-1),t||(f+=Ri*p,a.t=f),m=x)};return{get target(){return o},set(e){o=e},advance(e){let n=e>0?Math.min(e,zi):0;h+=n,b();let o=Hn(n),s=n/o;for(let e=0;e<o;e++)Bn(r,14,1,s),Bn(i,11,1,s),Bn(a,14,1,s);t&&(i.x=1,a.x=a.t,r.x=r.t)},settle(){b();for(let e of[r,i,a])e.x=e.t,e.v=0;b()},snapshot(){return{amount:F(r.x,0,1),spin:a.x,kind:c,outgoing:l,swap:F(i.x,0,1),clock:{stateTime:h-g,shotTime:h-_},outgoingClock:{stateTime:h-v,shotTime:h-y},isReducedMotion:t,isSettled:Math.abs(r.x-r.t)<.001&&Math.abs(a.t-a.x)<.01&&i.x>.996}}}}

// Original UTF-16 range 163738:163973
var qi=new Map([[`position`,`position`],[`rotation`,`rotation`],[`squash`,`squash`],[`scale`,`zoom`],[`lids`,`lids`],[`expression`,`expression`],[`pos`,`position`],[`rot`,`rotation`],[`scl`,`squash`],[`zoom`,`zoom`],[`expr`,`expression`]]);

// Original UTF-16 range 163974:164129
var Ji=new Map([[`blob`,`sphere`],[`sphereWide`,`sphere`],[`arch`,`horseshoe`],[`spark`,`sparkle`],[`star`,`star6`],[`heart`,`heartChubby`],[`hexagon`,`hex`]]);

// Original UTF-16 range 164130:164144
var Yi=[.4,0,.2,1];

// Original UTF-16 range 164145:164150
var Xi=.6;

// Original UTF-16 range 164151:164204
var Zi=(()=>{let[e,t,n]=hr(Sr);return[e/sr,t/sr,n/sr]})();

// Original UTF-16 range 164205:164332
var Qi={duration:10,body:null,squashAnchor:0,restTime:0,inspect:{},position:[],rotation:[],squash:[],zoom:[],lids:[],expression:[]};

// Original UTF-16 range 164333:164373
var $i={...Qi,rotation:[{t:0,v:Zi,ease:Kn}]};

// Original UTF-16 range 164374:164414
function ea(e){return wr.some(t=>t===e)}

// Original UTF-16 range 164414:164472
function ta(e){let t=Ji.get(e)??e;return ea(t)?t:`sphere`}

// Original UTF-16 range 164472:164516
function na(e){return e!=null&&e.length===4}

// Original UTF-16 range 164516:164600
function ra({t:e,v:t,ease:n}){return{t:e,v:typeof t==`string`?[]:t,ease:na(n)?n:Kn}}

// Original UTF-16 range 164600:164693
function ia(e){return[{t:e,v:[0],ease:Kn},{t:e+Xn*.45,v:[1],ease:Kn},{t:e+Xn,v:[0],ease:Kn}]}

// Original UTF-16 range 164693:164836
function aa({inspect:e}){let t=e?.bias;return{bias:t!==void 0&&Number.isFinite(t)?Math.min(1,Math.max(-1,t)):void 0,isFollowingTurn:e?.follow}}

// Original UTF-16 range 164836:165439
function oa(e){let t=new Map;for(let[n,r]of Object.entries(e.tracks)){let e=qi.get(n);e!==void 0&&t.set(e,r)}let n=e=>(t.get(e)??[]).map(ra),r=n(`lids`),i=[],a=!1;for(let e of t.get(`expression`)??[]){if(e.v===`blink`){a=!0,r.push(...ia(e.t));continue}i.push({t:e.t,name:typeof e.v==`string`?Hr(e.v):`neutral`,isThroughBlink:e.cut===!1})}return a&&r.sort((e,t)=>e.t-t.t),{duration:e.duration,body:ta(e.body??`sphere`),squashAnchor:e.squashAnchor??0,restTime:e.workArea?e.workArea.start:0,inspect:aa(e),position:n(`position`),rotation:n(`rotation`),squash:n(`squash`),zoom:n(`zoom`),lids:r,expression:i}}

// Original UTF-16 range 165439:165698
function sa(e,t){if(e.length===0)return null;if(t<=e[0].t)return e[0].v;let n=e[e.length-1];if(t>=n.t)return n.v;let r=0;for(;r<e.length-2&&e[r+1].t<=t;)r++;let i=e[r],a=e[r+1],o=nr((t-i.t)/Math.max(a.t-i.t,1e-9),i.ease);return i.v.map((e,t)=>e+(a.v[t]-e)*o)}

// Original UTF-16 range 165698:166075
function ca(e){let t=e.restTime,n=sa(e.rotation,t),r=sa(e.position,t),i=sa(e.squash,t),a=sa(e.zoom,t),o=sa(e.lids,t),s=`neutral`,c=!1;for(let n of e.expression)c||=(s=n.name,!0),n.t<=t+1e-9&&(s=n.name);return{rot:n?[n[0],n[1],n[2]]:[0,0,0],pos:r?[r[0],r[1]]:[0,0],scl:i?[i[0],i[1]]:[1,1],zoom:a?a[0]:Xi,lids:o?Math.min(1,Math.max(0,o[0])):0,expr:s,squashAnchor:e.squashAnchor}}

// Original UTF-16 range 166075:166127
function la(e,t){return e+360*Math.round((t-e)/360)}

// Original UTF-16 range 166127:166185
function ua(e,t){return Math.abs(((e-t)%360+540)%360-180)}

// Original UTF-16 range 166185:166475
function da(e,t){return ua(e.rot[0],t.rot[0])<4&&ua(e.rot[1],t.rot[1])<4&&ua(e.rot[2],t.rot[2])<4&&Math.abs(e.pos[0]-t.pos[0])<.015&&Math.abs(e.pos[1]-t.pos[1])<.015&&Math.abs(e.scl[0]-t.scl[0])<.02&&Math.abs(e.scl[1]-t.scl[1])<.02&&Math.abs(e.zoom-t.zoom)<.02&&Math.abs(e.lids-t.lids)<.05}

// Original UTF-16 range 166475:166812
function fa(e,t){let n=(e,t)=>[{t:0,v:e,ease:Yi},{t:Yn,v:t,ease:Kn}],r=[la(t.rot[0],e.rot[0]),la(t.rot[1],e.rot[1]),la(t.rot[2],e.rot[2])];return{...Qi,duration:Yn,squashAnchor:e.squashAnchor,position:n(e.pos,t.pos),rotation:n(e.rot,r),squash:n(e.scl,t.scl),zoom:n([e.zoom],[t.zoom]),lids:e.lids===0&&t.lids===0?[]:n([e.lids],[t.lids])}}

// Original UTF-16 range 166816:166978
var pa={left:{rot:[0,-20,0],pos:[-.1,0]},right:{rot:[0,20,0],pos:[.1,0]},up:{rot:[-20,0,0],pos:[0,.1]},down:{rot:[20,0,0],pos:[0,-.1]},center:{rot:[0,0,0],pos:[0,0]}};

// Original UTF-16 range 166979:166995
var ma=[.42,0,.58,1];

// Original UTF-16 range 166996:167001
var ha=.5;

// Original UTF-16 range 167002:167007
var ga=.1;

// Original UTF-16 range 167008:167013
var _a=10;

// Original UTF-16 range 167014:167021
var va=1e-4;

// Original UTF-16 range 167022:167027
var ya=.5;

// Original UTF-16 range 167028:167035
var ba=.001;

// Original UTF-16 range 167036:167045
var xa=`rest`;

// Original UTF-16 range 167046:167090
function Sa(e){return 360*Math.round(e/360)}

// Original UTF-16 range 167090:167177
function Ca(e,t){let n=`neutral`;for(let r of e){if(r.t>t+1e-9)break;n=r.name}return n}

// Original UTF-16 range 167177:172685
function wa(e={}){let t=Math.min(3,Math.max(.2,e.zoomMul||1)),n=yi(),r=e.body??`sphere`,i=e.body!==void 0,a=[],o=zn(1),s=Ki(),c=null,l=Zi,u=[0,0],d=[1,1],f=0,p=Xi*t,m={bias:-1,isFollowingTurn:!0},h=null,g={isHeld:!1,isAlways:e.isGazeAlways??!1,x:0,y:0,cx:0,cy:0,hold:0},_=$i,v=0,y=!1,b=!0,x=!1,S=null,C=null,w=null,T=0,E=0,D=null,O=null,ee=!1,k=[],te=()=>{let e=sa(_.position,v);u=e?[e[0],e[1]]:[0,0];let n=sa(_.rotation,v);l=n?[n[0],n[1],n[2]]:[0,0,0];let r=sa(_.squash,v);d=r?[r[0],r[1]]:[1,1];let i=sa(_.zoom,v);i&&(p=Math.min(2.5,Math.max(.25,i[0]))*t)},ne=e=>{if((n.blinkAmount()??ie())>0){O=e;return}e(),M()},A=(e,t)=>{if(D==null)for(let r of _.expression)r.t<=e||r.t>t||ne(()=>n.play(r))},j=e=>{v=e,h=null,O=null,te(),n.seek(_.expression,e),D!=null&&n.seek([{t:0,name:D,isThroughBlink:!1}],0)},re=()=>{let e=sa(_.lids,v);return e?Math.min(1,Math.max(0,e[0])):0},ie=()=>ee?0:re(),M=()=>{!Wr(n.name)||n.isMorphing?ee=!0:ee&&re()===0&&(ee=!1)},ae=()=>({rot:l,pos:u,scl:d,zoom:p/t,lids:ie(),expr:n.name,squashAnchor:f}),oe=e=>{y=!1,_=e,v=0,f=e.squashAnchor,e.body!=null&&!i&&(r=e.body),m={bias:e.inspect.bias??m.bias,isFollowingTurn:e.inspect.isFollowingTurn??m.isFollowingTurn}},se=e=>{if(C=null,oe(e.clip),S={clip:e.clip,name:e.name},b=!0,!e.isPlaying){j(0),e.isRest&&(g={...g,hold:0});return}y=!0,e.phase>0&&j(e.phase*e.clip.duration),n.release(),e.phase<=0&&A(-1e-9,0)},N=e=>{let t=ae(),r=ca(e.clip);C=e,oe(fa(t,r)),b=!1,y=!0,D==null&&t.expr!==r.expr&&ne(()=>n.morph(r.expr))},ce=()=>C!=null||S==null||da(ae(),ca(S.clip))?!1:(N({...S,isPlaying:!0,phase:0,isRest:!1}),!0),le=e=>{let t=v,n=t+e;if(n>=_.duration){if(A(t,_.duration),b){if(E+=1,ce())return;n-=_.duration,n>=_.duration&&(n=0),A(-1e-9,n),v=n}else v=_.duration,y=!1,C!=null&&se(C)}else A(t,n),v=n;h=null,te()},ue=(e,t,n)=>{let r=e+(t-e)*n;return Math.abs(t-r)<ba?t:r},de=e=>{if(x||!g.isHeld&&g.hold===0)return;let t=Pi(e);if(g={...g,cx:ue(g.cx,g.x,t),cy:ue(g.cy,g.y,t),hold:ue(g.hold,+!!g.isHeld,t)},y)return;te();let n=Fi(r,g.cx,g.cy),{hold:i}=g;l=[l[0]+(n.rx-l[0])*i,l[1]+(n.ry-l[1])*i,l[2]*(1-i)],u=[u[0]+(n.px-u[0])*i,u[1]+(n.py-u[1])*i]},fe=e=>{if(h==null)return;let t=h.t+e,n=Math.min(t/ha,1),r=nr(n,ma),{fromRot:i,toRot:a,fromPos:o,toPos:s}=h;l=[i[0]+(a[0]-i[0])*r,i[1]+(a[1]-i[1])*r,i[2]+(a[2]-i[2])*r],u=[o[0]+(s[0]-o[0])*r,o[1]+(s[1]-o[1])*r],n>=1?(l=a,u=s,h=null):h={...h,t}},pe=()=>{if(a.length===0)return[{body:r,weight:1}];let e=Un(F(o.x,0,1)),t=new Map;for(let n of a)t.set(n.body,(t.get(n.body)??0)+n.weight*(1-e));t.set(r,(t.get(r)??0)+e);let n=[...t].filter(([,e])=>e>va),i=n.reduce((e,[,t])=>e+t,0);return n.map(([e,t])=>({body:e,weight:t/i}))},me=e=>{e!==r&&(a=pe(),r=e,o.x=0,o.v=0,o.t=1)},he=e=>{if(a.length===0)return;let t=Hn(e);for(let n=0;n<t;n++)Bn(o,_a,1,e/t);Math.abs(o.x-1)<.001&&Math.abs(o.v)<.01&&(o.x=1,o.v=0,a=[])},ge=()=>n.blinkAmount()??ie(),_e=(e,t)=>{let r=hi(n.eyes(),t,m,e),i=ge();return i<=1e-4?r:[ui(r[0],i),ui(r[1],i)]};return{get isPlaying(){return y},get time(){return v},get duration(){return _.duration},get loopCount(){return E},get face(){return n.name},get isSettled(){let e=x||g.hold===+!!g.isHeld&&(!g.isHeld||g.cx===g.x&&g.cy===g.y);return!y&&k.length===0&&a.length===0&&h==null&&O==null&&!n.isMorphing&&n.blinkAmount()==null&&s.snapshot().isSettled&&e},load(e,{isPlaying:t=!0,transition:n=`bridge`,phase:r=0}={}){let i=e.name||S?.name||`recipe`,a={clip:oa(e),name:i,isPlaying:t,phase:F(r,0,1)%1,isRest:!1};n===`bridge`&&S!=null&&(C!=null||S.name!==i)?N(a):se(a)},play(){x=!1,y=!0},pause(){x=!0,y=!1},stop(){y=!1,j(0)},rest(){x=!1;let e={clip:$i,name:xa,isPlaying:!1,phase:0,isRest:!0};if(C==null&&(S==null||S.name===xa)){S??se(e);return}N(e)},seek:j,setBody(e,{isInstant:t=!1}={}){if(i=!0,!t&&!Tr.has(e)&&!Tr.has(r)){me(e);return}r=e,a=[],o.x=1,o.v=0},setMorph(e,{isInstant:t=!1}={}){s.set(e),t&&s.settle()},setExpression(e,{isThroughBlink:t=!1}={}){ne(()=>{t&&!Ur(e)&&!Ur(n.name)?n.lidMorph(e):n.morph(e)})},holdFace(e){e!==D&&(D=e,ne(()=>{let e=D??(C==null?Ca(_.expression,v):Ca(C.clip.expression,0));e!==n.name&&n.morph(e)}))},poke(e,{turns:t=1}={}){k=[...k,{poke:e,t:0,turns:Math.max(1,Math.round(t))}]},blink(){n.blink()},setInspect({bias:e,isFollowingTurn:t}){m={bias:e===void 0?m.bias:Math.min(1,Math.max(-1,e)),isFollowingTurn:t??m.isFollowingTurn}},setGaze(e){if(e==null){g={...g,isHeld:!1};return}let t=F(e[0]||0,-1,1),n=F(e[1]||0,-1,1);g=g.hold===0?{...g,isHeld:!0,x:t,y:n,cx:t,cy:n}:{...g,isHeld:!0,x:t,y:n}},setGazeAlways(e){g={...g,isAlways:e}},look(e){let t=pa[e];h={t:0,fromRot:l,toRot:t.rot,fromPos:u,toPos:t.pos}},setGlow(e){w=e},advance(e){let t=Math.min(e,ga);de(t);let r=1-s.snapshot().amount;if(y&&le(t*r),fe(t),n.step(t),O!=null&&(n.blinkAmount()??ie())===0){let e=O;O=null,e()}M(),he(t),k=k.map(e=>({...e,t:e.t+t})).filter(e=>e.t<Di(e)),s.advance(t);let i=s.snapshot();i.amount>0||!i.isSettled?c??=[Sa(l[0]),Sa(l[1]),Sa(l[2])]:c=null,T+=e},frame(){let e=g.isAlways&&y&&!x?Fi(r,g.cx,g.cy):null,t=ji*g.hold,i=Oi(k),a=[l[0]+(e?e.rx*t:0)+i.pitch,l[1]+(e?e.ry*t:0)+i.yaw,l[2]],o=[u[0]+(e?e.px*t:0),u[1]+(e?e.py*t:0)+i.lift],m=[d[0]*i.squash[0],d[1]*i.squash[1]],h=n.inspectWeight(),_=s.snapshot(),v=1-_.amount,b=_.spin%(2*Math.PI)/sr,S=c??[0,0,0],C=e=>S[e]+(a[e]-S[e])*v,E=C(1);return{body:r,quat:pr(C(0)*sr,(E+b)*sr,C(2)*sr),zoom:p,offset:v===1?o:[o[0]*v,o[1]*v],squash:v===1?m:[1+(m[0]-1)*v,1+(m[1]-1)*v],squashAnchor:f,eyes:_.amount>=ya?null:_e(E,h),glow:w&&{...w,midT:.5+.5*Math.sin(T*1e3/860)},inspectWeight:h,bodies:pe(),morph:_.kind===null&&_.isSettled?null:_}}}}

// Original UTF-16 range 172689:172695
var Ta=.92;

// Original UTF-16 range 172696:172723
function Ea(e){return e/Xi}

// Original UTF-16 range 172723:172858
function Da(e){let t=e=>Math.round(Math.min(1,Math.max(0,e))*255).toString(16).padStart(2,`0`);return`#${t(e[0])}${t(e[1])}${t(e[2])}`}

// Original UTF-16 range 172858:172902
function Oa(e){return e.inkPaint??Da(e.ink)}

// Original UTF-16 range 172902:172948
function ka(e){return e.spotPaint??Da(e.spot)}

// Original UTF-16 range 172952:214998
var Aa=[{name:`Blocked_A`,duration:2.12,body:`sphere`,squashAnchor:0,workArea:{start:0,end:2.1},inspect:{bias:-1,follow:!0},tracks:{position:[{t:0,v:[0,0],ease:[.7968976121829217,.023358873568246466,.25805236576790014,.9399472349279558]},{t:.38639855209383034,v:[.020362603567309623,.0321716960933944],ease:[.7968976121829217,.023358873568246466,.25805236576790014,.9399472349279558]},{t:.7460619029579755,v:[-.13200621755876568,.04928491306786316],ease:[.16206624605678288,.6573718201333453,.4776581771164943,.9890940068909632]},{t:.8660990266653926,v:[-.0027221809712659807,.05083886406795958],ease:[.34720720728860055,-.008777460320222181,.2695010548130348,1.02521711915982]},{t:1.0493565888199954,v:[-.12038936798795193,.04235181137057312],ease:[.2773807176656155,.29281356631792965,.35341088328075676,1.0737667821535892]},{t:1.2986659810851888,v:[-.0027221809712659807,.05083886406795958],ease:[.34720720728860055,-.008777460320222181,.2695010548130348,1.02521711915982]},{t:1.7569209127327317,v:[0,0],ease:[.42,0,.58,1]}],rotation:[{t:0,v:[0,0,0],ease:[.8199958981940145,-.1753438779653778,.35490544014951186,.958837837092147]},{t:.38639855209383034,v:[6.596421550520286,26.266588805679774,6.122577979110701],ease:[.8199958981940145,-.1753438779653778,.35490544014951186,.958837837092147]},{t:.7460619029579755,v:[4.03072349953808,-14.070821783965659,-8.088521350792867],ease:[.16206624605678288,.6573718201333453,.4776581771164943,.9890940068909632]},{t:.8660990266653926,v:[10.306252195330941,13.969026095064219,7.524804229298955],ease:[.34720720728860055,-.008777460320222181,.2695010548130348,1.02521711915982]},{t:1.0493565888199954,v:[8.006914468651756,-9.270764174998455,-8.505309845875193],ease:[.2773807176656155,.29281356631792965,.35341088328075676,1.0737667821535892]},{t:1.2986659810851888,v:[10.306252195330941,13.969026095064219,7.524804229298955],ease:[.34720720728860055,-.008777460320222181,.2695010548130348,1.02521711915982]},{t:1.7569209127327317,v:[0,0,0],ease:[.42,0,.58,1]}],scale:[{t:0,v:[.6],ease:[.42,0,.06944264684998447,.9679740678629829]},{t:.38639855209383034,v:[.6],ease:[.42,0,.06944264684998447,.9679740678629829]},{t:1.1494959879909783,v:[.5],ease:[.7910272291113791,-.026550296201944556,.19732842008291107,1]},{t:1.900275655021834,v:[.6],ease:[.42,0,.06944264684998447,.9679740678629829]}],expression:[{t:.46926065284592233,v:`confused`,ease:[.42,0,.58,1]},{t:1.606008694397346,v:`neutral`,ease:[.42,0,.58,1]}]}},{name:`Blocked_B`,duration:3,body:`sphere`,squashAnchor:0,workArea:{start:0,end:3},inspect:{bias:-1,follow:!0},tracks:{position:[{t:1.2593574149757256,v:[.004259404064870088,-.22320548763819217],ease:[.42,0,.58,1]}],rotation:[{t:1.2593574149757256,v:[22.38040777312499,-.11374925549943268,-1.3254543924838493],ease:[.42,0,.58,1]}],expression:[{t:0,v:`sad`,ease:[.8458217358299596,.40487753378378377,.13769926619433198,.9154349662162162]}]}},{name:`Blocked_C`,duration:1.4,body:`sphere`,squashAnchor:0,workArea:{start:0,end:1.3929879324776784},inspect:{bias:-1,follow:!0},tracks:{position:[{t:0,v:[-.10159994888361161,.0005766171900318479],ease:[.42,0,.58,1]},{t:.6816231863839288,v:[.06829453998737205,.0005766171900318479],ease:[.42,0,.58,1]},{t:1.3929879324776784,v:[-.10159994888361161,.0005766171900318479],ease:[.42,0,.58,1]}],rotation:[{t:0,v:[22.100629997955743,-15.657630964434397,-4.681428255949899],ease:[.42,0,.58,1]},{t:.6816231863839288,v:[21.919069173693785,11.388653232575262,.7382242020910257],ease:[.42,0,.58,1]},{t:1.3929879324776784,v:[22.100629997955743,-15.657630964434397,-4.681428255949899],ease:[.42,0,.58,1]}],expression:[{t:0,v:`sleepy`,ease:[.8458217358299596,.40487753378378377,.13769926619433198,.9154349662162162]}]}},{name:`Bodymoves_A`,duration:5,body:`clover`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:0,v:[0,0],ease:[.42,0,.58,1]},{t:.3316869300911854,v:[-.1,0],ease:[.42,0,.58,1]},{t:.6673157294832825,v:[-.1,0],ease:[.42,0,.58,1]},{t:1,v:[.1,0],ease:[.42,0,.58,1]},{t:1.3356762917933132,v:[.1,0],ease:[.42,0,.58,1]},{t:1.654302811550152,v:[0,.1],ease:[.42,0,.58,1]},{t:2,v:[0,.1],ease:[.42,0,.58,1]},{t:2.329549772036474,v:[0,-.1],ease:[.42,0,.58,1]},{t:2.667601683029453,v:[0,-.1],ease:[.42,0,.58,1]},{t:2.9985974754558207,v:[0,0],ease:[.42,0,.58,1]}],rotation:[{t:0,v:[0,0,0],ease:[.42,0,.58,1]},{t:.3316869300911854,v:[0,-20,0],ease:[.42,0,.58,1]},{t:.6673157294832825,v:[0,-20,0],ease:[.42,0,.58,1]},{t:1,v:[0,20,0],ease:[.42,0,.58,1]},{t:1.3356762917933132,v:[0,20,0],ease:[.42,0,.58,1]},{t:1.654302811550152,v:[-20,0,0],ease:[.42,0,.58,1]},{t:2,v:[-20,0,0],ease:[.42,0,.58,1]},{t:2.329549772036474,v:[20,0,0],ease:[.42,0,.58,1]},{t:2.667601683029453,v:[20,0,0],ease:[.42,0,.58,1]},{t:2.9985974754558207,v:[0,0,0],ease:[.7340521114106021,0,.024581648697214575,1]},{t:4.546161721267454,v:[0,360,0],ease:[.42,0,.58,1]}]}},{name:`Done_A`,duration:3.7,body:`sphere`,squashAnchor:-1,workArea:{start:.07228455190755256,end:2.4415076840284984},inspect:{bias:-1,follow:!0},tracks:{expression:[{t:.5404427256792492,v:`happy`,ease:[.9601942054655871,-.052470439189189255,.20804339574898786,.9135346283783784]},{t:1.1009640885188103,v:`neutral`,ease:[.9601942054655871,-.052470439189189255,.20804339574898786,.9135346283783784]}],squash:[{t:.026170163234005256,v:[1,1],ease:[.42,0,.58,1]},{t:.1712334301051709,v:[1.095,.95],ease:[.42,0,.58,1]},{t:.2519479897020158,v:[1,1.1],ease:[.42,0,.58,1]},{t:.5890803023663453,v:[1,1],ease:[.42,0,.58,1]},{t:.7128174264881666,v:[1,1],ease:[.42,0,.58,1]},{t:.7669564766634516,v:[1.095,.95],ease:[.42,0,.58,1]},{t:.9897759640666083,v:[1,1.05],ease:[.42,0,.8951431517668547,.3407570422535186]},{t:1.2017846598233752,v:[1,1],ease:[.31159929257512675,.38869681601739836,.58,1]},{t:1.2442602578454727,v:[1.02,.95],ease:[.42,0,0,.9636255030181098]},{t:1.3707862721816209,v:[1,1.05],ease:[.42,-.06206202263065829,.58,1]},{t:1.5659785175305556,v:[1,1.05],ease:[.42,-.06206202263065829,.58,1]},{t:1.7225242861726335,v:[1,1],ease:[.42,0,.58,1]}],rotation:[{t:.07894117002629274,v:[0,0,0],ease:[.42,0,.58,1]},{t:.5890803023663453,v:[-30.114678799869385,-.3481515921755908,14.22102163595976],ease:[.7300325174456456,-.12405425024558042,.3365835061031919,.8017889379937657]},{t:1.1421861305872043,v:[-22.577941336944804,6.412920843838687,-21.655639323327193],ease:[.583298559499341,-.33760664743211344,.32045494511798944,1.0963542960860653]},{t:1.9672542725679227,v:[-2.0781042925060573,2.7701174100260233,-1.1097245079483975],ease:[.42,0,.58,1]},{t:2.265132022348826,v:[0,0,0],ease:[.42,0,.58,1]}],position:[{t:.21523060911481157,v:[0,0],ease:[.26223486988161915,.6947245975855132,.19480556164846297,.9038661358145291]},{t:.4114390589896057,v:[4251034064187152e-20,.2658889947011273],ease:[.6174717437059508,-.1285535110701914,.9558063166458642,1.4558335539794296]},{t:.7733546480351897,v:[0,.0027633019963448496],ease:[.09538195235865887,.5878716966122386,.07993556895591414,.9424688534678969]},{t:.9897759640666083,v:[4251034064187152e-20,.2724621969461928],ease:[.8363729761758775,-.06230462217533443,.9982539187302559,1.5]},{t:1.2463303718735304,v:[0,.004098894994698572],ease:[.0027852407545025976,.747585125427439,.2902850468489716,1.075893533235889]},{t:1.4277545322137832,v:[4251034064187152e-20,.20927514060819213],ease:[.6418193857854623,.06919682671194852,.999114846102708,1.0051682084254565]},{t:1.6154571730378309,v:[0,-.0012722231452485869],ease:[.1439324608778934,.5569463954729904,.40675790714828725,.8986649812795062]},{t:1.6919913573024103,v:[4251034064187152e-20,.12826705419287673],ease:[.7357127354801332,-.23608339420075217,.998983119560359,1.0241908800770656]},{t:1.838861098534871,v:[0,-.00406003797139351],ease:[.16778668894268609,.5982980173372091,.2604597520439014,.8844972998628613]},{t:1.8667112801287638,v:[4251034064187152e-20,.07903432452816228],ease:[.4685028760838894,-.42953625372100485,.9202731953835559,.8525061773543536]},{t:1.9472873681398353,v:[0,-.006228275916527491],ease:[.0027852407545025976,1.5,.48865476645304945,.9551260679225434]}]}},{name:`Done_B`,duration:1.8,body:`sphere`,squashAnchor:-1,workArea:null,inspect:{bias:-1,follow:!1},tracks:{expression:[{t:.1,v:`happy`,ease:[.4,.22,.28,1.34]}],squash:[{t:0,v:[1,1],ease:[.42,0,.58,1]},{t:.24,v:[1.12,.88],ease:[.42,0,.58,1]},{t:.46,v:[.93,1.09],ease:[.42,0,.58,1]},{t:.68,v:[1.04,.97],ease:[.42,0,.58,1]},{t:.92,v:[1,1],ease:[.42,0,.58,1]}]}},{name:`Done_C`,duration:2,body:`sphere`,squashAnchor:-1,workArea:null,inspect:{bias:-1,follow:!0},tracks:{expression:[{t:0,v:`happy`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:1.1902334624750293,v:`neutral`,ease:[.8458217358299596,.40487753378378377,.13769926619433198,.9154349662162162]}],position:[{t:0,v:[0,0],ease:[.42,0,.4073342890672376,1.018190339792799]},{t:.3798103165938864,v:[-.1054748164006256,.1247799599228919],ease:[.6446428602987402,.013555142906648983,.26273657853993304,1.0464437149441994]},{t:.9426716022659842,v:[.10617803719053583,.1550632852223643],ease:[.8992655949641883,.06226468791954258,.6897429932929974,1.0606800225733635]},{t:1.3822867688368345,v:[.011140244111415301,-.17250079856992764],ease:[.5369766709678977,.09639530999237222,.4242841447981972,.8655803895199093]},{t:1.5768176200981194,v:[.009657934584899294,.02418870866616249],ease:[.10285717371228631,.44298137016142797,.58,1]},{t:1.7545755610844578,v:[.005569779366063913,-.08650009457623184],ease:[.11393164333435832,.20842906107559217,.58,1]},{t:1.9557554786340765,v:[0,0],ease:[.42,0,.58,1]}],rotation:[{t:0,v:[0,0,0],ease:[.7521899922111783,0,.29680419697434735,1.2284132127170915]},{t:.3798103165938864,v:[-31.25365067481446,-5.533499139447874,13.746823539571478],ease:[.6650959278914218,.08187947429053509,.027403916739799694,1.175374728587553]},{t:.9426716022659842,v:[-30.6162399609899,14.144576441037861,-12.73974221895198],ease:[.8992655949641883,.06226468791954258,.6897429932929974,1.0606800225733635]},{t:1.3972576410224693,v:[19.356472882732792,.12303000388944017,-1.6697872707546177],ease:[.5369766709678977,.09639530999237222,.4242841447981972,.8655803895199093]},{t:1.5873362914457065,v:[-4.965245810760847,-1.410803032494741,-.08557034006007683],ease:[.10285717371228631,.44298137016142797,.58,1]},{t:1.7574889536920633,v:[12.945220298267941,-.9549298574076148,-1.3541756721371099],ease:[.11393164333435832,.20842906107559217,.58,1]},{t:1.9557554786340765,v:[0,0,0],ease:[.7521899922111783,0,.29680419697434735,1.2284132127170915]}]}},{name:`Idle_A`,duration:6,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:.4874467656537753,v:[0,0],ease:[.39919726822734797,-.1380913825536936,.15951040179591214,1]},{t:1.3832000000000173,v:[-.14647919001828796,.027266090496135924],ease:[.5825263567433967,.31017058172003364,.04617913732408452,1.3610608114532912]},{t:1.77965296961326,v:[-.14647919001828796,.027266090496135924],ease:[.22005965712189499,.31017058172003364,.04617913732408452,.9652306378531971]},{t:2.75,v:[-.0745899946905787,-.16596550351011732],ease:[.7924378812353865,.08203268815009183,.20257664629337524,.5708768022766131]},{t:2.9261481353591154,v:[-.0745899946905787,-.16596550351011732],ease:[.9024115240536277,.09528443113772456,.31187154968454267,.9286115269461079]},{t:4.0795674814720835,v:[0,0],ease:[.8772841365461845,.09396460316883949,0,.9378491736838274]},{t:5.754212106241882,v:[0,0],ease:[.42,0,.58,1]}],rotation:[{t:.4874467656537753,v:[0,0,0],ease:[.39919726822734797,-.1380913825536936,.15951040179591214,1]},{t:1.3832000000000173,v:[-16.083597442672094,-32.69316873461356,-11.038560548848148],ease:[.5825263567433967,.31017058172003364,.04617913732408452,1.3610608114532912]},{t:1.77965296961326,v:[-13.471262391203387,-31.664036845872012,-11.622988481798327],ease:[.22005965712189499,.31017058172003364,.04617913732408452,.9652306378531971]},{t:2.75,v:[10.37381753258554,13.583422586232203,10.666197221172675],ease:[.7924378812353865,.08203268815009183,.20257664629337524,.5708768022766131]},{t:2.9261481353591154,v:[22.819835891847944,5.292311893891789,5.163005094237094],ease:[1,-.5,.4051656151419559,.8872272583365959]},{t:4.0795674814720835,v:[-24.875244874578584,31.812786832669843,15.07444269105954],ease:[.8772841365461845,.09396460316883949,0,.9378491736838274]},{t:5.754212106241882,v:[0,360,0],ease:[.9122920380277829,.038550560528246756,.4251612081579069,.8172019143128422]}],expression:[{t:1.1628970994475138,v:`blink`,ease:[.42,0,.58,1]},{t:4.00439785911593,v:`blink`,ease:[.42,0,.58,1]},{t:5.643314779005485,v:`neutral`,ease:[.42,0,.58,1]}]}},{name:`Idle_B`,duration:4,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:1.6054821209465213,v:[0,0],ease:[.42,0,.58,1]}],rotation:[{t:.9010370289220491,v:[0,0,0],ease:[.42,0,.28927730966925536,.9624241226685105]},{t:1.6163686240140267,v:[.12032076750937498,-8.658512604326788,-2.5426418939710658],ease:[.8747812559101849,-.03625853912624016,.25467036702156304,.8980229024542974]},{t:2.4902049517966525,v:[.9659548057072269,5.658900089349377,1.7129240357574211],ease:[.6027205111294465,-.23084976154500042,.2902495275740431,.9815467952425966]},{t:3.45704978089402,v:[0,0,0],ease:[.42,0,.58,1]}],scale:[{t:0,v:[.6],ease:[.6180446538332104,.0012432525890504465,.1839130507609582,.9358696746423821]},{t:1.6054821209465213,v:[.64],ease:[.8658706538170823,-.07995460153625837,.29979142380351903,1.0195121615474219]},{t:3.841942375109553,v:[.6],ease:[.6180446538332104,.0012432525890504465,.1839130507609582,.9405530305724485]}],expression:[{t:1.4811034202342213,v:`blink`,ease:[.4,.22,.28,1.34]},{t:3.45704978089402,v:`blink`,ease:[.4,.22,.28,1.34]}]}},{name:`Idle_D`,duration:6,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{rotation:[{t:0,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.6511065418455951,0,.3268385117846959,1]},{t:.5867355510752692,v:[-34.32339609164593,16.86196736106905,15.137354734738835],ease:[.5996715199956071,0,.24671113951908907,1]},{t:1.0783308131720428,v:[-34.32339609164593,16.86196736106905,15.137354734738835],ease:[.5996715199956071,0,.10657397408207336,1]},{t:1.962638608870968,v:[-6.1682538522357975,3.098853229789992,14.349419848128031],ease:[.42,0,.58,1]},{t:2.671748991935484,v:[-6.1682538522357975,3.098853229789992,14.349419848128031],ease:[.42,0,.2029056425485961,1]},{t:3.914377520161291,v:[7.572938650100637,40.386943374478015,25.47389006919084],ease:[.42,0,.58,1]},{t:4.785706485215049,v:[7.572938650100637,40.386943374478015,25.47389006919084],ease:[.6315554130669547,0,.21641299946004333,1]},{t:5.632732694892469,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.6511065418455951,0,.3268385117846959,1]}],expression:[{t:.5929099462365591,v:`blink`,ease:[.4,.22,.28,1.34]},{t:2.0691383064517033,v:`blink`,ease:[.4,.22,.28,1.34]},{t:2.3722908266129035,v:`blink`,ease:[.4,.22,.28,1.34]},{t:4.247479838709677,v:`blink`,ease:[.4,.22,.28,1.34]}]}},{name:`Logo_A`,duration:4,body:`sphere`,squashAnchor:0,workArea:{start:0,end:2.0002578769692425},inspect:{bias:-1,follow:!0},tracks:{rotation:[{t:0,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.940308570092613,0,.8322175812019608,.42841310531523513]},{t:.9325431465191484,v:[-15.896271043294888,290.3612956381275,25.38480127460161],ease:[.08370250411471428,.7821860109261747,.1762354651162792,1]},{t:1.9567938859714928,v:[-15.896271043294888,393.29315635042974,25.38480127460161],ease:[.42,0,.58,1]}]}},{name:`Logo_B`,duration:4,body:`sphere`,squashAnchor:0,workArea:{start:0,end:3.1220695798949736},inspect:{bias:-1,follow:!0},tracks:{rotation:[{t:0,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.77323790487339,0,.19818347223390587,.9476806070764106]},{t:.7185100111661579,v:[-11.287778634690255,-33.00231519019303,-21.062449423926747],ease:[.2717748154604947,-.2636988609351958,.6005198984279181,.023491972600300434]},{t:1.141527569392348,v:[-11.399396607755296,-31.39663474186699,-19.937494120163255],ease:[.9137669521901326,.04016940837145343,.8322175812019608,.42841310531523513]},{t:2.074070715911496,v:[-15.896271043294888,290.3612956381275,25.38480127460161],ease:[.08370250411471428,.7821860109261747,.1762354651162792,1]},{t:3.0983214553638407,v:[-15.896271043294888,393.29315635042974,25.38480127460161],ease:[.42,0,.58,1]}]}},{name:`Marketing_A`,duration:4,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:.6167064755838638,v:[0,0],ease:[.5771393784786643,0,.41654104823747684,1]},{t:1.4190773177636233,v:[-.16387514369529332,0],ease:[.42,0,.58,1]},{t:2.2684226822363764,v:[-.16387514369529332,.05904395257747427],ease:[.580719503710575,0,0,1]},{t:3.1610281808035716,v:[0,0],ease:[.5771393784786643,0,.41654104823747684,1]}],rotation:[{t:0,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.42,0,.58,1]},{t:.6167064755838638,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.8625910776088882,-.041613616273912,.25952275632662025,1.049784301761229]},{t:1.4190773177636233,v:[-2.97589945531819,-26.234478989223906,-3.2544499064295738],ease:[.7818125791576046,.15346315752484826,.32687664998404986,1.1173618829561318]},{t:2.2684226822363764,v:[-31.58476211869586,-3.710798107118315,24.071416454447956],ease:[.36229770668640776,-.17418027527991467,.2875659277885649,1.2452842602722636]},{t:2.7962446921443735,v:[-27.874087487241205,.739249290532289,5.007074162025872],ease:[.42,.044881803684311196,.58,1]},{t:3.2725893489030398,v:[-19.255583925594408,-17.414119894980235,-7.023063437300964],ease:[.49415439617951884,-.031041466813226757,.2907565775851124,1]},{t:3.8435756138392856,v:[-19.353875077555468,20.03044512007725,19.013275491556097],ease:[.42,0,.58,1]},{t:3.9805733816964284,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.42,0,.58,1]}],expression:[{t:.05960518973214285,v:`neutral`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:2.2434315286624202,v:`surprised`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}]}},{name:`Marketing_B`,duration:4,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{rotation:[{t:0,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.42,0,.58,1]},{t:.6167064755838638,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.8625910776088882,-.041613616273912,.25952275632662025,1.049784301761229]},{t:1.4190773177636233,v:[-2.97589945531819,-26.234478989223906,-3.2544499064295738],ease:[.7818125791576046,.15346315752484826,.32687664998404986,1.1173618829561318]},{t:2.2684226822363764,v:[20.16565207199379,-20.644446669166673,22.47273384376682],ease:[.36229770668640776,-.17418027527991467,.2875659277885649,1.2452842602722636]},{t:3.2725893489030398,v:[-20.98869306129836,-21.248460672675545,-6.20573622722674],ease:[.49415439617951884,-.031041466813226757,.2907565775851124,1]},{t:4,v:[-23.757982259034762,24.83627384870201,18.82083960330674],ease:[.42,0,.58,1]}],expression:[{t:0,v:`neutral`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:1.4471868365180467,v:`calm`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}]}},{name:`Marketing_C`,duration:4,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{rotation:[{t:0,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.42,0,.58,1]},{t:.6167064755838638,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.8625910776088882,-.041613616273912,.25952275632662025,1.049784301761229]},{t:1.4190773177636233,v:[-2.97589945531819,-26.234478989223906,-3.2544499064295738],ease:[.7818125791576046,.15346315752484826,.32687664998404986,1.1173618829561318]},{t:2.2684226822363764,v:[20.16565207199379,-20.644446669166673,22.47273384376682],ease:[.36229770668640776,-.17418027527991467,.2875659277885649,1.2452842602722636]},{t:3.2725893489030398,v:[-20.98869306129836,-21.248460672675545,-6.20573622722674],ease:[.49415439617951884,-.031041466813226757,.2907565775851124,1]},{t:4,v:[-23.757982259034762,24.83627384870201,18.82083960330674],ease:[.42,0,.58,1]}],expression:[{t:0,v:`neutral`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:1.4471868365180467,v:`calm`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}]}},{name:`Marketing_D`,duration:4,body:`sphere`,squashAnchor:-1,workArea:null,inspect:{bias:-1,follow:!0},tracks:{expression:[{t:.05498053786270347,v:`neutral`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:.7522248761500355,v:`happy`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:3.188380537862626,v:`neutral`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}],squash:[{t:.6800000000000002,v:[1,1],ease:[.42,0,.58,1]},{t:.9199999999999999,v:[1.12,.88],ease:[.42,0,.58,1]},{t:1.1400000000000001,v:[.93,1.09],ease:[.42,0,.58,1]},{t:1.3600000000000003,v:[1.04,.97],ease:[.42,0,.58,1]},{t:1.6,v:[1,1],ease:[.42,0,.58,1]}],rotation:[{t:0,v:[-6.345525006325851,19.726304895345887,7.225894380877916],ease:[.42,0,.58,1]},{t:.68,v:[-6.345525006325851,19.726304895345887,7.225894380877916],ease:[.6287715517241379,0,.1652870297805643,1]},{t:1.80886178343963,v:[7.946317173704124,-27.372379409841862,-13.611633161590936],ease:[.5888217507250163,0,0,1]},{t:3.406449044585987,v:[0,0,0],ease:[.42,0,.58,1]},{t:3.887429228591649,v:[-6.345525006325851,19.726304895345887,7.225894380877916],ease:[.42,0,.58,1]}]}},{name:`Rotation_A`,duration:6,body:`cloud`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{rotation:[{t:0,v:[2.3120950657104795,-34.698071961330996,6.287220573778937],ease:[.001,.001,.999,.999]},{t:3.0420576880625374,v:[-15.896271043294888,393.29315635042974,25.38480127460161],ease:[.001,.001,.999,.999]},{t:5.685518927730484,v:[-26.2,719.4,25.38480127460161],ease:[.42,0,.58,1]}]}},{name:`Rotation_B`,duration:10,body:`cloud`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{rotation:[{t:0,v:[-5.86170199829258,-66.48579621643268,11.013855401509232],ease:[.001,.001,.999,.999]},{t:10,v:[-5.86170199829258,293.5142037835673,11.013855401509232],ease:[.42,0,.58,1]}]}},{name:`Rotation_C`,duration:4,body:`cloud`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:0,v:[0,0],ease:[.42,0,.58,1]}],rotation:[{t:0,v:[-35,-28.5,8.9],ease:[.001,.001,.999,.999]},{t:3.954889112903226,v:[30.3,-25.03032384031022,25.838583124958074],ease:[.42,0,.58,1]}],expression:[{t:2.02137936827957,v:`blink`,ease:[.4,.22,.28,1.34]}]}},{name:`Streaming_A`,duration:2.6,body:`sphere`,squashAnchor:0,workArea:{start:0,end:2.593141413751879},inspect:{bias:-1,follow:!0},tracks:{rotation:[{t:0,v:[-17.330877831673277,2.263279637703984,15.443629275983977],ease:[.7300325174456456,-.12405425024558042,.40585908939755444,1.0050376870076922]},{t:.3458182816671912,v:[9.638628832336948,2.025895269795649,-1.2527648183630171],ease:[.4224707625763918,.0022972310598335997,.58,.9927354054381194]},{t:.5813687143348092,v:[-15.366003917619995,-2.619836674995623,-2.16549892253304],ease:[.7322498965237162,-.011667049678267111,0,.9141484219009502]},{t:.8343818658890081,v:[4.338039365692767,.49348825557993187,-3.7087410402723067],ease:[.1580317356155577,-.07611268668891613,.32045494511798944,1.0963542960860653]},{t:1.2183655201918815,v:[-.2793440526930908,0,0],ease:[.7202644919359068,0,.414580660247694,.9498001208025284]},{t:1.6185917357603328,v:[-5.399115822872089,14.530502605079048,3.1285787766973128],ease:[.603730806420981,-.0304892240026259,.2700959962528573,.9305186654092706]},{t:2.0602042690217752,v:[-2.088336039091766,-10.814208972017363,-20.009405175503947],ease:[.48373539910046165,-.09542268080702558,.26548699703136136,1]},{t:2.593141413751879,v:[-17.330877831673277,2.263279637703984,15.443629275983977],ease:[.7300325174456456,-.12405425024558042,.40585908939755444,1.0050376870076922]}],position:[{t:.008051106963364502,v:[0,0],ease:[.42,0,.58,1]},{t:.34800758255567965,v:[0,-.09893530004977505],ease:[.42,0,.58,1]},{t:.5873549334090005,v:[0,.04654750224419043],ease:[.42,0,.58,1]},{t:.8343818658890081,v:[0,.004683687521738383],ease:[.42,0,.58,1]},{t:1.2183655201918815,v:[0,0],ease:[.42,0,.27743996350027533,.9367983894536062]},{t:1.6185917357603328,v:[.12655004394233813,0],ease:[.603730806420981,-.0304892240026259,.2700959962528573,.9282552090918559]},{t:2.0602042690217752,v:[-.1362091399555723,0],ease:[.48373539910046165,-.09542268080702558,.26548699703136136,1]},{t:2.593141413751879,v:[0,0],ease:[.42,0,.58,1]}]}},{name:`Streaming_B`,duration:2.6,body:`sphere`,squashAnchor:0,workArea:{start:0,end:2.593141413751879},inspect:{bias:-1,follow:!0},tracks:{expression:[{t:.8343818658890081,v:`surprised`,ease:[.8458217358299596,.40487753378378377,.13769926619433198,.9154349662162162],cut:!0},{t:2.1679160926807017,v:`neutral`,ease:[.8458217358299596,.40487753378378377,.13769926619433198,.9154349662162162],cut:!0}],rotation:[{t:0,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.7300325174456456,-.12405425024558042,.40585908939755444,1.0050376870076922]},{t:.3458182816671912,v:[9.638628832336948,2.025895269795649,-1.2527648183630171],ease:[.4224707625763918,.0022972310598335997,.58,.9927354054381194]},{t:.8343818658890081,v:[-13.158704916519811,-16.90797681471658,-2.914418472822627],ease:[.1580317356155577,-.07611268668891613,.32045494511798944,1.0963542960860653]},{t:1.2183655201918815,v:[3.3337098816649693,21.543227556484112,4.461698658684633],ease:[.7202644919359068,0,.414580660247694,.9498001208025284]},{t:1.6185917357603328,v:[-5.399115822872089,14.530502605079048,3.1285787766973128],ease:[.603730806420981,-.0304892240026259,.2700959962528573,.9305186654092706]},{t:2.0602042690217752,v:[-2.088336039091766,-10.814208972017363,-20.009405175503947],ease:[.48373539910046165,-.09542268080702558,.26548699703136136,1]},{t:2.593141413751879,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.7300325174456456,-.12405425024558042,.40585908939755444,1.0050376870076922]}],position:[{t:.008051106963364502,v:[0,0],ease:[.42,0,.58,1]},{t:.34800758255567965,v:[0,-.09893530004977505],ease:[.42,0,.58,1]},{t:.8343818658890081,v:[0,.004683687521738383],ease:[.42,0,.58,1]},{t:1.36568364300849,v:[.12655004394233813,0],ease:[.603730806420981,-.0304892240026259,.2700959962528573,.9282552090918559]},{t:2.0602042690217752,v:[-.1362091399555723,0],ease:[.48373539910046165,-.09542268080702558,.26548699703136136,1]},{t:2.593141413751879,v:[0,0],ease:[.42,0,.58,1]}]}},{name:`Streaming_C`,duration:2.4,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{expression:[{t:.0930430477108114,v:`squinted`,ease:[.9601942054655871,-.052470439189189255,.20804339574898786,.9135346283783784]}],rotation:[{t:.007536501544973762,v:[-30.114678799869385,-.3481515921755908,10.657733527966457],ease:[.8069695446331039,.06068366162676136,.22176992691461772,1.0529567094556063]},{t:.6967011702649526,v:[-25.983934007381276,7.767555485689494,-17.97884031792412],ease:[.6337438554404256,.03915919163464518,.24060607252134747,.9552013782917067]},{t:1.3,v:[-27.316297934452344,-1.3907007432867593,11.301625700367927],ease:[.8069695446331039,.06068366162676136,.05967881944444445,.9976179673321233]},{t:2.3830582002457,v:[-30.114678799869385,359.6518484078244,10.657733527966457],ease:[.545887017284529,-.16488185903681707,.58,1]}],position:[{t:.007536501544973762,v:[0,0],ease:[.8069695446331039,.06068366162676136,.22176992691461772,1.0529567094556063]},{t:.6967011702649526,v:[.16304040871678732,.1060830475460072],ease:[.6337438554404256,.03915919163464518,.24060607252134747,.9552013782917067]},{t:1.3,v:[-.16109273893088566,.1112767252235085],ease:[.8069695446331039,.06068366162676136,.05967881944444445,.9976179673321233]},{t:2.3830582002457,v:[0,0],ease:[.7622975213794354,-.39274360300976613,.22176992691461772,1.0529567094556063]}]}},{name:`Working_A`,duration:8,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:.4874467656537753,v:[0,0],ease:[.39919726822734797,-.1380913825536936,.15951040179591214,1]},{t:1.3832000000000173,v:[-.14647919001828796,.027266090496135924],ease:[.5825263567433967,.31017058172003364,.04617913732408452,1.3610608114532912]},{t:1.77965296961326,v:[-.14647919001828796,.027266090496135924],ease:[.22005965712189499,.31017058172003364,.04617913732408452,.9652306378531971]},{t:2.5961328343722427,v:[.06209379465135341,.0363636826260471],ease:[.6823010997778416,.03975119923438924,.58,.7462988396745895]},{t:3.066377943544433,v:[-.016487420591570615,.0804209848791122],ease:[.8034080182827295,-.08276325518488785,.6510110561346553,.8128258749805829]},{t:3.426085780646072,v:[-.008916270094194876,-.2135819760518346],ease:[.1744021985074266,-.5,.8865519014643501,-.2214168917492133]},{t:4.00439785911593,v:[-.0052248049102180776,-.12515593913381462],ease:[.023812816055625345,.31341394515796384,.0448947139696587,1.0658309377957906]},{t:5.005029942257856,v:[0,0],ease:[.42,0,.58,1]},{t:6.298778790534628,v:[.03813914798218992,-.019258402700427682],ease:[.576933472628317,.007827540903749368,.12610215878412523,.9598864308897559]},{t:6.952426906222622,v:[-.25,-.004137934943726919],ease:[.8326089284460128,-.06392110845094923,.3654460022570882,1.0352901568389925]},{t:7.900964066608238,v:[0,0],ease:[.39919726822734797,-.1380913825536936,.15951040179591214,1]}],rotation:[{t:.4874467656537753,v:[0,0,0],ease:[.39919726822734797,-.1380913825536936,.15951040179591214,1]},{t:1.3832000000000173,v:[-11.013174031248813,-20.059833580125414,-12.896783267756348],ease:[.5825263567433967,.31017058172003364,.04617913732408452,1.3610608114532912]},{t:1.77965296961326,v:[-17.48975478197329,-18.703976724880516,-12.678205332257816],ease:[.22005965712189499,.31017058172003364,.04617913732408452,.9652306378531971]},{t:2.5961328343722427,v:[-14.554913391638532,17.164836260093473,9.376528927180779],ease:[.6823010997778416,.03975119923438924,.58,.9240336563778733]},{t:3.1796016343940767,v:[-24.586251970533304,.14133926125606477,-.7477216271856462],ease:[.8034080182827295,-.08276325518488785,.9143306014396848,.4851034680582119]},{t:3.4679142027965795,v:[-1.0943281912285556,-1.1346215368163393,-.7116952620126241],ease:[.12040927423864656,-.18872517040581954,.9481776569383256,-.20917925086224787]},{t:4.001861402631413,v:[-147.11069531984157,-.6757806869448113,-.4238857605398247],ease:[.03131913716814155,.8644907690193963,.0448947139696587,1.0658309377957906]},{t:5.005029942257856,v:[-360,0,0],ease:[.7970933306500759,-.5,.24118105710043447,.7361553789450831]},{t:6.298778790534628,v:[-364.89323527138873,18.626179650675688,-.2598233988596897],ease:[.576933472628317,.007827540903749368,.12610215878412523,.9742744867440337]},{t:6.952426906222622,v:[-366.80423922162356,-23.365336474310464,-3.339162411443921],ease:[.8326089284460128,-.06392110845094923,.3654460022570882,1.0352901568389925]},{t:7.900964066608238,v:[-360,0,0],ease:[.42,0,.58,1]}],expression:[{t:1.1672000000000002,v:`blink`,ease:[.42,0,.58,1]},{t:1.77965296961326,v:`surprised`,ease:[.7394673582995951,.10409628378378377,.6676682692307693,1.5]},{t:5.643314779005485,v:`neutral`,ease:[.42,0,.58,1]},{t:6.298778790534628,v:`strange`,ease:[.9601942054655871,-.052470439189189255,.20804339574898786,.9135346283783784]},{t:7.3115338882283,v:`neutral`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}]}},{name:`Working_B`,duration:4.8,body:`sphere`,squashAnchor:0,workArea:{start:0,end:4.8},inspect:{bias:-1,follow:!0},tracks:{position:[{t:.17746730083234244,v:[0,0],ease:[.807066718478605,.026672824415491948,.05397305674842967,1.0519668384455731]},{t:1.4141067024830507,v:[-.1,-14911040730998862e-21],ease:[.7054694160272805,.15290809768637542,0,.9011176996605331]},{t:2.75,v:[.1,-.0019533463357608513],ease:[.8240202817829232,-.24792725943516045,.2993925437700369,1]},{t:4.7824019024970275,v:[0,0],ease:[.42,0,.07071724310528026,1.3032158407916754]}],rotation:[{t:.17746730083234244,v:[0,0,0],ease:[.807066718478605,.026672824415491948,.05397305674842967,1.0519668384455731]},{t:1.4141067024830507,v:[1.431495026310406,-16.140319998213133,-36.05175434586088],ease:[.7054694160272805,.15290809768637542,0,.9507801322055007]},{t:2.75,v:[-3.793664340840882,16.145026960161896,23.111555762366347],ease:[.8145184258410576,.05868417745499387,.7187386211123404,.8220737938312388]},{t:3.300369915174868,v:[-.658471135071176,32.094524718170625,23.00284198348812],ease:[.9529378729987852,-.03412152368009878,.7143170242443122,.5254015949332431]},{t:3.896330300821882,v:[-.03018222484427137,-273.02901001946327,5.757592653481982],ease:[.11270319506726437,.6690303636987784,.23166630377840014,.9738369897382892]},{t:4.7824019024970275,v:[-.02727988727869867,-360,0],ease:[.42,0,.58,1]}],scale:[{t:.17779177760649373,v:[.6],ease:[.807066718478605,.026672824415491948,.05397305674842967,.9010023979880923]},{t:1.4141067024830507,v:[.4215844279727266],ease:[.758517646256336,-.08984960385218788,.3074500979615823,.9070651813931356]},{t:2.25,v:[.5281520264776418],ease:[1,.12529134929810246,.3851632150743237,.8426351606267645]},{t:2.9883359098579825,v:[.6153393854797824],ease:[.6185932743021068,-.26875053521000764,.341686978852472,1]},{t:4.608223713420763,v:[.6],ease:[.807066718478605,.026672824415491948,.05397305674842967,1.0519668384455731]}],expression:[{t:.7466486120839366,v:`inspect`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:2.556108799048751,v:`surprised`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:3.7592152199762188,v:`neutral`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}]}},{name:`Working_C`,duration:5,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:.17491812227074233,v:[-.06835221071089878,-14911040730998862e-21],ease:[.48050979200063776,.06136202638923106,.999,1.5]},{t:1.5108114197876916,v:[.032133292775302545,-.0019533463357608513],ease:[.001,.24090214653366723,.58,1]},{t:1.7971520856616507,v:[-.06835221071089878,-14911040730998862e-21],ease:[.48050979200063776,.06136202638923106,.999,1.5]},{t:3.1330453831785996,v:[.032133292775302545,-.0019533463357608513],ease:[.001,.24090214653366723,.58,1]},{t:3.4083292556973226,v:[-.06835221071089878,-14911040730998862e-21],ease:[.48050979200063776,.06136202638923106,.999,1.5]},{t:4.777367618612606,v:[.032133292775302545,-.0019533463357608513],ease:[.001,.24090214653366723,.58,1]},{t:5,v:[-.06835221071089878,-14911040730998862e-21],ease:[.48050979200063776,.06136202638923106,.999,1.5]}],rotation:[{t:.17491812227074233,v:[22.808320996747383,-5.474402376762305,-34.85465299871112],ease:[.48050979200063776,.06136202638923106,.9994333239875214,1.5]},{t:1.5108114197876916,v:[25.82236401380847,8.163455755358939,36.34926880424543],ease:[0,.24090214653366723,.58,1]},{t:1.7971520856616507,v:[22.808320996747383,-5.474402376762305,-34.85465299871112],ease:[.48050979200063776,.06136202638923106,.9994333239875214,1.5]},{t:3.1330453831785996,v:[25.82236401380847,8.163455755358939,36.34926880424543],ease:[0,.24090214653366723,.58,1]},{t:3.4083292556973226,v:[22.808320996747383,-5.474402376762305,-34.85465299871112],ease:[.48050979200063776,.06136202638923106,.9994333239875214,1.5]},{t:4.777367618612606,v:[25.82236401380847,8.163455755358939,36.34926880424543],ease:[0,.24090214653366723,.58,1]},{t:5,v:[22.808320996747383,-5.474402376762305,-34.85465299871112],ease:[.48050979200063776,.06136202638923106,.9994333239875214,1.5]}],expression:[{t:0,v:`surprised`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}]}},{name:`Working_D`,duration:5,body:`sphere`,squashAnchor:0,workArea:{start:0,end:5},inspect:{bias:-1,follow:!0},tracks:{position:[{t:1.5264103096017296,v:[0,0],ease:[.8183794558884002,0,.42063048773799955,.8916191063669083]},{t:2.2538209606986896,v:[.13302558581350077,.08599672420051416],ease:[.7164816671975539,-.07059803322016199,.15856161687281733,1]},{t:2.636972068926158,v:[0,0],ease:[.42,0,.58,1]}],rotation:[{t:0,v:[-2.97589945531819,-26.234478989223906,-3.2544499064295738],ease:[.7818125791576046,.15346315752484826,.32687664998404986,1.1173618829561318]},{t:.003820960698689868,v:[2.4615600363954893,-24.921015876700608,2.790543200988768],ease:[.42,0,.58,1]},{t:.5222436429350663,v:[20.16565207199379,-20.644446669166673,22.47273384376682],ease:[.36229770668640776,-.17418027527991467,.2875659277885649,1.2452842602722636]},{t:1.5264103096017296,v:[-20.98869306129836,-21.248460672675545,-6.20573622722674],ease:[.49415439617951884,-.031041466813226757,.2907565775851124,1]},{t:2.2538209606986896,v:[-23.757982259034762,24.83627384870201,18.82083960330674],ease:[.42,0,.58,1]},{t:2.636972068926158,v:[8.316132781421524,-27.390741199393897,-9.531735566337252],ease:[.12247552635300568,-.002557518043474879,.7043012111749869,.5773041000961353]},{t:3.494456667932666,v:[6.3335276735657375,-.1762970079864843,.6565665872756274],ease:[.42,.5038392468370619,.58,1]},{t:4.25382096069869,v:[8.1703683326745,24.729657859977713,10.395084291173474],ease:[.42,0,.58,1]},{t:4.971120960698738,v:[2.4615600363954893,-24.921015876700608,2.790543200988768],ease:[.42,0,.58,1]}],expression:[{t:.003820960698689868,v:`calm`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}]}},{name:`Working_E`,duration:4,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:.6167064755838638,v:[0,0],ease:[.5771393784786643,0,.41654104823747684,1]},{t:1.4190773177636233,v:[-.16387514369529332,0],ease:[.42,0,.58,1]},{t:2.2684226822363764,v:[-.16387514369529332,.05904395257747427],ease:[.580719503710575,0,0,1]},{t:3.1610281808035716,v:[0,0],ease:[.5771393784786643,0,.41654104823747684,1]}],rotation:[{t:0,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.42,0,.58,1]},{t:.6167064755838638,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.8625910776088882,-.041613616273912,.25952275632662025,1.049784301761229]},{t:1.4190773177636233,v:[-2.97589945531819,-26.234478989223906,-3.2544499064295738],ease:[.7818125791576046,.15346315752484826,.32687664998404986,1.1173618829561318]},{t:2.2684226822363764,v:[-31.58476211869586,-3.710798107118315,24.071416454447956],ease:[.36229770668640776,-.17418027527991467,.2875659277885649,1.2452842602722636]},{t:2.7962446921443735,v:[-27.874087487241205,.739249290532289,5.007074162025872],ease:[.42,.044881803684311196,.58,1]},{t:3.2725893489030398,v:[-19.255583925594408,-17.414119894980235,-7.023063437300964],ease:[.49415439617951884,-.031041466813226757,.2907565775851124,1]},{t:3.8435756138392856,v:[-10.064416055441825,12.982763466855692,19.192265328801522],ease:[.42,0,.58,1]},{t:3.9805733816964284,v:[-15.896271043294888,33.29315635042974,25.38480127460161],ease:[.42,0,.58,1]}],expression:[{t:.05960518973214285,v:`neutral`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]},{t:2.2434315286624202,v:`surprised`,ease:[.7416814271255061,.03220016891891886,.26459703947368424,1.0216427364864864]}]}},{name:`Working_F`,duration:5,body:`sphere`,squashAnchor:0,workArea:null,inspect:{bias:-1,follow:!0},tracks:{position:[{t:.4874467656537753,v:[0,0],ease:[.6778358120868745,-.22439715100065685,.15951040179591214,1]},{t:1.3832000000000173,v:[-.14647919001828796,.027266090496135924],ease:[.5825263567433967,.31017058172003364,.04617913732408452,1.3610608114532912]},{t:1.77965296961326,v:[-.14647919001828796,.027266090496135924],ease:[.22005965712189499,.31017058172003364,.04617913732408452,.9652306378531971]},{t:2.5961328343722427,v:[.06209379465135341,.0363636826260471],ease:[.6823010997778416,.03975119923438924,.58,.7462988396745895]},{t:3.066377943544433,v:[-.016487420591570615,.0804209848791122],ease:[.8034080182827295,-.08276325518488785,.6510110561346553,.8128258749805829]},{t:3.426085780646072,v:[-.008916270094194876,-.2135819760518346],ease:[.1744021985074266,-.5,.8865519014643501,-.2214168917492133]},{t:4.00439785911593,v:[-.0052248049102180776,-.12515593913381462],ease:[.023812816055625345,.31341394515796384,.0448947139696587,1.0658309377957906]},{t:4.893926749555462,v:[0,0],ease:[.42,0,.58,1]}],rotation:[{t:.4874467656537753,v:[0,0,0],ease:[.6778358120868745,-.22439715100065685,.15951040179591214,1]},{t:1.3832000000000173,v:[-11.013174031248813,-20.059833580125414,-12.896783267756348],ease:[.5825263567433967,.31017058172003364,.04617913732408452,1.3610608114532912]},{t:1.77965296961326,v:[-17.48975478197329,-18.703976724880516,-12.678205332257816],ease:[.22005965712189499,.31017058172003364,.04617913732408452,.9652306378531971]},{t:2.5961328343722427,v:[-14.554913391638532,17.164836260093473,9.376528927180779],ease:[.6823010997778416,.03975119923438924,.58,.9240336563778733]},{t:3.1796016343940767,v:[-24.586251970533304,.14133926125606477,-.7477216271856462],ease:[.8034080182827295,-.08276325518488785,.9143306014396848,.4851034680582119]},{t:3.4679142027965795,v:[-1.0943281912285556,-1.1346215368163393,-.7116952620126241],ease:[.12040927423864656,-.18872517040581954,.9481776569383256,-.20917925086224787]},{t:4.001861402631413,v:[-147.11069531984157,-.6757806869448113,-.4238857605398247],ease:[.03131913716814155,.8644907690193963,.0448947139696587,1.0658309377957906]},{t:4.893926749555462,v:[-360,0,0],ease:[.7970933306500759,-.5,.24118105710043447,.7361553789450831]}],expression:[{t:1.8508295659644571,v:`surprised`,ease:[.7394673582995951,.10409628378378377,.6676682692307693,1.5]},{t:4.893926749555462,v:`neutral`,ease:[.8458217358299596,.40487753378378377,.13769926619433198,.9154349662162162],cut:!0}],lids:[{t:1.1672000000000002,v:[0],ease:[.42,0,.58,1]},{t:1.2797000000000003,v:[1],ease:[.42,0,.58,1]},{t:1.4172000000000002,v:[0],ease:[.42,0,.58,1]}]}}];

// Original UTF-16 range 214999:215005
var ja=120;

// Original UTF-16 range 215006:215090
var Ma={clips:[`Working_A`,`Working_B`,`Working_C`,`Working_D`,`Working_E`,`Working_F`]};

// Original UTF-16 range 215091:217234
var Na={idle:{clips:[`Idle_B`,`Idle_B`,`Idle_D`,`Idle_B`,`Idle_A`],compactClips:[`Idle_B`]},listening:{clips:[`Idle_D`],face:`calm`},thinking:{clips:[`Idle_B`],morph:`thinking`},streaming:{clips:[`Streaming_A`,`Streaming_B`,`Streaming_C`]},searching:{clips:[`Idle_B`],morph:`radar`},reading:Ma,working:Ma,coding:Ma,running:Ma,computing:Ma,controlling:Ma,waiting:{clips:[`Idle_B`],morph:`orbit`},blocked:{clips:[`Blocked_A`],next:`drowsy`,holdSeconds:ja},finished:{clips:[`Done_B`,`Done_A`],face:`happy`,next:`idle`},failed:{clips:[`Blocked_B`],next:`idle`},sleeping:{clips:[`Idle_B`],face:`sleepy`},waking:{clips:[`Idle_B`],face:`surprised`,next:`idle`,holdSeconds:1.6},happy:{clips:[`Done_A`]},excited:{clips:[`Done_C`]},laughing:{clips:[`Done_B`]},proud:{clips:[`Marketing_B`]},curious:{clips:[`Working_B`],face:`inspecting`},playful:{clips:[`Bodymoves_A`]},shy:{clips:[`Idle_D`],face:`calm`},surprised:{clips:[`Idle_B`],face:`surprised`},suspicious:{clips:[`Idle_D`],face:`squinted`},angry:{clips:[`Blocked_A`],face:`squinted`},confused:{clips:[`Blocked_A`]},sad:{clips:[`Blocked_B`]},drowsy:{clips:[`Blocked_C`]},bored:{clips:[`Idle_B`],face:`sleepy`},scared:{clips:[`Idle_D`],face:`surprised`},celebrate:{clips:[`Rotation_A`],face:`happy`},approving:{clips:[`Rotation_C`],next:`idle`},orbit:{clips:[`Idle_B`],morph:`orbit`},radar:{clips:[`Idle_B`],morph:`radar`},progress:{clips:[`Idle_B`],morph:`progress`},spawning:{clips:[`Idle_B`],morph:`spawning`},loading:{clips:[`Idle_B`],morph:`progress`},dictating:{clips:[`Idle_B`],morph:`dictating`},sending:{clips:[`Idle_B`],morph:`sending`},receiving:{clips:[`Idle_B`],morph:`receiving`},uploading:{clips:[`Idle_B`],morph:`uploading`},writing:{clips:[`Idle_B`],morph:`writing`},alerting:{clips:[`Idle_B`],morph:`alerting`},bouncing:{clips:[`Idle_B`],morph:`bouncing`},"powering-down":{clips:[`Idle_B`],morph:`powering-down`},humming:{clips:[`Idle_B`],face:`calm`},notifying:{clips:[`Done_B`],face:`surprised`},dragging:{clips:[`Idle_B`],face:`surprised`},logo:{clips:[`Logo_A`,`Logo_B`]},showcase:{clips:[`Marketing_A`,`Marketing_B`,`Marketing_C`,`Marketing_D`]},turntable:{clips:[`Rotation_B`]}};

// Original UTF-16 range 217235:217268
var Pa=new Map(Aa.map(e=>[e.name,e]));

// Original UTF-16 range 217269:217363
function Fa(e){let t=Pa.get(e);if(t==null)throw Error(`No motion recipe named ${e}`);return t}

// Original UTF-16 range 217367:217381
var Ia=`surprised`;

// Original UTF-16 range 217382:217525
function La(e,t,n){let r=[...e];for(let e=r.length-1;e>0;--e)Ra(r,e,Math.floor(t()*(e+1)));let i=r.findIndex(e=>e!==n);return i>0&&Ra(r,0,i),r}

// Original UTF-16 range 217525:217602
function Ra(e,t,n){let r=e[t],i=e[n];r!==void 0&&i!==void 0&&(e[t]=i,e[n]=r)}

// Original UTF-16 range 217602:218591
function za(e,t,n={}){let r=Wi(n.seed??1),i=new Map,a=n.isCompact??!1,o=n.isResting??!1,s=!1,c=o,l=t,u=Na[t],d=0,f=0,p=e.loopCount,m=null,h=()=>a&&u.compactClips!=null?u.compactClips:u.clips,g=()=>u.next!=null&&u.holdSeconds==null,_=()=>{let e=h(),t=i.get(e)??[];return t.length===0&&t.push(...La(e,r,m)),i.set(e,t),t.shift()},v=()=>{let t=g()?h()[f]:_();if(p=e.loopCount,t===void 0||t===m)return;let i=c||g();e.load(Fa(t),{phase:i?0:n.firstPhase??r()}),c=!0,m=t,p=e.loopCount},y=()=>{e.holdFace(u.face??(s?Ia:null))},b=t=>{l=t,u=Na[t],d=0,f=0,e.setMorph(u.morph??null),y(),o||v()};return o&&e.rest(),b(t),{get state(){return l},get clip(){return m},setState(e){e!==l&&b(e)},setCompact(e){a=e},setEmphasis(e){e!==s&&(s=e,y())},setResting(t){if(t!==o){if(o=t,!o){v();return}e.rest(),m=null}},advance(t){if(o)return;d+=t;let n=u.next;if(n!=null&&u.holdSeconds!=null&&d>=u.holdSeconds){b(n);return}if(e.loopCount!==p){if(n!=null&&u.holdSeconds==null&&(f+=1,f>=h().length)){b(n);return}v()}}}}

// Original UTF-16 range 218595:218601
var Ba=.26;

// Original UTF-16 range 218602:218608
var Va=.57;

// Original UTF-16 range 218609:218615
var Ha=.64;

// Original UTF-16 range 218616:218622
var Ua=.04;

// Original UTF-16 range 218623:218629
var Wa=.12;

// Original UTF-16 range 218630:218635
var Ga=11;

// Original UTF-16 range 218636:218641
var Ka=18;

// Original UTF-16 range 218642:218647
var qa=48;

// Original UTF-16 range 218648:218653
var Ja=10;

// Original UTF-16 range 218654:218659
var Ya=64;

// Original UTF-16 range 218660:218712
var Xa={on:!1,oval:!1,width:0,height:0,tilt:0,cx:0,cy:0};

// Original UTF-16 range 218713:220634
var Za={cloud:{width:.21294,height:.4668299999999999,gap:.47001600000000004,shiftY:.06999999999999999},square:{width:.2553258426966292,height:.559752808988764,gap:.529408,shiftY:.12},sparkle:{width:.18381999999999998,height:.40298999999999996,gap:.41215999999999997,shiftY:0},clover:{width:.23296,height:.51072,gap:.559104,shiftY:-.020000000000000018},heartChubby:{width:.18657600000000002,height:.409032,gap:.44620799999999994,shiftY:.051999999999999935},starFlower:{width:.19292,height:.42294,gap:.38297600000000004,shiftY:.12},teardrop:{width:.20779200000000003,height:.455544,gap:.45260800000000007,shiftY:.18},tablet:{width:.2132,height:.4673999999999999,gap:.587776,shiftY:.01999999999999999},wedge:{width:.2132,height:.4673999999999999,gap:.46771199999999996,shiftY:.18},house:{width:.2295124,height:.5031617999999999,gap:.5125120000000001,shiftY:.18499534000463813},star6:{width:.184782,height:.44965988999999995,gap:.41913343999999997,shiftY:.12},pebble:{width:.23920000000000002,height:.5244,gap:.546304,shiftY:.12},bean:{width:.2028,height:.4446,gap:.4608,shiftY:.12},egg:{width:.23920000000000002,height:.5244,gap:.433664,shiftY:.11299906800092761},squircle:{width:.23920000000000002,height:.5244,gap:.5632,shiftY:.12},capsule:{width:.2106,height:.4617,gap:.36044800000000005,shiftY:.12},cylinder:{width:.23920000000000002,height:.5244,gap:.47872000000000003,shiftY:.12},hex:{width:.26,height:.57,gap:.64,shiftY:.12},gem:{width:.23920000000000002,height:.5244,gap:.501248,shiftY:.12},crystal:{width:.1612,height:.3534,gap:.3712,shiftY:.12},shield:{width:.26790400000000003,height:.5873280000000001,gap:.44492800000000005,shiftY:.12},dome:{width:.2132,height:.4673999999999999,gap:.47872000000000003,shiftY:.10599813600185524},arch:{width:.19240000000000002,height:.42179999999999995,gap:.44799999999999995,shiftY:.16},leaf:{width:.1872,height:.41039999999999993,gap:.44799999999999995,shiftY:.039999999999999994}};

// Original UTF-16 range 220635:220839
function Qa(e,t){let n=Za[e],r=n.width/Ba,i=n.height/Va,a=n.gap/Ha;return t.every(e=>ho(e)&&!(e.fillRing!=null&&e.fillRing.length>0))?eo(no(t[0]),no(t[1]),n,r,i,a):{loops:ro(t,r,a,i,0,n.shiftY),shiftY:0}}

// Original UTF-16 range 220839:220879
function $a(e){return ro(e,1,1,1,Ua,Wa)}

// Original UTF-16 range 220879:221331
function eo(e,t,n,r,i,a){let o=z(e.width*r),s=z(e.height*r),c=z(t.width*r),l=z(t.height*r),u=Math.max(0,z(Math.min(o,s))),d=Math.max(0,z(Math.max(o,s))),f=Math.max(0,z(Math.min(c,l))),p=Math.max(0,z(Math.max(c,l))),m=Math.max(0,z((Ha+(e.on?z(e.cx):0)+(t.on?z(t.cx):0))*a,Ha*a)),h=Math.max(.05,Math.min(1.8,m));return{loops:[to(-1,u,d,-z(z(e.tilt)+(o>=s?0:90)),h),to(1,f,p,z(z(t.tilt)+(c>=l?0:90)),h)],shiftY:z(n.shiftY+(z(e.cy)+z(t.cy))/2*i,n.shiftY)}}

// Original UTF-16 range 221331:221610
function to(e,t,n,r,i){let a=Math.max(.01,Math.min(1,t))/2,o=Math.max(.02,Math.min(1.8,Math.max(n,t)))/2,s=-r*Math.PI/180,c=Math.cos(s),l=Math.sin(s);return Array.from({length:Ya},(t,n)=>{let r=2*Math.PI*n/Ya,s=e*o*Math.cos(r),u=a*Math.sin(r);return{x:s*c-u*l+e*i/2,y:s*l+u*c}})}

// Original UTF-16 range 221610:222083
function no(e){let t=ho(e);if(!(e.wid>0)&&!t)return Xa;let n=e.lidY||1,r=(e.tilt||0)*(180/Math.PI);if(t)return{on:!0,oval:!0,width:2*e.oval[0],height:2*e.oval[1]*n,tilt:r,cx:e.off[0],cy:e.off[1]};let i=e.pts;if(i.length<2)return{...Xa,cx:e.off[0],cy:e.off[1]};let a=i[0],o=i[i.length-1],s=o[0]-a[0],c=o[1]-a[1],l=Math.hypot(s,c),u=2*e.wid;return{on:!0,oval:!1,width:u,height:(l+u)*n,tilt:180/Math.PI*Math.atan2(s,c)+r,cx:e.off[0]+(a[0]+o[0])/2,cy:e.off[1]+(a[1]+o[1])/2*n}}

// Original UTF-16 range 222083:222796
function ro(e,t,n,r,i,a){let o=[],s=Math.sin(i),c=-Math.sin(a);return e.forEach((e,i)=>{let a=ho(e);if(!(e.wid>0)&&!a||!a&&e.pts.length<2)return;let l=i===0?-1:1,u=e.lidY||1,d=Math.cos(e.tilt||0),f=Math.sin(e.tilt||0),p=l*((Ha/2+z(e.off[0]))*n)+s,m=c+z(e.off[1])*r,h=(e,n)=>{let r=e*d-n*f,i=e*f+n*d;return{x:p+l*r*t,y:m+i*t*u}};if(e.fillRing!=null&&e.fillRing.length>=3){let t=z(e.off[0]),n=z(e.off[1]);o.push(e.fillRing.map(([e,r])=>h(e-t,(r-n)*u)));return}if(a){let t=[];for(let n=0;n<qa;n++){let r=2*Math.PI*n/qa;t.push(h(e.oval[0]*Math.cos(r),e.oval[1]*u*Math.sin(r)))}o.push(t);return}let g=e.wid*t,_=e.path!=null&&e.path.length===Ka?ao(e.path,h,g):io(e.pts.map(e=>h(e[0],e[1])),g);_.length>0&&o.push(_)}),o}

// Original UTF-16 range 222796:223298
function io(e,t){let n=[];for(let t of e){let e=n.at(-1);(e==null||Math.hypot(t.x-e.x,t.y-e.y)>1e-6)&&n.push(t)}if(n.length===0||t<=0)return[];let r=co(n,t);if(r!=null)return r;let i=n.length;if(i<2)return[];let a=[],o=[];for(let e=0;e<i;e++){let t=n[Math.max(0,e-1)],r=n[Math.min(i-1,e+1)],s=Math.hypot(r.x-t.x,r.y-t.y)||1,c=-(r.y-t.y)/s,l=(r.x-t.x)/s;e>0&&c*a[e-1]+l*o[e-1]<0&&(c=-c,l=-l),a.push(c),o.push(l)}return oo(n,a,o,t,mo(n[1].x-n[0].x,n[1].y-n[0].y),mo(n[i-1].x-n[i-2].x,n[i-1].y-n[i-2].y))}

// Original UTF-16 range 223298:223907
function ao(e,t,n){if(n<=0)return[];let r=[];for(let n=0;n<2;n++){let i=lo(e,n),a=uo(e,n,4),o=uo(e,n+1,2),s=lo(e,n+1);for(let e=n===0?0:1;e<Ga;e++){let n=e/10,c=fo(i,a,o,s,n),l=po(i,a,o,s,n),u=t(c[0],c[1]),d=t(c[0]+l[0],c[1]+l[1]);r.push({x:u.x,y:u.y,tx:d.x-u.x,ty:d.y-u.y})}}let i=co(r,n);if(i!=null)return i;let a=r.length,o=[],s=[];for(let e=0;e<a;e++){let t=Math.hypot(r[e].tx,r[e].ty)||1,n=-r[e].ty/t,i=r[e].tx/t;e>0&&n*o[e-1]+i*s[e-1]<0&&(n=-n,i=-i),o.push(n),s.push(i)}let c=r[0],l=r[a-1],u=Math.hypot(c.tx,c.ty)||1,d=Math.hypot(l.tx,l.ty)||1;return oo(r,o,s,n,{x:c.tx/u,y:c.ty/u},{x:l.tx/d,y:l.ty/d})}

// Original UTF-16 range 223907:224190
function oo(e,t,n,r,i,a){let o=e.length,s=e.map((e,i)=>({x:e.x+t[i]*r,y:e.y+n[i]*r})),c=e.map((e,i)=>({x:e.x-t[i]*r,y:e.y-n[i]*r})),l={x:e[0].x-i.x*r,y:e[0].y-i.y*r},u={x:e[o-1].x+a.x*r,y:e[o-1].y+a.y*r};return[...s,...so(e[o-1],s[o-1],u,r),...[...c].reverse(),...so(e[0],c[0],l,r)]}

// Original UTF-16 range 224190:224461
function so(e,t,n,r){let i=[],a=Math.atan2(t.y-e.y,t.x-e.x),o=Math.atan2(n.y-e.y,n.x-e.x)-a;for(;o>Math.PI;)o-=2*Math.PI;for(;o<-Math.PI;)o+=2*Math.PI;let s=o>=0?1:-1;for(let t=1;t<Ja;t++){let n=a+t/Ja*s*Math.PI;i.push({x:e.x+r*Math.cos(n),y:e.y+r*Math.sin(n)})}return i}

// Original UTF-16 range 224461:224816
function co(e,t){let n=0,r=0;for(let t of e)n+=t.x,r+=t.y;n/=e.length,r/=e.length;let i=0;for(let t of e)i=Math.max(i,Math.hypot(t.x-n,t.y-r));if(t<=i*1.05)return null;let a=[];for(let n=0;n<qa;n++){let r=2*Math.PI*n/qa,i=Math.cos(r),o=Math.sin(r),s=-1/0,c=0,l=0;for(let t of e){let e=t.x*i+t.y*o;e>s&&(s=e,c=t.x,l=t.y)}a.push({x:c+i*t,y:l+o*t})}return a}

// Original UTF-16 range 224816:224857
function lo(e,t){return[e[t*6],e[t*6+1]]}

// Original UTF-16 range 224857:224920
function uo(e,t,n){return[e[t*6]+e[t*6+n],e[t*6+1]+e[t*6+n+1]]}

// Original UTF-16 range 224920:225057
function fo(e,t,n,r,i){let a=1-i;return[a*a*a*e[0]+3*a*a*i*t[0]+3*a*i*i*n[0]+i*i*i*r[0],a*a*a*e[1]+3*a*a*i*t[1]+3*a*i*i*n[1]+i*i*i*r[1]]}

// Original UTF-16 range 225057:225206
function po(e,t,n,r,i){let a=1-i;return[3*a*a*(t[0]-e[0])+6*a*i*(n[0]-t[0])+3*i*i*(r[0]-n[0]),3*a*a*(t[1]-e[1])+6*a*i*(n[1]-t[1])+3*i*i*(r[1]-n[1])]}

// Original UTF-16 range 225206:225268
function mo(e,t){let n=Math.hypot(e,t)||1;return{x:e/n,y:t/n}}

// Original UTF-16 range 225268:225321
function ho(e){return e.oval[0]>1e-4&&e.oval[1]>1e-4}

// Original UTF-16 range 225321:225369
function z(e,t=0){return Number.isFinite(e)?e:t}

// Original UTF-16 range 225373:225383
var B=114.2705;

// Original UTF-16 range 225569:225632
var go=(e,t,n)=>e.map(([e,r],i)=>[e+(t[i][0]-e)*n,r+(t[i][1]-r)*n]);

// Original UTF-16 range 225633:225641
var _o=1e-10;

// Original UTF-16 range 225642:225650
var vo=2**26;

// Original UTF-16 range 225651:226232
function yo(e){let t=bo(e);if(t==null)return[];let n=To(t.map(t=>e[t])),[r,i,a,o]=t,s=[[r,i,a],[r,i,o],[r,a,o],[i,a,o]].map(([t,r,i])=>{let a=xo(e,[t,r,i]);return So(a,n)>0?xo(e,[t,i,r]):a});return e.forEach((n,r)=>{if(t.includes(r))return;let i=s.map(e=>So(e,n)>_o);if(!i.includes(!0))return;let a=new Set;s.forEach((e,t)=>{if(!i[t])for(let t=0;t<3;t++)a.add(Co(e.corners[t],e.corners[(t+1)%3]))});let o=[];s.forEach((t,n)=>{if(!i[n]){o.push(t);return}for(let n=0;n<3;n++){let i=t.corners[n],s=t.corners[(n+1)%3];a.has(Co(s,i))&&o.push(xo(e,[i,s,r]))}}),s=o}),s.map(e=>e.corners)}

// Original UTF-16 range 226232:226522
function bo(e){if(e.length<4)return null;let t=0;e.forEach((n,r)=>{n[0]<e[t][0]&&(t=r)});let n=wo(e,n=>ko(Eo(n,e[t]))),r=wo(e,r=>ko(Do(Eo(e[n],e[t]),Eo(r,e[t])))),i=Do(Eo(e[n],e[t]),Eo(e[r],e[t])),a=wo(e,n=>Math.abs(Oo(i,Eo(n,e[t]))));return Math.abs(Oo(i,Eo(e[a],e[t])))<_o?null:[t,n,r,a]}

// Original UTF-16 range 226522:226665
function xo(e,t){let n=e[t[0]],r=Do(Eo(e[t[1]],n),Eo(e[t[2]],n)),i=ko(r)||1,a=[r[0]/i,r[1]/i,r[2]/i];return{corners:t,normal:a,offset:Oo(a,n)}}

// Original UTF-16 range 226665:226713
function So(e,t){return Oo(e.normal,t)-e.offset}

// Original UTF-16 range 226713:226744
function Co(e,t){return e*vo+t}

// Original UTF-16 range 226744:226831
function wo(e,t){let n=0,r=-1/0;return e.forEach((e,i)=>{let a=t(e);a>r&&(r=a,n=i)}),n}

// Original UTF-16 range 226831:226953
function To(e){let t=e.length;return[e.reduce((e,t)=>e+t[0],0)/t,e.reduce((e,t)=>e+t[1],0)/t,e.reduce((e,t)=>e+t[2],0)/t]}

// Original UTF-16 range 226953:227008
function Eo(e,t){return[e[0]-t[0],e[1]-t[1],e[2]-t[2]]}

// Original UTF-16 range 227008:227093
function Do(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]}

// Original UTF-16 range 227093:227147
function Oo(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}

// Original UTF-16 range 227147:227196
function ko(e){return Math.hypot(e[0],e[1],e[2])}

// Original UTF-16 range 227200:234154
var Ao=[{x:.934475052698969,y:.004363180216799212},{x:.948891570423846,y:.039714756021395174},{x:.9608728659762679,y:.07607039935952659},{x:.9703302557200477,y:.11326502451357987},{x:.977189539605176,y:.15112675873557632},{x:.9813908922405818,y:.18947802927479046},{x:.9828887074578869,y:.2281365499571005},{x:.9816519990958227,y:.2669163757988432},{x:.9776625497902636,y:.30562830330137525},{x:.9709166586711733,y:.3440810419322467},{x:.9614266573440594,y:.3820827122339433},{x:.949221424670692,y:.41944230284893746},{x:.9343467338379507,y:.45597122804302315},{x:.9168643128164508,y:.49148439126889626},{x:.8968538338085426,y:.5258027955519334},{x:.8744135590875667,y:.5587560766363049},{x:.8496605481016927,y:.5901852347689388},{x:.8227287687893752,y:.6199442885313702},{x:.7937617531488526,y:.6478973166280976},{x:.762905919754175,y:.6739136951531549},{x:.7303134746505421,y:.6978700569784003},{x:.6961411032024281,y:.7196491755310737},{x:.6605596057818293,y:.7391502303914683},{x:.6237513457393834,y:.7562897143525837},{x:.5859073404691287,y:.7710015652906158},{x:.5472248974285161,y:.7832374824769789},{x:.507904865265839,y:.7929662862613107},{x:.4681494646643414,y:.8001734773422571},{x:.4281602030115182,y:.8048604074486263},{x:.38813613170852307,y:.8070434681543606},{x:.34827256966973696,y:.8067537475134688},{x:.3087597745583025,y:.8040363403785654},{x:.26978201344672026,y:.7989504065912386},{x:.23151662960878241,y:.7915694823366872},{x:.19413194481287305,y:.7819778247879767},{x:.1577852845947917,y:.7702630818507747},{x:.12262733079593371,y:.7565354795442158},{x:.08880015313138229,y:.7409422361214794},{x:.05642586889159421,y:.7236017950683938},{x:.02561647598492663,y:.704659966051552},{x:-.0036037810305528913,y:.6895105233164277},{x:-.03317542334906984,y:.7095400285365243},{x:-.06438496917371282,y:.7280864309789705},{x:-.0971349646590295,y:.7450166000084965},{x:-.13130575647382275,y:.7601465770772312},{x:-.16677330012669841,y:.7733777436363767},{x:-.20339569964825052,y:.7845796245158417},{x:-.24101725346433553,y:.7936313321637897},{x:-.27947704857143557,y:.8004456020397803},{x:-.3186049196302664,y:.8049436403918587},{x:-.35822225014656567,y:.8070572252942809},{x:-.398143514039767,y:.8067313311007664},{x:-.438177182680152,y:.8039242993502419},{x:-.478126841210925,y:.7986084072202804},{x:-.5177925726656645,y:.7907706714017452},{x:-.5569723963185897,y:.7804134068929688},{x:-.5954640748960385,y:.7675550146764192},{x:-.6330671972405764,y:.7522306880298593},{x:-.6695855487964426,y:.734492987733704},{x:-.7048299443180804,y:.714412410733904},{x:-.7386209319309059,y:.6920772477931056},{x:-.7707921245520308,y:.6675935661866239},{x:-.8011924150225685,y:.641083697347949},{x:-.8296683466506882,y:.612669941116809},{x:-.8560711521836232,y:.5824818706921402},{x:-.8802586099360401,y:.550657644865542},{x:-.9021016261853626,y:.5173474030319016},{x:-.921488351217944,y:.48271361643050537},{x:-.9383250626073236,y:.44692900756649523},{x:-.9525363976829352,y:.4101742582574272},{x:-.9640652637601566,y:.37263580242597466},{x:-.9728702117174652,y:.3345029815392968},{x:-.9789264673905609,y:.2959671170672982},{x:-.9822255348467005,y:.25722000690078245},{x:-.982774894246464,y:.21845258628445002},{x:-.9805967489497907,y:.17985349925722946},{x:-.9757258679433654,y:.1416078138454962},{x:-.9682107746348935,y:.1038965717106635},{x:-.9581143826889033,y:.06689596974801386},{x:-.9455146116784895,y:.03077634172969411},{x:-.9305051553319804,y:-.004299067407576291},{x:-.9131952327192244,y:-.038175545674491246},{x:-.8937019647378253,y:-.07070785611844921},{x:-.8721591451869681,y:-.10176130887451734},{x:-.8487362913086253,y:-.1312168064224554},{x:-.8236207468105732,y:-.15897343836917888},{x:-.7970979502287641,y:-.18497038865757742},{x:-.7710541733734617,y:-.2096139557882936},{x:-.7461193861529073,y:-.23320814197562353},{x:-.7221519248227056,y:-.2558870618710858},{x:-.6990265515010246,y:-.27776911859221876},{x:-.6766318459161248,y:-.29895980890191903},{x:-.6548676461286994,y:-.31955389248594185},{x:-.6336431338424889,y:-.3396372581810514},{x:-.6128753135059731,y:-.359288557412959},{x:-.5924873537443393,y:-.3785803988633805},{x:-.5724075923763201,y:-.3975806113171165},{x:-.5525683653066091,y:-.4163531831687479},{x:-.5329051623123328,y:-.43495923867716463},{x:-.5133556323648999,y:-.45345775659418885},{x:-.49385881021048816,y:-.47190633957419137},{x:-.4743544952965227,y:-.4903620705111528},{x:-.4547822689301765,y:-.5088820023697915},{x:-.43508096787875605,y:-.5275240823754965},{x:-.41518776564532156,y:-.5463477370262614},{x:-.39503744073179237,y:-.565414738403984},{x:-.37456138068841166,y:-.584789881188713},{x:-.3536868090571391,y:-.6045421927475639},{x:-.33233545822868515,y:-.6247456276706727},{x:-.31042247776931897,y:-.6454805113116225},{x:-.28785488995869934,y:-.6668347728530055},{x:-.26452992996104363,y:-.6889057008744045},{x:-.24032737271767535,y:-.7117848186103969},{x:-.21465925160321186,y:-.7340046463187382},{x:-.18703495679704094,y:-.7534714425430167},{x:-.15772553428835867,y:-.7700652053068575},{x:-.1270070450444056,y:-.7836711911119708},{x:-.0951684130469074,y:-.7942311382405959},{x:-.062495032850901626,y:-.8016579582061256},{x:-.02928242470209217,y:-.8059763869703366},{x:.00418250025635626,y:-.8071603933705995},{x:.03761179305139532,y:-.8051997052887491},{x:.07071763099568142,y:-.8001090083866196},{x:.10320959245128111,y:-.7918885098432591},{x:.134798677354145,y:-.7805799374564395},{x:.16519657722647352,y:-.7662371932046725},{x:.1941137081486192,y:-.748919054724023},{x:.22126182274327255,y:-.7287044591356419},{x:.24646172395988103,y:-.705992917688509},{x:.27042811605651085,y:-.6833113574191189},{x:.2935522498121435,y:-.6614269249128338},{x:.31594558408750634,y:-.6402340573221494},{x:.33770831010282365,y:-.6196380408622824},{x:.3589311734375708,y:-.5995528607013482},{x:.3796973337781967,y:-.579900027393222},{x:.40008347985475634,y:-.5606067493570983},{x:.4201613352275292,y:-.5416052696177914},{x:.4399985323371352,y:-.5228315569692281},{x:.4596595725296922,y:-.504224454308306},{x:.47920690986264164,y:-.4857251046289992},{x:.4987013585100146,y:-.46727574968264535},{x:.5182031792984406,y:-.44881937116377135},{x:.5377727619439542,y:-.4302988919363394},{x:.5574712942997964,y:-.41165639717445024},{x:.5773615598171413,y:-.39283243400856016},{x:.5975088031531646,y:-.3737652763272414},{x:.6179815681468954,y:-.3543900575947271},{x:.6388526754619042,y:-.3346378544777047},{x:.6602003073706015,y:-.3144346462096216},{x:.6821093031111911,y:-.2937001458611249},{x:.7046726622334125,y:-.2723464324690267},{x:.7279930725720649,y:-.25027624068777876},{x:.752199978996238,y:-.22738555814564856},{x:.7774207173704459,y:-.20355017023582161},{x:.8037647094696927,y:-.17862206250636986},{x:.8300422031017065,y:-.15219910918500412},{x:.8547554784773178,y:-.1240094996536292},{x:.8777124848745345,y:-.09414272665900433},{x:.8987592287763329,y:-.06270816362882596},{x:.9177264967761565,y:-.029827205842901418}];

// Original UTF-16 range 234155:234166
var V=Math.PI*2;

// Original UTF-16 range 234167:234193
var H=e=>Math.round(e*100)/100;

// Original UTF-16 range 234194:234219
var jo=(e,t,n)=>e<t?t:e>n?n:e;

// Original UTF-16 range 234220:235066
var Mo=class{d=``;move(e,t){return this.d+=`M${H(e)} ${H(t)}`,this}line(e,t){return this.d+=`L${H(e)} ${H(t)}`,this}curve(e,t,n,r,i,a){return this.d+=`C${H(e)} ${H(t)} ${H(n)} ${H(r)} ${H(i)} ${H(a)}`,this}corner(e,t,n,r){let i=(e,t)=>{let n=e[0]-t[0],r=e[1]-t[1],i=Math.hypot(n,r)||1;return[n/i,r/i]},a=i(e,t),o=i(n,t),s=[t[0]+a[0]*r,t[1]+a[1]*r],c=[t[0]+o[0]*r,t[1]+o[1]*r];return this.d?this.line(s[0],s[1]):this.move(s[0],s[1]),this.d+=`Q${H(t[0])} ${H(t[1])} ${H(c[0])} ${H(c[1])}`,this}arc(e,t,n,r,i,a){let o=Math.max(1,Math.ceil(Math.abs(a-i)/(Math.PI/2))),s=(a-i)/o,c=4/3*Math.tan(s/4),l=i;for(let i=0;i<o;i++){let i=l+s,a=[e+n*Math.cos(l),t+r*Math.sin(l)],o=[e+n*Math.cos(i),t+r*Math.sin(i)];this.curve(a[0]-c*n*Math.sin(l),a[1]+c*r*Math.cos(l),o[0]+c*n*Math.sin(i),o[1]-c*r*Math.cos(i),o[0],o[1]),l=i}return this}close(){return this.d+`Z`}};

// Original UTF-16 range 235067:235336
var No=e=>{let t=e.length,n=`M${H(e[0][0])} ${H(e[0][1])}`;for(let r=0;r<t;r++){let i=e[(r-1+t)%t],a=e[r],o=e[(r+1)%t],s=e[(r+2)%t];n+=`C${H(a[0]+(o[0]-i[0])/6)} ${H(a[1]+(o[1]-i[1])/6)} ${H(o[0]-(s[0]-a[0])/6)} ${H(o[1]-(s[1]-a[1])/6)} ${H(o[0])} ${H(o[1])}`}return n+`Z`};

// Original UTF-16 range 235337:235411
var Po=(e,t=128)=>{let n=[];for(let r=0;r<t;r++)n.push(e(r/t*V));return No(n)};

// Original UTF-16 range 235412:235567
var Fo=(e,t)=>{let n=new Mo,r=e.length;for(let i=0;i<r;i++){let a=typeof t==`number`?t:t[i%t.length];n.corner(e[(i-1+r)%r],e[i],e[(i+1)%r],a)}return n.close()};

// Original UTF-16 range 235568:235675
var Io=(e,t,n,r=0)=>Fo(Array.from({length:t},(n,i)=>{let a=r+i/t*V;return[B+Math.cos(a)*e,B+Math.sin(a)*e]}),n);

// Original UTF-16 range 235676:235871
var Lo=(e,t=160)=>Po(t=>{let n=Math.cos(t),r=Math.sin(t),i=0;for(let[t,a,o]of e){let e=t-B,s=a-B,c=n*e+r*s,l=c*c-(e*e+s*s)+o*o;if(l<=0)continue;let u=c+Math.sqrt(l);u>i&&(i=u)}return[B+n*i,B+r*i]},t);

// Original UTF-16 range 235872:236004
var Ro=(e,t,n)=>Po(r=>{let i=Math.cos(r),a=Math.sin(r);return[B+Math.sign(i)*Math.abs(i)**(2/n)*e,B+Math.sign(a)*Math.abs(a)**(2/n)*t]});

// Original UTF-16 range 236005:236156
var zo=(e,t)=>new Mo().move(B-e+t,B-t).line(B+e-t,B-t).arc(B+e-t,B,t,t,-Math.PI/2,Math.PI/2).line(B-e+t,B+t).arc(B-e+t,B,t,t,Math.PI/2,Math.PI*3/2).close();

// Original UTF-16 range 236157:236285
var Bo=(e,t)=>new Mo().move(B-e,B+t-e).line(B-e,B-t+e).arc(B,B-t+e,e,e,Math.PI,V).line(B+e,B+t-e).arc(B,B+t-e,e,e,0,Math.PI).close();

// Original UTF-16 range 236286:236400
var Vo=(e,t,n)=>new Mo().move(B-e,B-t+n).arc(B,B-t+n,e,n,Math.PI,V).line(B+e,B+t-n).arc(B,B+t-n,e,n,0,Math.PI).close();

// Original UTF-16 range 236401:236573
var Ho=(e,t,n)=>{let r=B+t;return new Mo().move(B-e,r-n).arc(B,r-n,e,2*t-n,Math.PI,V).line(B+e,r-n).curve(B+e,r,B+e,r,B+e-n,r).line(B-e+n,r).curve(B-e,r,B-e,r,B-e,r-n).close()};

// Original UTF-16 range 236574:236746
var Uo=(e,t,n)=>{let r=B+t,i=B-t+e;return new Mo().move(B-e,i).arc(B,i,e,e,Math.PI,V).line(B+e,r-n).curve(B+e,r,B+e,r,B+e-n,r).line(B-e+n,r).curve(B-e,r,B-e,r,B-e,r-n).close()};

// Original UTF-16 range 236747:236953
var Wo=(e,t,n)=>{let r=B-t,i=B+t;return new Mo().move(B-e,r+n).curve(B-e,r-2,B-e*.5,r-10,B,r-10).curve(B+e*.5,r-10,B+e,r-2,B+e,r+n).curve(B+e,B+t*.42,B+e*.62,i,B,i).curve(B-e*.62,i,B-e,B+t*.42,B-e,r+n).close()};

// Original UTF-16 range 236954:237046
var Go=(e,t,n)=>Po(r=>{let i=Math.cos(r),a=Math.sin(r),o=(1-a)/2;return[B+i*e*(1-n*o*o),B+a*t]});

// Original UTF-16 range 237047:237249
var Ko=(e,t,n,r)=>{let i=jo(e/(n-t),-1,1),a=Math.sqrt(1-i*i),o=[B+e*a,n-e*i],s=[B-e*a,n-e*i],c=Math.atan2(o[1]-n,o[0]-B);return new Mo().corner(o,[B,t],s,r).line(s[0],s[1]).arc(B,n,e,e,Math.PI-c,c).close()};

// Original UTF-16 range 237250:237307
var qo=(e,t)=>Fo([[B-e,B-e],[B+e,B-e],[B+e,B+e],[B-e,B+e]],t);

// Original UTF-16 range 237308:237381
var Jo=(e,t,n,r)=>Fo([[B-e,B+t],[B+e,B+t],[B+e,B-t+n],[B,B-t],[B-e,B-t+n]],r);

// Original UTF-16 range 237382:238118
var Yo=`M79.4511 11.5693C94.8767 -3.85636 119.887 -3.85622 135.312 11.5693C150.738 26.995 150.738 52.0049 135.312 67.4306L129.302 73.4404L129.303 73.4414L83.7724 118.972C81.8111 120.933 79.4309 122.22 76.9199 122.833C76.463 122.944 76.0018 123.034 75.538 123.101C74.1477 123.301 72.734 123.301 71.3437 123.101C70.8802 123.034 70.4194 122.944 69.9628 122.833C69.8486 122.805 69.7347 122.776 69.621 122.745C69.3938 122.684 69.1679 122.616 68.9433 122.544C67.4837 122.073 66.0831 121.367 64.8017 120.426C64.6047 120.281 64.4108 120.13 64.2197 119.975C63.837 119.662 63.466 119.328 63.1093 118.972L11.5693 67.4306C-3.85643 52.0049 -3.85642 26.995 11.5693 11.5693C26.995 -3.85643 52.0049 -3.85643 67.4306 11.5693L73.4404 17.579L79.4511 11.5693Z`;

// Original UTF-16 range 238119:238896
var Xo=`M58.9438 9.25323C63.2492 -3.08441 80.6974 -3.08441 85.0027 9.25322L91.7612 28.6207C94.0136 35.0751 100.652 38.9078 107.368 37.6311L127.52 33.8004C140.357 31.3602 149.081 46.4708 140.549 56.3681L127.156 71.9049C122.692 77.0827 122.692 84.748 127.156 89.9258L140.549 105.463C149.081 115.36 140.357 130.471 127.52 128.03L107.368 124.2C100.652 122.923 94.0136 126.756 91.7612 133.21L85.0027 152.577C80.6974 164.915 63.2492 164.915 58.9438 152.577L52.1853 133.21C49.933 126.756 43.2946 122.923 36.5788 124.2L16.4268 128.03C3.58942 130.471 -5.1347 115.36 3.39733 105.463L16.7908 89.9258C21.2543 84.748 21.2543 77.0827 16.7908 71.9049L3.39734 56.3681C-5.13469 46.4708 3.58941 31.3602 16.4268 33.8004L36.5787 37.6311C43.2946 38.9078 49.933 35.0751 52.1853 28.6207L58.9438 9.25323Z`;

// Original UTF-16 range 238897:245081
var Zo=`M93.9365 0.100586C98.4439 -0.387322 102.691 0.897134 106.341 4.03418C111.502 8.47087 114.842 16.0545 116.636 25.2725C118.36 34.1341 118.716 44.8177 117.701 56.4346L117.707 56.4375L117.706 56.4443C122.25 58.5638 126.519 60.8171 130.449 63.168C130.485 63.1891 130.52 63.2103 130.556 63.2314C131.25 63.6478 131.934 64.067 132.607 64.4893C132.68 64.5349 132.753 64.5813 132.825 64.627C133.074 64.7838 133.322 64.941 133.567 65.0986C133.692 65.1787 133.816 65.2596 133.94 65.3398C134.138 65.4676 134.335 65.5954 134.53 65.7236C134.653 65.8039 134.775 65.8844 134.896 65.9648C135.112 66.1073 135.325 66.2506 135.538 66.3936C135.625 66.4522 135.713 66.5106 135.8 66.5693C138.866 68.645 141.667 70.7792 144.163 72.9502C149.754 77.8126 153.981 83.0002 156.136 88.2578C156.159 88.3133 156.181 88.3693 156.203 88.4248C156.268 88.5868 156.332 88.749 156.393 88.9111C156.435 89.0226 156.475 89.1346 156.516 89.2461C156.541 89.3175 156.566 89.3895 156.591 89.4609C157.443 91.8917 157.839 94.3199 157.696 96.7109C157.522 99.7997 156.469 102.655 154.613 105.192C154.236 105.709 153.826 106.208 153.388 106.692C153.365 106.717 153.343 106.742 153.32 106.767C153.171 106.93 153.019 107.091 152.863 107.25C152.844 107.27 152.824 107.29 152.804 107.311C152.3 107.822 151.762 108.316 151.191 108.79C151.168 108.81 151.144 108.83 151.12 108.85C150.952 108.988 150.781 109.125 150.607 109.261C150.558 109.299 150.509 109.337 150.46 109.375C150.282 109.512 150.101 109.648 149.917 109.781C149.903 109.792 149.888 109.801 149.874 109.812C149.255 110.26 148.605 110.689 147.926 111.1C147.795 111.179 147.662 111.256 147.528 111.334C147.41 111.403 147.292 111.473 147.173 111.541C146.915 111.687 146.653 111.832 146.388 111.974C146.316 112.012 146.243 112.047 146.171 112.085C145.978 112.186 145.783 112.287 145.586 112.386C145.459 112.449 145.331 112.511 145.203 112.573C145.048 112.649 144.891 112.723 144.733 112.797C144.614 112.853 144.494 112.909 144.373 112.964C144.198 113.044 144.021 113.122 143.843 113.2C143.722 113.253 143.6 113.306 143.478 113.358C143.288 113.439 143.096 113.519 142.903 113.598C142.836 113.625 142.769 113.655 142.701 113.683C142.662 113.698 142.622 113.712 142.583 113.728C142.371 113.812 142.156 113.895 141.94 113.978C141.847 114.013 141.753 114.051 141.658 114.086C140.71 114.441 139.731 114.771 138.725 115.078C138.613 115.112 138.502 115.145 138.39 115.179C138.257 115.218 138.123 115.26 137.989 115.299C137.911 115.322 137.831 115.343 137.752 115.365C137.61 115.406 137.467 115.446 137.324 115.485C137.095 115.549 136.863 115.611 136.63 115.672C136.52 115.701 136.41 115.73 136.3 115.759C136.064 115.819 135.827 115.879 135.588 115.938C135.451 115.971 135.314 116.004 135.177 116.037C134.975 116.085 134.772 116.131 134.568 116.178C134.312 116.236 134.054 116.294 133.795 116.35C133.535 116.406 133.274 116.461 133.011 116.515C132.85 116.547 132.688 116.578 132.525 116.61C132.333 116.648 132.14 116.686 131.946 116.723C131.689 116.771 131.43 116.818 131.17 116.864C131.075 116.881 130.979 116.898 130.884 116.914C130.595 116.964 130.304 117.012 130.012 117.06C129.932 117.073 129.851 117.085 129.771 117.098C129.484 117.143 129.196 117.188 128.906 117.23C128.818 117.243 128.729 117.256 128.641 117.269C127.33 117.457 125.983 117.62 124.601 117.755C124.468 117.768 124.336 117.782 124.203 117.794C123.92 117.82 123.636 117.845 123.351 117.869C123.24 117.878 123.13 117.888 123.02 117.897C122.701 117.923 122.381 117.948 122.059 117.971C121.967 117.977 121.874 117.984 121.782 117.99C121.463 118.012 121.143 118.033 120.82 118.053C120.73 118.058 120.639 118.063 120.549 118.068C119.546 118.126 118.527 118.171 117.492 118.202C117.322 118.207 117.151 118.213 116.979 118.218C116.785 118.223 116.59 118.225 116.395 118.229C116.147 118.235 115.899 118.24 115.65 118.244C115.415 118.248 115.178 118.25 114.94 118.252C114.688 118.254 114.435 118.256 114.181 118.257C114.008 118.257 113.835 118.257 113.662 118.257C113.32 118.256 112.976 118.255 112.631 118.252C112.503 118.251 112.375 118.25 112.247 118.248C111.858 118.243 111.466 118.237 111.073 118.229C110.984 118.227 110.894 118.226 110.804 118.224C107.734 118.154 104.558 117.977 101.289 117.69C96.3593 128.261 90.7082 137.338 84.7832 144.151C78.6204 151.238 71.9357 156.137 65.2471 157.399C60.5179 158.292 56.1975 157.281 52.5381 154.604C48.9431 151.975 46.1246 147.845 44.0479 142.691C40.0321 132.725 38.5457 118.333 40.043 101.281C40.0382 101.279 40.0331 101.277 40.0283 101.274C39.6986 101.121 39.3711 100.965 39.0449 100.811C38.8351 100.711 38.6254 100.612 38.417 100.512C38.0794 100.35 37.7438 100.186 37.4102 100.023C37.2392 99.9399 37.0684 99.8563 36.8984 99.7725C36.5886 99.6196 36.2801 99.4663 35.9736 99.3125C35.7564 99.2034 35.5398 99.0939 35.3242 98.9844C34.9817 98.8104 34.6409 98.636 34.3027 98.4609C34.2424 98.4297 34.1823 98.3975 34.1221 98.3662C19.2858 90.6566 8.70839 81.8767 3.56055 73.3232C3.50461 73.2303 3.44926 73.137 3.39453 73.0439C3.37308 73.0075 3.35134 72.971 3.33008 72.9346C3.19352 72.7003 3.06142 72.4652 2.93262 72.2305C2.19429 70.8865 1.58552 69.5375 1.11816 68.1895C1.10444 68.1499 1.09161 68.1099 1.07813 68.0703C1.04009 67.9586 1.00191 67.847 0.96582 67.7354C0.954674 67.7009 0.943578 67.6663 0.932617 67.6318C0.823298 67.2877 0.723275 66.9435 0.632813 66.5996C-0.103732 63.8123 -0.218301 61.0433 0.402344 58.3643C1.34437 54.2986 3.89972 50.7745 7.875 47.9023C7.90661 47.8794 7.93796 47.8559 7.96973 47.833C8.12646 47.7208 8.2852 47.6092 8.44629 47.499C8.57825 47.4084 8.71216 47.3194 8.84668 47.2305C8.87052 47.2148 8.89404 47.1983 8.91797 47.1826C10.608 46.0723 12.497 45.0908 14.5547 44.2324C14.6355 44.1986 14.7165 44.1643 14.7979 44.1309C14.8508 44.1092 14.9038 44.087 14.957 44.0654L15.25 43.9482C15.3501 43.9084 15.4509 43.8694 15.5518 43.8301C15.6093 43.8078 15.6668 43.7848 15.7246 43.7627C23.7646 40.6682 34.1765 39.3165 45.6846 39.4756C45.8574 39.4779 46.0307 39.4814 46.2041 39.4844C46.4305 39.4884 46.6576 39.4909 46.8848 39.4961C47.3568 39.5065 47.8313 39.5207 48.3076 39.5361C48.4142 39.5397 48.5212 39.5441 48.6279 39.5479C51.1795 39.6366 53.791 39.7967 56.4512 40.0293C63.6811 24.5137 72.1655 12.7934 80.627 6.1709C85.0025 2.74635 89.5085 0.57999 93.9365 0.100586Z`;

// Original UTF-16 range 245082:245145
var Qo=(e,t)=>Lo([[B-e,B-e,t],[B+e,B-e,t],[B+e,B+e,t],[B-e,B+e,t]]);

// Original UTF-16 range 245146:245248
var $o=(e,t,n)=>Po(r=>{let i=Math.cos(r),a=Math.sin(r);return[B+i*e*Math.max(1-a*a,0)**(n/2-.5)*1,B+a*t]});

// Original UTF-16 range 245249:245432
var es=(e,t,n,r)=>Po(i=>{let a=e=>{let t=Math.abs(((i-e+Math.PI)%V+V)%V-Math.PI);return Math.exp(-(t*t)/.4232)},o=1-n*a(r)+n*.34*a(r+Math.PI);return[B+Math.cos(i)*e*o,B+Math.sin(i)*t*o]});

// Original UTF-16 range 245433:245551
var ts=(e,t,n)=>Po(r=>{let i=e*(1+t*(Math.sin(r*2+n)*.6+Math.sin(r*3-n)*.4));return[B+Math.cos(r)*i,B+Math.sin(r)*i*.98]});

// Original UTF-16 range 245552:246484
var ns=(e,t=4)=>{let n=e.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)??[],r=[],i=0,a=``,o=0,s=0,c=0,l=0,u=()=>parseFloat(n[i++]),d=(e,n)=>{let i=Math.max(2,Math.ceil(n/t));for(let t=1;t<=i;t++)r.push(e(t/i))};for(;i<n.length;){if(/[a-z]/i.test(n[i])&&(a=n[i++].toUpperCase()),a===`Z`){Math.hypot(c-o,l-s)>.01&&d(e=>[o+(c-o)*e,s+(l-s)*e],Math.hypot(c-o,l-s)),o=c,s=l;continue}if(i>=n.length)break;if(a===`M`)o=u(),s=u(),c=o,l=s,r.push([o,s]),a=`L`;else if(a===`L`){let e=u(),t=u();d(n=>[o+(e-o)*n,s+(t-s)*n],Math.hypot(e-o,t-s)),o=e,s=t}else if(a===`Q`){let e=u(),t=u(),n=u(),r=u(),i=o,a=s;d(o=>{let s=1-o;return[s*s*i+2*s*o*e+o*o*n,s*s*a+2*s*o*t+o*o*r]},Math.hypot(e-o,t-s)+Math.hypot(n-e,r-t)),o=n,s=r}else{let e=u(),t=u(),n=u(),r=u(),i=u(),a=u(),c=o,l=s;d(o=>{let s=1-o;return[s*s*s*c+3*s*s*o*e+3*s*o*o*n+o*o*o*i,s*s*s*l+3*s*s*o*t+3*s*o*o*r+o*o*o*a]},Math.hypot(e-o,t-s)+Math.hypot(n-e,r-t)+Math.hypot(i-n,a-r)),o=i,s=a}}return r};

// Original UTF-16 range 246485:247227
var rs=(e,t=160)=>{let n=1/0,r=-1/0;for(let t of e)t[1]<n&&(n=t[1]),t[1]>r&&(r=t[1]);let i=r-n,a=e=>n+i*(e+.5)/t,o=new Float64Array(t),s=new Float64Array(t),c=new Float64Array(t),l=new Float64Array(t);for(let n=0;n<t;n++){let t=a(n),r=-1/0,i=1/0,u=1/0,d=-1/0;for(let n=0;n<e.length;n++){let a=e[n],o=e[(n+1)%e.length];if(a[1]<=t==o[1]<=t)continue;let s=a[0]+(o[0]-a[0])*(t-a[1])/(o[1]-a[1]);s<=114.2705?s>r&&(r=s):s<i&&(i=s),s<u&&(u=s),s>d&&(d=s)}o[n]=Number.isFinite(r)?r:B,s[n]=Number.isFinite(i)?i:B,c[n]=Number.isFinite(u)?u:B,l[n]=Number.isFinite(d)?d:B}let u=(e,r)=>a=>{let o=jo((a-n)/i*t-.5,0,t-1),s=Math.floor(o),c=o-s,l=Math.min(s+1,t-1);return[e[s]+(e[l]-e[s])*c,r[s]+(r[l]-r[s])*c]};return{top:n,bottom:r,spanAt:u(o,s),outerAt:u(c,l)}};

// Original UTF-16 range 247228:247233
var is=96;

// Original UTF-16 range 247234:247564
var as=e=>Array.from({length:is},(t,n)=>{let r=n/is*V,i=Math.cos(r),a=Math.sin(r),o=0;for(let t=0;t<e.length;t++){let n=e[t],r=e[(t+1)%e.length],s=n[0]-B,c=n[1]-B,l=r[0]-B,u=r[1]-B,d=(l-s)*a-(u-c)*i;if(Math.abs(d)<1e-9)continue;let f=(s*a-c*i)/-d;if(f<0||f>1)continue;let p=(s+(l-s)*f)*i+(c+(u-c)*f)*a;p>o&&(o=p)}return[B+i*o,B+a*o]});

// Original UTF-16 range 247565:247702
var os=(e,t,n,r)=>{let i=0;return e.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi,e=>{i^=1;let a=parseFloat(e)+(i?n:r);return String(H(B+(a-B)*t))})};

// Original UTF-16 range 247703:247712
var ss=228.44;

// Original UTF-16 range 247713:247914
var cs=e=>{let t=1/0,n=-1/0,r=1/0,i=-1/0;for(let a of e)a[0]<t&&(t=a[0]),a[0]>n&&(n=a[0]),a[1]<r&&(r=a[1]),a[1]>i&&(i=a[1]);let a=B-(t+n)/2,o=B-(r+i)/2;return{k:jo(ss/Math.max(n-t,i-r),.9,1.35),dx:a,dy:o}};

// Original UTF-16 range 247915:248023
var ls=(e,t)=>{let{k:n,dx:r,dy:i}=cs(t);return Math.abs(n-1)<.005&&Math.abs(r)<.5&&Math.abs(i)<.5?e:os(e,n,r,i)};

// Original UTF-16 range 248024:248234
var us=e=>{let t=ls(e,ns(e)),n=ns(t),{top:r,bottom:i,spanAt:a,outerAt:o}=rs(n),s=0;for(let e=r;e<=i;e+=2){let[t,n]=o(e);s=Math.max(s,(n-t)/2)}return{path:t,ring:as(n),top:H(r),bottom:H(i),spanAt:a,beltRadius:H(s)}};

// Original UTF-16 range 248235:248773
var ds={pebble:()=>ts(108,.075,1.1),bean:()=>es(94,112,.34,Math.PI),egg:()=>Go(98,113,.22),squircle:()=>Ro(107,107,3.2),square:()=>qo(107,28),tablet:()=>zo(114,74),capsule:()=>Bo(72,113),cylinder:()=>Vo(94,110,48),hex:()=>Io(114,6,20,Math.PI/6),gem:()=>Ro(112,113,1.5),shield:()=>Wo(98,108,30),dome:()=>Ho(114,82,26),arch:()=>Uo(76,113,42),cloud:()=>Lo([[B-62,B+26,56],[B+62,B+26,54],[B,B+34,62],[B-24,B-30,62],[B+38,B-26,54]]),leaf:()=>$o(88,113,1.5),clover:()=>Qo(38,58),house:()=>Jo(100,110,78,29),heart:()=>Yo,sparkle:()=>Zo,star6:()=>Xo};

// Original UTF-16 range 248774:248784
var fs=new Map;

// Original UTF-16 range 248785:248875
function ps(e){let t=fs.get(e);if(t!=null)return t;let n=us(ds[e]());return fs.set(e,n),n}

// Original UTF-16 range 248879:248906
var U=(e,t=4)=>ns(ps(e).path,t);

// Original UTF-16 range 248907:248918
var ms=e=>ns(e);

// Original UTF-16 range 248919:248951
var hs=(e,t)=>us(Ko(e,B-114,B+26,t));

// Original UTF-16 range 248952:248994
var gs=(e,t)=>us(Io(130,3,[t,e,e],-Math.PI/2));

// Original UTF-16 range 248995:249007
var _s=Math.PI*2;

// Original UTF-16 range 249008:249014
var vs=.36;

// Original UTF-16 range 249015:249021
var ys=.22;

// Original UTF-16 range 249022:249026
var bs=4;

// Original UTF-16 range 249027:249035
var xs=1e-12;

// Original UTF-16 range 249036:249041
var Ss=64;

// Original UTF-16 range 249042:249047
var Cs=33;

// Original UTF-16 range 249048:249053
var ws=40;

// Original UTF-16 range 249054:249060
var Ts=.72;

// Original UTF-16 range 249061:249066
var Es=16;

// Original UTF-16 range 249067:249073
var Ds=160;

// Original UTF-16 range 249074:249080
var Os=180;

// Original UTF-16 range 249081:249086
var ks=64;

// Original UTF-16 range 249087:249094
var As=1e-5;

// Original UTF-16 range 249095:251180
var js={pebble:()=>Rs(1.2167999999999999,`pebble`),bean:()=>{let e=ic(`bean`);return{size:1.17,silhouette:{kind:`solid`,samples:[],balls:e,isLoop:!1,yawPeriod:null},seat:Ws(`bean`,e)}},egg:()=>Rs(1.17,`egg`),squircle:()=>({size:1.17,silhouette:Is(Js(`squircle`,.28,.11)),seat:{kind:`front`,faceZ:.28}}),tablet:()=>{let{x0:e,x1:t,y0:n,y1:r}=qs(`tablet`),i=(t-e)/2/B,a=(r-n)/2/B,o=Math.max(0,i-a);return{size:1.3922999999999999,silhouette:{kind:`solid`,samples:[],balls:nc(`tablet`,`x`),isLoop:!1,yawPeriod:null},seat:{kind:`wrapX`,wrapR:a,wrapX0:-i+.02,wrapX1:i-.02,radiusAtX:e=>{let t=Math.abs(e)-o;return t<=0?a:Math.sqrt(Math.max(0,a*a-t*t))}}}},capsule:()=>{let e=nc(`capsule`,`y`),{y0:t,y1:n}=qs(`capsule`),r=-(n-B)/B,i=-(t-B)/B,{hx:a,hz:o}=rc(e);return{size:1.17,silhouette:{kind:`solid`,samples:[],balls:e,isLoop:!1,yawPeriod:null},seat:{kind:`wrap`,wrapR:Math.max(.35,(a+o)*.5),wrapY0:r,wrapY1:i,eyeY:(r+i)*.5}}},cylinder:()=>zs(`cylinder`,(e,t)=>(t+e)*.5),hex:()=>Bs(1.2519,Ks(U(`hex`))),gem:()=>Rs(1.17,`gem`),crystal:()=>({size:1.3805999999999998,silhouette:Is(Ys()),seat:{kind:`front`,faceZ:Math.sqrt(3)/2*.64}}),wedge:()=>{let e=gs(60,80),t=ms(e.path),[n,r]=e.spanAt(e.top+(e.bottom-e.top)*.5),i=-(e.top-B)/B,a=-(e.bottom-B)/B;return{size:1.3590719999999998,silhouette:Ls(Qs(t)),seat:{kind:`wrap`,wrapR:Math.max(.2,(r-n)/2/B),wrapY0:a,wrapY1:i,eyeY:i+(a-i)*.5,radiusAt:tc(t)}}},shield:()=>Rs(1.17,`shield`),dome:()=>Rs(1.17,`dome`),arch:()=>zs(`arch`,(e,t)=>e+(t-e)*.42),cloud:()=>Us(1.3455,Ks(U(`cloud`,1)),.72),teardrop:()=>{let e=hs(88,48),t=ms(e.path),[n,r]=e.spanAt(e.top+(e.bottom-e.top)*.62),i=-(e.bottom-B)/B,a=-(e.top-B)/B;return{size:1.318122,silhouette:Ls(Qs(t)),seat:{kind:`wrap`,wrapR:Math.max(.2,(r-n)/2/B),wrapY0:i,wrapY1:a,eyeY:(i+a)*.5,radiusAt:tc(t)}}},leaf:()=>Rs(1.17,`leaf`),square:()=>Bs(1.0413,Ks(U(`square`))),starFlower:()=>Bs(1.3922999999999999,oc()),sparkle:()=>Bs(1.521,Ks(U(`sparkle`))),clover:()=>Bs(1.0881,Ks(U(`clover`))),heartChubby:()=>Us(1.3571999999999997,Ao,.62),house:()=>Bs(1.17,Ks(U(`house`))),star6:()=>Vs(1.4976,Ks(U(`star6`)),.3,.18)};

// Original UTF-16 range 251181:251191
var Ms=new Map;

// Original UTF-16 range 251192:251199
var Ns=null;

// Original UTF-16 range 251200:251286
function Ps(e){let t=Ms.get(e);if(t!=null)return t;let n=js[e]();return Ms.set(e,n),n}

// Original UTF-16 range 251286:251419
function Fs(){return Ns??={size:1.17,silhouette:{kind:`solid`,samples:Ks(U(`bean`)),balls:[],isLoop:!0,yawPeriod:null},seat:null},Ns}

// Original UTF-16 range 251419:251499
function Is(e){return{kind:`solid`,samples:e,balls:[],isLoop:!1,yawPeriod:null}}

// Original UTF-16 range 251499:251581
function Ls(e){return{kind:`solid`,samples:e,balls:[],isLoop:!1,yawPeriod:360/Ss}}

// Original UTF-16 range 251581:251648
function Rs(e,t){return{size:e,silhouette:Ls(Zs(t)),seat:Ws(t,[])}}

// Original UTF-16 range 251648:251834
function zs(e,t){let n=ps(e),r=-(n.top-B)/B,i=-(n.bottom-B)/B;return{size:1.17,silhouette:Ls(Zs(e)),seat:{kind:`wrap`,wrapR:n.beltRadius/B,wrapY0:i,wrapY1:r,eyeY:t(r,i),radiusAt:ec(e)}}}

// Original UTF-16 range 251834:251872
function Bs(e,t){return Vs(e,t,vs,ys)}

// Original UTF-16 range 251872:251997
function Vs(e,t,n,r){return{size:e,silhouette:{kind:`extrusion`,rings:ac(t,n,r),isConvex:Hs(t)},seat:{kind:`front`,faceZ:n}}}

// Original UTF-16 range 251997:252231
function Hs(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length],a=e[(n+2)%e.length],o=(i.x-r.x)*(a.y-i.y)-(i.y-r.y)*(a.x-i.x);if(!(Math.abs(o)<xs)){if(t===0)t=Math.sign(o);else if(Math.sign(o)!==t)return!1}}return!0}

// Original UTF-16 range 252231:252352
function Us(e,t,n){let r=sc(t,n);return{size:e,silhouette:{kind:`loft`,rings:r.rings},seat:{kind:`loft`,surfaceZ:cc(r)}}}

// Original UTF-16 range 252352:252567
function Ws(e,t){let n=ps(e),r=-(n.bottom-B)/B,i=-(n.top-B)/B,a=ec(e),o=Math.min(i-.02,Math.max(r+.02,0));return{kind:`wrap`,wrapR:a(o),wrapY0:r,wrapY1:i,eyeY:o,radiusAt:a,puffAt:t.length>0?(e,n)=>Gs(t,e,n):void 0}}

// Original UTF-16 range 252567:252805
function Gs(e,t,n){let r=e[0],i=-1/0,a=1/0,o=!1;for(let s of e){let e=Math.hypot(t-s[0],n-s[1]);if(e<s[3]){let t=s[2]+Math.sqrt(s[3]*s[3]-e*e);(!o||t>i)&&(o=!0,i=t,r=s)}else!o&&e-s[3]<a&&(a=e-s[3],r=s)}return{x:r[0],y:r[1],z:r[2],r:r[3]}}

// Original UTF-16 range 252805:252872
function Ks(e){return e.map(([e,t])=>({x:(e-B)/B,y:-(t-B)/B,z:0}))}

// Original UTF-16 range 252872:253015
function qs(e){let t=1/0,n=-1/0,r=1/0,i=-1/0;for(let[a,o]of ps(e).ring)a<t&&(t=a),a>n&&(n=a),o<r&&(r=o),o>i&&(i=o);return{x0:t,x1:n,y0:r,y1:i}}

// Original UTF-16 range 253015:253412
function Js(e,t,n){let r=ps(e).ring.map(([e,t])=>({x:(e-B)/B,y:-(t-B)/B})),i=r.length,a=[];for(let e=0;e<i;e++){let o=r[e],s=r[(e-1+i)%i],c=r[(e+1)%i],l=c.y-s.y,u=-(c.x-s.x),d=Math.hypot(l,u)||1;l/=d,u/=d,l*o.x+u*o.y<0&&(l=-l,u=-u);for(let e=0;e<=bs;e++){let r=e/bs*(Math.PI/2),i=n*(1-Math.cos(r)),s=t-n+n*Math.sin(r);a.push({x:o.x-l*i,y:o.y-u*i,z:s}),a.push({x:o.x-l*i,y:o.y-u*i,z:-s})}}return a}

// Original UTF-16 range 253412:253800
function Ys(){let e=.12,t=[{x:0,y:1.04,z:0},{x:0,y:-1.04,z:0}],n=.52;for(let e of[-1,1])for(let r=0;r<6;r++){let i=r/6*_s;t.push({x:n*Math.cos(i),y:e*.51,z:n*Math.sin(i)})}let r=[];for(let n of t)for(let t=0;t<=8;t++){let i=t/8*Math.PI,a=Math.sin(i),o=t===0||t===8?1:14;for(let t=0;t<o;t++){let s=t/o*_s;r.push({x:n.x+e*a*Math.sin(s),y:n.y+e*Math.cos(i),z:n.z+e*a*Math.cos(s)})}}return r}

// Original UTF-16 range 253800:254387
function Xs(e){let t=e.length,n=1/0,r=-1/0;for(let[,t]of e)t<n&&(n=t),t>r&&(r=t);n-=As,r+=As;let i=e=>Math.min(63,Math.floor((e-n)/(r-n)*ks)),a=Array.from({length:ks},()=>[]);for(let n=0;n<t;n++){let r=e[n][1],o=e[(n+1)%t][1],s=i(Math.max(r,o)+As);for(let e=i(Math.min(r,o)-As);e<=s;e++)a[e].push(n)}return o=>{let s=1/0,c=-1/0;if(!(o>=n&&o<=r))return c-s;for(let n of a[i(o)]){let[r,i]=e[n],[a,l]=e[(n+1)%t];if(Math.abs(l-i)<1e-9){Math.abs(i-o)<1e-6&&(s=Math.min(s,r,a),c=Math.max(c,r,a));continue}if(i<=o&&l>=o||l<=o&&i>=o){let e=r+(a-r)*(o-i)/(l-i);e<s&&(s=e),e>c&&(c=e)}}return c-s}}

// Original UTF-16 range 254387:254418
function Zs(e){return Qs(U(e))}

// Original UTF-16 range 254418:255154
function Qs(e){let t=1/0,n=-1/0;for(let[,r]of e)r<t&&(t=r),r>n&&(n=r);let r=[],i=-(t-B)/B,a=-(n-B)/B,o=Xs(e),s=e=>{let t=o(e);return t<0?0:t/2/B},c=n-t,l=(e,t)=>{if(s(e)>=.06)return null;let n=s(e),r=c*.02;for(let i=c/512;i<=c*.05;i+=c/512)if(Math.abs(s(e+t*i)-n)>1e-4){r=i;break}return{yEdge:e,sign:t,dJoin:r,rJoin:s(e+t*r)}},u=[l(t,1),l(n,-1)].filter(e=>e!==null),d=e=>{let t=s(e);for(let n of u){let r=(e-n.yEdge)*n.sign;r>=0&&r<n.dJoin&&(t=Math.min(t,n.rJoin*Math.sqrt(r/n.dJoin)))}return t},f=(e,t)=>{let n=d(t);n<.06?r.push({x:0,y:e,z:0}):r.push(...$s(e,n))};f(i,t);for(let e=1;e<95;e++){let i=(1-Math.cos(e/95*Math.PI))/2,a=t+(n-t)*i,o=d(a),s=-(a-B)/B;if(o<1e-4){r.push({x:0,y:s,z:0});continue}r.push(...$s(s,o))}return f(a,n),r}

// Original UTF-16 range 255154:255271
function $s(e,t){let n=[];for(let r=0;r<Ss;r++){let i=r/Ss*_s;n.push({x:t*Math.sin(i),y:e,z:t*Math.cos(i)})}return n}

// Original UTF-16 range 255271:255302
function ec(e){return tc(U(e))}

// Original UTF-16 range 255302:255458
function tc(e){let t=Xs(e),n=1/0,r=-1/0;for(let[,t]of e)t<n&&(n=t),t>r&&(r=t);return e=>{let i=Math.max(n,Math.min(r,B-e*B));return Math.max(.02,t(i)/2/B)}}

// Original UTF-16 range 255458:255672
function nc(e,t){let{x0:n,x1:r,y0:i,y1:a}=qs(e),o=(r-n)/2/B,s=(a-i)/2/B,c=t===`x`?s:o,l=Math.max(0,(t===`x`?o:s)-c),u=-l,d=[];for(let e=0;e<Cs;e++){let n=u+(l-u)*(e/32);d.push(t===`x`?[n,0,0,c]:[0,n,0,c])}return d}

// Original UTF-16 range 255672:255797
function rc(e){let t=.55,n=.35;for(let[r,,i,a]of e)t=Math.max(t,Math.abs(r)+a),n=Math.max(n,Math.abs(i)+a);return{hx:t,hz:n}}

// Original UTF-16 range 255797:256430
function ic(e){let t=U(e),n=1/0,r=-1/0,i=1/0,a=-1/0;for(let[e,o]of t)n=Math.min(n,e),r=Math.max(r,e),i=Math.min(i,o),a=Math.max(a,o);let o=(e,n)=>{let r=!1,i=t.length;for(let a=0,o=i-1;a<i;o=a++){let[i,s]=t[a],[c,l]=t[o];s>n!=l>n&&e<i+(c-i)*(n-s)/(l-s)&&(r=!r)}return r},s=Math.max(r-n,a-i)/ws,c=[];for(let e=i+s/2;e<a;e+=s)for(let i=n+s/2;i<r;i+=s){if(!o(i,e))continue;let n=1/0;for(let[r,a]of t)n=Math.min(n,(r-i)**2+(a-e)**2);let r=Math.sqrt(n);r>s&&c.push({x:i,y:e,r})}c.sort((e,t)=>t.r-e.r);let l=[];for(let e of c)l.some(t=>Math.hypot(e.x-t.x,e.y-t.y)+e.r<=t.r+s*.25)||l.push(e);return l.map(e=>[(e.x-B)/B,-(e.y-B)/B,0,e.r/B])}

// Original UTF-16 range 256430:256891
function ac(e,t,n){let r=1/0,i=-1/0,a=1/0,o=-1/0;for(let t of e)r=Math.min(r,t.x),i=Math.max(i,t.x),a=Math.min(a,t.y),o=Math.max(o,t.y);let s=(r+i)/2,c=(a+o)/2,l=Math.max(1e-4,Math.min((i-r)/2,(o-a)/2)),u=(e,r)=>{let i=e/bs*(Math.PI/2),a=t-n+n*Math.sin(i);return{z:r<0?-a:a,scale:1-n/l*(1-Math.cos(i))}},d=[];for(let e=bs;e>=0;e--)d.push(u(e,-1));for(let e=0;e<=bs;e++)d.push(u(e,1));return d.map(({z:t,scale:n})=>e.map(e=>({x:s+(e.x-s)*n,y:c+(e.y-c)*n,z:t})))}

// Original UTF-16 range 256891:257270
function oc(){let e=.58,t=[{x:0,y:0,r:.36}];for(let n=0;n<6;n++){let r=-Math.PI/2+n*_s/6;t.push({x:e*Math.cos(r),y:e*Math.sin(r),r:.33})}let n=[];for(let e=0;e<240;e++){let r=e/240*_s,i=Math.cos(r),a=Math.sin(r),o=0,s=.9099999999999999;for(let e=0;e<22;e++){let e=(o+s)/2,n=e*i,r=e*a;t.some(e=>(n-e.x)*(n-e.x)+(r-e.y)*(r-e.y)<=e.r*e.r)?o=e:s=e}n.push({x:o*i,y:o*a,z:0})}return n}

// Original UTF-16 range 257270:257704
function sc(e,t){let n=e.length/Ds,r=n>1?Array.from({length:Ds},(t,r)=>e[Math.floor(r*n)]):e,i=1/0,a=-1/0,o=1/0,s=-1/0;for(let e of r)i=Math.min(i,e.x),a=Math.max(a,e.x),o=Math.min(o,e.y),s=Math.max(s,e.y);let c={x:(i+a)/2,y:(o+s)/2},l=[];for(let e=0;e<=Es;e++){let n=-Math.PI/2+Math.PI*e/Es,i=Math.max(0,Math.cos(n))**+Ts,a=t*Math.sin(n);l.push(r.map(e=>({x:c.x+(e.x-c.x)*i,y:c.y+(e.y-c.y)*i,z:a})))}return{rings:l,center:c,depth:t}}

// Original UTF-16 range 257704:258373
function cc({rings:e,center:t,depth:n}){let r=e[Math.floor(e.length/2)],i=new Float64Array(Os);for(let e=0;e<Os;e++){let n=(e+.5)/Os*Math.PI*2,a=Math.cos(n),o=Math.sin(n),s=0;for(let e=0;e<r.length;e++){let n=r[e],i=r[(e+1)%r.length],c=i.x-n.x,l=i.y-n.y,u=a*l-o*c;if(Math.abs(u)<1e-9)continue;let d=n.x-t.x,f=n.y-t.y,p=(d*l-f*c)/u,m=(d*o-f*a)/u;p>s&&m>=0&&m<=1&&(s=p)}i[e]=s}let a=(e,n)=>{let r=e-t.x,a=n-t.y,o=Math.hypot(r,a);if(o<1e-8)return 0;let s=(Math.atan2(a,r)+Math.PI*2)%(Math.PI*2)/(Math.PI*2)*Os,c=Math.floor(s)%Os,l=s-Math.floor(s),u=i[c],d=i[(c+1)%Os];return Math.min(1,o/Math.max(1e-8,u*(1-l)+d*l))};return(e,t)=>n*Math.sqrt(Math.max(0,1-a(e,t)**(2/Ts)))}

// Original UTF-16 range 258377:258389
var lc=Math.PI*2;

// Original UTF-16 range 258390:258395
var uc=.2;

// Original UTF-16 range 258396:258402
var dc=.36;

// Original UTF-16 range 258403:258410
var fc=1.18;

// Original UTF-16 range 258411:258417
var pc=160;

// Original UTF-16 range 258418:258423
var W=480;

// Original UTF-16 range 258424:258433
var mc=bc(pc);

// Original UTF-16 range 258434:258442
var hc=bc(W);

// Original UTF-16 range 258443:258450
var gc=1.01;

// Original UTF-16 range 258451:258458
var _c=1e-5;

// Original UTF-16 range 258459:258465
var vc=.01;

// Original UTF-16 range 258466:258470
var yc=8;

// Original UTF-16 range 258471:258574
function bc(e){return Array.from({length:e},(t,n)=>{let r=n/e*lc;return{x:Math.cos(r),y:Math.sin(r)}})}

// Original UTF-16 range 258574:258628
function xc(e,t){return Math.max(uc,e.size)*(dc*t/fc)}

// Original UTF-16 range 258628:258693
function Sc(e,t,n){return kc(e.silhouette,Tc(e,t,n)).flatMap(Oc)}

// Original UTF-16 range 258693:258847
function Cc(e,t,n){let r=e.silhouette;if(r.kind!==`extrusion`||!r.isConvex)return Sc(e,t,n);let{project:i}=Tc(e,t,n);return Oc(jc(r.rings.flat().map(i)))}

// Original UTF-16 range 258847:258926
function wc(e,t,n,r){return e.seat==null?[]:Pc(e.seat,r,Tc(e,t,n)).flatMap(Oc)}

// Original UTF-16 range 258926:259123
function Tc(e,t,n){let r=n/2,i=xc(e,n),a=Ec(t.yaw*Math.PI/180,t.pitch*Math.PI/180,t.roll*Math.PI/180);return{rotate:a,project:e=>{let t=a(e);return{x:r+i*t.x,y:r-i*t.y}},origin:{x:r,y:r},radius:i}}

// Original UTF-16 range 259123:259314
function Ec(e,t,n){let[r,i,a]=Dc(e),[o,s,c]=Dc(t),[l,u,d]=Dc(n);return({x:e,y:t,z:n})=>{let f=e*r+n*i,p=t*r+t*a,m=n*r-e*i,h=f*o+f*c,g=p*o-m*s,_=m*o+p*s;return{x:h*l-g*u,y:g*l+h*u,z:_*l+_*d}}}

// Original UTF-16 range 259314:259373
function Dc(e){let t=Math.cos(e);return[t,Math.sin(e),1-t]}

// Original UTF-16 range 259373:259576
function Oc(e){let[t]=e;if(e.length<2||!Number.isFinite(t.x)||!Number.isFinite(t.y))return[];let n=[];for(let t of e)Number.isFinite(t.x)&&Number.isFinite(t.y)&&n.push(t.x,t.y);return n.length>=6?[n]:[]}

// Original UTF-16 range 259576:259877
function kc(e,t){if(e.kind===`loft`)return[Nc(e.rings,t)];if(e.kind===`solid`)return[Ac(e,t)];let n=e.rings.map(e=>e.map(t.project)),r=n[0],i=n[n.length-1],a=[i,r];for(let e=1;e<n.length;e++){let t=n[e-1],r=n[e];for(let e=0;e<r.length;e++){let n=(e+1)%i.length;a.push([t[e],t[n],r[n],r[e]])}}return a}

// Original UTF-16 range 259877:260662
function Ac(e,{project:t,origin:n,radius:r}){let i=[];for(let n of e.samples){let e=t(n);Number.isFinite(e.x)&&Number.isFinite(e.y)&&i.push(e)}if(e.isLoop)return i;if(e.balls.length===0)return jc(i);let a=e.balls.map(([e,n,i,a])=>({...t({x:e,y:n,z:i}),r:a*r})).filter(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&e.r>1e-6),o=n.x,s=n.y;if(a.length>0){o=0,s=0;for(let e of a)o+=e.x,s+=e.y;o/=a.length,s/=a.length}for(let{x:e,y:t}of mc){let n=0;for(let r of a){let i=r.x-o,a=r.y-s,c=e*i+t*a,l=c*c-(i*i+a*a)+r.r*r.r;if(l<=0)continue;let u=c+Math.sqrt(l);u>n&&(n=u)}n>0&&i.push({x:o+e*n,y:s+t*n})}if(e.samples.length>0)return jc(i);if(i.length>=3)return i;for(let e of a)for(let t=0;t<48;t++){let n=t/48*lc;i.push({x:e.x+e.r*Math.cos(n),y:e.y+e.r*Math.sin(n)})}return i.length>=3?jc(i):i}

// Original UTF-16 range 260662:261074
function jc(e){let t=Mc(e.filter(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)));if(t.length<3)return t;let n=(e,t,n)=>(t.x-e.x)*(n.y-e.y)-(t.y-e.y)*(n.x-e.x),r=[];for(let e of t){for(;r.length>=2&&n(r[r.length-2],r[r.length-1],e)<=0;)r.pop();r.push(e)}let i=[];for(let e=t.length-1;e>=0;e--){let r=t[e];for(;i.length>=2&&n(i[i.length-2],i[i.length-1],r)<=0;)i.pop();i.push(r)}return r.pop(),i.pop(),[...r,...i]}

// Original UTF-16 range 261074:261537
function Mc(e){let t=1/0,n=-1/0;for(let{x:r}of e)r<t&&(t=r),r>n&&(n=r);let r=Math.ceil(e.length/yc),i=n>t?r/(n-t):0,a=e=>Math.min(r-1,Math.floor((e-t)*i)),o=new Int32Array(r+1);for(let{x:t}of e)o[a(t)+1]++;for(let e=0;e<r;e++)o[e+1]+=o[e];let s=o.slice(0,r),c=Array(e.length);for(let t of e)c[s[a(t.x)]++]=t;for(let e=0;e<r;e++)for(let t=o[e]+1;t<o[e+1];t++){let n=c[t],r=t-1;for(;r>=o[e]&&(c[r].x>n.x||c[r].x===n.x&&c[r].y>n.y);r--)c[r+1]=c[r];c[r+1]=n}return c}

// Original UTF-16 range 261537:262993
function Nc(e,{project:t,origin:n}){let r=e.map(e=>e.map(t)),i=e=>{let t=0,n=0;for(let r of e)t+=r.x,n+=r.y;return{x:t/e.length,y:n/e.length}},a=i(r[0]),o=i(r[r.length-1]);if(Math.hypot(o.x-a.x,o.y-a.y)<1e-4){let e=r[0],t=0;for(let n of r){let r=0;for(let e=0;e<n.length;e++){let t=n[e],i=n[(e+1)%n.length];r+=t.x*i.y-i.x*t.y}Math.abs(r)>t&&(e=n,t=Math.abs(r))}return e}let s=r.map(e=>e.map(({x:e,y:t})=>(e-n.x)*(e-n.x)+(t-n.y)*(t-n.y))),c=s.map(e=>Math.max(...e)),l=_c*Math.max(...c)+vc,u=(e,t)=>{let n=(t-l)/gc;return n>0&&e<n*n},d=r.map(e=>e.map(e=>{let t=(Math.atan2(e.y-n.y,e.x-n.x)+lc)%lc;return Math.floor(t/lc*W)%W})),f=new Float64Array(W),p=0,m=(e,t,r,i,a)=>{if(u(a,p))return;let o=i-r;o>W/2?o-=W:o<-240&&(o+=W);let s=o<0?-1:1,c=Math.abs(o),l=1/0;for(let e=-1;e<=c+1;e++){let t=(r+s*e+W)%W;f[t]<l&&(l=f[t])}if(u(a,l))return;let d=t.x-e.x,m=t.y-e.y,h=e.x-n.x,g=e.y-n.y;for(let e=-1;e<=c+1;e++){let t=(r+s*e+W)%W,{x:n,y:i}=hc[t],a=n*m-i*d;if(Math.abs(a)<1e-9)continue;let o=(h*m-g*d)/a,c=(h*i-g*n)/a;o>f[t]&&c>=0&&c<=1&&(f[t]=o)}},h=c.map((e,t)=>t).sort((e,t)=>c[t]-c[e]);for(let e of h){let t=r[e];for(let n=0;n<t.length;n++){let r=(n+1)%t.length;m(t[n],t[r],d[e][n],d[e][r],Math.max(s[e][n],s[e][r]))}p=Math.min(...f)}for(let e=0;e<r.length-1;e++){let t=r[e],n=r[e+1];for(let r=0;r<Math.min(t.length,n.length);r++)m(t[r],n[r],d[e][r],d[e+1][r],Math.max(s[e][r],s[e+1][r]))}return hc.flatMap(({x:e,y:t},r)=>f[r]>0?[{x:n.x+e*f[r],y:n.y+t*f[r]}]:[])}

// Original UTF-16 range 262993:263195
function Pc(e,t,n){switch(e.kind){case`front`:return Fc(e.faceZ,t,n);case`loft`:return Ic(e.surfaceZ,t,n);case`wrap`:return Lc(e,t,n);case`wrapX`:return Rc(e,t,n);default:throw Error(`Unhandled case`)}}

// Original UTF-16 range 263195:263375
function Fc(e,{loops:t,shiftY:n},r){if(!(r.rotate({x:0,y:0,z:1}).z>.03))return[];let i=Math.sin(n);return t.filter(e=>e.length>=3).map(t=>t.map(t=>r.project({x:t.x,y:t.y-i,z:e})))}

// Original UTF-16 range 263375:263837
function Ic(e,{loops:t,shiftY:n},{rotate:r,project:i}){if(!(r({x:0,y:0,z:1}).z>=.05))return[];let a=Math.sin(n),o=[];for(let n of t){if(n.length<3)continue;let t=n.map(e=>({x:e.x,y:e.y-a})),s=0,c=0;for(let e of t)s+=e.x,c+=e.y;s/=t.length,c/=t.length;let l=.004,u=(e(s+l,c)-e(s-l,c))/(2*l),d=(e(s,c+l)-e(s,c-l))/(2*l),f=Math.hypot(u,d,1);if(r({x:-u/f,y:-d/f,z:1/f}).z<.12)continue;let p=e(s,c);o.push(t.map(e=>i({x:e.x,y:e.y,z:p+(e.x-s)*u+(e.y-c)*d})))}return o}

// Original UTF-16 range 263837:265086
function Lc(e,{loops:t,shiftY:n},{rotate:r,project:i}){let{wrapR:a,wrapY0:o,wrapY1:s,radiusAt:c,puffAt:l}=e,u=c?.02:.06,d=Math.min(s-u,Math.max(o+u,e.eyeY-n)),f=e=>Math.min(s,Math.max(o,e)),p=e=>{let t=[];for(let n of e){let e=f(d+n.y),l=c?c(e):a,u=Math.max(-2.6,Math.min(2.6,n.x/Math.max(.12,l))),p=0;if(c){let t=.012;p=-(c(Math.min(s,e+t))-c(Math.max(o,e-t)))/(2*t)}r({x:Math.sin(u),y:p,z:Math.cos(u)}).z>=.05&&t.push(i({x:l*Math.sin(u),y:e,z:l*Math.cos(u)}))}return t},m=e=>{if(!l||e.length===0)return[];let t=0,n=0;for(let r of e)t+=r.x,n+=r.y;let a=l(t/e.length,f(d+n/e.length)),o=r({x:0,y:0,z:1}).z,s=[];for(let t of e){let e=t.x-a.x,n=f(d+t.y)-a.y,c=Math.hypot(e,n),l=Math.min(c/a.r,Math.PI-.02),u=c>1e-9?e/c:1,p=c>1e-9?n/c:0,m=r({x:u,y:p,z:0}).z,h=e=>m*Math.sin(e)+o*Math.cos(e);if(h(l)<.06&&o>.06){let e=0,t=l;for(let n=0;n<20;n++){let n=(e+t)/2;h(n)>=.06?e=n:t=n}l=e}let g=a.r*Math.sin(l);r({x:u*Math.sin(l),y:p*Math.sin(l),z:Math.cos(l)}).z>=.05&&s.push(i({x:a.x+u*g,y:a.y+p*g,z:a.z+a.r*Math.cos(l)}))}return s},h=1/0,g=-1/0;for(let e of t)for(let t of e)t.y<h&&(h=t.y),t.y>g&&(g=t.y);let _=0;g-h<=s-o&&(d+h<o?_=o-(d+h):d+g>s&&(_=s-(d+g)));let v=_===0?t:t.map(e=>e.map(e=>({x:e.x,y:e.y+_}))),y=l?m:p;return v.map(y).filter(e=>e.length>2)}

// Original UTF-16 range 265086:265699
function Rc(e,{loops:t,shiftY:n},{rotate:r,project:i}){let{wrapR:a,wrapX0:o,wrapX1:s,radiusAtX:c}=e,l=Math.max(-2.4,Math.min(2.4,-n/a)),u=1/0,d=-1/0;for(let e of t)for(let t of e)t.x<u&&(u=t.x),t.x>d&&(d=t.x);let f=0;return d-u<=s-o&&(u<o?f=o-u:d>s&&(f=s-d)),(f===0?t:t.map(e=>e.map(e=>({x:e.x+f,y:e.y})))).map(e=>{let t=[];for(let n of e){let e=Math.min(s,Math.max(o,n.x)),u=c(e),d=l+Math.max(-2.6,Math.min(2.6,n.y/Math.max(.12,a))),f=.012;r({x:-(c(Math.min(s,e+f))-c(Math.max(o,e-f)))/(2*f),y:Math.sin(d),z:Math.cos(d)}).z>=.05&&t.push(i({x:e,y:u*Math.sin(d),z:u*Math.cos(d)}))}return t}).filter(e=>e.length>2)}

// Original UTF-16 range 265703:265748
var zc={kind:`extrusion`,halfDepth:.36,bevel:.22};

// Original UTF-16 range 265749:266323
var Bc={cloud:{kind:`loft`,depth:.72},square:zc,sparkle:zc,clover:zc,heartChubby:{kind:`loft`,depth:.62},starFlower:zc,teardrop:{kind:`revolve`},tablet:{kind:`pill`,axis:0},wedge:{kind:`revolve`},house:zc,star6:{kind:`extrusion`,halfDepth:.3,bevel:.18},pebble:{kind:`revolve`},bean:{kind:`inscribedBalls`},egg:{kind:`revolve`},squircle:{kind:`roundedSlab`,halfDepth:.28,edge:.11},capsule:{kind:`pill`,axis:1},cylinder:{kind:`revolve`},hex:zc,gem:{kind:`revolve`},crystal:{kind:`crystal`},shield:{kind:`revolve`},dome:{kind:`revolve`},arch:{kind:`revolve`},leaf:{kind:`revolve`}};

// Original UTF-16 range 266324:266336
var Vc=Math.PI*2;

// Original UTF-16 range 266337:266344
var Hc=1024;

// Original UTF-16 range 266345:266370
var Uc={yaw:0,pitch:0,roll:0};

// Original UTF-16 range 266371:266375
var Wc=4;

// Original UTF-16 range 266376:266381
var Gc=64;

// Original UTF-16 range 266382:266387
var Kc=96;

// Original UTF-16 range 266388:266392
var qc=4;

// Original UTF-16 range 266393:266399
var Jc=.72;

// Original UTF-16 range 266400:266405
var Yc=16;

// Original UTF-16 range 266406:266411
var Xc=33;

// Original UTF-16 range 266412:266417
var Zc=40;

// Original UTF-16 range 266418:266425
var Qc=1e-9;

// Original UTF-16 range 266426:266434
var $c=1e-15;

// Original UTF-16 range 266435:266445
var el=new Map;

// Original UTF-16 range 266446:266536
function tl(e){let t=el.get(e);if(t!=null)return t;let n=nl(e,Bc[e]);return el.set(e,n),n}

// Original UTF-16 range 266536:266962
function nl(e,t){if(t.kind===`inscribedBalls`)return{kind:`balls`,balls:ul(rl(Fs())[0])};let n=rl(Ps(e));switch(t.kind){case`extrusion`:return il(n,t.halfDepth,t.bevel);case`revolve`:return al(yl(n[0]));case`roundedSlab`:return ol(dl(yl(n[0])),t.halfDepth,t.edge);case`pill`:return{kind:`balls`,balls:sl(yl(n[0]),t.axis)};case`crystal`:return cl();case`loft`:return ll(yl(n[0]),t.depth);default:throw Error(`Unhandled case`)}}

// Original UTF-16 range 266962:267063
function rl(e){let t=xc(e,Hc),n=Hc/2;return Sc(e,Uc,Hc).map(e=>e.map((e,r)=>r%2==0?(e-n)/t:(n-e)/t))}

// Original UTF-16 range 267063:267662
function il(e,t,n){let r=e[0].length/2,i=_l(Array.from({length:r},(t,n)=>{let i=e[2+Wc*r+n];return[i[0],i[1]]})),{x0:a,x1:o,y0:s,y1:c}=vl(i),l=(a+o)/2,u=(s+c)/2,d=Math.max(1e-4,Math.min((o-a)/2,(c-s)/2)),f=Math.min(t*.8,n),p=e=>{let n=e/Wc*(Math.PI/2);return{z:t-f+f*Math.sin(n),scale:1-f/d*(1-Math.cos(n))}},m=Array.from({length:5},(e,t)=>p(t)),{vertices:h,faces:g}=fl([...m.map(({z:e,scale:t})=>({z:-e,scale:t})).reverse(),...m].map(({z:e,scale:t})=>i.map(([n,r])=>[l+(n-l)*t,u+(r-u)*t,e])),!0),_=g.length-1;return{kind:`mesh`,vertices:h,faces:g.map((e,t)=>({corners:e,isBounding:t===0||t===_}))}}

// Original UTF-16 range 267662:268040
function al(e){let t=new Map;for(let[n,r]of e)n>-1e-9&&t.set(r,Math.max(t.get(r)??0,n));let n=[],r=e=>n.push(e)-1,i=[...t].sort((e,t)=>t[0]-e[0]).map(([e,t])=>t<=Qc?[r([0,e,0])]:Array.from({length:Gc},(n,i)=>{let a=i/Gc*Vc;return r([t*Math.sin(a),e,t*Math.cos(a)])})),a=[i[0],i[i.length-1]].filter(e=>e.length>1),o=i.slice(1).flatMap((e,t)=>ml(i[t],e));return hl(n,[...a,...o])}

// Original UTF-16 range 268040:268401
function ol(e,t,n){let r=e.length,i=e.map((t,n)=>{let i=e[(n-1+r)%r],a=e[(n+1)%r],o=a[1]-i[1],s=-(a[0]-i[0]),c=Math.hypot(o,s)||1;return o/=c,s/=c,o*t[0]+s*t[1]<0?[-o,-s]:[o,s]}),a=[];return e.forEach(([e,r],o)=>{for(let s=0;s<=qc;s++){let c=s/qc*(Math.PI/2),l=n*(1-Math.cos(c)),u=t-n+n*Math.sin(c),d=e-i[o][0]*l,f=r-i[o][1]*l;a.push([d,f,u],[d,f,-u])}}),pl(a)}

// Original UTF-16 range 268401:268612
function sl(e,t){let n=Math.max(...e.map(e=>Math.abs(e[1-t]))),r=Math.max(...e.map(e=>Math.abs(e[t])))-n;return Array.from({length:Xc},(e,i)=>{let a=-r+2*r*(i/32);return{center:t===0?[a,0,0]:[0,a,0],radius:n}})}

// Original UTF-16 range 268612:268978
function cl(){let e=.12,t=[[0,1.04,0],[0,-1.04,0]],n=.52;for(let e of[-1,1])for(let r=0;r<6;r++){let i=r/6*Vc;t.push([n*Math.cos(i),e*.51,n*Math.sin(i)])}let r=[];for(let[n,i,a]of t)for(let t=0;t<=8;t++){let o=t/8*Math.PI,s=Math.sin(o),c=t===0||t===8?1:14;for(let t=0;t<c;t++){let l=t/c*Vc;r.push([n+e*s*Math.sin(l),i+e*Math.cos(o),a+e*s*Math.cos(l)])}}return pl(r)}

// Original UTF-16 range 268978:269315
function ll(e,t){let n=_l(e),{x0:r,x1:i,y0:a,y1:o}=vl(n),s=(r+i)/2,c=(a+o)/2,{vertices:l,faces:u}=fl(Array.from({length:17},(e,r)=>{let i=-Math.PI/2+Math.PI*r/Yc,a=Math.max(0,Math.cos(i))**+Jc,o=t*Math.sin(i);return n.map(([e,t])=>[s+(e-s)*a,c+(t-c)*a,o])}),!1);return{kind:`mesh`,vertices:l,faces:u.map(e=>({corners:e,isBounding:!1}))}}

// Original UTF-16 range 269315:269915
function ul(e){let t=yl(e).map(([e,t])=>[B+B*e,B-B*t]),{x0:n,x1:r,y0:i,y1:a}=vl(t),o=(e,n)=>{let r=!1;for(let i=0,a=t.length-1;i<t.length;a=i++){let[o,s]=t[i],[c,l]=t[a];s>n!=l>n&&e<o+(c-o)*(n-s)/(l-s)&&(r=!r)}return r},s=Math.max(r-n,a-i)/Zc,c=[];for(let e=i+s/2;e<a;e+=s)for(let i=n+s/2;i<r;i+=s){if(!o(i,e))continue;let n=1/0;for(let[r,a]of t)n=Math.min(n,(r-i)**2+(a-e)**2);let r=Math.sqrt(n);r>s&&c.push({x:i,y:e,r})}c.sort((e,t)=>t.r-e.r);let l=[];for(let e of c)l.some(t=>Math.hypot(e.x-t.x,e.y-t.y)+e.r<=t.r+s*.25)||l.push(e);return l.map(e=>({center:[(e.x-B)/B,-(e.y-B)/B,0],radius:e.r/B}))}

// Original UTF-16 range 269915:270218
function dl(e){return Array.from({length:Kc},(t,n)=>{let r=n/Kc*Vc,i=Math.cos(r),a=-Math.sin(r),o=0;return e.forEach((t,n)=>{let r=e[(n+1)%e.length],s=r[0]-t[0],c=r[1]-t[1],l=i*c-a*s;if(Math.abs(l)<$c)return;let u=(t[0]*c-t[1]*s)/l,d=(t[0]*a-t[1]*i)/l;u>o&&d>=-1e-9&&d<=1.000000001&&(o=u)}),[i*o,a*o]})}

// Original UTF-16 range 270218:270516
function fl(e,t){let n=e[0].length,r=e.flat(),i=[],a=(e,t)=>e*n+t%n;t&&i.push(Array.from({length:n},(e,t)=>a(0,n-1-t)));for(let t=1;t<e.length;t++)for(let e=0;e<n;e++)i.push([a(t-1,e),a(t-1,e+1),a(t,e+1),a(t,e)]);return t&&i.push(Array.from({length:n},(t,n)=>a(e.length-1,n))),{vertices:r,faces:i}}

// Original UTF-16 range 270516:270610
function pl(e){return{kind:`mesh`,vertices:e,faces:yo(e).map(e=>({corners:e,isBounding:!0}))}}

// Original UTF-16 range 270610:270831
function ml(e,t){return e.length===1&&t.length===1?[]:e.length===1?t.map((n,r)=>[e[0],n,t[(r+1)%t.length]]):t.length===1?e.map((n,r)=>[n,t[0],e[(r+1)%e.length]]):e.map((n,r)=>[n,t[r],t[(r+1)%t.length],e[(r+1)%e.length]])}

// Original UTF-16 range 270831:271197
function hl(e,t){let n=e.length,r=[e.reduce((e,t)=>e+t[0],0)/n,e.reduce((e,t)=>e+t[1],0)/n,e.reduce((e,t)=>e+t[2],0)/n];return{kind:`mesh`,vertices:e,faces:t.map(t=>{let[n,i,a]=gl(e,t),o=t.reduce((t,n)=>[t[0]+e[n][0],t[1]+e[n][1],t[2]+e[n][2]],[0,0,0]),s=t.length;return{corners:n*(o[0]/s-r[0])+i*(o[1]/s-r[1])+a*(o[2]/s-r[2])<0?[...t].reverse():t,isBounding:!0}})}}

// Original UTF-16 range 271197:271390
function gl(e,t){let n=0,r=0,i=0;for(let a=0;a<t.length;a++){let o=e[t[a]],s=e[t[(a+1)%t.length]];n+=(o[1]-s[1])*(o[2]+s[2]),r+=(o[2]-s[2])*(o[0]+s[0]),i+=(o[0]-s[0])*(o[1]+s[1])}return[n,r,i]}

// Original UTF-16 range 271390:271510
function _l(e){let t=0;return e.forEach((n,r)=>{let i=e[(r+1)%e.length];t+=n[0]*i[1]-i[0]*n[1]}),t<0?[...e].reverse():e}

// Original UTF-16 range 271510:271664
function vl(e){let t=1/0,n=-1/0,r=1/0,i=-1/0;for(let[a,o]of e)t=Math.min(t,a),n=Math.max(n,a),r=Math.min(r,o),i=Math.max(i,o);return{x0:t,x1:n,y0:r,y1:i}}

// Original UTF-16 range 271664:271743
function yl(e){return Array.from({length:e.length/2},(t,n)=>[e[2*n],e[2*n+1]])}

// Original UTF-16 range 271747:271754
var bl=1024;

// Original UTF-16 range 271755:271763
var xl=2**23;

// Original UTF-16 range 271764:271772
var Sl=2**25;

// Original UTF-16 range 271773:271781
var Cl=2**26;

// Original UTF-16 range 271782:271943
var wl=class{xs=[];ys=[];#e=new Map;id(e,t){let n=(e+xl)*Sl+(t+xl),r=this.#e.get(n);return r??(r=this.xs.length,this.xs.push(e),this.ys.push(t),this.#e.set(n,r)),r}};

// Original UTF-16 range 271944:272090
function Tl(e){let t=``;for(let n of e){t+=`M${Rl(n[0])} ${Rl(n[1])}`;for(let e=2;e<n.length;e+=2)t+=` ${Rl(n[e])} ${Rl(n[e+1])}`;t+=`Z`}return t}

// Original UTF-16 range 272090:272166
function El(e){let t=Dl(e),n=Ol(t);return Nl(Ml(jl(t.flatMap(e=>kl(e,n)))))}

// Original UTF-16 range 272166:272790
function Dl(e){let t=new wl,n=new Map,r=[],i=[],a=e=>{let r=Il(e);if(r===0)return;let a=e.length/2;i.length=0;for(let n=0;n<a;n++){let o=r>0?n:a-1-n;i.push(t.id(e[2*o],e[2*o+1]))}for(let e=0;e<a;e++){let t=i[e],r=i[(e+1)%a];if(t===r)continue;let o=r*Cl+t,s=n.get(o)??0;s>1?n.set(o,s-1):s===1?n.delete(o):n.set(t*Cl+r,(n.get(t*Cl+r)??0)+1)}};for(let t of e){r.length=t.length;for(let e=0;e<t.length;e++)r[e]=Math.round(t[e]*bl);let e=r.length===8?Pl(r):null;if(e==null)a(r);else for(let t of e)a(t)}let{xs:o,ys:s}=t;return[...n].map(([e,t])=>{let n=Math.floor(e/Cl),r=e-n*Cl;return{ax:o[n],ay:s[n],bx:o[r],by:s[r],count:t}})}

// Original UTF-16 range 272790:273497
function Ol(e){let t=new wl;for(let n of e)t.id(n.ax,n.ay),t.id(n.bx,n.by);let n=e.map((e,t)=>t).sort((t,n)=>Ll(e[t])-Ll(e[n]));n.forEach((r,i)=>{let a=e[r],o=Math.max(a.ax,a.bx);for(let r=i+1;r<n.length;r++){let i=e[n[r]];if(Ll(i)>o)break;if(Math.min(i.ay,i.by)>Math.max(a.ay,a.by)||Math.max(i.ay,i.by)<Math.min(a.ay,a.by))continue;let s=Math.sign(G(a.ax,a.ay,a.bx,a.by,i.ax,i.ay)),c=Math.sign(G(a.ax,a.ay,a.bx,a.by,i.bx,i.by)),l=G(i.ax,i.ay,i.bx,i.by,a.ax,a.ay),u=G(i.ax,i.ay,i.bx,i.by,a.bx,a.by);if(s*c>=0||Math.sign(l)*Math.sign(u)>=0)continue;let d=l/(l-u);t.id(Math.round(a.ax+(a.bx-a.ax)*d),Math.round(a.ay+(a.by-a.ay)*d))}});let{xs:r,ys:i}=t;return r.map((e,t)=>({x:e,y:i[t]})).sort((e,t)=>e.x-t.x)}

// Original UTF-16 range 273497:274003
function kl(e,t){let n=e.bx-e.ax,r=e.by-e.ay,i=Math.abs(n)+Math.abs(r),a=Math.min(e.ay,e.by)-.5,o=Math.max(e.ay,e.by)+.5,s=Math.max(e.ax,e.bx)+.5,c=[];for(let l=Al(t,Math.min(e.ax,e.bx)-.5);l<t.length&&t[l].x<=s;l++){let{x:s,y:u}=t[l];u<a||u>o||2*Math.abs(G(e.ax,e.ay,e.bx,e.by,s,u))>i||c.push({t:((s-e.ax)*n+(u-e.ay)*r)/(n*n+r*r),x:s,y:u})}c.sort((e,t)=>e.t-t.t);let l=[];for(let t=1;t<c.length;t++){let n=c[t-1],r=c[t];(n.x!==r.x||n.y!==r.y)&&l.push({ax:n.x,ay:n.y,bx:r.x,by:r.y,count:e.count})}return l}

// Original UTF-16 range 274003:274091
function Al(e,t){let n=0,r=e.length;for(;n<r;){let i=n+r>>1;e[i].x<t?n=i+1:r=i}return n}

// Original UTF-16 range 274091:274413
function jl(e){let t=new wl,n=new Map;for(let r of e){let e=t.id(r.ax,r.ay),i=t.id(r.bx,r.by),a=Math.min(e,i)*Cl+Math.max(e,i);n.set(a,(n.get(a)??0)+(e<i?r.count:-r.count))}let{xs:r,ys:i}=t,a=[];for(let[e,t]of n){if(t===0)continue;let n=Math.floor(e/Cl),o=e-n*Cl;a.push({ax:r[n],ay:i[n],bx:r[o],by:i[o],count:t})}return a}

// Original UTF-16 range 274413:274799
function Ml(e){let t=[];for(let n of e){let r=n.ax+n.bx,i=n.ay+n.by,a=0;for(let t of e){if(t===n)continue;let e=2*t.ay,o=2*t.by;e<=i?o>i&&G(2*t.ax,e,2*t.bx,o,r,i)>0&&(a+=t.count):o<=i&&G(2*t.ax,e,2*t.bx,o,r,i)<0&&(a-=t.count)}let o=n.ay<n.by||n.ay===n.by&&n.ax>n.bx?a+n.count:a,s=o-n.count;o!==0!=(s!==0)&&t.push(o===0?{ax:n.bx,ay:n.by,bx:n.ax,by:n.ay,count:1}:{...n,count:1})}return t}

// Original UTF-16 range 274799:275198
function Nl(e){let t=new wl,n=[];for(let r of e){let e=t.id(r.ax,r.ay),i=t.id(r.bx,r.by);for(;n.length<=Math.max(e,i);)n.push([]);for(let t=0;t<Math.abs(r.count);t++)r.count>0?n[e].push(i):n[i].push(e)}let{xs:r,ys:i}=t,a=``;return n.forEach((e,t)=>{for(;e.length>0;){a+=`M${Rl(r[t]/bl)} ${Rl(i[t]/bl)}`;let o=e.pop();for(;o!=null&&o!==t;)a+=` ${Rl(r[o]/bl)} ${Rl(i[o]/bl)}`,o=n[o].pop();a+=`Z`}}),a}

// Original UTF-16 range 275198:275405
function Pl(e){let[t,n,r,i,a,o,s,c]=e,l=Fl(t,n,r,i,a,o,s,c);if(l!=null)return[[t,n,l[0],l[1],s,c],[l[0],l[1],r,i,a,o]];let u=Fl(r,i,a,o,s,c,t,n);return u==null?null:[[r,i,u[0],u[1],t,n],[u[0],u[1],a,o,s,c]]}

// Original UTF-16 range 275405:275647
function Fl(e,t,n,r,i,a,o,s){let c=Math.sign(G(e,t,n,r,i,a)),l=Math.sign(G(e,t,n,r,o,s)),u=G(i,a,o,s,e,t),d=G(i,a,o,s,n,r);if(!(c*l<0&&Math.sign(u)*Math.sign(d)<0))return null;let f=u/(u-d);return[Math.round(e+(n-e)*f),Math.round(t+(r-t)*f)]}

// Original UTF-16 range 275647:275701
function G(e,t,n,r,i,a){return(n-e)*(a-t)-(r-t)*(i-e)}

// Original UTF-16 range 275701:275810
function Il(e){let t=0;for(let n=0;n<e.length;n+=2){let r=(n+2)%e.length;t+=e[n]*e[r+1]-e[r]*e[n+1]}return t}

// Original UTF-16 range 275810:275852
function Ll(e){return Math.min(e.ax,e.bx)}

// Original UTF-16 range 275852:275904
function Rl(e){return String(Math.round(e*100)/100)}

// Original UTF-16 range 275908:275920
var zl=Math.PI/6;

// Original UTF-16 range 275921:275929
var Bl=-1.24;

// Original UTF-16 range 275930:275936
var Vl=.79;

// Original UTF-16 range 275937:275944
var Hl=3.24;

// Original UTF-16 range 275945:275950
var Ul=48;

// Original UTF-16 range 275951:275957
var Wl=160;

// Original UTF-16 range 275958:275965
var Gl=.001;

// Original UTF-16 range 275966:275972
var Kl=.18;

// Original UTF-16 range 275973:275991
var K=tu([-.5,.6,.62]);

// Original UTF-16 range 275992:276231
var ql=[...[0,1,2,3,4,5].map(e=>{let t=e*zl;return{center:[0,0,0],a:[Math.sin(t),0,Math.cos(t)],b:[0,1,0],isEquator:!1}}),...[-2,-1,0,1,2].map(e=>{let t=e*zl,n=Math.cos(t);return{center:[0,Math.sin(t),0],a:[0,0,n],b:[n,0,0],isEquator:e===0}})];

// Original UTF-16 range 276232:276239
var Jl=null;

// Original UTF-16 range 276240:276516
function Yl(e,t){let n=L(t,e.center),r=L(t,e.a),i=L(t,e.b),a=Math.hypot(r[2],i[2]),o=0,s=2*Math.PI;if(a>Math.abs(n[2])){let e=Math.atan2(i[2],r[2]),t=Math.acos(-n[2]/a);o=e-t,s=e+t}else if(n[2]<=0)return null;return{center:[n[0],n[1]],a:[r[0],r[1]],b:[i[0],i[1]],from:o,to:s}}

// Original UTF-16 range 276516:276637
function Xl(e,t){let n=Math.sqrt(Math.max(0,1-e*e-t*t)),r=K[0]*e+K[1]*t+K[2]*n;return Kl+.8200000000000001*Math.max(0,r)}

// Original UTF-16 range 276637:276859
function Zl(){if(Jl!==null)return Jl;let e=Math.hypot(K[0],K[1]),t=[K[0]/e,K[1]/e],n={origin:[Bl*K[0],Bl*K[1]],axisX:[Vl*Hl*t[0],Vl*Hl*t[1]],axisY:[-3.24*t[1],Hl*t[0]],focus:2.41*e/(Vl*Hl)};return Jl={...n,stops:$l(n)},Jl}

// Original UTF-16 range 276859:277117
function Ql(e,t,n){let r=t-e.origin[0],i=n-e.origin[1],a=(r*e.axisX[0]+i*e.axisX[1])/(e.axisX[0]**2+e.axisX[1]**2),o=(r*e.axisY[0]+i*e.axisY[1])/(e.axisY[0]**2+e.axisY[1]**2),s=e.focus,c=s*s-1,l=2*s*(a-s),u=(a-s)**2+o*o;return(-l-Math.sqrt(l*l-4*c*u))/(2*c)}

// Original UTF-16 range 277117:277587
function $l(e){let t=new Float64Array(49),n=new Float64Array(49),r=new Float64Array(49),i=0;for(let a=0;a<Wl;a++)for(let o=0;o<Wl;o++){let s=(a+.5)/Wl*2-1,c=(o+.5)/Wl*2-1;if(s*s+c*c>=1)continue;let l=Math.min(1,Ql(e,s,c))*Ul,u=Math.min(47,Math.floor(l)),d=l-u,f=Xl(s,c);t[u]+=(1-d)**2,t[u+1]+=d*d,n[u]+=(1-d)*d,r[u]+=(1-d)*f,r[u+1]+=d*f,i++}let a=Gl*i/49;for(let e=0;e<Ul;e++)t[e]+=a,t[e+1]+=a,n[e]-=a;let o=eu(t,n,r);return Array.from(o,(e,t)=>({offset:t/Ul,shade:e}))}

// Original UTF-16 range 277587:277875
function eu(e,t,n){let r=e.length,i=new Float64Array(r),a=new Float64Array(r);i[0]=t[0]/e[0],a[0]=n[0]/e[0];for(let o=1;o<r;o++){let r=e[o]-t[o-1]*i[o-1];i[o]=t[o]/r,a[o]=(n[o]-t[o-1]*a[o-1])/r}let o=new Float64Array(r);o[r-1]=a[r-1];for(let e=r-2;e>=0;e--)o[e]=a[e]-i[e]*o[e+1];return o}

// Original UTF-16 range 277875:277952
function tu(e){let t=Math.hypot(e[0],e[1],e[2]);return[e[0]/t,e[1]/t,e[2]/t]}

// Original UTF-16 range 277956:277961
var nu=.4;

// Original UTF-16 range 277962:277969
var ru=1e-9;

// Original UTF-16 range 277970:277974
var iu=6;

// Original UTF-16 range 277975:277980
var au=24;

// Original UTF-16 range 277981:277988
var ou=.004;

// Original UTF-16 range 277989:278003
var su=Math.PI/180;

// Original UTF-16 range 278004:278293
function cu(e,t,n,r){let i=tl(e),a=lu(t),o=xc(Ps(e),n),s=n/2,c=r.map(e=>e+(1-e)*nu),l=e=>{let t=e[0]*K[0]+e[1]*K[1]+e[2]*K[2],n=Kl+(1-Kl)*Math.max(0,t);return _u(c.map(e=>e*n))},u=e=>[s+o*e[0],s-o*e[1]],d=i.kind===`mesh`?uu(i,a,u,l):du(i.balls,a,u,o,l);return{baseFill:l([0,0,1]),faces:d}}

// Original UTF-16 range 278293:278544
function lu(e){let[t,n]=[Math.cos(e.yaw*su),Math.sin(e.yaw*su)],[r,i]=[Math.cos(e.pitch*su),Math.sin(e.pitch*su)],[a,o]=[Math.cos(e.roll*su),Math.sin(e.roll*su)];return([e,s,c])=>{let l=e*t+c*n,u=c*t-e*n,d=s*r-u*i,f=s*i+u*r;return[l*a-d*o,l*o+d*a,f]}}

// Original UTF-16 range 278544:278967
function uu(e,t,n,r){let i=e.vertices.map(t),a=[],o=new Map;for(let t of e.faces){let[e,s,c]=gl(i,t.corners),l=Math.hypot(e,s,c);if(l===0||c<=ru*l)continue;let u=r([e/l,s/l,c/l]),d=t.corners.flatMap(e=>n(i[e]));if(t.isBounding){pu(o,u,d);continue}let f=t.corners.reduce((e,t)=>e+i[t][2],0)/t.corners.length;a.push({polygon:d,fill:u,depth:f})}return a.sort((e,t)=>e.depth-t.depth),[...fu(a),...[...o].map(([e,t])=>mu(t,e))]}

// Original UTF-16 range 278967:279810
function du(e,t,n,r,i){let a=e.map(e=>({center:t(e.center),radius:e.radius})),o=a.map((e,t)=>t).sort((e,t)=>a[e].center[2]+a[e].radius-(a[t].center[2]+a[t].radius)),s=ou/r;return o.flatMap(e=>{let{center:t,radius:o}=a[e],c=a.filter((t,n)=>n!==e&&a[n].radius>s),l=e=>c.some(t=>e.every(e=>gu(e,t.center)<(t.radius-s)**2)),u=(e,n)=>[t[0]+o*Math.sin(e)*Math.cos(n),t[1]+o*Math.sin(e)*Math.sin(n),t[2]+o*Math.cos(e)],d=hu(o*r),f=new Map;for(let e=0;e<iu;e++){let t=e/iu*(Math.PI/2),r=(e+1)/iu*(Math.PI/2),a=e===5?d:1;for(let o=0;o<au;o++){let s=o/au*2*Math.PI,c=(o+1)/au*2*Math.PI,d=[...e===0?[u(0,0)]:[u(t,s)],...Array.from({length:a+1},(e,t)=>u(r,s+(c-s)*t/a)),...e===0?[]:[u(t,c)]];if(l(d))continue;let p=(t+r)/2,m=(s+c)/2;pu(f,i([Math.sin(p)*Math.cos(m),Math.sin(p)*Math.sin(m),Math.cos(p)]),d.flatMap(n))}}return[...f].map(([e,t])=>mu(t,e))})}

// Original UTF-16 range 279810:279969
function fu(e){let t=[],n=0;for(let r=1;r<=e.length;r++)r<e.length&&e[r].fill===e[n].fill||(t.push(mu(e.slice(n,r).map(e=>e.polygon),e[n].fill)),n=r);return t}

// Original UTF-16 range 279969:280034
function pu(e,t,n){let r=e.get(t);r==null?e.set(t,[n]):r.push(n)}

// Original UTF-16 range 280034:280074
function mu(e,t){return{d:Tl(e),fill:t}}

// Original UTF-16 range 280074:280178
function hu(e){if(e<=ou)return 1;let t=2*Math.acos(1-ou/e);return Math.max(1,Math.ceil(2*Math.PI/au/t))}

// Original UTF-16 range 280178:280246
function gu(e,t){return(e[0]-t[0])**2+(e[1]-t[1])**2+(e[2]-t[2])**2}

// Original UTF-16 range 280246:280363
function _u(e){return`#${e.map(e=>Math.round(Math.min(1,Math.max(0,e))*255).toString(16).padStart(2,`0`)).join(``)}`}

// Original UTF-16 range 280367:280372
var vu=60;

// Original UTF-16 range 280373:280379
var yu=256;

// Original UTF-16 range 280380:280385
var bu=24;

// Original UTF-16 range 280386:280392
var xu=2e4;

// Original UTF-16 range 280393:280398
var Su=.2;

// Original UTF-16 range 280399:280582
function Cu(e,t,n){let r={field:e,tolerance:n,root:n.deviation*.001,reach:t.step*Math.hypot(t.nx,t.ny)},i=[];for(let e of wu(r,t)){let t=Au(Eu(r,e),n);t.length>=3&&i.push(t)}return i}

// Original UTF-16 range 280582:281589
function wu(e,t){let{field:n}=e,{x0:r,y0:i,step:a,nx:o,ny:s}=t,c=o+1,l=new Float64Array(c*(s+1));for(let e=0;e<=s;e++)for(let t=0;t<=o;t++)l[e*c+t]=n(r+t*a,i+e*a);let u=2*c*(s+1),d=new Int32Array(u).fill(-1),f=new Map,p=t=>{let n=f.get(t);if(n!==void 0)return n;let o=t>>1,s=t&1?o+c:o+1,u=r+o%c*a,d=i+Math.floor(o/c)*a,p=r+s%c*a,m=i+Math.floor(s/c)*a,h=Tu(e,u,d,l[o],p,m,l[s]),g=[u+(p-u)*h,d+(m-d)*h];return f.set(t,g),g},m=[0,0,0,0],h=[0,0,0,0],g=[],_=[];for(let e=0;e<s;e++)for(let t=0;t<o;t++){let o=e*c+t;m[0]=o,m[1]=o+1,m[2]=o+1+c,m[3]=o+c,h[0]=2*o,h[1]=2*(o+1)+1,h[2]=2*(o+c),h[3]=2*o+1,g.length=0,_.length=0;for(let e=0;e<4;e++){let t=l[m[e]]<0;t!==l[m[e+1&3]]<0&&(g.push(h[e]),_.push(t))}if(g.length===2){let e=+!_[0];d[g[e]]=g[1-e]}else if(g.length===4){let o=n(r+(t+.5)*a,i+(e+.5)*a)<0;for(let e=0;e<4;e++)_[e]&&(d[g[e]]=g[e+(o?1:3)&3])}}let v=[],y=new Uint8Array(u);for(let e=0;e<u;e++){if(d[e]<0||y[e])continue;let t=[],n=e;for(;n>=0&&!y[n];)y[n]=1,t.push(p(n)),n=d[n];n===e&&v.push(t)}return v}

// Original UTF-16 range 281589:281836
function Tu(e,t,n,r,i,a,o){let s=0,c=r,l=1,u=o,d=0,f=0;for(let r=0;r<vu;r++){f=(s*u-l*c)/(u-c);let r=e.field(t+(i-t)*f,n+(a-n)*f);if(Math.abs(r)<=e.root||l-s<=1e-15)break;r<0==u<0?(l=f,u=r,d===-1&&(c/=2),d=-1):(s=f,c=r,d===1&&(u/=2),d=1)}return f}

// Original UTF-16 range 281836:281984
function Eu(e,t){let n=[];for(let r=0;r<t.length;r++){let i=t[r],a=t[(r+1)%t.length];(i[0]!==a[0]||i[1]!==a[1])&&(n.push(i),Du(e,i,a,0,n))}return n}

// Original UTF-16 range 281984:282376
function Du(e,t,n,r,i){let a=n[0]-t[0],o=n[1]-t[1],s=Math.sqrt(a*a+o*o);if(s===0||r>=bu||i.length>=xu)return;let c=(t[0]+n[0])/2,l=(t[1]+n[1])/2,u=e.field(c,l);if(!Number.isFinite(u))return;let d=u>0?1:-1,f=-o/s*d,p=a/s*d,m=ku(e,c,l,u,f,p);if(m===null||m<=e.tolerance.deviation/2&&s<=e.tolerance.edge)return;let h=u>0?Ou(e,c,l,u,f,p,m):[c+f*m,l+p*m];Du(e,t,h,r+1,i),i.push(h),Du(e,h,n,r+1,i)}

// Original UTF-16 range 282376:282666
function Ou(e,t,n,r,i,a,o){let s=[t+i*o,n+a*o],c=o*.001,l=e.field(t+c,n)-e.field(t-c,n),u=e.field(t,n+c)-e.field(t,n-c),d=Math.sqrt(l*l+u*u);if(d===0)return s;let f=l*a-u*i<0?-1:1,p=-u/d*f,m=l/d*f;if(p*i+m*a<Su)return s;let h=ku(e,t,n,r,p,m);return h===null||h*(p*i+m*a)<=o?s:[t+p*h,n+m*h]}

// Original UTF-16 range 282666:282913
function ku(e,t,n,r,i,a){if(r===0)return 0;let o=0,s=r;for(let c=0;c<yu;c++){let c=o+Math.max(Math.abs(s),e.root);if(c>e.reach)return null;let l=t+i*c,u=n+a*c,d=e.field(l,u);if(d<0!=r<0)return o+(c-o)*Tu(e,t+i*o,n+a*o,s,l,u,d);o=c,s=d}return null}

// Original UTF-16 range 282913:283319
function Au(e,t){let n=e.length;if(n<4)return e;let r=new Uint8Array(n),i=0,a=-1;for(let t=1;t<n;t++){let n=ju(e[0],e[t]);n>a&&(a=n,i=t)}r[0]=1,r[i]=1;let o=(i,a)=>{if(a-i<2)return;let s=e[i],c=e[a%n],l=-1,u=i;for(let t=i+1;t<a;t++){let n=Mu(e[t],s,c);n>l&&(l=n,u=t)}let d=l>t.deviation/2;!d&&Math.sqrt(ju(s,c))<=t.edge||(d||(u=i+a>>1),r[u]=1,o(i,u),o(u,a))};return o(0,i),o(i,n),e.filter((e,t)=>r[t]===1)}

// Original UTF-16 range 283319:283379
function ju(e,t){let n=t[0]-e[0],r=t[1]-e[1];return n*n+r*r}

// Original UTF-16 range 283379:283546
function Mu(e,t,n){let r=n[0]-t[0],i=n[1]-t[1],a=e[0]-t[0],o=e[1]-t[1],s=r*r+i*i,c=s>0?Math.min(1,Math.max(0,(a*r+o*i)/s)):0,l=a-r*c,u=o-i*c;return Math.sqrt(l*l+u*u)}

// Original UTF-16 range 283550:283630
var Nu=[{fill:`#3d3d3d`,paints:new Set([1,2])},{fill:`#525252`,paints:new Set([2])}];

// Original UTF-16 range 283631:283655
var Pu={deviation:.5,edge:4};

// Original UTF-16 range 283656:283660
var Fu=2;

// Original UTF-16 range 283661:283665
var Iu=4;

// Original UTF-16 range 283666:283670
var Lu=8;

// Original UTF-16 range 283671:283688
var Ru=19*Math.PI/180;

// Original UTF-16 range 283689:283695
var zu=.16;

// Original UTF-16 range 283696:283702
var Bu=2.2;

// Original UTF-16 range 283703:283708
var Vu=.9;

// Original UTF-16 range 283709:283716
var Hu=1.08;

// Original UTF-16 range 283717:283726
var Uu=Hu*.84;

// Original UTF-16 range 283727:283745
var Wu=-65*Math.PI/180;

// Original UTF-16 range 283746:283753
var Gu=1.17;

// Original UTF-16 range 283754:283760
var Ku=.36;

// Original UTF-16 range 283761:283768
var qu=1.18;

// Original UTF-16 range 283769:283775
var Ju=160;

// Original UTF-16 range 283776:283782
var Yu=320;

// Original UTF-16 range 283783:283788
var q=256;

// Original UTF-16 range 283789:283794
var Xu=24;

// Original UTF-16 range 283795:283802
var Zu=1.25;

// Original UTF-16 range 283803:283810
var Qu=.015;

// Original UTF-16 range 283811:283819
var $u=1.002;

// Original UTF-16 range 283820:283827
var ed=-.35;

// Original UTF-16 range 283828:283833
var td=48;

// Original UTF-16 range 283834:283840
var nd=2.2;

// Original UTF-16 range 283841:283846
var rd=14;

// Original UTF-16 range 283847:283853
var id=.03;

// Original UTF-16 range 283854:283861
var ad=.012;

// Original UTF-16 range 283862:283867
var od=48;

// Original UTF-16 range 283868:283872
var J=72;

// Original UTF-16 range 283873:283877
var sd=8;

// Original UTF-16 range 283878:283885
var cd=.115;

// Original UTF-16 range 283886:283892
var ld=.08;

// Original UTF-16 range 283893:283899
var ud=.06;

// Original UTF-16 range 283900:283906
var dd=.09;

// Original UTF-16 range 283907:283912
var fd=24;

// Original UTF-16 range 283913:283918
var pd=32;

// Original UTF-16 range 283919:283924
var md=.6;

// Original UTF-16 range 283925:283932
var hd=.012;

// Original UTF-16 range 283933:283939
var gd=.02;

// Original UTF-16 range 283940:283946
var _d=128;

// Original UTF-16 range 283947:283963
var vd={x:0,y:0,z:1};

// Original UTF-16 range 283964:283980
var yd={x:0,y:1,z:0};

// Original UTF-16 range 283981:283997
var bd={x:1,y:0,z:0};

// Original UTF-16 range 283998:284005
var xd=null;

// Original UTF-16 range 284006:284013
var Sd=null;

// Original UTF-16 range 284014:284024
var Cd=new Map;

// Original UTF-16 range 284025:284039
var wd=new WeakMap;

// Original UTF-16 range 284040:284460
function Td(e,t,n){let r=1/((Math.hypot(e,n)/Hu)**+Bu+(Math.abs(t)/Uu)**+Bu)**(1/Bu),i=Math.abs(Math.cos(Lu*(Math.atan2(n,e)-Math.PI/2-Ru)/2)),a=t<0?Math.max(0,1-t*t)**.2:Math.sqrt(Math.max(0,1-t*t))*(1-.45*t),o=1-zu*(1-i**.6)*a,s=Math.abs(Math.cos(3*Math.asin(Math.max(-1,Math.min(1,t)))))**.6,c=t<0?1:Math.max(0,1-2.2*t),l=1-zu*.55*Vu*(1-s)*c,u=t>0?.11*Math.exp(-(1-t)/.02):.03*Math.exp(-(1+t)/.03);return r*o*l*(1-u)}

// Original UTF-16 range 284460:284780
function Ed(){if(xd!=null)return xd;let e=new Float32Array(51681),t=1/0,n=0;for(let r=0;r<=Ju;r++){let i=-Math.PI/2+r/Ju*Math.PI,a=Math.cos(i),o=Math.sin(i);for(let i=0;i<=Yu;i++){let s=-Math.PI+i/Yu*2*Math.PI,c=Td(a*Math.cos(s),o,a*Math.sin(s));e[r*321+i]=c,c<t&&(t=c),c>n&&(n=c)}}return xd={radii:e,least:t,most:n},xd}

// Original UTF-16 range 284780:285127
function Dd({x:e,y:t,z:n}){let{radii:r}=Ed(),i=(Math.asin(Math.max(-1,Math.min(1,t/(Math.hypot(e,t,n)||1))))+Math.PI/2)/Math.PI*Ju,a=(Math.atan2(n,e)+Math.PI)/(2*Math.PI)*Yu,o=Math.min(159,Math.max(0,Math.floor(i))),s=Math.min(319,Math.max(0,Math.floor(a))),c=i-o,l=a-s,u=o*321+s,d=u+Yu+1;return(r[u]*(1-l)+r[u+1]*l)*(1-c)+(r[d]*(1-l)+r[d+1]*l)*c}

// Original UTF-16 range 285127:285192
function Od(e){let t=Math.cos(e);return{c:t,s:Math.sin(e),k:1-t}}

// Original UTF-16 range 285192:285271
function kd(e,{c:t,s:n,k:r}){return{x:e.x*t+e.x*r,y:e.y*t-e.z*n,z:e.z*t+e.y*n}}

// Original UTF-16 range 285271:285350
function Ad(e,{c:t,s:n,k:r}){return{x:e.x*t+e.z*n,y:e.y*t+e.y*r,z:e.z*t-e.x*n}}

// Original UTF-16 range 285350:285429
function jd(e,{c:t,s:n,k:r}){return{x:e.x*t-e.y*n,y:e.y*t+e.x*n,z:e.z*t+e.z*r}}

// Original UTF-16 range 285429:285644
function Md({yaw:e,pitch:t,roll:n}){let r=e*Math.PI/180,i=t*Math.PI/180,a=n*Math.PI/180,[o,s,c]=[Od(r),Od(i),Od(a)],[l,u,d]=[Od(-r),Od(-i),Od(-a)];return{toView:e=>jd(kd(Ad(e,o),s),c),toBody:e=>Ad(kd(jd(e,d),u),l)}}

// Original UTF-16 range 285644:285679
function Nd(e){return Gu*(Ku*e/qu)}

// Original UTF-16 range 285679:286212
function Pd(e,t){let n=`${t} ${e.yaw} ${e.pitch} ${e.roll}`,r=Cd.get(n);if(r!=null)return Cd.delete(n),Cd.set(n,r),r;let{toView:i,toBody:a}=Md(e),o=t/2,s=Nd(t),c=new Float64Array(q),l=[];for(let e=0;e<q;e++){let t=2*Math.PI*e/q,n=Math.cos(t),r=Math.sin(t),i=0;for(let e=-24;e<=Xu;e++){let t=e/Xu*Zu,o=Math.cos(t),s=Math.sin(t),c=Dd(a({x:n*o,y:r*o,z:s}));i=Math.max(i,c*o)}c[e]=i,l.push(o+s*i*n,o-s*i*r)}let u={reaches:c,body:l,stem:tf(i,a,t)};if(Cd.set(n,u),Cd.size>_d){let e=Cd.keys().next().value;e!==void 0&&Cd.delete(e)}return u}

// Original UTF-16 range 286212:286625
function Fd(e,t,n,r){let{toView:i,toBody:a}=Md(t),o=n/2,s=Nd(n),c=e=>({x:o+s*e.x,y:o-s*e.y}),l=i(vd),u=i(yd),d=i(bd),f=[];for(let t of r){let n=Gd(t.map(({x:e,y:t})=>i(Vd(e,t))),e=>{let n=Hd(e,l);if(n<=.02)return!1;let r=Math.acos(Math.max(-1,Math.min(1,n))),i=Math.sin(r);return i<1e-8?Qd(t,{x:0,y:0}):Qd(t,{x:r*Hd(e,d)/i,y:r*Hd(e,u)/i})},e.reaches,a,o,s,c);n!=null&&f.push(n)}return Jd(f,e.reaches,o,s).map($d)}

// Original UTF-16 range 286625:286815
function Id(e){if(e==null)return[];let t=wd.get(e);if(t!=null)return t;let n=Nu.flatMap(({fill:t,paints:n})=>{let r=Ld(e,n);return r.length>0?[{fill:t,polygons:r}]:[]});return wd.set(e,n),n}

// Original UTF-16 range 286815:287171
function Ld(e,t){let n=(t,n)=>t<0||n<0||t>=e.width||n>=e.height?0:e.paint[n*e.width+t],r=(e,r)=>t.has(n(e,r)),i=(e,t)=>{for(let n=-2;n<=Fu;n++)for(let i=-2;i<=Fu;i++)if(r(e+i,t+n))return!0;return!1},a=Rd(e),o=zd(a,(e,t)=>n(e,t)!==0),s=zd(a,(e,t)=>r(e,t)||n(e,t)===0&&i(e,t));return Cu((e,t)=>Math.max(s(e,t),o(e,t)),a,Pu).map(e=>e.flatMap(([e,t])=>[e,t]))}

// Original UTF-16 range 287171:287263
function Rd(e){return{x0:e.left-Iu+.5,y0:e.top-Iu+.5,step:1,nx:e.width+8-1,ny:e.height+8-1}}

// Original UTF-16 range 287263:287670
function zd(e,t){let n=e.nx+1,r=e.ny+1,i=new Float32Array(n*r);for(let e=0;e<r;e++)for(let r=0;r<n;r++)t(r-Iu,e-Iu)&&(i[e*n+r]=1);let a=Bd(Bd(i,n,r,1),n,r,n);return(t,r)=>{let i=Math.min(e.nx,Math.max(0,t-e.x0)),o=Math.min(e.ny,Math.max(0,r-e.y0)),s=Math.min(e.nx-1,Math.floor(i)),c=Math.min(e.ny-1,Math.floor(o)),l=i-s,u=o-c,d=c*n+s,f=a[d]*(1-l)+a[d+1]*l,p=a[d+n]*(1-l)+a[d+n+1]*l;return .5-(f*(1-u)+p*u)}}

// Original UTF-16 range 287670:287820
function Bd(e,t,n,r){let i=new Float32Array(e.length);for(let a=1;a<n-1;a++)for(let n=1;n<t-1;n++){let o=a*t+n;i[o]=(e[o-r]+2*e[o]+e[o+r])/4}return i}

// Original UTF-16 range 287820:287935
function Vd(e,t){let n=Math.hypot(e,t);if(n<1e-8)return vd;let r=Math.sin(n);return{x:e/n*r,y:t/n*r,z:Math.cos(n)}}

// Original UTF-16 range 287935:287983
function Hd(e,t){return e.x*t.x+e.y*t.y+e.z*t.z}

// Original UTF-16 range 287983:288107
function Ud(e,t){let n=Math.hypot(e.x,e.y,e.z)||1,r={x:e.x/n,y:e.y/n,z:e.z/n},i=Dd(t(r))*$u;return{x:r.x*i,y:r.y*i,z:r.z*i}}

// Original UTF-16 range 288107:288337
function Wd(e,t){let n=Math.hypot(e.x,e.y,e.z)||1;if(e.z/n<ed)return!1;let r=Ud(e,t);for(let e=1;e<=td;e++){let n=.01+e/td*nd,i=r.x,a=r.y,o=r.z+n,s=Math.hypot(i,a,o);if(s>nd)break;if(s<Dd(t({x:i/s,y:a/s,z:o/s})))return!1}return!0}

// Original UTF-16 range 288337:289297
function Gd(e,t,n,r,i,a,o){let s=e.map(e=>Wd(e,r));if(s.every(e=>!e))return null;if(s.every(e=>e))return e.map(e=>o(Ud(e,r)));let c=(e,t)=>{let n=0,i=1;for(let a=0;a<rd;a++){let a=(n+i)/2;Wd(Kd(e,t,a),r)?n=a:i=a}return Ud(Kd(e,t,n),r)},l=e=>{let t=e/(2*Math.PI)*q;t=(t%q+q)%q;let r=Math.floor(t)%q,o=t-Math.floor(t),s=(n[r]*(1-o)+n[(r+1)%q]*o)*a;return{x:i+s*Math.cos(e),y:i-s*Math.sin(e)}},u=e.length,d=s.findIndex(e=>!e),f=[],p=null,m=0;for(let n=0;n<u;n++){let i=(d+n)%u,a=(i+1)%u;if(!s[i]&&s[a]){let t=c(e[a],e[i]);m=Math.atan2(t.y,t.x),p=[o(t)]}if(s[i]&&(p??=[],p.push(o(Ud(e[i],r)))),s[i]&&!s[a]&&p!=null){let n=c(e[i],e[a]);p.push(o(n));let r=Math.atan2(n.y,n.x),s=m-r;for(;s<=-Math.PI;)s+=2*Math.PI;for(;s>Math.PI;)s-=2*Math.PI;let u=r+s/2;if(t({x:Math.cos(u),y:Math.sin(u),z:0})){let e=Math.max(2,Math.ceil(Math.abs(s)/id));for(let t=1;t<e;t++)p.push(l(r+s*t/e))}p.length>2&&f.push(p),p=null}}return f.length===0?null:f.reduce((e,t)=>qd(t)>qd(e)?t:e)}

// Original UTF-16 range 289297:289378
function Kd(e,t,n){return{x:e.x+(t.x-e.x)*n,y:e.y+(t.y-e.y)*n,z:e.z+(t.z-e.z)*n}}

// Original UTF-16 range 289378:289482
function qd(e){return Math.abs(e.reduce((t,n,r)=>{let i=e[(r+1)%e.length];return t+n.x*i.y-i.x*n.y},0))}

// Original UTF-16 range 289482:289971
function Jd(e,t,n,r){if(e.length===0)return[];let i=[];for(let e=0;e<q;e++){let a=2*Math.PI*e/q,o=Math.max(.05,t[e]-Qu)*r;i.push({x:n+o*Math.cos(a),y:n-o*Math.sin(a)})}let a=Yd(i),[o,s]=a,c=(s.x-o.x)*(n-o.y)-(s.y-o.y)*(n-o.x)>0?1:-1,l=[];for(let t of e){if(t.every(e=>Qd(a,e))){l.push(t);continue}let e=t;for(let t=0;t<a.length&&e.length>2;t++){let n=a[t],r=a[(t+1)%a.length];e=Xd(e,e=>c*((r.x-n.x)*(e.y-n.y)-(r.y-n.y)*(e.x-n.x)))}(e.length>2?Math.abs(Zd(e)):0)>ad*r*r&&l.push(e)}return l}

// Original UTF-16 range 289971:290336
function Yd(e){let t=e.slice().sort((e,t)=>e.x-t.x||e.y-t.y),n=(e,t,n)=>(t.x-e.x)*(n.y-e.y)-(t.y-e.y)*(n.x-e.x),r=[];for(let e of t){for(;r.length>=2&&n(r[r.length-2],r[r.length-1],e)<=0;)r.pop();r.push(e)}let i=[];for(let e=t.length-1;e>=0;e--){let r=t[e];for(;i.length>=2&&n(i[i.length-2],i[i.length-1],r)<=0;)i.pop();i.push(r)}return r.pop(),i.pop(),r.concat(i)}

// Original UTF-16 range 290336:290536
function Xd(e,t){let n=[];for(let r=0;r<e.length;r++){let i=e[r],a=e[(r+1)%e.length],o=t(i),s=t(a);if(o>=0&&n.push(i),o>=0!=s>=0){let e=o/(o-s);n.push({x:i.x+e*(a.x-i.x),y:i.y+e*(a.y-i.y)})}}return n}

// Original UTF-16 range 290536:290647
function Zd(e){let t=0;for(let n=0,r=e.length-1;n<e.length;r=n++)t+=(e[r].x+e[n].x)*(e[r].y-e[n].y);return t/2}

// Original UTF-16 range 290647:290807
function Qd(e,t){let n=!1;for(let r=0,i=e.length-1;r<e.length;i=r++){let a=e[r],o=e[i];a.y>t.y!=o.y>t.y&&t.x<a.x+(t.y-a.y)*(o.x-a.x)/(o.y-a.y)&&(n=!n)}return n}

// Original UTF-16 range 290807:290853
function $d(e){return e.flatMap(e=>[e.x,e.y])}

// Original UTF-16 range 290853:291912
function ef(){if(Sd!=null)return Sd;let e=Td(0,1,0),t=.6799999999999999,n=e=>Wu*e**2.2,r=[],i=0,a=e-ld;for(let e=0;e<=J;e++){let o=e/J;if(r.push({x:i,y:a,angle:n(o)}),e===J)break;for(let e=0;e<sd;e++){let r=n(o+(e+.5)/sd/J);i+=Math.sin(r)*(t/J/sd),a+=Math.cos(r)*(t/J/sd)}}let o=e;for(let e=1;e<=fd;e++){let t=e/fd*md;for(let e=0;e<pd;e++){let n=e*Math.PI/16,r=Td(Math.sin(t)*Math.cos(n),Math.cos(t),Math.sin(t)*Math.sin(n))*Math.cos(t);r>o&&(o=r)}}let s=[];for(let e=0;e<=J;e++){let t=e/J,{x:n,y:i,angle:a}=r[e],c=i-(o+.01),l=Math.max(0,Math.min(1,1-c/dd)),u=cd+.05500000000000001*(1-t)*(1-t)+ud*l*l,d=Math.cos(a),f=-Math.sin(a);for(let e=0;e<od;e++){let t=2*Math.PI*e/od;s.push({x:n+u*Math.cos(t)*d,y:i+u*Math.cos(t)*f,z:u*Math.sin(t)})}}let c=s.length;s.push({x:r[J].x,y:r[J].y,z:0});let l=new Int32Array(27840),u=0,d=(e,t,n,r)=>{l.set([e,t,n,r],u),u+=4};for(let e=0;e<J;e++)for(let t=0;t<od;t++){let n=(t+1)%od,r=e*od,i=(e+1)*od;d(r+t,r+n,i+n,1),d(r+t,i+n,i+t,1)}let f=3456;for(let e=0;e<od;e++)d(c,f+e,f+(e+1)%od,2);return Sd={vertices:s,triangles:l},Sd}

// Original UTF-16 range 291912:293358
function tf(e,t,n){let{vertices:r,triangles:i}=ef(),a=n/2,o=Nd(n),s=r.map(e),c=s.map(e=>({x:a+o*e.x,y:a-o*e.y})),l=n,u=n,d=0,f=0;for(let e=0;e<i.length;e+=4)for(let t=0;t<3;t++){let n=c[i[e+t]];l=Math.min(l,n.x-1),u=Math.min(u,n.y-1),d=Math.max(d,n.x+1),f=Math.max(f,n.y+1)}l=Math.max(0,Math.floor(l)),u=Math.max(0,Math.floor(u)),d=Math.min(n,Math.ceil(d)),f=Math.min(n,Math.ceil(f));let p=Math.max(1,d-l),m=Math.max(1,f-u);if(p<2||m<2)return null;let h=new Uint8Array(p*m),g=new Float32Array(p*m).fill(-1e9),_=nf(t);for(let e=0;e<i.length;e+=4){let t=s[i[e]],n=s[i[e+1]],r=s[i[e+2]],a=c[i[e]],o=c[i[e+1]],m=c[i[e+2]],v=(o.y-m.y)*(a.x-m.x)+(m.x-o.x)*(a.y-m.y);if(Math.abs(v)<1e-8)continue;let y=Math.max(u,Math.floor(Math.min(a.y,o.y,m.y))),b=Math.min(f-1,Math.ceil(Math.max(a.y,o.y,m.y))),x=a,S=o,C=m;x.y>S.y&&([x,S]=[S,x]),S.y>C.y&&([S,C]=[C,S]),x.y>S.y&&([x,S]=[S,x]);let w=(e,t,n)=>t.y-e.y<1e-9?t.x:e.x+(t.x-e.x)*(n-e.y)/(t.y-e.y);for(let s=y;s<=b;s++){let c=s+.5,f=Math.max(x.y,Math.min(C.y,c)),y=w(x,C,f),b=f<=S.y?w(x,S,f):w(S,C,f),T=Math.max(l,Math.floor(Math.min(y,b))-1),E=Math.min(d-1,Math.ceil(Math.max(y,b))+1);for(let d=T;d<=E;d++){let f=d+.5,y=((o.y-m.y)*(f-m.x)+(m.x-o.x)*(c-m.y))/v,b=((m.y-a.y)*(f-m.x)+(a.x-m.x)*(c-m.y))/v,x=1-y-b;if(y<0||b<0||x<0)continue;let S={x:y*t.x+b*n.x+x*r.x,y:y*t.y+b*n.y+x*r.y,z:y*t.z+b*n.z+x*r.z},C=(s-u)*p+(d-l);S.z<=g[C]||_(S)||(g[C]=S.z,h[C]=i[e+3])}}}return{left:l,top:u,width:p,height:m,paint:h}}

// Original UTF-16 range 293358:293654
function nf(e){let{least:t,most:n}=Ed(),r=e(vd);return i=>{if(i.x*i.x+i.y*i.y>=Hu*Hu)return!1;let a=e({x:i.x,y:i.y,z:0});for(let e=i.z+hd;e<=Hu;e+=gd){let o=Math.hypot(i.x,i.y,e);if(o<t)return!0;if(o>n){if(e>=0)return!1;continue}if(o<=Dd({x:a.x+e*r.x,y:a.y+e*r.y,z:a.z+e*r.z}))return!0}return!1}}

// Original UTF-16 range 293658:293707
var rf=new Set([`path`,`use`,`rect`,`stop`,`circle`]);

// Original UTF-16 range 293708:293720
var af=/[&<>"]/g;

// Original UTF-16 range 293721:293772
var of={"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`};

// Original UTF-16 range 293773:293827
function Y(e,t,n=[]){return{tag:e,attrs:t,children:n}}

// Original UTF-16 range 293827:293949
function sf(e,t,n,r){return Y(`svg`,{xmlns:`http://www.w3.org/2000/svg`,id:t,width:n,height:n,viewBox:`0 0 ${e} ${e}`},r)}

// Original UTF-16 range 293949:294156
function cf(e){let t=``;for(let[n,r]of Object.entries(e.attrs))t+=` ${n}="${String(r).replace(af,e=>of[e])}"`;return rf.has(e.tag)?`<${e.tag}${t}/>`:`<${e.tag}${t}>${e.children.map(cf).join(``)}</${e.tag}>`}

// Original UTF-16 range 294160:294166
var lf=144;

// Original UTF-16 range 294167:294177
var uf=184/256;

// Original UTF-16 range 294178:294192
var df=180/Math.PI;

// Original UTF-16 range 294193:294200
var ff=16e6;

// Original UTF-16 range 294201:294206
var pf=.6;

// Original UTF-16 range 294207:294213
var mf=256;

// Original UTF-16 range 294214:294237
var hf=new Set([`pumpkin`]);

// Original UTF-16 range 294238:294248
var gf=new Map;

// Original UTF-16 range 294249:294253
var _f=0;

// Original UTF-16 range 294254:294264
var vf=new Map;

// Original UTF-16 range 294265:294825
function yf(e,t,n,r={}){let i=Math.max(8,Math.round(n*e.zoom/uf)),a=Math.max(i,lf),o=Cf(e,n),{body:s,eyes:c,stem:l}=Df(e.body,o,a,e.eyes),[u,d,f,p]=Mf(e,n,i,a),m=`matrix(${If(u)} 0 0 ${If(d)} ${If(f)} ${If(p)})`,h=r.isProof===!0&&e.body!==`pumpkin`?cu(e.body,o,a,t.ink):null;if(e.glow!=null){let t=Pf(e.glow,a);return{size:n,sprite:a,transform:m,body:[...s,...l.map(e=>e.d)],bodyFill:t,eyes:[],eyeFill:null,proof:h,stem:[]}}let g=t.cutout?null:ka(t),_=e.eyes==null?[]:c;return{size:n,sprite:a,transform:m,body:s,bodyFill:Oa(t),eyes:_,eyeFill:g,proof:h,stem:l}}

// Original UTF-16 range 294825:295240
function bf(e,t){let n=Math.max(8,Math.round(t*e.zoom/uf)),r=Math.max(n,lf),i=Cf(e,t),{body:a,eyes:o,stem:s}=Df(e.body,i,r,e.eyes),[c,l,u,d]=Mf(e,t,n,r),f=([e,t])=>[c*e+u,l*t+d],p=e=>Nf(e).map(e=>e.map(f)),m=s.map(e=>({fill:e.fill,loops:p(e.d)}));return{center:[c*r/2+u,l*r/2+d],radius:e.zoom*t/2,body:[...a.flatMap(p),...m.flatMap(({loops:e})=>e)],eyes:e.eyes==null?[]:o.flatMap(p),...m.length===0?{}:{painted:m}}}

// Original UTF-16 range 295240:296473
function xf(e,t,n=e.size){let r=e.sprite,i=`${t}-body`,a={maskUnits:`userSpaceOnUse`,x:0,y:0,width:r,height:r},o=t=>e.eyes.map(e=>Y(`path`,{d:e,fill:t})),s=e.body.map(e=>Y(`path`,{d:e})),c=[Y(`g`,{id:i},s)],l={},u=[];e.eyes.length>0&&e.eyeFill==null?(c.push(Y(`mask`,{id:`${t}-holes`,...a},[Y(`rect`,{width:r,height:r,fill:`#fff`}),...o(`#000`)])),l={mask:`url(#${t}-holes)`}):e.eyes.length>0&&e.eyeFill!=null&&(c.push(Y(`mask`,{id:`${t}-inside`,...a},[Y(`use`,{href:`#${i}`,fill:`#fff`})])),u.push(Y(`g`,{mask:`url(#${t}-inside)`},o(e.eyeFill))));let d;if(e.proof!=null)c.push(Y(`clipPath`,{id:`${t}-solid`},s)),d=Y(`g`,{"clip-path":`url(#${t}-solid)`,...l},[Y(`use`,{href:`#${i}`,fill:e.proof.baseFill}),...e.proof.faces.map(e=>Y(`path`,{d:e.d,fill:e.fill}))]);else if(typeof e.bodyFill==`string`)d=Y(`use`,{href:`#${i}`,fill:e.bodyFill,...l});else{let{cx:n,cy:r,r:a,stops:o}=e.bodyFill;c.push(Y(`radialGradient`,{id:`${t}-glow`,gradientUnits:`userSpaceOnUse`,cx:n,cy:r,r:a},o.map(e=>Y(`stop`,{offset:e.offset,"stop-color":e.color})))),d=Y(`use`,{href:`#${i}`,fill:`url(#${t}-glow)`,...l})}let f=e.stem.map(({d:e,fill:t})=>Y(`path`,{d:e,fill:t}));return sf(e.size,t,n,[Y(`defs`,{},c),Y(`g`,{transform:e.transform},[d,...u,...f])])}

// Original UTF-16 range 296473:296580
function Sf(e,t=0){let n=fr(e);return wf(n[8]>=0?n:[-n[0],n[1],-n[2],-n[3],n[4],-n[5],-n[6],n[7],-n[8]],t)}

// Original UTF-16 range 296580:296668
function Cf(e,t){let n=Tf(t,e.zoom);return hf.has(e.body)?wf(fr(e.quat),n):Sf(e.quat,n)}

// Original UTF-16 range 296668:296786
function wf(e,t){let[n,r,i]=mr(e),a=e=>t>0?Math.round(e/t)*t:e;return{yaw:Ef(a(r*df)),pitch:Ef(a(n*df)),roll:a(i*df)}}

// Original UTF-16 range 296786:296868
function Tf(e,t){let n=pf/Math.max(e*t/2,1)*df;return 2**Math.floor(Math.log2(n))}

// Original UTF-16 range 296868:296957
function Ef(e){let t=(e%180+180)%180;return Math.abs(t-90)>=.5?e:e+(t<=90?89.5-t:90.5-t)}

// Original UTF-16 range 296957:297212
function Df(e,t,n,r){if(e===`pumpkin`){let e=Pd(t,n),i=r==null?[]:Fd(e,t,n,$a(r));return{body:[Tl([e.body])],eyes:i.map(e=>Tl([e])),stem:Id(e.stem).map(({fill:e,polygons:t})=>({d:Tl(t),fill:e}))}}return{body:kf(e,t,n),eyes:r==null?[]:Of(e,t,n,r),stem:[]}}

// Original UTF-16 range 297212:297481
function Of(e,t,n,r){let i=`${e} ${n} ${t.yaw} ${t.pitch} ${t.roll} ${JSON.stringify(r)}`,a=vf.get(i);if(a!=null)return vf.delete(i),vf.set(i,a),a;let o=wc(Ps(e),t,n,Qa(e,r)).map(e=>Tl([e]));if(vf.set(i,o),vf.size>mf)for(let e of vf.keys()){vf.delete(e);break}return o}

// Original UTF-16 range 297481:297849
function kf(e,t,n){let r=Ps(e),i=r.silhouette.kind===`solid`?r.silhouette.yawPeriod:null,{pitch:a,roll:o}=t,s=i==null?t.yaw:t.yaw-i*Math.floor(t.yaw/i),c=`${e} ${n} ${s} ${a} ${o}`,l=gf.get(c);if(l!=null)return gf.delete(c),gf.set(c,l),l;let u=jf(Cc(r,{yaw:s,pitch:a,roll:o},n));gf.set(c,u),_f+=Af(u);for(let[e,t]of gf){if(_f<=ff)break;gf.delete(e),_f-=Af(t)}return u}

// Original UTF-16 range 297849:297901
function Af(e){return e.reduce((e,t)=>e+t.length,0)}

// Original UTF-16 range 297901:297979
function jf(e){if(e.length===1)return[Tl(e)];let t=El(e);return t===``?[]:[t]}

// Original UTF-16 range 297979:298147
function Mf(e,t,n,r){let i=t/2,a=i+e.offset[0]*e.zoom*i,o=i-e.offset[1]*e.zoom*i,s=o-e.squashAnchor*e.zoom*i,[c,l]=e.squash,u=n/r;return[c*u,l*u,a-c*n/2,s+l*(o-n/2-s)]}

// Original UTF-16 range 298147:298376
function Nf(e){let t=[];for(let n of e.split(`Z`)){let e=n.replace(`M`,` `).trim().split(/\s+/).filter(e=>e!==``).map(Number);if(e.length<6)continue;let r=[];for(let t=0;t+1<e.length;t+=2)r.push([e[t],e[t+1]]);t.push(r)}return t}

// Original UTF-16 range 298376:298558
function Pf(e,t){let n=t/2;return{cx:n,cy:n,r:n,stops:[{offset:0,color:Ff(e.inner)},{offset:.42+e.midT*.16,color:Ff(e.mid)},{offset:.93,color:Ff(e.rim)},{offset:1,color:Ff(e.rim)}]}}

// Original UTF-16 range 298558:298660
function Ff(e){return`rgb(${Math.round(e[0]*255)}, ${Math.round(e[1]*255)}, ${Math.round(e[2]*255)})`}

// Original UTF-16 range 298660:298704
function If(e){return Math.round(e*1e6)/1e6}

// Original UTF-16 range 298708:298719
var X=Math.PI*2;

// Original UTF-16 range 298720:298727
var Lf=1e-7;

// Original UTF-16 range 298728:298735
var Rf=1e-7;

// Original UTF-16 range 298736:298742
var zf=720;

// Original UTF-16 range 298743:298866
function Bf({body:e,painted:t}){if(t==null)return e;let n=new Set(t.flatMap(({loops:e})=>e));return e.filter(e=>!n.has(e))}

// Original UTF-16 range 298866:298924
function Vf(e){return Array.from({length:e},(t,n)=>n/e*X)}

// Original UTF-16 range 298924:298988
function Hf(e,t){return e.flatMap(e=>e.map(([e,n])=>ap(t,e,n)))}

// Original UTF-16 range 298988:299078
function Uf(e){let t=e.flat().sort((e,t)=>e-t);return t.filter((e,n)=>n===0||e-t[n-1]>Lf)}

// Original UTF-16 range 299078:299204
function Wf(e,t,n){let r=rp(e,t),i=op(n.map(e=>ip(r,t,e)));return n.map((e,n)=>[t[0]+Math.cos(e)*i[n],t[1]+Math.sin(e)*i[n]])}

// Original UTF-16 range 299204:299378
function Gf(e,t,n){let[r,i]=t;return Array.from({length:n},(t,a)=>{let o=a/n*X,s=Math.cos(o),c=Math.sin(o),l=r===0||i===0?0:1/Math.hypot(s/r,c/i);return[e[0]+s*l,e[1]+c*l]})}

// Original UTF-16 range 299378:299579
function Kf(e,t,n){let r=e.map(([e,n])=>({angle:ap(t,e,n),reach:Math.hypot(e-t[0],n-t[1])})).sort((e,t)=>e.angle-t.angle);return n.map(e=>{let n=sp(r,e);return[t[0]+Math.cos(e)*n,t[1]+Math.sin(e)*n]})}

// Original UTF-16 range 299579:299881
function qf(e){let t=np(e)<0?[...e].reverse():e,n=cp(t,ep(t)),r=n==null?t:[n.point,...t.slice(n.edge+1),...t.slice(0,n.edge+1)],i=[0];for(let e=0;e<r.length;e++){let[t,n]=r[e],[a,o]=r[(e+1)%r.length];i.push(i[e]+Math.hypot(a-t,o-n))}let a=i[r.length]??0;return{points:r,stations:i.map(e=>a===0?0:e/a)}}

// Original UTF-16 range 299881:300104
function Jf({points:e,stations:t},n){if(e.length===0)return[];let r=0;return n.map(n=>{for(;r<e.length-1&&t[r+1]<n;)r++;let[i,a]=e[r],[o,s]=e[(r+1)%e.length],c=t[r+1]-t[r],l=c===0?0:(n-t[r])/c;return[i+(o-i)*l,a+(s-a)*l]})}

// Original UTF-16 range 300104:300160
function Yf(e){return Array.from({length:e},(t,n)=>n/e)}

// Original UTF-16 range 300160:300265
function Xf(e){let t=e.flat().filter(e=>e<1).sort((e,t)=>e-t);return t.filter((e,n)=>n===0||e-t[n-1]>Rf)}

// Original UTF-16 range 300265:300457
function Zf(e){let t=e.reduce((e,t)=>e+t.weight,0),[n]=e;return n==null||t===0?[]:n.outline.map((n,r)=>{let i=0,a=0;for(let{outline:t,weight:n}of e)i+=t[r][0]*n,a+=t[r][1]*n;return[i/t,a/t]})}

// Original UTF-16 range 300457:300535
function Qf(e,t,n){return e.map(([e,r],i)=>[e+(t[i][0]-e)*n,r+(t[i][1]-r)*n])}

// Original UTF-16 range 300535:300598
function $f(e,t){return Array.from({length:t},()=>[e[0],e[1]])}

// Original UTF-16 range 300598:300710
function ep(e){if(e.length===0)return[0,0];let t=0,n=0;for(let[r,i]of e)t+=r,n+=i;return[t/e.length,n/e.length]}

// Original UTF-16 range 300710:300801
function tp(e){return e.length===0?``:`M${e.map(([e,t])=>`${lp(e)} ${lp(t)}`).join(`L`)}Z`}

// Original UTF-16 range 300801:300912
function np(e){let t=0;for(let n=0;n<e.length;n++){let[r,i]=e[n],[a,o]=e[(n+1)%e.length];t+=r*o-a*i}return t/2}

// Original UTF-16 range 300912:301243
function rp(e,t){let n=Array.from({length:zf},()=>[]);for(let r of e)for(let e=0;e<r.length;e++){let i=r[e],a=r[(e+1)%r.length],o=ap(t,i[0],i[1]),s=ap(t,a[0],a[1])-o;s>Math.PI&&(s-=X),s<-Math.PI&&(s+=X);let c=Math.floor((s<0?o+s:o)/X*zf)-1,l=Math.floor((s<0?o:o+s)/X*zf)+1;for(let e=c;e<=l;e++)n[(e%zf+zf)%zf].push([i,a])}return n}

// Original UTF-16 range 301243:301509
function ip(e,[t,n],r){let i=Math.cos(r),a=Math.sin(r),o=NaN;for(let[[s,c],[l,u]]of e[Math.floor(r/X*zf)%zf]){let e=l-s,r=u-c,d=i*r-a*e;if(Math.abs(d)<1e-12)continue;let f=s-t,p=c-n,m=(f*r-p*e)/d,h=(f*a-p*i)/d;m>=0&&h>=-1e-9&&h<=1.000000001&&!(m<=o)&&(o=m)}return o}

// Original UTF-16 range 301509:301577
function ap(e,t,n){let r=Math.atan2(n-e[1],t-e[0]);return r<0?r+X:r}

// Original UTF-16 range 301577:301853
function op(e){let t=e.length,n=e.flatMap((e,t)=>Number.isNaN(e)?[]:[t]);return n.length===0?e.map(()=>0):e.map((r,i)=>{if(!Number.isNaN(r))return r;let a=n.find(e=>e>i)??n[0]+t,o=[...n].reverse().find(e=>e<i)??(n.at(-1)??0)-t,s=(i-o)/(a-o);return e[(o+t)%t]*(1-s)+e[a%t]*s})}

// Original UTF-16 range 301853:302080
function sp(e,t){let n=e.length;if(n===0)return 0;let r=e.findIndex(e=>e.angle>=t);r<0&&(r=0);let i=e[r],a=e[(r-1+n)%n],o=(i.angle-a.angle+X)%X;if(o===0)return i.reach;let s=(t-a.angle+X)%X/o;return a.reach+(i.reach-a.reach)*s}

// Original UTF-16 range 302080:302302
function cp(e,[t,n]){let r=null;for(let i=0;i<e.length;i++){let[a,o]=e[i],[s,c]=e[(i+1)%e.length];if(o===c||(o-n)*(c-n)>0)continue;let l=a+(n-o)/(c-o)*(s-a);l>=t&&(r==null||l>r.point[0])&&(r={edge:i,point:[l,n]})}return r}

// Original UTF-16 range 302302:302354
function lp(e){return String(Math.round(e*100)/100)}

// Original UTF-16 range 302358:302366
var up=[1,1];

// Original UTF-16 range 302367:302860
function dp(e,t){let n=e.length,r=-1;for(let t=0;t<n&&r<0;t++)e[t][2]<=0&&e[(t+1)%n][2]>0&&(r=t);if(r<0)return n===0||e[0][2]<=0?null:e.map(([e,t])=>({kind:`line`,to:[e,t]}));let i=[],a=[1,0],o=null;for(let s=0;s<n;s++){let c=e[(r+s)%n],l=e[(r+s+1)%n],u=c[2]>0,d=l[2]>0;if(u&&d)i.push({kind:`line`,to:[l[0],l[1]]});else if(u)o=gp(c,l),i.push({kind:`line`,to:o});else if(d){let e=gp(c,l);o===null?a=e:i.push(_p(o,e,t)),i.push({kind:`line`,to:[l[0],l[1]]})}}return o!==null&&i.push(_p(o,a,t)),i}

// Original UTF-16 range 302860:303370
function fp(e,t){let n=vp(e,t),r=n.length;if(n.every(e=>e.isInside))return e;let i=-1;for(let e=0;e<r&&i<0;e++)n[e].isInside&&!n[(e+r-1)%r].isInside&&(i=e);if(i<0){let e=n.reduce((e,t)=>e+t.sweep,0);return Math.abs(e)>Math.PI?mp(t,Math.sign(e)):null}let a=[],o=null,s=0;for(let e=0;e<r;e++){let c=n[(i+e)%r];c.isInside?(o!==null&&a.push({kind:`arc`,to:c.from,radii:t,sweep:s}),o=null,a.push(c.segment)):(o===null&&(o=c.from,s=0),s+=c.sweep)}return o!==null&&a.push({kind:`arc`,to:n[i].from,radii:t,sweep:s}),a}

// Original UTF-16 range 303370:303789
function pp(e,t){let n=t=>t.kind===`arc`&&t.radii[0]===e[0]&&t.radii[1]===e[1],r=[],i=[],a=[],o=[];for(let e of t){let t=e.findIndex(n);if(t<0){r.push(e);continue}let s=e[t].to,c=[],l=s;for(let r=1;r<=e.length;r++){let u=e[(t+r)%e.length];n(u)?(a.push({from:l,sweep:u.sweep}),o.push(l,u.to),c.length>0&&i.push(xp(s,c)),c=[],s=u.to):c.push(u),l=u.to}}return a.length===0?[mp(e,1),...r]:[...wp([...i,...Sp(e,a,o)]),...r]}

// Original UTF-16 range 303789:303913
function mp(e,t){return[{kind:`arc`,to:[-e[0],0],radii:e,sweep:t*Math.PI},{kind:`arc`,to:[e[0],0],radii:e,sweep:t*Math.PI}]}

// Original UTF-16 range 303913:304025
function hp(e,t){let n=Math.cos(t),r=Math.sin(t),i=1/Math.sqrt(n*n/(e[0]*e[0])+r*r/(e[1]*e[1]));return[i*n,i*r]}

// Original UTF-16 range 304025:304144
function gp(e,t){let n=e[2]/(e[2]-t[2]),r=e[0]+(t[0]-e[0])*n,i=e[1]+(t[1]-e[1])*n,a=Math.sqrt(r*r+i*i);return[r/a,i/a]}

// Original UTF-16 range 304144:304258
function _p(e,t,n){return{kind:`arc`,to:t,radii:up,sweep:Ep(Math.atan2(t[1],t[0])-n)-Ep(Math.atan2(e[1],e[0])-n)}}

// Original UTF-16 range 304258:305054
function vp(e,t){let n=1/(t[0]*t[0]),r=1/(t[1]*t[1]),i=e=>n*e[0]*e[0]+r*e[1]*e[1]-1,a=[],o=e[e.length-1].to;for(let t of e){if(t.kind===`line`){let e=yp(o,t.to,n,r),s=o;for(let n=0;n<=e.length;n++){let r=n===0?0:e[n-1],c=n===e.length?1:e[n],l=n===e.length?t.to:Tp(o,t.to,c);a.push({from:s,segment:{kind:`line`,to:l},sweep:Math.atan2(s[0]*l[1]-s[1]*l[0],s[0]*l[0]+s[1]*l[1]),isInside:i(Tp(o,t.to,(r+c)/2))<0}),s=l}}else{let e=t.radii[0],s=Math.atan2(o[1],o[0]),c=bp(e,s,t.sweep,n,r),l=o;for(let n=0;n<=c.length;n++){let r=n===0?0:c[n-1],o=n===c.length?1:c[n],u=s+t.sweep*o,d=n===c.length?t.to:[e*Math.cos(u),e*Math.sin(u)],f=s+t.sweep*(r+o)/2,p=t.sweep*(o-r);a.push({from:l,segment:{kind:`arc`,to:d,radii:t.radii,sweep:p},sweep:p,isInside:i([e*Math.cos(f),e*Math.sin(f)])<0}),l=d}}o=t.to}return a}

// Original UTF-16 range 305054:305289
function yp(e,t,n,r){let i=t[0]-e[0],a=t[1]-e[1],o=n*i*i+r*a*a,s=n*e[0]*i+r*e[1]*a,c=n*e[0]*e[0]+r*e[1]*e[1]-1,l=s*s-o*c;if(o===0||l<=0)return[];let u=Math.sqrt(l),d=-(s+(s<0?-u:u));return[d/o,c/d].filter(e=>e>0&&e<1).sort((e,t)=>e-t)}

// Original UTF-16 range 305289:305540
function bp(e,t,n,r,i){if(r===i||n===0)return[];let a=(1/(e*e)-i)/(r-i);if(!(a>0&&a<1))return[];let o=Math.acos(Math.sqrt(a)),s=[];for(let e of[o,-o,Math.PI-o,Math.PI+o]){let r=Dp(n>0?e-t:t-e)/Math.abs(n);r>0&&r<1&&s.push(r)}return s.sort((e,t)=>e-t)}

// Original UTF-16 range 305540:305722
function xp(e,t){let n=[e,...t.map(e=>e.to)],r=t.map((e,t)=>e.kind===`line`?{kind:`line`,to:n[t]}:{...e,to:n[t],sweep:-e.sweep}).reverse();return{from:n[n.length-1],to:e,segments:r}}

// Original UTF-16 range 305722:306114
function Sp(e,t,n){let r=n.map(e=>({point:e,angle:Dp(Math.atan2(e[1],e[0]))})).sort((e,t)=>e.angle-t.angle),i=[];for(let n=0;n<r.length;n++){let a=r[n],o=r[(n+1)%r.length],s=n+1<r.length?o.angle-a.angle:o.angle+2*Math.PI-a.angle;if(s<=0)continue;let c=a.angle+s/2;t.reduce((e,t)=>e+Cp(t,c),0)===0&&i.push({from:a.point,to:o.point,segments:[{kind:`arc`,to:o.point,radii:e,sweep:s}]})}return i}

// Original UTF-16 range 306114:306242
function Cp(e,t){let n=Math.atan2(e.from[1],e.from[0]);return(e.sweep>0?Dp(t-n):Dp(n-t))<Math.abs(e.sweep)?Math.sign(e.sweep):0}

// Original UTF-16 range 306242:306550
function wp(e){let t=e=>`${e[0]} ${e[1]}`,n=new Map;for(let r of e){let e=n.get(t(r.from));e===void 0?n.set(t(r.from),[r]):e.push(r)}let r=new Set,i=[];for(let a of e){let e=[],o=a;for(;o!==void 0&&!r.has(o);)r.add(o),e.push(...o.segments),o=n.get(t(o.to))?.find(e=>!r.has(e));e.length>0&&i.push(e)}return i}

// Original UTF-16 range 306550:306615
function Tp(e,t,n){return[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n]}

// Original UTF-16 range 306615:306675
function Ep(e){return e-2*Math.PI*Math.round(e/(2*Math.PI))}

// Original UTF-16 range 306675:306735
function Dp(e){let t=e%(2*Math.PI);return t<0?t+2*Math.PI:t}

// Original UTF-16 range 306739:306745
var Op=.02;

// Original UTF-16 range 306746:306751
var kp=16;

// Original UTF-16 range 306752:306759
var Ap=.015;

// Original UTF-16 range 306760:306766
var jp=400;

// Original UTF-16 range 306767:306773
var Mp=512;

// Original UTF-16 range 306774:306778
var Np=5;

// Original UTF-16 range 306779:306789
var Pp=new Map;

// Original UTF-16 range 306790:307113
function Fp(e,t){let n=Math.min(kp,Math.max(0,Math.ceil(Math.log2(Math.max(t,1))))),r=`${n}|${e.wid}|${e.oval.join()}|${e.ovalMix}|${e.pts.join()}`,i=Pp.get(r);if(i!==void 0)return Pp.delete(r),Pp.set(r,i),i;let a=zp(Ip(e),Op/2**n);if(Pp.set(r,a),Pp.size>Mp){let e=Pp.keys().next();e.done!==!0&&Pp.delete(e.value)}return a}

// Original UTF-16 range 307113:307464
function Ip(e){let[t,n]=e.oval,r=t>1e-5&&n>1e-5?e.ovalMix>1e-4?Math.min(1,e.ovalMix):Bp(0,.08,Math.min(t,n)):0,i=Math.max(0,e.pts.length-1),a=new Float64Array(i*Np);for(let t=0;t<i;t++){let[n,r]=e.pts[t],i=e.pts[t+1][0]-n,o=e.pts[t+1][1]-r,s=i*i+o*o;a.set([n,r,i,o,s>0?1/s:0],t*Np)}return{segments:a,halfWidth:e.wid>0?e.wid:-1,rx:t,ry:n,ellipseMix:r}}

// Original UTF-16 range 307464:307657
function Lp(e,t,n){let r=Rp(e.segments,t,n)-e.halfWidth;if(e.ellipseMix===0)return r;let i=t/e.rx,a=n/e.ry,o=(Math.sqrt(i*i+a*a)-1)*Math.min(e.rx,e.ry);return r*(1-e.ellipseMix)+o*e.ellipseMix}

// Original UTF-16 range 307657:307850
function Rp(e,t,n){let r=1e6;for(let i=0;i<e.length;i+=Np){let a=t-e[i],o=n-e[i+1],s=e[i+2],c=e[i+3],l=(a*s+o*c)*e[i+4],u=l<0?0:l>1?1:l,d=a-s*u,f=o-c*u,p=d*d+f*f;p<r&&(r=p)}return Math.sqrt(r)}

// Original UTF-16 range 307850:308464
function zp(e,t){let n=1/0,r=1/0,i=-1/0,a=-1/0,o=1/0,{segments:s,halfWidth:c}=e;if(c>0&&e.ellipseMix<1&&s.length>0){for(let e=0;e<s.length;e+=Np)for(let[t,o]of[[s[e],s[e+1]],[s[e]+s[e+2],s[e+1]+s[e+3]]])n=Math.min(n,t-c),r=Math.min(r,o-c),i=Math.max(i,t+c),a=Math.max(a,o+c);o=c}if(e.ellipseMix>0&&(n=Math.min(n,-e.rx),r=Math.min(r,-e.ry),i=Math.max(i,e.rx),a=Math.max(a,e.ry),o=Math.min(o,e.rx,e.ry)),!(i>n&&a>r))return[];let l=Math.max(Math.min(Ap,o/3),Math.max(i-n,a-r)/jp);return Cu((t,n)=>Lp(e,t,n),{x0:n-2*l,y0:r-2*l,step:l,nx:Math.ceil((i-n)/l)+4,ny:Math.ceil((a-r)/l)+4},{deviation:t,edge:Math.sqrt(4*t)})}

// Original UTF-16 range 308464:308544
function Bp(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}

// Original UTF-16 range 308548:308553
var Vp=48;

// Original UTF-16 range 308554:308559
var Hp=11;

// Original UTF-16 range 308560:308567
var Up=.055;

// Original UTF-16 range 308568:308583
var Wp=Math.PI*.999;

// Original UTF-16 range 308584:308589
var Gp=.4;

// Original UTF-16 range 308590:308598
var Kp=.0035;

// Original UTF-16 range 308599:308605
var qp=.75;

// Original UTF-16 range 308606:308612
var Jp=.45;

// Original UTF-16 range 308613:308619
var Yp=1.8;

// Original UTF-16 range 308620:308625
var Xp=.8;

// Original UTF-16 range 308626:308639
var Zp=Cr.map(om);

// Original UTF-16 range 308640:308646
var Qp=192;

// Original UTF-16 range 308647:308660
var $p=Math.PI/48;

// Original UTF-16 range 308661:309155
function em(e,t,n,r={}){let i=e.zoom*n/2,[a,o]=e.squash;if(i===0||a===0||o===0)return{size:n,body:``,eyes:``,glow:null,proof:null};let s=[Math.abs(a),Math.abs(o)],c=n/2+i*e.offset[0],l=n/2-i*(e.squashAnchor*(1-o)+e.offset[1]),u=e=>`${ym(c+e[0]*i)} ${ym(l-e[1]*i)}`,d=e=>e.map(e=>sm(e,u,Math.abs(i))).join(``),f=tm(e,Math.abs(i));return{size:n,body:d(t.cutout?pp(s,f):[mp(s,1)]),eyes:t.cutout?``:d(f),glow:e.glow===null?null:lm(e.glow,s,u,Math.abs(i)),proof:r.isProof===!0?um(e,t,s,u,i,n):null}}

// Original UTF-16 range 309155:309394
function tm(e,t){if(e.eyes===null)return[];let n=fr(e.quat),r=[Math.abs(e.squash[0]),Math.abs(e.squash[1])],i=r[0]<1||r[1]<1,a=[];return e.eyes.forEach((e,o)=>{for(let s of am(e,Cr[o],Zp[o],n,t)){let e=i?fp(s,r):s;e!==null&&a.push(e)}}),a}

// Original UTF-16 range 309394:309657
function nm(e,t){let n=e.zoom*t/2,[r,i]=e.squash,a=[t/2+n*e.offset[0],t/2-n*(e.squashAnchor*(1-i)+e.offset[1])],o=Math.abs(n),s=([e,t])=>[a[0]+e*n,a[1]-t*n];return{center:a,radius:o,body:[Gf(a,[Math.abs(r)*o,Math.abs(i)*o],Qp)],eyes:tm(e,o).map(e=>rm(e).map(s))}}

// Original UTF-16 range 309657:309900
function rm(e){let t=[],n=e[e.length-1]?.to??[0,0];for(let r of e){if(r.kind===`arc`){let e=Math.atan2(n[1],n[0]),i=Math.max(1,Math.ceil(Math.abs(r.sweep)/$p));for(let n=1;n<i;n++)t.push(hp(r.radii,e+r.sweep*n/i))}t.push(r.to),n=r.to}return t}

// Original UTF-16 range 309900:310729
function im(e,t,n=`grok-sphere`,r=e.size){let i=[],a=[],o=Oa(t);if(e.glow?.halo!=null&&(i.push(_m(`${n}-halo`,e.glow.halo.gradient)),a.push(Y(`path`,{d:e.glow.halo.d,fill:`url(#${n}-halo)`,"fill-rule":`evenodd`}))),e.proof===null?e.glow!==null&&(o=`url(#${n}-body)`,i.push(_m(`${n}-body`,e.glow.body))):(o=`url(#${n}-light)`,i.push(_m(`${n}-light`,e.proof.light),Y(`clipPath`,{id:`${n}-proof`},[Y(`path`,{d:e.body,"clip-rule":`evenodd`})]))),a.push(Y(`path`,{d:e.body,fill:o,"fill-rule":`evenodd`})),e.eyes!==``&&a.push(Y(`path`,{d:e.eyes,fill:ka(t)})),e.proof!==null){let t=e.proof.lines.filter(e=>e.d!==``).map(e=>Y(`path`,{d:e.d,fill:`none`,stroke:e.color,"stroke-width":ym(e.width),"stroke-opacity":e.opacity}));a.push(Y(`g`,{"clip-path":`url(#${n}-proof)`},t))}return sf(e.size,n,r,[...i.length>0?[Y(`defs`,{},i)]:[],...a])}

// Original UTF-16 range 310729:311211
function am(e,t,n,r,i){let a=Fp(e,i*Math.max(1,e.lidY));if(a.length===0)return[];let o=L(r,t.M),s=L(r,t.C),c=L(r,t.T),l=Math.atan2(o[1],o[0]),u=Math.cos(e.tilt),d=Math.sin(e.tilt),[f,p]=e.off,m=([t,n])=>{let r=n*e.lidY,i=f+u*t+d*r,a=p-d*t+u*r,l=Math.sqrt(i*i+a*a),m=l>1e-12?Math.sin(l)/l:1,h=Math.cos(l);return[h*o[0]+m*(i*s[0]+a*c[0]),h*o[1]+m*(i*s[1]+a*c[1]),h*o[2]+m*(i*s[2]+a*c[2])]},h=[];for(let e of a){let t=e.map(m);n&&t.reverse();let r=dp(t,l);r!==null&&h.push(r)}return h}

// Original UTF-16 range 311211:311345
function om({M:e,T:t,C:n}){let r=[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]];return r[0]*e[0]+r[1]*e[1]+r[2]*e[2]<0}

// Original UTF-16 range 311345:311481
function sm(e,t,n){let r=e[e.length-1].to,i=`M${t(r)}`;for(let a of e)i+=a.kind===`line`?`L${t(a.to)}`:cm(r,a,t,n),r=a.to;return`${i}Z`}

// Original UTF-16 range 311481:311753
function cm(e,t,n,r){if(t.sweep===0)return``;if(Math.abs(t.sweep)>Wp){let i=t.sweep/2,a=hp(t.radii,Math.atan2(e[1],e[0])+i);return cm(e,{...t,to:a,sweep:i},n,r)+cm(a,{...t,sweep:i},n,r)}return`A${`${ym(t.radii[0]*r)} ${ym(t.radii[1]*r)}`} 0 0 ${t.sweep>0?0:1} ${n(t.to)}`}

// Original UTF-16 range 311753:312246
function lm(e,t,n,r){let i=.42+.16*e.midT,a=[];for(let t=0;t<=Vp;t++){let n=1-(1-t/Vp)**2;a.push({offset:n,color:Da(hm(e,i,n)),opacity:1})}let o={transform:gm(t,n,r),focus:0,stops:a};if(!(e.halo>0))return{body:o,halo:null};let s=[];for(let t=0;t<=Hp;t++){let n=Up*t/Hp,r=Math.min(1,e.halo*(1-vm(0,Up,n)));s.push({offset:(1+n)/1.055,color:Da(e.rim),opacity:r})}let c=[t[0]*1.055,t[1]*1.055];return{body:o,halo:{d:sm(mp(c,1),n,r)+sm(mp(t,1),n,r),gradient:{transform:gm(c,n,r),focus:0,stops:s}}}}

// Original UTF-16 range 312246:312704
function um(e,t,n,r,i,a){let o=fr(e.quat),s=``,c=``;for(let e of ql){let t=Yl(e,o);t!==null&&(e.isEquator?c+=dm(t,r,i):s+=dm(t,r,i))}let l=pm(t.ink,[1,1,1],Gp),u=Zl(),d=.2126*l[0]+.7152*l[1]+.0722*l[2]>.6?`#000000`:`#ffffff`,f=Math.max(qp,a*Kp);return{light:{transform:fm(u,n,r,i),focus:u.focus,stops:u.stops.map(e=>({offset:e.offset,color:Da(pm([0,0,0],l,e.shade)),opacity:1}))},lines:[{d:s,color:d,width:f,opacity:Jp},{d:c,color:d,width:f*Yp,opacity:Xp}]}}

// Original UTF-16 range 312704:313324
function dm(e,t,n){let r=t=>[e.center[0]+e.a[0]*Math.cos(t)+e.b[0]*Math.sin(t),e.center[1]+e.a[1]*Math.cos(t)+e.b[1]*Math.sin(t)],i=.5*Math.atan2(2*mm(e.a,e.b),mm(e.a,e.a)-mm(e.b,e.b)),[a,o]=[Math.cos(i),Math.sin(i)],s=[e.a[0]*a+e.b[0]*o,e.a[1]*a+e.b[1]*o],c=[e.b[0]*a-e.a[0]*o,e.b[1]*a-e.a[1]*o],l=`${ym(Math.hypot(s[0],s[1])*Math.abs(n))} ${ym(Math.hypot(c[0],c[1])*Math.abs(n))}`,u=Math.round(Math.atan2(-s[1]*n,s[0]*n)*(180/Math.PI)*1e3)/1e3,d=e.a[0]*e.b[1]-e.a[1]*e.b[0]>0?0:1,f=Math.ceil((e.to-e.from)/Wp),p=`M${t(r(e.from))}`;for(let n=1;n<=f;n++)p+=`A${l} ${u} 0 ${d} ${t(r(e.from+(e.to-e.from)*n/f))}`;return p}

// Original UTF-16 range 313324:313525
function fm(e,t,n,r){let[i,a]=e.axisX,[o,s]=e.axisY,c=[i*t[0]*r,-a*t[1]*r,o*t[0]*r,-s*t[1]*r],l=n([e.origin[0]*t[0],e.origin[1]*t[1]]);return`matrix(${c.map(e=>Math.round(e*1e4)/1e4).join(` `)} ${l})`}

// Original UTF-16 range 313525:313609
function pm(e,t,n){return[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n]}

// Original UTF-16 range 313609:313653
function mm(e,t){return e[0]*t[0]+e[1]*t[1]}

// Original UTF-16 range 313653:313834
function hm(e,t,n){let r=vm(.12,t,n),i=vm(t,.93,n),a=.9+.1*Math.max(0,1-n*n)**.225,o=t=>{let n=e.inner[t]+(e.mid[t]-e.inner[t])*r;return(n+(e.rim[t]-n)*i)*a};return[o(0),o(1),o(2)]}

// Original UTF-16 range 313834:313913
function gm(e,t,n){return`matrix(${ym(e[0]*n)} 0 0 ${ym(e[1]*n)} ${t([0,0])})`}

// Original UTF-16 range 313913:314145
function _m(e,t){return Y(`radialGradient`,{id:e,gradientUnits:`userSpaceOnUse`,cx:0,cy:0,r:1,fx:t.focus,fy:0,gradientTransform:t.transform},t.stops.map(e=>Y(`stop`,{offset:e.offset,"stop-color":e.color,"stop-opacity":e.opacity})))}

// Original UTF-16 range 314145:314225
function vm(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}

// Original UTF-16 range 314225:314277
function ym(e){return String(Math.round(e*100)/100)}

// Original UTF-16 range 314281:314289
var bm=114.5;

// Original UTF-16 range 314290:314296
var xm=.62;

// Original UTF-16 range 314297:314302
var Sm=96;

// Original UTF-16 range 314303:314315
var Cm=Math.PI*2;

// Original UTF-16 range 314316:314440
var wm={dots:22,orbit:19,radar:19,progress:19,gather:19,wave:16,send:20,receive:20,dock:20,ball:18,pencil:17,bang:13,standby:13};

// Original UTF-16 range 314441:314589
var Tm={dots:1.5,orbit:1.14,radar:1.14,progress:1.32,gather:1.15,wave:1.42,send:1.12,receive:1.12,dock:1.3,ball:1.22,pencil:1.18,bang:1.28,standby:1.75};

// Original UTF-16 range 314590:314595
var Em=22;

// Original UTF-16 range 314596:314601
var Dm=62;

// Original UTF-16 range 314602:314608
var Om=.84;

// Original UTF-16 range 314609:314615
var km=.22;

// Original UTF-16 range 314616:314623
var Am=1.02;

// Original UTF-16 range 314624:314628
var jm=9;

// Original UTF-16 range 314629:314636
var Mm=1400;

// Original UTF-16 range 314637:314644
var Nm=1500;

// Original UTF-16 range 314645:314652
var Pm=1700;

// Original UTF-16 range 314653:314660
var Fm=2500;

// Original UTF-16 range 314661:314667
var Im=.68;

// Original UTF-16 range 314668:314676
var Lm=Fm*Im;

// Original UTF-16 range 314677:314683
var Rm=2.4;

// Original UTF-16 range 314684:314690
var zm=120;

// Original UTF-16 range 314691:314712
var Bm=Gi(`progress`)*1e3;

// Original UTF-16 range 314713:314734
var Vm=Gi(`spawning`)*1e3;

// Original UTF-16 range 314735:314749
var Hm=[-2,-1,1,2];

// Original UTF-16 range 314750:314765
var Um=e=>(e%1+1)%1;

// Original UTF-16 range 314766:314941
var Wm=(e,t)=>{let n=e.length,r=t/n*Math.PI*2,i=Math.cos(r),a=Math.sin(r);return Array.from({length:n},(r,o)=>{let[s,c]=e[((o-t)%n+n)%n],l=s-B,u=c-B;return[B+l*i-u*a,B+l*a+u*i]})};

// Original UTF-16 range 314942:315031
var Gm=Array.from({length:Sm},(e,t)=>{let n=t/Sm*Cm;return[B+Math.cos(n)*B,B+Math.sin(n)*B]});

// Original UTF-16 range 315032:315049
var Km=hs(88,18).ring;

// Original UTF-16 range 315050:315071
var qm=Wm(Km,Km.length/2);

// Original UTF-16 range 315072:315096
var Jm=e=>e===`pencil`?qm:Gm;

// Original UTF-16 range 315097:315228
var Ym=(e,t)=>{let n=e/2,r=B-t/2+n,i=B+t/2-n;return`M${B-n} ${r}A${n} ${n} 0 0 1 ${B+n} ${r}L${B+n} ${i}A${n} ${n} 0 0 1 ${B-n} ${i}Z`};

// Original UTF-16 range 315229:315372
var Xm=(e,t,n)=>{let r=e/2,i=t/2,a=B-n/2,o=B+n/2;return`M${B-r} ${a+r}A${r} ${r} 0 0 1 ${B+r} ${a+r}L${B+i} ${o-i}A${i} ${i} 0 0 1 ${B-i} ${o-i}Z`};

// Original UTF-16 range 315373:315385
var Zm=Ym(30,88);

// Original UTF-16 range 315386:315401
var Qm=Xm(30,17,96);

// Original UTF-16 range 315402:315461
var $m=(e,t,n,r,i)=>({type:`disc`,key:e,cx:t,cy:n,r,opacity:i});

// Original UTF-16 range 315462:315529
var eh=(e,t,n,r)=>({type:`ring`,key:e,cx:B,cy:B,r:t,width:n,opacity:r});

// Original UTF-16 range 315530:315592
var th=(e,t,n,r)=>({type:`shape`,key:e,d:t,transform:n,opacity:r});

// Original UTF-16 range 315593:315652
var nh=(e,t,n,r)=>({type:`stroke`,key:e,d:t,width:n,opacity:r});

// Original UTF-16 range 315653:315677
var rh={lift:0,pop:1,tone:1};

// Original UTF-16 range 315678:315857
var ih=(e,t,n,r)=>{let i=Um(e.stateTime*1e3/Mm+.119),a=Math.abs(i-t/3),o=Math.min(a,1-a),s=r?1:Math.exp(-(o*o)/.045),c=+!r;return{lift:s*jm*n*c,pop:1+c*(Om+km*s-1),tone:1-c*.5*(1-s)}};

// Original UTF-16 range 315858:315933
var ah=e=>.42+.29*Math.sin(e*.0021)*Math.sin(e*.0034)+.29*Math.sin(e*.0013+1.7);

// Original UTF-16 range 315934:315993
var oh=(e,t)=>ah(e)*(.55+.45*Math.sin(e*.012-Math.abs(t)*1.05));

// Original UTF-16 range 315994:316033
var sh=e=>-Math.PI*1.25+Wi(e)()*Math.PI*1.5;

// Original UTF-16 range 316034:316144
var ch=e=>{let t=.62,n=416/(t*t),r=Math.sqrt(80/n);if(e<r)return .5*n*e*e;let i=Um((e-r)/t);return 40-208*i*(1-i)};

// Original UTF-16 range 316145:316446
var lh=e=>{let t=Um(e/Fm);if(t<Im){let n=t/Im,r=n*n*(3-2*n),i=F(n/.08,0,1)*F((1-n)/.08,0,1);return{x:-54+118*r,y:26,wig:Math.sin(n*24)*3.2*i,rot:17+Math.sin(e*6e-4)*1}}let n=Un((t-Im)/.31999999999999995);return{x:64-118*n,y:26-20*Math.sin(n*Math.PI),wig:0,rot:17-2*Math.sin(n*Math.PI)+Math.sin(e*6e-4)*1}};

// Original UTF-16 range 316447:316495
var uh=e=>{let t=lh(e);return[B+t.x,B+t.y+t.wig+19]};

// Original UTF-16 range 316496:316661
var dh=(()=>{let e=[];for(let t=0;t<Lm;t++){let n=uh(t),r=e[e.length-1];(r===void 0||Math.hypot(n[0]-r.point[0],n[1]-r.point[1])>Rm)&&e.push({at:t,point:n})}return e})();

// Original UTF-16 range 316662:316865
var fh=e=>{let t=Um(e/Fm)*Fm,n=Math.min(t,Lm),r=dh.filter(e=>e.at<=n),i=n>(r.length>0?r[r.length-1].at:n)?[uh(n)]:[],a=[...r.map(e=>e.point),...i].slice(-64);return t<Lm?a:a.slice(Math.floor((t-Lm)/1e3*zm))};

// Original UTF-16 range 316866:317290
var ph=e=>{let t=e.length,n=`M${e[0][0].toFixed(1)} ${e[0][1].toFixed(1)}`;if(t===2)return n+`L${e[1][0].toFixed(1)} ${e[1][1].toFixed(1)}`;for(let r=0;r<t-1;r++){let i=e[Math.max(r-1,0)],a=e[r],o=e[r+1],s=e[Math.min(r+2,t-1)],c=a[0]+(o[0]-i[0])/6,l=a[1]+(o[1]-i[1])/6,u=o[0]-(s[0]-a[0])/6,d=o[1]-(s[1]-a[1])/6;n+=`C${c.toFixed(1)} ${l.toFixed(1)} ${u.toFixed(1)} ${d.toFixed(1)} ${o[0].toFixed(1)} ${o[1].toFixed(1)}`}return n};

// Original UTF-16 range 317291:317520
var mh=(e,t,n)=>{let r=[B-Dm,B+Dm],i=[];for(let a=0;a<2;a++){let o=F((e-a*.12)/(1-a*.12),0,1);if(o<=.004)continue;let s=I(o),c=Wn(o),l=ih(t,a===0?0:2,e,n);i.push($m(`dots.${a}`,B+(r[a]-B)*c,B-l.lift,Em*s*l.pop*Am,s*l.tone))}return i};

// Original UTF-16 range 317521:317771
var hh=(e,t)=>{let n=I(e),r=52*Wn(e),i=t.stateTime*1e3*.0017;return Array.from({length:5},(e,t)=>{let a=i+t*Math.PI*2/5,o=Math.cos(a),s=.5+.5*F(o,0,1);return $m(`orbit.${t}`,B+r*Math.sin(a),B-r*.42*Math.cos(a),Math.max(12*s*n,.3),F((o+.4)/.6,.18,1)*n)})};

// Original UTF-16 range 317772:317931
var gh=(e,t,n)=>{let r=I(e);return Array.from({length:3},(e,i)=>{let a=Um(t.stateTime*1e3/1300+i/3);return eh(`radar.${i}`,n+(104-n)*a,3.4*(1-a*.55),r*(1-a)*.9)})};

// Original UTF-16 range 317932:318149
var _h=(e,t)=>{let n=I(e),r=62*Wn(e),i=F(F(t.shotTime*1e3/Bm,0,1)/.85,0,1),a=eh(`progress.track`,r,5,n*.16);return i<=0?[a]:[a,{type:`ring`,key:`progress.arc`,cx:B,cy:B,r,width:5,opacity:n,arc:{fraction:i,startDeg:-90}}]};

// Original UTF-16 range 318150:318407
var vh=(e,t)=>{let n=I(e),r=[];for(let e=0;e<5;e++){let i=F((t.shotTime*1e3/Vm-e*.09)/.62,0,1);if(i>=1)continue;let a=1-(1-i)**3,o=e*2.4+i*2.2,s=96*(1-a);r.push($m(`gather.${e}`,B+s*Math.cos(o),B+s*Math.sin(o)*.8,9*(.5+.5*a)*n,n*F(i*5,0,1)*(1-a*.25)))}return r};

// Original UTF-16 range 318408:318645
var yh=(e,t)=>{let n=t.stateTime*1e3,r=[];for(let t of Hm){let i=F((e-Math.abs(t)*.1)/(1-Math.abs(t)*.1),0,1);if(i<=.004)continue;let a=Wn(i),o=oh(n,t),s=(7+9*F(o,.08,1))*I(i),c=6*F(o,0,1)*i;r.push($m(`wave.${t}`,B+t*44*a,B-c,s,i))}return r};

// Original UTF-16 range 318646:319070
var bh=(e,t)=>{let n=I(e),r=Um(t.stateTime*1e3/Nm),i=F((r-.18)/.55,0,1),a=i*i*(.4+.6*i),o=.74,s=-.62,c=[];if(i>0&&i<1){let e=108*a;c.push($m(`send.packet`,B+o*e,B+s*e,10*(1-a*.55)*n,n*(1-a*a)))}let l=F((r-.26)/.55,0,1),u=l*l*(.4+.6*l);if(i>0&&l>0&&l<1){let e=108*u;c.push($m(`send.streak`,B+o*e,B+s*e,5*(1-u*.6)*n,n*.3*(1-u)))}let d=F((r-.18)/.3,0,1);return d>0&&d<1&&c.push(eh(`send.launch`,20+34*I(d),2.8*(1-d),n*(1-d)*.8)),c};

// Original UTF-16 range 319071:319452
var xh=(e,t)=>{let n=I(e),r=t.stateTime*1e3,i=sh(Math.floor(r/Pm)),a=Um(r/Pm),o=F(a/.6,0,1),s=1-(1-o)**3,c=Math.cos(i),l=Math.sin(i),u=108*(1-s),d=[];if(o<1){let e=18*Math.sin(o*Math.PI)*(1-s*.7);d.push($m(`receive.packet`,B+c*u-l*e,B+l*u+c*e,3.5+6.5*s,n*F(o*3.5,0,1)*(.3+.7*s)))}let f=F((a-.58)/.32,0,1);return f>0&&f<1&&d.push(eh(`receive.absorb`,20+26*I(f),2.8*(1-f),n*(1-f)*.8)),d};

// Original UTF-16 range 319453:319772
var Sh=(e,t)=>{let n=I(e),r=t.stateTime*1e3,i=[];for(let e=0;e<2;e++){let a=F((t.stateTime-(.2+e*1.3))/.9,0,1);if(a<=0)continue;let o=1-(1-a)**3,s=r*.001*1.1+e*Math.PI,c=B+42*Math.sin(s),l=B+21*Math.cos(s)+Math.sin(r*.003+e)*2,u=B-120+e*30,d=B+95;i.push($m(`dock.${e}`,u+(c-u)*o,d+(l-d)*o,(7+3*o)*n,n*F(a*4,0,1)))}return i};

// Original UTF-16 range 319773:320155
var Ch=(e,t)=>{let n=t.stateTime*1e3,r=lh(n),i=(r.rot-90)*Math.PI/180,a=Math.cos(i)*68,o=Math.sin(i)*68,s=B+(r.x+a)*e,c=B+(r.y+r.wig*.15+o)*e,l=[th(`pencil.shaft`,Zm,`translate(${s.toFixed(1)} ${c.toFixed(1)}) rotate(${(r.rot*e).toFixed(1)}) scale(${I(e).toFixed(3)}) translate(${-B} ${-B})`,F(e*1.6-.3,0,1))],u=fh(n);return u.length>=2&&l.push(nh(`pencil.ink`,ph(u),6,F(e*1.2,0,1))),l};

// Original UTF-16 range 320156:320465
var wh=(e,t)=>{let n=t.stateTime,r=I(F(e*1.1,0,1)),i=Math.exp(-(n%2.2)*5.5),a=Math.sin(n*42)*2.2*i;return[th(`bang.bar`,Qm,`translate(0 ${(-26-(1-r)*70).toFixed(1)}) rotate(${a.toFixed(2)} ${B} ${(B-74).toFixed(1)}) translate(${B} ${B}) scale(${F(e*1.2,0,1).toFixed(3)}) translate(${-B} ${-B})`,F(e*1.5-.2,0,1))]};

// Original UTF-16 range 320466:320575
var Th=(e,t)=>{let n=.5+.5*Math.sin(t.stateTime*1e3*.0016);return[$m(`standby.halo`,B,B,26+7*n,I(e)*(.06+.1*n))]};

// Original UTF-16 range 320576:321008
var Eh=(e,t,n,r,i)=>{switch(e){case`dots`:return mh(t,n,i);case`orbit`:return hh(t,n);case`radar`:return gh(t,n,r);case`progress`:return _h(t,n);case`gather`:return vh(t,n);case`wave`:return yh(t,n);case`send`:return bh(t,n);case`receive`:return xh(t,n);case`dock`:return Sh(t,n);case`ball`:return[];case`pencil`:return Ch(t,n);case`bang`:return wh(t,n);case`standby`:return Th(t,n);default:throw Error(`Unhandled case: ${String(e)}`)}};

// Original UTF-16 range 321009:322399
function Dh(e,t){let{kind:n,isReducedMotion:r}=e,i=F(e.amount,0,1),a=F(e.swap,0,1),o=a<.999?e.outgoing:null,s=e=>e===n?i*a:e===o?i*(1-a):0,c=t=>t===n?e.clock:e.outgoingClock,l=F(i/xm,0,1),u=n!==`pencil`&&o!==`pencil`?Gm:a>=.999?Jm(n):go(Jm(o),Jm(n),Un(a)),d=n?wm[n]*a+(o?wm[o]:wm[n])*(1-a):19,f=s(`dots`),p=n===`dots`||o===`dots`,m=p?ih(c(`dots`),1,i,r):rh,h=p?1+(m.pop-1)*(f/Math.max(i,.001)):1,g=s(`receive`);if(g>.004){let e=F((Um(c(`receive`).stateTime*1e3/Pm)-.58)/.34,0,1);h*=1+.11*Math.sin(e*Math.PI)*g}let _=s(`send`);if(_>.004){let e=Um(c(`send`).stateTime*1e3/Nm),t=e<.18?-.06*Math.sin(e/.18*Math.PI):0,n=e>=.18&&e<.42?.05*Math.sin((e-.18)/.24*Math.PI):0;h*=1+(t+n)*_}let v=s(`bang`);v>.004&&(h*=1+.04*Math.exp(-(c(`bang`).stateTime%2.2)*5.5)*v);let y=0,b=0,x=0,S=s(`pencil`);if(S>.004){let e=lh(c(`pencil`).stateTime*1e3);y+=e.x*S,b+=(e.y+e.wig*.5)*S,x+=e.rot*S}v>.004&&(b+=58*v);let C=s(`ball`);C>.004&&(b+=ch(c(`ball`).stateTime)*C);let w=d/B*h,T=s(`standby`),E=T>0?(.28+.2*Math.sin(c(`standby`).stateTime*1e3*.0016))*T:0,D={scale:1-i+w*i,dx:y*i,dy:-m.lift*f+b*i,rotation:x*i,opacity:(1-(1-m.tone)*f)*(1-E),round:Un(l),ring:u},O=1-Gn(F((t-44)/90,0,1)),ee=n==null?1:Tm[n],k=o?Tm[o]:ee,te=1+(ee*a+k*(1-a)-1)*i*O,ne=[];for(let e of[o,n]){if(e==null)continue;let t=s(e);t>.004&&ne.push(...Eh(e,t,c(e),d,r))}return{core:D,isFaceVisible:i<.5,zoom:te,parts:ne.filter(e=>e.opacity>0)}}

// Original UTF-16 range 322403:322413
var Oh=Vf(192);

// Original UTF-16 range 322414:322423
var kh=Yf(96);

// Original UTF-16 range 322424:322429
var Ah=.6;

// Original UTF-16 range 322430:322509
function jh(e,t,n){return t===`sphere`?nm({...e,body:t},n):bf({...e,body:t},n)}

// Original UTF-16 range 322509:323170
function Mh(e,t,n=t){let r=e.bodies.map(({body:n,weight:r})=>({shape:jh(e,n,t),weight:r})).sort((e,t)=>t.weight-e.weight),i=r[0]?.shape.center??[t/2,t/2],a=r[0]?.shape.radius??0,o=Uf([Oh,...r.map(({shape:e})=>Hf(Bf(e),e.center))]),s=Zf(r.map(({shape:e,weight:t})=>({outline:Wf(Bf(e),e.center,o),weight:t}))),c=e.morph==null?null:Dh(e.morph,n),l=Xi*t/2/B,u=c?.core.round??0;return{size:t,center:i,body:c==null||u===0?s:Qf(s,Fh(c,i,a,o),u),eyes:r.length===1?r[0]?.shape.eyes??[]:Rh(r),painted:r.length===1?r[0]?.shape.painted??[]:[],paintedOpacity:1-u,head:c==null||e.morph==null?null:Ih(c,e.morph.amount,e.zoom,l),parts:c?.parts??[],markScale:l,zoom:c?.zoom??1}}

// Original UTF-16 range 323170:323226
function Nh(e,t,n,r,i=n,a=n){return Ph(Mh(e,n,i),t,r,a)}

// Original UTF-16 range 323226:324498
function Ph(e,t,n,r=e.size){let{size:i,center:a}=e,o=Oa(t),s=tp(e.body),c=e.eyes.map(tp).join(``),l=[],u=[Y(`path`,{d:s,fill:o})];if(c!==``&&t.cutout?(l.push(Y(`mask`,{id:`${n}-holes`,maskUnits:`userSpaceOnUse`,x:0,y:0,width:i,height:i},[Y(`rect`,{width:i,height:i,fill:`#fff`}),Y(`path`,{d:c,fill:`#000`})])),u[0]=Y(`path`,{d:s,fill:o,mask:`url(#${n}-holes)`})):c!==``&&(l.push(Y(`clipPath`,{id:`${n}-body`},[Y(`path`,{d:s})])),u.push(Y(`path`,{d:c,fill:ka(t),"clip-path":`url(#${n}-body)`}))),e.paintedOpacity>0){let t=e.paintedOpacity<1?{opacity:Z(e.paintedOpacity,3)}:{};for(let{fill:n,loops:r}of e.painted)u.push(Y(`path`,{d:r.map(tp).join(``),fill:n,...t}))}let d=e.head,f=d==null?u:[Y(`g`,{transform:`translate(${Z(a[0]+d.translate[0])} ${Z(a[1]+d.translate[1])}) rotate(${Z(d.rotation)}) scale(${Z(d.scale,5)}) translate(${Z(-a[0])} ${Z(-a[1])})`,...d.opacity<1?{opacity:Z(d.opacity,3)}:{}},u)],p=e.parts.length===0?[]:[Y(`g`,{transform:`translate(${i/2} ${i/2}) scale(${Z(e.markScale,5)}) translate(${-B} ${-B})`},e.parts.map(e=>Lh(e,o)))],m=i/2+(bm-B)*e.markScale,h=e.zoom===1?[...p,...f]:[Y(`g`,{transform:`translate(${Z(m)} ${Z(m)}) scale(${Z(e.zoom,5)}) translate(${Z(-m)} ${Z(-m)})`},[...p,...f])];return sf(i,n,r,[...l.length===0?[]:[Y(`defs`,{},l)],...h])}

// Original UTF-16 range 324498:324598
function Fh(e,t,n,r){let i=n/B;return Kf(e.core.ring.map(([e,n])=>[t[0]+(e-B)*i,t[1]+(n-B)*i]),t,r)}

// Original UTF-16 range 324598:324750
function Ih(e,t,n,r){let{core:i}=e,a=1-t,o=t>0?(i.scale-a)/t:0;return{translate:[i.dx*r,i.dy*r],rotation:i.rotation,scale:a+Xi/n*o*t,opacity:i.opacity}}

// Original UTF-16 range 324750:325429
function Lh(e,t){let n=e.opacity<1?{opacity:Z(e.opacity,3)}:{};switch(e.type){case`disc`:return Y(`circle`,{cx:Z(e.cx),cy:Z(e.cy),r:Z(e.r),fill:t,...n});case`ring`:{let r=2*Math.PI*e.r,i=e.arc==null?{}:{"stroke-dasharray":`${Z(r*e.arc.fraction)} ${Z(r)}`,transform:`rotate(${Z(e.arc.startDeg)} ${Z(e.cx)} ${Z(e.cy)})`};return Y(`circle`,{cx:Z(e.cx),cy:Z(e.cy),r:Z(e.r),fill:`none`,stroke:t,"stroke-width":Z(e.width),...i,...n})}case`shape`:return Y(`path`,{d:e.d,transform:e.transform,fill:t,...n});case`stroke`:return Y(`path`,{d:e.d,fill:`none`,stroke:t,"stroke-width":Z(e.width),"stroke-linecap":`round`,"stroke-linejoin":`round`,...n});default:throw Error(`Unhandled case`)}}

// Original UTF-16 range 325429:325858
function Rh(e){let t=(e[0]?.shape.radius??0)*Ah,n=[];return e.forEach(({shape:r},i)=>{for(let a of r.eyes){let r=ep(a),o=zh(n,i,r,t);if(o!=null){o.loops[i]=a;continue}let s=e.map(()=>null);s[i]=a,n.push({anchor:r,loops:s})}}),n.map(t=>{let n=t.loops.map(e=>e==null?null:qf(e)),r=Xf([kh,...n.map(e=>e?.stations??[])]);return Zf(e.map(({weight:e},i)=>{let a=n[i];return{outline:a==null?$f(t.anchor,r.length):Jf(a,r),weight:e}}))})}

// Original UTF-16 range 325858:326015
function zh(e,t,n,r){let i=null,a=r;for(let r of e){if(r.loops[t]!=null)continue;let e=Math.hypot(r.anchor[0]-n[0],r.anchor[1]-n[1]);e<a&&(i=r,a=e)}return i}

// Original UTF-16 range 326015:326078
function Z(e,t=2){let n=10**t;return String(Math.round(e*n)/n)}

// Original UTF-16 range 326078:326129
function Bh(e,t,n,r,i={}){return cf(Vh(e,t,n,r,i))}

// Original UTF-16 range 326129:326364
function Vh(e,t,n,r,i={}){let[a,...o]=e.bodies;return a==null||o.length>0||e.morph!=null?Nh(e,t,n,r,i.displaySize??n,i.extent):a.body===`sphere`?im(em({...e,body:a.body},t,n,i),t,r,i.extent):xf(yf({...e,body:a.body},t,n,i),r,i.extent)}

// Original UTF-16 range 326368:326382
var Hh=new WeakMap;

// Original UTF-16 range 326383:326414
var Uh=`http://www.w3.org/2000/svg`;

// Original UTF-16 range 326415:326421
var Wh=`/`;

// Original UTF-16 range 326422:326778
function Gh(e,t){let n=[],r=[];Kh(t,n,r);let i=Hh.get(e);if(i!=null&&e.firstChild===i.root&&Jh(i.names,n)){for(let e=0;e<r.length;e++)r[e]!==i.values[e]&&(i.slots[e].value=r[e]);i.values=r;return}let a=qh(e.ownerDocument,t);e.replaceChildren(a);let o=[a,...a.querySelectorAll(`*`)].flatMap(e=>[...e.attributes]);Hh.set(e,{root:a,names:n,slots:o,values:r})}

// Original UTF-16 range 326778:326923
function Kh(e,t,n){t.push(e.tag);for(let[r,i]of Object.entries(e.attrs))t.push(r),n.push(String(i));for(let r of e.children)Kh(r,t,n);t.push(Wh)}

// Original UTF-16 range 326923:327092
function qh(e,t){let n=e.createElementNS(Uh,t.tag);for(let[e,r]of Object.entries(t.attrs))n.setAttribute(e,String(r));for(let r of t.children)n.append(qh(e,r));return n}

// Original UTF-16 range 327092:327162
function Jh(e,t){return e.length===t.length&&e.every((e,n)=>e===t[n])}

// Original UTF-16 range 327162:327320
function Yh(e){switch(e){case`blob`:return`sphere`;case`flower`:return`starFlower`;case`heart`:return`heartChubby`;case`star`:return`star6`;default:return e}}

// Original UTF-16 range 327324:327334
var Xh=[0,0,0];

// Original UTF-16 range 327335:327455
function Zh(e,t){return t==null?{ink:Xh,spot:Xh,cutout:!0,inkPaint:e}:{ink:Xh,spot:Xh,cutout:!1,inkPaint:e,spotPaint:t}}

// Original UTF-16 range 327459:327464
var Qh=48;

// Original UTF-16 range 327465:327470
var $h=60;

// Original UTF-16 range 327471:327476
var eg=.1;

// Original UTF-16 range 327477:327589
function tg(e){let t=2166136261;for(let n=0;n<e.length;n++)t=Math.imul(t^e.charCodeAt(n),16777619);return t>>>0}

// Original UTF-16 range 327589:327731
function ng(){return typeof window>`u`||typeof window.matchMedia!=`function`?!1:window.matchMedia(`(prefers-reduced-motion: reduce)`).matches}

// Original UTF-16 range 327731:328082
function rg(e){return{id:e.id,body:e.body,appearance:e.appearance,state:e.state,clip:e.clip??null,morph:e.morph??null,size:e.size,fill:e.fill??.6,resolution:e.resolution,maxFrameRate:e.maxFrameRate??60,isPlaying:e.isPlaying??!0,isEmphasized:e.isEmphasized??!1,isFollowingPointer:e.isFollowingPointer??!1,isStatic:e.isStatic??!1,isProof:e.isProof??!1}}

// Original UTF-16 range 328082:331311
function ig(e){let t=rg(e),n=ng(),r=()=>t.isStatic||n,i=()=>t.isPlaying&&!r(),a=wa({body:t.body}),o=t.state===void 0?null:za(a,t.state,{seed:tg(e.seed??e.id),isCompact:typeof t.size!=`number`||t.size<Qh,isResting:!i()}),s=typeof t.size==`number`?t.size:0,c=null,l=null,u=null,d=null,f=null,p=()=>{let e=c?.canvas,{appearance:n,fill:r,isProof:i,resolution:o}=t,l=o??Math.round(s*Ea(r)*100)/100;e==null||l<=0||Gh(e,Vh(a.frame(),n,l,t.id,{isProof:i,displaySize:s>0?s:l,extent:`100%`}))},m=()=>{if(r()){a.pause(),a.seek(0);for(let e=0;e<$h;e++)a.advance(eg);p();return}p(),l?.wake()},h=()=>{a.setBody(t.body,{isInstant:r()}),m()},g=()=>{o==null&&t.clip!=null&&a.load(t.clip,{isPlaying:i()}),m()},_=()=>{o??a.setMorph(t.morph,{isInstant:r()}),m()},v=()=>{t.state!==void 0&&o?.setState(t.state),m()},y=()=>{o?.setEmphasis(t.isEmphasized),m()},b=()=>{o==null?i()?a.play():a.pause():o.setResting(!i()),m()},x=e=>{let{size:n}=t;if(typeof n==`number`)return s=n,o?.setCompact(n<Qh),m(),null;if(typeof ResizeObserver>`u`)return null;let r=new ResizeObserver(e=>{let t=e.at(-1)?.contentRect.width??0;t!==s&&(s=t,o?.setCompact(t<Qh),m())});return r.observe(e),()=>r.disconnect()},S=e=>{if(a.setGazeAlways(t.isFollowingPointer),!t.isFollowingPointer)return null;let n=t=>{a.setGaze(Ii(e.getBoundingClientRect(),{x:t.clientX,y:t.clientY})),l?.wake()};return window.addEventListener(`pointermove`,n,{passive:!0}),()=>{window.removeEventListener(`pointermove`,n),a.setGaze(null),l?.wake()}},C=e=>{if(r())return null;let n=1e3/Math.max(1,t.maxFrameRate),s=0,c=0,u=!1,d=!0,f=e=>{if(s=0,e-c<n-1){s=requestAnimationFrame(f);return}let t=(e-c)/1e3;if(c=e,document.hidden||(i()&&o?.advance(t),a.advance(t)),p(),!i()&&a.isSettled){u=!1;return}s=requestAnimationFrame(f)},m=()=>{!u&&d&&(u=!0,c=performance.now(),s=requestAnimationFrame(f))},h=typeof IntersectionObserver>`u`?null:new IntersectionObserver(e=>{if(d=e.at(-1)?.isIntersecting??!0,d){m();return}cancelAnimationFrame(s),s=0,u=!1});return h?.observe(e),l={wake:m},m(),()=>{cancelAnimationFrame(s),h?.disconnect(),l=null}},w=()=>{u?.(),u=c==null?null:x(c.host)},T=()=>{d?.(),d=null,c==null?a.setGazeAlways(t.isFollowingPointer):d=S(c.host)},E=()=>{f?.(),f=c==null?null:C(c.host)},D=()=>{f?.(),d?.(),u?.(),f=null,d=null,u=null,c=null},O=e=>{let a=t;t=rg({...t,...e});let o=e=>!Object.is(a[e],t[e]),s=a.isStatic||n,c=a.isPlaying&&!s;o(`body`)&&h(),o(`clip`)&&g(),o(`morph`)&&_(),o(`state`)&&v(),o(`isEmphasized`)&&y(),c!==i()&&b(),(o(`appearance`)||o(`fill`)||o(`resolution`)||o(`isProof`))&&m(),o(`size`)&&w(),o(`isFollowingPointer`)&&T(),(s!==r()||o(`maxFrameRate`))&&E()};return a.setBody(t.body,{isInstant:r()}),o==null&&t.clip!=null&&a.load(t.clip,{isPlaying:i()}),o??a.setMorph(t.morph,{isInstant:r()}),o?.setEmphasis(t.isEmphasized),o==null?i()?a.play():a.pause():o.setResting(!i()),a.setGazeAlways(t.isFollowingPointer),{attach:e=>(D(),c=e,m(),u=x(e.host),d=S(e.host),f=C(e.host),()=>{c===e&&D()}),update:O,setState:e=>O({state:e}),setBody:e=>O({body:e}),setPlaying:e=>O({isPlaying:e}),setExpression:(e,t)=>{a.setExpression(e,t),m()},blink:()=>{a.blink(),m()},look:e=>{a.look(e),m()},restart:()=>{a.seek(0),a.play(),m()},poke:(e,t)=>{n||(a.poke(e,t),m())},gaze:e=>{n||(a.setGaze(e),m())}}}

export { wa as createMotionEngine, za as createStateController, ig as createAvatarRuntime, Bh as renderSvg, Vh as renderSvgTree, Zh as createAppearance, Yh as resolveBody, Aa as motionRecipes, Na as animationStates, Ta as defaultFill, Ea as fillScale, jh as projectGeometry, tp as serializePolygon, Gh as commitSvgTree };