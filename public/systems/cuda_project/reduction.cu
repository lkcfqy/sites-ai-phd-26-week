// Cooperative-kernel teaching baseline. NOT compiled or GPU-tested by course build.
#include <cuda_runtime.h>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <vector>
static void ck(cudaError_t e){if(e!=cudaSuccess)throw std::runtime_error(cudaGetErrorString(e));}
// blockDim.x must be a power of 2; all threads reach every barrier.
__global__ void partial_sum(const float* input,float* partial,int n){
 extern __shared__ float tile[];
 unsigned t=threadIdx.x,i=blockIdx.x*blockDim.x+t;
 tile[t]=i<unsigned(n)?input[i]:0.f;
 __syncthreads();
 for(unsigned stride=blockDim.x/2;stride>0;stride/=2){
  if(t<stride)tile[t]+=tile[t+stride];
  __syncthreads();
 }
 if(t==0)partial[blockIdx.x]=tile[0];
}
struct Buffer{float* p=nullptr;explicit Buffer(size_t n){ck(cudaMalloc(reinterpret_cast<void**>(&p),n*sizeof(float)));}~Buffer(){if(p)cudaFree(p);}Buffer(const Buffer&)=delete;};
int main(){try{
 for(int n:{1,31,257,4099,1048579}){
  constexpr int block=128;int grid=(n+block-1)/block;
  std::vector<float>x(n),parts(grid);double reference=0,abs_sum=0;
  for(int i=0;i<n;i++){x[i]=std::sin(float(i)*.013f);reference+=x[i];abs_sum+=std::abs(x[i]);}
  Buffer dx(n),dp(grid);ck(cudaMemcpy(dx.p,x.data(),n*sizeof(float),cudaMemcpyHostToDevice));
  partial_sum<<<grid,block,block*sizeof(float)>>>(dx.p,dp.p,n);ck(cudaGetLastError());ck(cudaDeviceSynchronize());
  ck(cudaMemcpy(parts.data(),dp.p,grid*sizeof(float),cudaMemcpyDeviceToHost));double sum=0;for(float v:parts){if(!std::isfinite(v))throw std::runtime_error("nonfinite partial");sum+=v;}
  const double error=std::abs(sum-reference),tolerance=1e-5*(1+abs_sum);
  if(error>tolerance)throw std::runtime_error("CPU reference mismatch");
  std::cout<<"{\"n\":"<<n<<",\"blocks\":"<<grid<<",\"abs_error\":"<<error<<",\"tolerance\":"<<tolerance<<",\"timing\":\"not measured\"}\n";
 }
 return 0;
}catch(const std::exception&e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}}
