// Educational CUDA baseline. Not compiled/executed on GPU by the course build.
// Learner task: add a fused affine + ReLU kernel, preserving this baseline.
#include <cuda_runtime.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <vector>
static void check(cudaError_t e){if(e!=cudaSuccess)throw std::runtime_error(cudaGetErrorString(e));}
__global__ void affine(const float* x,float* y,int n,float a,float b){
  int i=blockIdx.x*blockDim.x+threadIdx.x;
  if(i<n)y[i]=a*x[i]+b; // Why must this guard remain when n is not a block multiple?
}
__global__ void relu(float* y,int n){int i=blockIdx.x*blockDim.x+threadIdx.x;if(i<n)y[i]=fmaxf(0.f,y[i]);}
struct Buffer {float* p=nullptr;explicit Buffer(size_t n){check(cudaMalloc(reinterpret_cast<void**>(&p),n*sizeof(float)));}~Buffer(){if(p)cudaFree(p);}Buffer(const Buffer&)=delete;Buffer& operator=(const Buffer&)=delete;};
struct Event {cudaEvent_t e;Event(){check(cudaEventCreate(&e));}~Event(){cudaEventDestroy(e);}Event(const Event&)=delete;};
static void run(int n,int block){
  const float a=.75f,b=-.2f;std::vector<float>x(n),y(n),ref(n);for(int i=0;i<n;i++){x[i]=std::sin(float(i)*.013f);ref[i]=std::max(0.f,a*x[i]+b);}
  Buffer dx(n),dy(n);Event begin,end;int grid=(n+block-1)/block;
  auto launch=[&](){affine<<<grid,block>>>(dx.p,dy.p,n,a,b);check(cudaGetLastError());relu<<<grid,block>>>(dy.p,n);check(cudaGetLastError());};
  check(cudaMemcpy(dx.p,x.data(),n*sizeof(float),cudaMemcpyHostToDevice));launch();check(cudaDeviceSynchronize()); // warm-up, excluded
  std::vector<float> kernel, e2e;
  for(int r=0;r<21;r++){
    auto t=std::chrono::steady_clock::now();
    check(cudaMemcpy(dx.p,x.data(),n*sizeof(float),cudaMemcpyHostToDevice));
    check(cudaEventRecord(begin.e));launch();check(cudaEventRecord(end.e));check(cudaEventSynchronize(end.e));
    float ms;check(cudaEventElapsedTime(&ms,begin.e,end.e));kernel.push_back(ms);
    check(cudaMemcpy(y.data(),dy.p,n*sizeof(float),cudaMemcpyDeviceToHost));
    e2e.push_back(std::chrono::duration<float,std::milli>(std::chrono::steady_clock::now()-t).count());
  }
  float maxerror=0;for(int i=0;i<n;i++){if(!std::isfinite(y[i]))throw std::runtime_error("non-finite output");maxerror=std::max(maxerror,std::abs(y[i]-ref[i]));}if(maxerror>1e-5f)throw std::runtime_error("CPU reference mismatch");
  auto p95=[](std::vector<float> v){std::sort(v.begin(),v.end());return v[size_t(std::ceil(.95*v.size()))-1];};
  std::cout<<"{\"n\":"<<n<<",\"block\":"<<block<<",\"max_abs_error\":"<<maxerror<<",\"kernel_p95_ms\":"<<p95(kernel)<<",\"e2e_p95_ms\":"<<p95(e2e)<<",\"kernel_ms\":[";
  for(size_t i=0;i<kernel.size();i++)std::cout<<(i?",":"")<<kernel[i];std::cout<<"],\"e2e_ms\":[";for(size_t i=0;i<e2e.size();i++)std::cout<<(i?",":"")<<e2e[i];std::cout<<"]}\n";
}
int main(int argc,char**argv){try{int count=0;check(cudaGetDeviceCount(&count));if(!count)throw std::runtime_error("no CUDA device");cudaDeviceProp p;check(cudaGetDeviceProperties(&p,0));std::cerr<<"device="<<p.name<<" compute="<<p.major<<'.'<<p.minor<<"\n";
  if(argc!=1)throw std::runtime_error("No arguments: bounded test suite only");
  for(int n:{1,31,257,4099,1048579})for(int block:{64,128,256})run(n,block);
  return 0;
}catch(const std::exception&e){std::cerr<<"FAIL: "<<e.what()<<'\n';return 1;}}
