#include "lab.hpp"
#include <numeric>
#include <stdexcept>
#include <thread>
namespace lab {
// Joins even if constructing a later thread throws. Referenced data outlives this guard.
struct JoinThreads {
  std::vector<std::thread>& threads;
  ~JoinThreads() { for(auto& t: threads) if(t.joinable()) t.join(); }
};
std::int64_t serial_sum(const std::vector<int>& xs) {
  return std::accumulate(xs.begin(),xs.end(),std::int64_t{0});
}
std::int64_t parallel_sum(const std::vector<int>& xs,std::size_t workers) {
  if(workers==0 || workers>8) throw std::invalid_argument("workers must be 1..8");
  std::vector<std::int64_t> partial(workers,0);
  std::vector<std::thread> threads;
  threads.reserve(workers);
  JoinThreads guard{threads};
  for(std::size_t w=0;w<workers;++w) {
    const auto begin=xs.size()*w/workers;
    const auto end=xs.size()*(w+1)/workers;
    threads.emplace_back([&xs,&partial,w,begin,end]{
      std::int64_t local=0;
      for(auto i=begin;i<end;++i) local+=xs[i];
      // Distinct vector elements are written; there is no shared counter update.
      partial[w]=local;
    });
  }
  for(auto& t:threads) t.join();
  return std::accumulate(partial.begin(),partial.end(),std::int64_t{0});
}
}
