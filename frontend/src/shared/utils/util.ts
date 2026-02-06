export function nonNull<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) {
        throw new Error(`Expected value to be non-null, but got ${value}`);
    }
    return value;
}

export class Canceled extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'Canceled';
    }
}

export type PromiseHandle<T> = {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
};
