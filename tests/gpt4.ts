import Gpt4 from '../src/gpt4';

new Gpt4().sendMessage('你是谁', {
    onMessage: (msg) => console.log(msg),
})
.then(res => console.log(res));