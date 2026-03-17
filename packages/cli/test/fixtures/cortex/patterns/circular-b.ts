import { helperA } from './circular-a';

export function helperB(): string {
    return helperA() + '-b';
}
