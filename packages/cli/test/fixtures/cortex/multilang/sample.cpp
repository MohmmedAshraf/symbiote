#include <string>

class Greeter {
public:
    std::string greet(const std::string& name) {
        return "Hello, " + name;
    }
};

void standalone_function() {
    Greeter g;
    g.greet("World");
}
