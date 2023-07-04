#!/usr/bin/env node

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import chat from '../src';

class Spinner {
  tick: number = 300;
  processing = false;
  index = 0;
  tid: any;
  chars = {
    output: ['-', '\\', '|', '/'],
    input: ['│', ' '],
  }
  currentMode: 'input' | 'output' = 'output';
  setMode(mode: 'input' | 'output') {
    this.currentMode = mode;
    if (mode === 'input') {
      this.tick = 900;
    } else {
      this.tick = 300;
    }
  }

  start() {
    this.processing = true;
    if (this.tid) return;
    this.spin();
  }

  spin() {
    this.tid = setTimeout(() => {
      if (!this.processing) return;
      const chars = this.chars[this.currentMode];
      this.index = ++this.index % chars.length;
      const char = chars[this.index];
      process.stdout.write(char);
      process.stdout.moveCursor(-1, 0);
      this.spin();
    }, this.tick);
  }

  write(text: string) {
    if(text.charAt(0) === '\n') {
      process.stdout.write(' ');
    }
    process.stdout.write(text);
  }

  stop() {
    this.processing = false;
    this.tid = null;
  }
}

class RL {
  rl?: ReturnType<typeof readline.createInterface>;
  constructor(readonly options: Parameters<typeof readline.createInterface>[0]) {
    this.rl = readline.createInterface(options);
  }
  async question(prompt: string) {
    this.rl?.setPrompt(prompt);
    this.rl?.prompt(true);
    const lines: string[] = [];
    let closeTid: NodeJS.Timeout;
    for await (const input of this.rl??[]) {
      clearTimeout(closeTid!);
      closeTid = setTimeout(() => {
        if (input === '') {
          process.stdout.write('\n');
        }
        this.close();
      }, 500);
      lines.push(input);
    }
    return lines.join('\n');
  }
  close() {
    this.rl?.close();
    this.rl = undefined;
  }
}

export async function cli() {
  let lastLength = 0;
  const spinner = new Spinner();
  while (true) {
    const prompt = await new RL({ input, output }).question('Man: ');
    if (!prompt.trim()) break;
    spinner.start();
    spinner.write('Bot: ');

    const response = await chat(prompt, {
      onMessage: (msg: string) => {
        spinner.write(msg.slice(lastLength));
        lastLength = msg.length;
      },
    });
    spinner.write(response.slice(lastLength));
    lastLength = 0;
    spinner.write('\n');
    spinner.stop();
  }
}

cli();
