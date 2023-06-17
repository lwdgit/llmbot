
import { chat } from '../src/gradio';

const local = [
    'http://127.0.0.1:6379',
];

const custom = [
    'https://chat.lmsys.org',
];

const modelscope = [
    'https://modelscope.cn/studios/damo/role_play_chat/summary',
    'https://modelscope.cn/studios/AI-ModelScope/ChatGLM6B-unofficial/summary',
    'https://modelscope.cn/studios/baichuan-inc/baichuan-7B-demo/summary',
    'https://modelscope.cn/studios/Fengshenbang/Ziya_LLaMA_13B_v1_online/summary',
];

const huggingface = [
    'https://huggingface.co/spaces/HuggingFaceH4/falcon-chat',
    'https://huggingface.co/spaces/multimodalart/ChatGLM-6B',
    'https://huggingface.co/spaces/ysharma/ChatGLM-6b_Gradio_Streaming',
    'https://huggingface.co/spaces/justest/vicuna-ggml',
    'https://huggingface.co/spaces/HuggingFaceH4/starchat-playground',
    // 'https://huggingface.co/spaces/IDEA-CCNL/Ziya-v1'
];

chat('你叫什么名字', {
    url: modelscope.at(-1),
}).then(res => console.log({res}));

// chat('你叫什么名字', {
//     url: huggingface.at(-1),
// }).then(res => console.log({res})).catch(e => console.log(e));

// // vicuna
// chat('你叫什么名字', {
//     endpoint: custom[0],
//     fn_index: 9,
// }).then(res => console.log({res})).catch(e => console.log(e));
