import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenBucket } from '../../src/main/utils/token-bucket';

describe('TokenBucket', () => {
  beforeEach(() => {
    // Use fake timers for consistent testing
    vi.useFakeTimers();
  });

  it('should create a bucket with specified capacity and refill rate', () => {
    const bucket = new TokenBucket(10, 2);
    expect(bucket.getTokens()).toBe(10);
  });

  it('should consume tokens when available', async () => {
    const bucket = new TokenBucket(10, 2);

    // Start consuming (don't await yet)
    const consumePromise = bucket.consume(3);

    // Should resolve immediately since tokens are available
    await consumePromise;

    expect(bucket.getTokens()).toBe(7);
  });

  it('should wait when not enough tokens are available', async () => {
    const bucket = new TokenBucket(5, 2); // 5 tokens, refills 2/sec

    // Consume all tokens
    await bucket.consume(5);
    expect(bucket.getTokens()).toBe(0);

    // Try to consume more - should wait
    const consumePromise = bucket.consume(2);

    // Advance time by 1 second (should add 2 tokens)
    await vi.advanceTimersByTimeAsync(1000);

    await consumePromise;

    // Should have consumed the 2 refilled tokens
    expect(bucket.getTokens()).toBe(0);
  });

  it('should refill tokens over time', async () => {
    const bucket = new TokenBucket(10, 2); // refills 2 tokens/second

    // Consume some tokens
    await bucket.consume(8);
    expect(bucket.getTokens()).toBe(2);

    // Advance time by 2 seconds (should add 4 tokens)
    await vi.advanceTimersByTimeAsync(2000);

    // Tokens should have refilled
    expect(bucket.getTokens()).toBe(6);
  });

  it('should not exceed capacity when refilling', async () => {
    const bucket = new TokenBucket(10, 5); // refills 5 tokens/second

    // Start with full bucket
    expect(bucket.getTokens()).toBe(10);

    // Advance time by 10 seconds (would add 50 tokens)
    await vi.advanceTimersByTimeAsync(10000);

    // Should cap at capacity
    expect(bucket.getTokens()).toBe(10);
  });

  it('should check token availability without consuming', async () => {
    const bucket = new TokenBucket(10, 2);

    expect(bucket.available(5)).toBe(true);
    expect(bucket.available(15)).toBe(false);

    // Tokens should not be consumed
    expect(bucket.getTokens()).toBe(10);
  });

  it('should throw error if trying to consume more than capacity', async () => {
    const bucket = new TokenBucket(10, 2);

    await expect(bucket.consume(15)).rejects.toThrow(
      'Cannot consume 15 tokens: exceeds bucket capacity of 10'
    );
  });

  it('should reset bucket to full capacity', async () => {
    const bucket = new TokenBucket(10, 2);

    // Consume some tokens
    await bucket.consume(8);
    expect(bucket.getTokens()).toBe(2);

    // Reset
    bucket.reset();

    // Should be back to full capacity
    expect(bucket.getTokens()).toBe(10);
  });

  it('should handle multiple rapid consumptions', async () => {
    const bucket = new TokenBucket(10, 2);

    // Consume tokens rapidly
    await bucket.consume(2);
    await bucket.consume(2);
    await bucket.consume(2);

    expect(bucket.getTokens()).toBe(4);
  });

  it('should allow bursts followed by throttling', async () => {
    const bucket = new TokenBucket(10, 2);

    // Burst: consume all tokens quickly
    await bucket.consume(10);
    expect(bucket.getTokens()).toBe(0);

    // Now we need to wait for refills
    const start = Date.now();

    // Try to consume 4 more tokens - should wait for 2 seconds
    const consumePromise = bucket.consume(4);

    // Advance time to allow refill
    await vi.advanceTimersByTimeAsync(2000);

    await consumePromise;

    // Should have consumed the refilled tokens
    expect(bucket.getTokens()).toBe(0);
  });

  it('should handle fractional refill rates', async () => {
    const bucket = new TokenBucket(10, 0.5); // 0.5 tokens per second

    await bucket.consume(10);
    expect(bucket.getTokens()).toBe(0);

    // Advance by 4 seconds (should add 2 tokens)
    await vi.advanceTimersByTimeAsync(4000);

    expect(bucket.getTokens()).toBe(2);
  });

  it('should handle concurrent consume requests', async () => {
    const bucket = new TokenBucket(10, 5);

    // Start multiple consume operations
    const promises = [
      bucket.consume(3),
      bucket.consume(3),
      bucket.consume(3),
    ];

    // All should complete eventually
    await Promise.all(promises);

    // Should have consumed 9 tokens total
    expect(bucket.getTokens()).toBe(1);
  });
});
