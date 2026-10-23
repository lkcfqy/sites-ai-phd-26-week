#include "lab.hpp"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <iomanip>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {
using Clock=std::chrono::steady_clock;
volatile double measured_sink=0; // consume outputs; no claims of a perfect benchmark barrier.
void check(bool value,const char* description) { if(!value) throw std::runtime_error(description); }
void print_array(const std::vector<double>& xs) {
  std::cout << '[';
  for(std::size_t i=0;i<xs.size();++i) {if(i)std::cout<<','; std::cout<<xs[i];}
  std::cout<<']';
}
template<class F> double time_ms(F f) {
  const auto start=Clock::now();
  const double consumed=f();
  const auto stop=Clock::now();
  measured_sink=consumed;
  return std::chrono::duration<double,std::milli>(stop-start).count();
}
int basics_tests() {
  check(lab::mean({10,20,30})==20,"mean normal");
  check(lab::mean({5})==5,"mean single");
  check(lab::mean({-2,2})==0,"mean signed");
  bool rejected=false;try{lab::mean({});}catch(const std::invalid_argument&){rejected=true;}
  check(rejected,"mean empty must fail");
  return 4;
}
int layout_tests() {
  lab::Matrix a(3,4);
  a.at(1,2)=7;
  check((&a.at(1,2)-&a.at(0,0))==6,"row major offset");
  auto b=a; b.at(1,2)=99;
  check(a.at(1,2)==7,"copy ownership independent");
  const lab::Matrix& const_ref=a;
  check(const_ref.at(1,2)==7,"const read");
  bool row=false,col=false,zero=false;
  try{a.at(3,0)=1;}catch(const std::out_of_range&){row=true;}
  try{a.at(0,4)=1;}catch(const std::out_of_range&){col=true;}
  try{lab::Matrix bad(0,3);}catch(const std::invalid_argument&){zero=true;}
  check(row && col && zero,"bounds and shape rejection");
  return 6;
}
int matmul_tests() {
  int n=0;
  const std::size_t shapes[][3]={{1,1,1},{2,3,4},{7,5,9},{16,17,15},{31,3,2}};
  for(const auto& d:shapes) {
    auto a=lab::make_matrix(d[0],d[1],3); auto b=lab::make_matrix(d[1],d[2],5);
    auto expected=lab::matmul_naive(a,b);
    for(std::size_t tile:{1u,3u,8u,16u}) {
      check(lab::max_error(expected,lab::matmul_blocked(a,b,tile))<=1e-10,"blocked rectangular");++n;
    }
  }
  lab::Matrix a(2,2),b(2,1);
  a.at(0,0)=1;a.at(0,1)=2;a.at(1,0)=3;a.at(1,1)=4;b.at(0,0)=2;b.at(1,0)=1;
  auto c=lab::matmul_naive(a,b);check(c.at(0,0)==4&&c.at(1,0)==10,"hand calculated matmul");++n;
  bool dims=false,tile=false;
  try{lab::matmul_naive(lab::Matrix(2,3),lab::Matrix(4,2));}catch(const std::invalid_argument&){dims=true;}
  try{lab::matmul_blocked(a,lab::Matrix(2,2),0);}catch(const std::invalid_argument&){tile=true;}
  check(dims && tile,"invalid matmul inputs");n+=2;
  return n;
}
int thread_tests() {
  int n=0;
  for(std::size_t size:{0u,1u,7u,101u,1003u}) {
    std::vector<int> x(size);
    for(std::size_t i=0;i<size;++i)x[i]=static_cast<int>(i%101)-50;
    for(std::size_t workers:{1u,2u,4u,8u}) {
      check(lab::parallel_sum(x,workers)==lab::serial_sum(x),"thread partition sum");++n;
    }
  }
  bool zero=false,many=false;
  try{lab::parallel_sum({1},0);}catch(const std::invalid_argument&){zero=true;}
  try{lab::parallel_sum({1},9);}catch(const std::invalid_argument&){many=true;}
  check(zero&&many,"thread bounds");return n+2;
}
void basics() {
  const int n=basics_tests();
  std::cout<<"{\"lab\":\"basics\",\"tests_passed\":"<<n<<",\"input\":[10,20,30],\"mean\":20,\"source_files\":4,\"meaning\":\"compiled and linked C++ reference, not independent authorship\"}";
}
void layout() {
  const int n=layout_tests();
  std::cout<<"{\"lab\":\"layout\",\"tests_passed\":"<<n<<",\"rows\":3,\"cols\":4,\"element_bytes\":"<<sizeof(double)<<",\"element_offset_r1_c2\":6,\"byte_offset_r1_c2\":"<<6*sizeof(double)<<",\"bounds_rejected\":true,\"copy_is_independent\":true}";
}
void threads(std::size_t elements,std::size_t workers,int repeats) {
  const int n=thread_tests();
  std::vector<int> x(elements);
  for(std::size_t i=0;i<elements;++i)x[i]=static_cast<int>(i%101)-50;
  const auto expected=lab::serial_sum(x);
  std::vector<double> serial;
  measured_sink=static_cast<double>(expected); // warm serial reference
  for(int r=0;r<repeats;++r)serial.push_back(time_ms([&]{auto value=lab::serial_sum(x);check(value==expected,"timed serial sum");return static_cast<double>(value);}));
  std::cout<<"{\"lab\":\"threads\",\"tests_passed\":"<<n<<",\"elements\":"<<elements<<",\"hardware_concurrency_hint\":"<<std::thread::hardware_concurrency()<<",\"sum\":"<<expected<<",\"serial_samples_ms\":";print_array(serial);
  std::cout<<",\"scan\":[";bool first=true;
  for(std::size_t w=1;w<=workers;w*=2) {
    check(lab::parallel_sum(x,w)==expected,"warm parallel correctness");
    std::vector<double> samples;
    for(int r=0;r<repeats;++r) {
      samples.push_back(time_ms([&]{auto result=lab::parallel_sum(x,w);check(result==expected,"timed sum");return static_cast<double>(result);}));
    }
    if(!first) std::cout<<',';
    first=false;
    std::cout<<"{\"workers\":"<<w<<",\"samples_ms\":";print_array(samples);std::cout<<'}';
  }
  std::cout<<"],\"timing_scope\":\"includes thread construction, join and reduction; no persistent pool; correctness checked\"}";
}
void matmul(std::size_t size,std::size_t tile,int repeats) {
  const int n=matmul_tests();
  auto a=lab::make_matrix(size,size,11), b=lab::make_matrix(size,size,19);
  auto ref=lab::matmul_naive(a,b);auto candidate=lab::matmul_blocked(a,b,tile);
  const double err=lab::max_error(ref,candidate);check(err<=1e-10,"timed shape correctness");
  std::vector<double> baseline,blocked;
  auto one=[&]{return time_ms([&]{return lab::checksum(lab::matmul_naive(a,b));});};
  auto two=[&]{return time_ms([&]{return lab::checksum(lab::matmul_blocked(a,b,tile));});};
  for(int r=0;r<repeats;++r) {
    if(r%2==0){baseline.push_back(one());blocked.push_back(two());}
    else{blocked.push_back(two());baseline.push_back(one());}
  }
  std::cout<<"{\"lab\":\"matmul\",\"tests_passed\":"<<n<<",\"shape\":["<<size<<','<<size<<','<<size<<"],\"tile\":"<<tile<<",\"max_abs_error\":"<<err<<",\"baseline_samples_ms\":";print_array(baseline);std::cout<<",\"candidate_samples_ms\":";print_array(blocked);
  std::cout<<",\"timing_scope\":\"allocation, checked indexing, matmul, checksum and destruction; fixed inputs; alternating order; not BLAS\"}";
}
}
int main(int argc,char** argv) {
 try {
  if(argc!=7)throw std::invalid_argument("expected command size repeats workers elements tile");
  const std::string cmd=argv[1];
  const auto size=std::stoul(argv[2]);const int repeats=std::stoi(argv[3]);
  const auto workers=std::stoul(argv[4]);const auto elements=std::stoul(argv[5]);const auto tile=std::stoul(argv[6]);
  if(size<2||size>128||repeats<3||repeats>15||!(workers==1||workers==2||workers==4||workers==8)||elements<1||elements>1000000||tile<1||tile>64)
    throw std::invalid_argument("resource parameter out of range");
  std::cout<<std::setprecision(17);
  if(cmd=="basics")basics();else if(cmd=="layout")layout();else if(cmd=="threads")threads(elements,workers,repeats);else if(cmd=="matmul")matmul(size,tile,repeats);
  else if(cmd=="selftest")std::cout<<"{\"lab\":\"selftest\",\"tests_passed\":"<<basics_tests()+layout_tests()+matmul_tests()+thread_tests()<<'}';
  else throw std::invalid_argument("unknown lab");
  std::cout<<'\n';return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
