/**
 * OpenAI 兼容 Chat Completions 客户端（DeepSeek / Kimi / OpenAI 等均可，
 * 通过 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 切换）。
 * 只用于"命令理解"：要求模型返回可解析的 JSON 文本。
 */
import { env } from "./env";

const TIMEOUT_MS = 45_000;

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export async function chatJson(params: {
  system: string;
  user: string;
}): Promise<string> {
  const { llm } = env;
  if (!llm.baseUrl || !llm.apiKey || !llm.model) {
    throw new LlmError("LLM 未配置（LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）");
  }
  const url = `${llm.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  // DeepSeek v4 系列是推理模型：思考会先吃掉大量输出 token，命令解析场景不需要思考，
  // 显式传 thinking.disabled（不支持该参数的模型会 4xx，自动走下面的裸请求降级）。
  const isDeepseekReasoner = /deepseek.*v4/i.test(llm.model);
  // 输出预算拉大：兼容仍带推理的模型（思考 + 长上下文 + 最终 JSON）
  const baseBody: Record<string, unknown> = {
    model: llm.model,
    max_tokens: 8192,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  };

  const request = async (extra: Record<string, unknown>): Promise<string> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${llm.apiKey}`,
        },
        body: JSON.stringify({ ...baseBody, ...extra }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const brief = text ? `：${text.slice(0, 200)}` : "";
        throw new LlmError(`上游返回 HTTP ${res.status}${brief}`, res.status);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      return (data.choices?.[0]?.message?.content ?? "").trim();
    } finally {
      clearTimeout(timer);
    }
  };

  // 优先要求 json_object + 低温度；个别模型/网关不支持这些参数时报 4xx，降级裸请求重试一次
  try {
    return await request({
      temperature: 0.1,
      response_format: { type: "json_object" },
      ...(isDeepseekReasoner ? { thinking: { type: "disabled" } } : {}),
    });
  } catch (err) {
    if (err instanceof LlmError && err.status != null && err.status >= 400 && err.status < 500) {
      return await request({});
    }
    throw err;
  }
}
