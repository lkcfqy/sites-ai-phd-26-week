#ifndef MLSYS_LAB_HPP
#define MLSYS_LAB_HPP
#include <cstddef>
#include <cstdint>
#include <vector>

namespace lab {
// const reference: avoids copying the vector and prevents mutation through xs.
double mean(const std::vector<double>& xs);

// vector owns the storage (RAII); no manual new/delete is needed.
class Matrix {
 public:
  Matrix(std::size_t rows, std::size_t cols, double initial = 0.0);
  std::size_t rows() const noexcept { return rows_; }
  std::size_t cols() const noexcept { return cols_; }
  double& at(std::size_t row, std::size_t col);
  const double& at(std::size_t row, std::size_t col) const;
 private:
  std::size_t rows_, cols_;
  std::vector<double> data_;
};
Matrix make_matrix(std::size_t rows, std::size_t cols, unsigned seed);
Matrix matmul_naive(const Matrix& a, const Matrix& b);
Matrix matmul_blocked(const Matrix& a, const Matrix& b, std::size_t tile);
double max_error(const Matrix& a, const Matrix& b);
double checksum(const Matrix& a);
std::int64_t serial_sum(const std::vector<int>& xs);
std::int64_t parallel_sum(const std::vector<int>& xs, std::size_t workers);
}
#endif
