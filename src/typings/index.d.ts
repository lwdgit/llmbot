export type LLMMessage = (msg: string) => void;
export interface LLMOpts<M> {
  model: M,
  onMessage?: LLMMessage,
}
