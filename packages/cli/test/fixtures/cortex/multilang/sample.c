#include <stdio.h>

typedef struct {
    int x;
    int y;
} Point;

void print_point(Point p) {
    printf("%d, %d\n", p.x, p.y);
}
