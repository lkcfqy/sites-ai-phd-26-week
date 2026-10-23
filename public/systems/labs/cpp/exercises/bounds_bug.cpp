// Intentionally invalid educational input. Run ONLY with the sanitizer command in README.
#include <iostream>
int main() {
  int values[4]{10,20,30,40};
  volatile int bad_index=4; // legal indices: 0..3; volatility keeps the runtime check observable.
  std::cout << values[bad_index] << '\n';
}
