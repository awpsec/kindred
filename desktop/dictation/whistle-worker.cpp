// Resident Whistle worker. stdin: u32 byte length + mono 16 kHz PCM WAV.
// stdout: one bounded JSON object per line. Audio and transcripts never touch disk.

#include <fstream>
#include <filesystem>
#include <iterator>
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

// Load the pinned native C ABI beside this worker, never from a search path.
#ifndef _WIN32
#include <dlfcn.h>
#endif
using Load = int (*)(const unsigned char*, unsigned long long);
using Transcribe = int (*)(const float*,int,const char*,const char*,int,char*,int);
static Load needle_load;
static Transcribe needle_transcribe;
static bool load_engine(const std::filesystem::path& directory){
#ifdef _WIN32
    auto lib=LoadLibraryExW((directory/L"libneedle.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);
    if(!lib)return false;
    needle_load=reinterpret_cast<Load>(GetProcAddress(lib,"needle_load"));
    needle_transcribe=reinterpret_cast<Transcribe>(GetProcAddress(lib,"needle_transcribe"));
#else
#ifdef __APPLE__
    const char* name="libneedle.dylib";
#else
    const char* name="libneedle.so";
#endif
    auto lib=dlopen((directory/name).c_str(),RTLD_NOW|RTLD_LOCAL);if(!lib)return false;
    needle_load=reinterpret_cast<Load>(dlsym(lib,"needle_load"));
    needle_transcribe=reinterpret_cast<Transcribe>(dlsym(lib,"needle_transcribe"));
#endif
    return needle_load&&needle_transcribe;
}
static uint32_t u32(const uint8_t * p){return uint32_t(p[0])|(uint32_t(p[1])<<8)|(uint32_t(p[2])<<16)|(uint32_t(p[3])<<24);}
static bool read_exact(void * data,size_t count){std::cin.read(static_cast<char *>(data),count);return size_t(std::cin.gcount())==count;}
static int run(const std::string & model_path) {
    // The pinned model bytes must outlive the process-global engine.
    std::ifstream file(std::filesystem::u8path(model_path),std::ios::binary);
    std::vector<unsigned char> model((std::istreambuf_iterator<char>(file)),{});
    if(model.empty()||needle_load(model.data(),model.size())<0){std::cout<<"{\"type\":\"error\",\"error\":\"Whistle could not load.\"}"<<std::endl;return 2;}
    std::cout<<"{\"type\":\"ready\",\"backend\":\"Whistle CPU\",\"device\":\"CPU\",\"gpu\":false}"<<std::endl;
    while(true){
        uint8_t header[4];if(!read_exact(header,4))break;const uint32_t count=u32(header);
        if(count<44||count>1920044)break;std::vector<uint8_t> bytes(count);if(!read_exact(bytes.data(),count))break;
        if(std::memcmp(bytes.data(),"RIFF",4)||std::memcmp(bytes.data()+8,"WAVEfmt ",8)||std::memcmp(bytes.data()+36,"data",4)||u32(bytes.data()+24)!=16000||u32(bytes.data()+40)!=count-44||(count-44)%2)break;
        std::vector<float> audio((count-44)/2);double energy=0;
        for(size_t i=0;i<audio.size();i++){const auto sample=int16_t(uint16_t(bytes[44+i*2])|(uint16_t(bytes[45+i*2])<<8));audio[i]=sample/32768.0f;energy+=audio[i]*audio[i];}
        if(audio.size()>480000){std::cout<<"{\"type\":\"error\",\"error\":\"Whistle accepts at most 30 seconds per segment.\"}"<<std::endl;continue;}
        // Silence should not turn into Whisper's familiar hallucinated captions.
        if(audio.empty()||energy/audio.size()<0.0000004){std::cout<<"{\"type\":\"transcript\",\"text\":\"\"}"<<std::endl;continue;}
        std::vector<char> out(262144,0);
        if(needle_transcribe(audio.data(),int(audio.size()),nullptr,nullptr,1,out.data(),int(out.size()))<0){std::cout<<"{\"type\":\"error\",\"error\":\"Whistle transcription failed.\"}"<<std::endl;continue;}
        // The API produces JSON; retain its escaped transcript and timing fields.
        out.back()=0;
        if(out[0]!='{'){std::cout<<"{\"type\":\"error\",\"error\":\"Invalid Whistle response.\"}"<<std::endl;continue;}
        std::cout<<"{\"type\":\"transcript\","<<(out.data()+1)<<std::endl;
    }
    return 0;
}
#ifdef _WIN32
int wmain(int argc,wchar_t ** argv){
    if(argc!=2||!load_engine(std::filesystem::absolute(argv[0]).parent_path()))return 1;_setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
    const int size=WideCharToMultiByte(CP_UTF8,0,argv[1],-1,nullptr,0,nullptr,nullptr);if(size<=1)return 1;
    std::string model(size,'\0');WideCharToMultiByte(CP_UTF8,0,argv[1],-1,model.data(),size,nullptr,nullptr);model.pop_back();
    try{return run(model);}catch(...){return 3;}
}
#else
int main(int argc,char ** argv){
    if(argc!=2||!load_engine(std::filesystem::absolute(argv[0]).parent_path()))return 1;
    const auto parent=getppid();
    // A Unix app closing or crashing must release a model even during inference.
    std::thread([parent]{while(getppid()==parent)std::this_thread::sleep_for(std::chrono::milliseconds(250));std::_Exit(0);}).detach();
    try{return run(argv[1]);}catch(...){return 3;}
}
#endif
