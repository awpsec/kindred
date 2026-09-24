// Render the installer sidebar from the existing vector application mark.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{const root=path.resolve(__dirname,'..'),svg=fs.readFileSync(path.join(root,'desktop/icons/icon.svg'),'utf8'),width=164,height=314;
const browser=await chromium.launch({headless:true,...(process.env.KINDRED_TEST_BROWSER==='edge'?{channel:'msedge'}:{})});
try{const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});await p.setContent(`<style>html,body{margin:0;background:#151515;color:#f0eeeb;font-family:Arial,sans-serif}main{height:314px;display:flex;flex-direction:column;align-items:center;justify-content:center}svg{width:92px;height:92px}h1{font-size:23px;letter-spacing:-.6px;margin:20px 0 8px}p{font-size:11px;color:#b9b5b0;margin:0}</style><main>${svg}<h1>Kindred</h1><p>Your AI teammates.</p></main>`);
 // Screenshot decoding uses the existing Playwright PNG through Python/Pillow;
 // this is a file-format conversion of a rendered UI asset.
 execFileSync(process.env.KINDRED_PYTHON||'python',['-c','from PIL import Image; import sys,io,base64; Image.open(io.BytesIO(base64.b64decode(sys.stdin.read()))).convert("RGB").save(sys.argv[1])',path.join(root,'desktop/installer/banner.bmp')],{input:(await p.screenshot()).toString('base64'),windowsHide:true});
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
