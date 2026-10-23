#include "lab.hpp"
#include <numeric>
#include <stdexcept>
namespace lab {
double mean(const std::vector<double>& xs) {
  if (xs.empty()) throw std::invalid_argument("mean: empty input");
  return std::accumulate(xs.begin(), xs.end(), 0.0) / static_cast<double>(xs.size());
}
}
