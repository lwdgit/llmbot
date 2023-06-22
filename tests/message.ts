import chat from '..';
// const chat = require('llmbot').default;
import {
 Message,
} from 'wechaty'

export default async msg => {
    if (msg.type() !== Message.Type.Text)
        return
    if (msg.self())
        return
    console.log('receive msg', msg.toString())
    const room = msg.room();
    let text = msg.text();
    if (room && text.startsWith('@小黄鸭')) {
        text = text.slice(5);
    } else if (room) {
        return;
    }
    const response = await chat(text);
    await msg.say(response);
    console.log('response msg', response);
}