// Simple test to verify Jest is working
import { describe, it, expect } from '@jest/globals';

describe('Basic Jest Test', () => {
    it('should pass a simple test', () => {
        expect(1 + 1).toBe(2);
    });

    it('should test string operations', () => {
        const str = 'Hello World';
        expect(str).toContain('World');
        expect(str.length).toBe(11);
    });

    it('should test array operations', () => {
        const arr = [1, 2, 3, 4, 5];
        expect(arr).toHaveLength(5);
        expect(arr).toContain(3);
        expect(arr[0]).toBe(1);
    });
});
