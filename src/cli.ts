#!/usr/bin/env node

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import chat from './';

export async function cli() {
  const rl = readline.createInterface({ input, output });
  let lastLength = 0;
  while (true) {
    const prompt = await rl.question('User: ');
    if (!prompt.trim()) break;
    process.stdout.write('AiBot: ');
    const response = await chat(prompt, {
      model: process.argv[2] as any || undefined,
      onMessage: (msg) => {
        process.stdout.write(msg.slice(lastLength));
        lastLength = msg.length;
      },
    });
    process.stdout.write(response.slice(lastLength));
    lastLength = 0;
    process.stdout.write('\n');
  }
  rl.close();
}

cli();
