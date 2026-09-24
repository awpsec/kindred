// Resident Whisper worker. stdin: u32 byte length + mono 16 kHz PCM WAV.
// stdout: one bounded JSON object per line. Audio and transcripts never touch disk.
#include "whisper.h"
#include "ggml-backend.h"
#include <algorithm>
#include <cstdint>
#include <chrono>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>
#include <thread>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#else
#include <unistd.h>
#endif

static bool gpu_used=false,gpu_failed=false;
static void log_message(ggml_log_level,const char * message,void *) {
    const std::string line(message);
    if(line.find("whisper_backend_init_gpu: using ")!=std::string::npos)gpu_used=true;
    if(line.find("whisper_backend_init_gpu: failed to initialize ")!=std::string::npos)gpu_failed=true;
}
static std::string json_string(const std::string & value) {
    std::string out="\"";
    for(unsigned char c:value){
        if(c=='"'||c=='\\'){out+='\\';out+=c;}
        else if(c<32){char escaped[7];std::snprintf(escaped,sizeof(escaped),"\\u%04x",c);out+=escaped;}
        else out+=c;
    }
    return out+'"';
}
static uint32_t u32(const uint8_t * p){return uint32_t(p[0])|(uint32_t(p[1])<<8)|(uint32_t(p[2])<<16)|(uint32_t(p[3])<<24);}
static bool read_exact(void * data,size_t count){std::cin.read(static_cast<char *>(data),count);return size_t(std::cin.gcount())==count;}
static int run(const std::string & model_path) {
    whisper_log_set(log_message,nullptr);
    int best=-1,index=0;size_t best_memory=0;bool discrete=false;std::string device="CPU",backend="CPU";
    for(size_t i=0;i<ggml_backend_dev_count();i++){
        auto d=ggml_backend_dev_get(i);ggml_backend_dev_props p{};ggml_backend_dev_get_props(d,&p);
        if(p.type!=GGML_BACKEND_DEVICE_TYPE_GPU&&p.type!=GGML_BACKEND_DEVICE_TYPE_IGPU)continue;
        const bool dedicated=p.type==GGML_BACKEND_DEVICE_TYPE_GPU;
        if(best<0||(dedicated&&!discrete)||(dedicated==discrete&&p.memory_free>best_memory)){
            best=index;best_memory=p.memory_free;discrete=dedicated;device=p.description?p.description:p.name;backend=ggml_backend_reg_name(ggml_backend_dev_backend_reg(d));
        }
        index++;
    }
    auto cp=whisper_context_default_params();cp.use_gpu=best>=0;cp.gpu_device=std::max(0,best);cp.flash_attn=best>=0;
    whisper_context * ctx=whisper_init_from_file_with_params(model_path.c_str(),cp);
    if(!ctx){std::cout<<"{\"type\":\"error\",\"error\":\"The model could not load.\"}"<<std::endl;return 2;}
    const bool accelerated=best>=0&&gpu_used&&!gpu_failed;
    if(accelerated){
        // Compile driver kernels while the UI says Loading, before recording.
        std::vector<float> silence(16000,0.0f);
        auto warm=whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        warm.n_threads=int(std::max(1u,std::min(8u,std::thread::hardware_concurrency())));
        warm.print_realtime=false;warm.print_progress=false;warm.print_timestamps=false;
        warm.print_special=false;warm.no_context=true;warm.no_timestamps=true;
        warm.language="en";warm.greedy.best_of=1;warm.temperature=0.0f;warm.suppress_nst=true;
        if(whisper_full(ctx,warm,silence.data(),int(silence.size()))!=0){
            whisper_free(ctx);std::cout<<"{\"type\":\"error\",\"error\":\"The GPU model could not initialize.\"}"<<std::endl;return 2;
        }
    }
    std::cout<<"{\"type\":\"ready\",\"backend\":"<<json_string(accelerated?backend:"CPU")<<",\"device\":"<<json_string(accelerated?device:"CPU")<<",\"gpu\":"<<(accelerated?"true":"false")<<",\"gpu_identified\":"<<(best>=0?"true":"false")<<"}"<<std::endl;
    while(true){
        uint8_t header[4];if(!read_exact(header,4))break;const uint32_t count=u32(header);
        if(count<44||count>1920044)break;std::vector<uint8_t> bytes(count);if(!read_exact(bytes.data(),count))break;
        if(std::memcmp(bytes.data(),"RIFF",4)||std::memcmp(bytes.data()+8,"WAVEfmt ",8)||std::memcmp(bytes.data()+36,"data",4)||u32(bytes.data()+24)!=16000||u32(bytes.data()+40)!=count-44||(count-44)%2)break;
        std::vector<float> audio((count-44)/2);double energy=0;
        for(size_t i=0;i<audio.size();i++){const auto sample=int16_t(uint16_t(bytes[44+i*2])|(uint16_t(bytes[45+i*2])<<8));audio[i]=sample/32768.0f;energy+=audio[i]*audio[i];}
        // Silence should not turn into Whisper's familiar hallucinated captions.
        if(audio.empty()||energy/audio.size()<0.0000004){std::cout<<"{\"type\":\"transcript\",\"text\":\"\"}"<<std::endl;continue;}
        auto p=whisper_full_default_params(WHISPER_SAMPLING_GREEDY);p.n_threads=int(std::max(1u,std::min(8u,std::thread::hardware_concurrency())));
        p.print_realtime=false;p.print_progress=false;p.print_timestamps=false;p.print_special=false;p.no_context=true;p.no_timestamps=true;p.language="auto";p.suppress_nst=true;p.greedy.best_of=1;p.temperature=0.0f;
        // Short live snapshots otherwise encode a full 30-second window on CPU.
        // Each encoder position covers 20 ms. Retain every input sample plus
        // 2.56 seconds of padding, with a conservative 10.24-second minimum.
        // Long recordings keep the model's full window and normal segmentation.
        // GPU workers keep their prewarmed graph dimensions.
        if(!accelerated)p.audio_ctx=std::min(whisper_n_audio_ctx(ctx),std::max(512,int((audio.size()+319)/320)+128));
        if(whisper_full(ctx,p,audio.data(),int(audio.size()))!=0){std::cout<<"{\"type\":\"error\",\"error\":\"Local transcription failed.\"}"<<std::endl;continue;}
        std::string text;
        for(int i=0;i<whisper_full_n_segments(ctx);i++){
            const char * segment=whisper_full_get_segment_text(ctx,i);if(segment)text+=segment;
            if(text.size()>64000)break;
        }
        if(text.size()>64000)std::cout<<"{\"type\":\"error\",\"error\":\"The transcript exceeded the message limit.\"}"<<std::endl;
        else std::cout<<"{\"type\":\"transcript\",\"text\":"<<json_string(text)<<"}"<<std::endl;
    }
    whisper_free(ctx);return 0;
}
#ifdef _WIN32
int wmain(int argc,wchar_t ** argv){
    if(argc!=2)return 1;_setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
    const int size=WideCharToMultiByte(CP_UTF8,0,argv[1],-1,nullptr,0,nullptr,nullptr);if(size<=1)return 1;
    std::string model(size,'\0');WideCharToMultiByte(CP_UTF8,0,argv[1],-1,model.data(),size,nullptr,nullptr);model.pop_back();
    try{return run(model);}catch(...){return 3;}
}
#else
int main(int argc,char ** argv){
    if(argc!=2)return 1;
    const auto parent=getppid();
    // A Unix app closing or crashing must release a model even during inference.
    std::thread([parent]{while(getppid()==parent)std::this_thread::sleep_for(std::chrono::milliseconds(250));std::_Exit(0);}).detach();
    try{return run(argv[1]);}catch(...){return 3;}
}
#endif
