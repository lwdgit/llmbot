import chat from '../src';

chat('/use gradio').then(res => {
    console.log(res);
    chat('你好').then(res => console.log(res));
    chat('你是谁').then(res => console.log(res));
    chat('1+1').then(res => console.log(res));
});


// chat('你好').then(res => console.log(res));
// chat('你是谁').then(res => console.log(res));
// chat('1+1').then(res => console.log(res));