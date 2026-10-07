"""Resident worker smoke test with a caller-supplied public speech fixture.
Usage: test-whistle.py WORKER MODEL WAV
"""
import os,io,json,struct,subprocess,sys,time,wave
worker,model,fixture=sys.argv[1:]
def wav(pcm):
    b=io.BytesIO()
    with wave.open(b,'wb') as w:w.setparams((1,2,16000,0,'NONE',''));w.writeframes(pcm)
    return b.getvalue()
p=subprocess.Popen([worker,model],stdin=subprocess.PIPE,stdout=subprocess.PIPE,env={**os.environ,"NEEDLE_TELEMETRY":"0","DO_NOT_TRACK":"1"})
try:
    assert json.loads(p.stdout.readline())['type']=='ready'
    def send(b):
        p.stdin.write(struct.pack('<I',len(b))+b);p.stdin.flush();return json.loads(p.stdout.readline())
    assert send(wav(bytes(32000)))['text']==''
    with wave.open(fixture) as w:
        assert (w.getnchannels(),w.getsampwidth(),w.getframerate())==(1,2,16000)
        pcm=w.readframes(w.getnframes())
    start=time.monotonic();result=send(wav(pcm))
    assert result['type']=='transcript' and result['text'].strip()
    assert result['words'] and all(0<=w['start']<=w['end']<=len(pcm)/32000 for w in result['words'])
    assert send(wav(b'\x00\x10'*480001))['type']=='error', 'Overlong audio must not be silently truncated'
    assert send(wav(bytes(32000)))['text']=='', 'Worker stays reusable after a rejected request'
    print(json.dumps({'passed':True,'speech_seconds':len(pcm)/32000,'elapsed_seconds':round(time.monotonic()-start,3),'text':result['text']}))
finally:
    p.terminate();p.wait(timeout=5)
