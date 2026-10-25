// Reference: lifetime ends on both normal scope exit and exception unwinding.
#include <cassert>
#include <iostream>
#include <stdexcept>
#include <vector>
struct Owner {
    int& alive;
    std::vector<int> values{1, 2, 3};
    explicit Owner(int& count) : alive(count) { ++alive; }
    ~Owner() { --alive; }
    Owner(const Owner&) = delete;
    Owner& operator=(const Owner&) = delete;
};
int main() {
    int alive = 0;
    { Owner sample(alive); assert(alive == 1); assert(sample.values.at(2) == 3); }
    assert(alive == 0);
    bool caught = false;
    try { Owner sample(alive); static_cast<void>(sample.values.at(3)); }
    catch (const std::out_of_range&) { caught = true; assert(alive == 0); }
    assert(caught);
    assert(alive == 0);
    std::cout << "normal and exception paths release the owner; alive=" << alive << '\n';
}
