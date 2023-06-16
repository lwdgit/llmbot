class MuteLock {
  private lock = false;
  private sleep = ms => new Promise((resolve) => setTimeout(resolve, ms));
  async acquire() {
    let count = 60;
    while (this.lock && count--) {
      await this.sleep(1000);
    }
    this.lock = true;
  }

  async release() {
    this.lock = false;
  }
}

export const lock = new MuteLock();