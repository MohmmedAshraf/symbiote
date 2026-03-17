import { helperB } from './circular-b';

export function helperA(): string {
    return helperB() + '-a';
}
