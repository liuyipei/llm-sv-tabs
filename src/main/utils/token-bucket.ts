/**
 * Token bucket algorithm for rate limiting.
 *
 * This implements a more sophisticated rate limiting strategy compared to
 * simple time-based delays. The token bucket allows bursts of requests
 * while maintaining an average rate limit.
 *
 * @example
 * const bucket = new TokenBucket(10, 2); // 10 tokens max, refills at 2 tokens/second
 * await bucket.consume(1); // Wait until a token is available, then consume it
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  /**
   * Create a new token bucket.
   *
   * @param capacity - Maximum number of tokens the bucket can hold
   * @param refillRate - Number of tokens added per second
   */
  constructor(
    private capacity: number,
    private refillRate: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Attempt to consume tokens from the bucket.
   * If not enough tokens are available, waits until they become available.
   *
   * @param tokens - Number of tokens to consume
   * @returns Promise that resolves when tokens have been consumed
   */
  async consume(tokens: number = 1): Promise<void> {
    if (tokens > this.capacity) {
      throw new Error(`Cannot consume ${tokens} tokens: exceeds bucket capacity of ${this.capacity}`);
    }

    // Wait until we have enough tokens
    while (true) {
      this.refill();

      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }

      // Calculate how long to wait for the next token
      const tokensNeeded = tokens - this.tokens;
      const waitTime = (tokensNeeded / this.refillRate) * 1000;

      // Wait a bit before checking again (with a minimum wait time)
      await new Promise((resolve) => setTimeout(resolve, Math.max(100, waitTime)));
    }
  }

  /**
   * Check if tokens are available without consuming them.
   *
   * @param tokens - Number of tokens to check for
   * @returns true if enough tokens are available
   */
  available(tokens: number = 1): boolean {
    this.refill();
    return this.tokens >= tokens;
  }

  /**
   * Get the current number of tokens in the bucket.
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Reset the bucket to full capacity.
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}
