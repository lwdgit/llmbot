import express from 'express';
import fileUpload from 'express-fileupload';
import assert from 'assert';
import chat from '../src';
import { client } from '../src/gradio/client';

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIRequest {
  model: string;
  messages: AIMessage[];
}

interface AIResponse {
  whisper?: string;
  choices: {
    message: AIMessage;
  }[]
}

const PORT = 8000;
const app = express();
app.use(express.json());
app.use(fileUpload({
  createParentPath: true,
  debug: true,
  limits: { fileSize: 5000 * 1024 * 1024 },
}));


function parseOpenAIMessage(request: AIRequest) {
  return {
    prompt: request.messages?.reverse().find((message) => message.role === 'user')?.content,
    model: request.model,
  };
}

function responseOpenAIMessage(content: string, input?: string): AIResponse {
  return {
    whisper: input,
    choices: [{
      message: {
        role: 'assistant',
        content,
      },
    }],
  };
}

app.post('/api/chat', async (req, res) => {
  console.log('req', res.body);
  const { prompt, model } = parseOpenAIMessage(req.body);
  assert(prompt, '输入不能为空');
  const content = await chat(prompt, model as any);
  const response = responseOpenAIMessage(content);
  res.json(response);
});

app.use('/api/audio', async (req, res, next) => {
  const audio = req.files.file.data.toString('base64');
  const { predict } = await client('justest-paddlespeechasr.hf.space', { session_hash: Math.random().toString(36).substring(2) });
  const app: any = await predict(0, [{
    data: `data:audio/wav;base64,${audio}`,
    name: 'audio/wav',
  }]);
  const prompt = app.data?.[0].slice(2);
  console.log('输入', prompt);
  const content = await chat(prompt, {
    model: 'midjourney',
  });
  console.log('输出', content);
  res.json(responseOpenAIMessage(content, prompt));
});

app.listen(PORT, '0.0.0.0');
console.log(`服务已启动，端口为: ${PORT}`);
/**
curl http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
     "model": "chatgpt",
     "messages": [{"role": "user", "content": "你好!"}],
     "temperature": 0.7
   }'
 */