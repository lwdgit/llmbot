import EventEmitter from 'node:stream';
import Debug from 'debug';
const debug = Debug('llmbot:lock');

class MuteLock {
  private lock = false;
  private event = new EventEmitter();
  async acquire() {
    if (this.lock) {
      let ownTicket = Math.random();
      return new Promise((resolve) => {
        const sendTicket = () => {
          debug('show ticket', ownTicket);
          this.event.emit('ticket', ownTicket);
        };
        const released = (ticket) => {
          if (ticket === ownTicket) {
            this.event.off('release', sendTicket);
            this.event.off('released', released);
            debug('acquired', ticket);
            resolve(true);
          }
        }
        this.event.on('release', sendTicket);
        this.event.on('released', released);
      });
    } else {
      debug('acquired directly');
      this.lock = true;
    }
  }

  async release() {
    let tid = setTimeout(() => {
      this.event.off('ticket', fn);
      this.lock = false;
      // 防止死锁
    }, 180000);

    const fn = (ticket: number) => {
      debug('get ticket', ticket);
      this.lock = true;
      this.event.emit('released', ticket);
      clearTimeout(tid);
    }

    debug('before release');
    this.event.once('ticket', fn);
    this.event.emit('release');
    this.lock = false;
    debug('release');
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const lock = new MuteLock();