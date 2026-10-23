#include "lab.hpp"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace lab {
Matrix::Matrix(std::size_t rows, std::size_t cols, double initial)
    : rows_(rows), cols_(cols) {
  // Bounded educational workload, also prevents dimension multiplication overflow.
  if (rows == 0 || cols == 0 || rows > 256 || cols > 256)
    throw std::invalid_argument("matrix dimensions must be 1..256");
  data_.assign(rows * cols, initial);
}
double& Matrix::at(std::size_t row, std::size_t col) {
  if (row >= rows_ || col >= cols_) throw std::out_of_range("matrix index");
  return data_.at(row * cols_ + col);
}
const double& Matrix::at(std::size_t row, std::size_t col) const {
  if (row >= rows_ || col >= cols_) throw std::out_of_range("matrix index");
  return data_.at(row * cols_ + col);
}
Matrix make_matrix(std::size_t rows, std::size_t cols, unsigned seed) {
  Matrix m(rows, cols);
  for (std::size_t i = 0; i < rows; ++i)
    for (std::size_t j = 0; j < cols; ++j)
      m.at(i,j) = static_cast<double>(static_cast<int>((i*17+j*7+seed)%31)-15) / 13.0;
  return m;
}
static void compatible(const Matrix& a, const Matrix& b) {
  if (a.cols() != b.rows()) throw std::invalid_argument("matmul inner dimensions differ");
}
Matrix matmul_naive(const Matrix& a, const Matrix& b) {
  compatible(a,b);
  Matrix c(a.rows(),b.cols());
  for (std::size_t i=0;i<a.rows();++i)
    for (std::size_t j=0;j<b.cols();++j)
      for (std::size_t k=0;k<a.cols();++k)
        c.at(i,j) += a.at(i,k)*b.at(k,j);
  return c;
}
Matrix matmul_blocked(const Matrix& a, const Matrix& b, std::size_t tile) {
  compatible(a,b);
  if (tile == 0 || tile > 64) throw std::invalid_argument("tile must be 1..64");
  Matrix c(a.rows(),b.cols());
  for (std::size_t ii=0;ii<a.rows();ii+=tile)
    for (std::size_t kk=0;kk<a.cols();kk+=tile)
      for (std::size_t jj=0;jj<b.cols();jj+=tile)
        for (std::size_t i=ii;i<std::min(ii+tile,a.rows());++i)
          for (std::size_t k=kk;k<std::min(kk+tile,a.cols());++k) {
            const double aik=a.at(i,k);
            for (std::size_t j=jj;j<std::min(jj+tile,b.cols());++j)
              c.at(i,j) += aik*b.at(k,j);
          }
  return c;
}
double max_error(const Matrix& a, const Matrix& b) {
  if (a.rows()!=b.rows() || a.cols()!=b.cols()) throw std::invalid_argument("compare shape");
  double result=0;
  for (std::size_t i=0;i<a.rows();++i)
    for (std::size_t j=0;j<a.cols();++j) {
      if (!std::isfinite(a.at(i,j)) || !std::isfinite(b.at(i,j)))
        throw std::runtime_error("non-finite result");
      result=std::max(result,std::abs(a.at(i,j)-b.at(i,j)));
    }
  return result;
}
double checksum(const Matrix& a) {
  double total=0;
  for(std::size_t i=0;i<a.rows();++i)
    for(std::size_t j=0;j<a.cols();++j) total+=a.at(i,j);
  return total;
}
}
