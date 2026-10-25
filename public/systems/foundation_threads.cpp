// Reference: bounded C++ threads, disjoint partials, join before aggregation.
#include <algorithm>
#include <cassert>
#include <cstddef>
#include <iostream>
#include <numeric>
#include <stdexcept>
#include <thread>
#include <vector>
long long parallel_sum(const std::vector<int>& values, unsigned workers) {
    if (workers < 1 || workers > 4) throw std::invalid_argument("workers must be 1..4");
    const auto count = std::min<std::size_t>(workers, values.size());
    std::vector<long long> partial(count, 0);
    std::vector<std::thread> threads;
    threads.reserve(count);
    // Thread creation can fail. Joining already started workers prevents terminate.
    try {
        for (std::size_t i=0; i<count; ++i) {
            const auto start=values.size()*i/count, end=values.size()*(i+1)/count;
            threads.emplace_back([&, i, start, end] {
                partial[i]=std::accumulate(values.begin()+start, values.begin()+end, 0LL);
            });
        }
    } catch (...) { for(auto& thread:threads) thread.join(); throw; }
    for(auto& thread:threads) thread.join();
    return std::accumulate(partial.begin(),partial.end(),0LL);
}
int main() {
    for (int n : {0,1,2,7,19}) {
        std::vector<int> values(n); std::iota(values.begin(),values.end(),1);
        for(unsigned workers=1;workers<=4;++workers) assert(parallel_sum(values,workers)==n*(n+1LL)/2);
    }
    bool rejected=false; try { parallel_sum({1},0); } catch(const std::invalid_argument&) { rejected=true; }
    assert(rejected); std::cout << "20 shape/thread cases and invalid worker count passed\n";
}
