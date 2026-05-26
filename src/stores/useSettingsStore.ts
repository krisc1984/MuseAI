import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ReferenceLibrary {
  id: string;
  name: string;
  path: string;
}

export interface SettingsState {
  llmProvider: string;
  modelInterface: 'OpenAI-compatible' | 'Anthropic-compatible';
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  temperature: number;
  maxOutputTokens: number;
  maxContextTokens: number;
  thinkingDepth: 'off' | 'low' | 'medium' | 'high';
  
  systemPrompt: string;
  
  referenceLibraries: ReferenceLibrary[];
  worksDirectory: string | null;

  setLlmConfig: (config: Partial<SettingsState>) => void;
  setSystemPrompt: (prompt: string) => void;
  resetSystemPrompt: () => void;
  addReferenceLibrary: (library: Omit<ReferenceLibrary, 'id'>) => void;
  removeReferenceLibrary: (id: string) => void;
  updateReferenceLibrary: (id: string, library: Partial<ReferenceLibrary>) => void;
  setWorksDirectory: (dir: string | null) => void;
}

export const defaultSystemPrompt = `你是一名有着20年网文写作经验的资深网文作者，专门在番茄小说上写各类长篇、短篇小说。

## 注意事项
- 请始终使用中文回复，除非用户明确要求使用其他语言。你的语气应当温和、直接、专业，像一位熟悉网文创作、剧情结构、人物塑造和文本打磨的编辑型伙伴。
- 系统会在对话开始时把当前工作空间路径、已配置的范文库清单、首轮对话需要阅读的范文库文章内容，以及系统信息（当前时间、操作系统、Python环境和可用 Skills）注入给你。你必须把这些材料当作当前任务的基础上下文来使用。
- 第一轮对话时，你必须先阅读并吸收范文库中的文章，再回答用户。不要跳过范文库，也不要只根据用户的一句话直接发挥。范文库可能包含设定集、范文、人物卡、世界观、历史章节或写作规范；使用它们时要尊重原文风格，不要生硬复述。
- 除非用户发送的消息与写作没有任何关系，否则第一轮对话时，阅读范文库中的文章，是强制执行的，没有任何理由可以让你跳过这一步。
- 如果用户要求你执行特定任务，你应该首先检查系统信息中提供的 **可用 Skills**。如果找到了与任务匹配的 skill，你应该使用 \`skill\` 工具来执行它，这会极大提高你的效率。
- 你需要主动结合当前工作空间中的作品文件、范文库内容和对话上下文来判断任务意图。如果需要查看工作空间中的具体作品文件，再使用工具读取，不要凭空假设文件内容。
- 当用户要求你读取、改写、创建或检查本地文件时，优先使用可用工具完成实际操作，并在动手前说明将要修改的目标。不要凭空声称已经读取或修改文件。

## 禁用词和句型：
- 不要有太多专业术语
- 不要有“不是...而是”、“不是....是”这种句型
- 不要有太多环境描写，多一些情节白描和人物对话

## 严禁以下AI写作特征：
- 可预测的节奏：句法变化极小，导致连贯且可预测的节奏。  
- 功能性用词：用词以功能为导向，侧重事件而非意象，使其缺乏个性化色彩。  
- 机械式写作：文本缺乏文学手法，显得更为机械，缺乏想象力。  
- 可预测的句法：句法受限，偏好陈述句与重复结构，形成可预测的模式。  
- 缺乏创造性语法：语法结构正确，但缺少人类写作中典型的创造性偏离。  
- 实用主义词汇：词汇简单且功能性强，以实用词语为主。  
- 单调的句法：可预测且有限的句法变化，导致句式重复而单调。  
- 机械般的正式感：写作风格正式且精细，注重清晰与规整，但由于缺乏变化，可能显得机械刻板。`;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      llmProvider: 'OpenAI',
      modelInterface: 'OpenAI-compatible',
      llmBaseUrl: 'https://api.openai.com/v1',
      llmApiKey: '',
      llmModel: 'gpt-4o',
      temperature: 0.7,
      maxOutputTokens: 4096,
      maxContextTokens: 128000,
      thinkingDepth: 'off',
      
      systemPrompt: defaultSystemPrompt,
      
      referenceLibraries: [],
      worksDirectory: null,

      setLlmConfig: (config) => set((state) => ({ ...state, ...config })),
      
      setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),

      resetSystemPrompt: () => set({ systemPrompt: defaultSystemPrompt }),
      
      addReferenceLibrary: (library) => set((state) => ({
        referenceLibraries: [
          ...state.referenceLibraries,
          { ...library, id: crypto.randomUUID() }
        ]
      })),
      
      removeReferenceLibrary: (id) => set((state) => ({
        referenceLibraries: state.referenceLibraries.filter((lib) => lib.id !== id)
      })),
      
      updateReferenceLibrary: (id, library) => set((state) => ({
        referenceLibraries: state.referenceLibraries.map((lib) => 
          lib.id === id ? { ...lib, ...library } : lib
        )
      })),

      setWorksDirectory: (dir) => set({ worksDirectory: dir }),
    }),
    {
      name: 'museai-settings-storage',
    }
  )
);
