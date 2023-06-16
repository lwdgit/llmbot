#!/usr/bin/env node

import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import chat from './';

export async function cli() {
  const rl = readline.createInterface({ input, output });
  while (true) {
    const prompt = await rl.question('用户: ');
    if (prompt === '') break;
    const response = await chat(prompt);
    console.log('AI: ' + response);
  }
  rl.close();
}

cli();

