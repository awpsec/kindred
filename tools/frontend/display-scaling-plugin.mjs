import {readFile} from 'node:fs/promises';
// Keep protocol pixels and pointer coordinates unchanged. Resample only the visible
// canvas to its physical display size instead of leaving enlargement to CSS.
export const displayScalingPlugin={name:'kindred-display-scaling',setup(build){
 build.onLoad({filter:/[/\\]@novnc[/\\]novnc[/\\]core[/\\]display\.js$/},async({path})=>{
  let contents=await readFile(path,'utf8');
  const draw=`this._targetCtx.drawImage(this._backbuffer,
                                          x, y, w, h,
                                          vx, vy, w, h);`;
  const end=`            this._target.style.height = height;
        }
    }

    _setFillColor`;
  for(const marker of [draw,end])if(contents.split(marker).length!==2)throw new Error('Review display scaling patch for this noVNC version');
  contents=contents.replace(draw,`this._paintPresentation(x, y, w, h, vx, vy);`);
  contents=contents.replace(end,`            this._target.style.height = height;
        }
        this._target.dataset.framebufferWidth = this._fbWidth;
        this._target.dataset.framebufferHeight = this._fbHeight;
        // Bound presentation memory to 32 MiB, including high-DPI/4K displays.
        if (vp.w > 0 && vp.h > 0) {
            const ratio = Math.min(factor * (window.devicePixelRatio || 1),
                                   Math.sqrt(8000000 / (vp.w * vp.h)));
            const pixelsW = Math.max(1, Math.floor(vp.w * ratio));
            const pixelsH = Math.max(1, Math.floor(vp.h * ratio));
            if (this._target.width !== pixelsW || this._target.height !== pixelsH) {
                this._target.width = pixelsW;
                this._target.height = pixelsH;
                this._paintPresentation(vp.x, vp.y, vp.w, vp.h, 0, 0);
            }
        }
    }

    _paintPresentation(x, y, w, h, vx, vy) {
        const vp = this._viewportLoc, target = this._target, ctx = this._targetCtx;
        if (target.width === vp.w && target.height === vp.h) {
            ctx.drawImage(this._backbuffer, x, y, w, h, vx, vy, w, h);
            return;
        }
        const sx = target.width / vp.w, sy = target.height / vp.h;
        ctx.save();
        // Expand dirty regions for the interpolation kernel. Draw with one global
        // transform so adjacent VNC rectangles cannot acquire seams or drift.
        ctx.beginPath();
        ctx.rect(Math.floor((vx - 8) * sx), Math.floor((vy - 8) * sy),
                 Math.ceil((w + 16) * sx) + 1, Math.ceil((h + 16) * sy) + 1);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this._backbuffer, vp.x, vp.y, vp.w, vp.h,
                      0, 0, target.width, target.height);
        ctx.restore();
    }

    _setFillColor`);
  return {contents,loader:'js'};
 });
}};
