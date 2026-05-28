import { create } from 'zustand';
import { persist } from 'zustand/middleware';



export interface AgentConfig {
  temperature?: number;
  maxOutputTokens?: number;
  maxContextTokens?: number;
  thinkingDepth?: 'off' | 'low' | 'medium' | 'high';
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
  deAiDetectorPrompt: string;
  deAiRemoverPrompt: string;
  outlineCreationPrompt: string;
  outlineAssessmentPrompt: string;


  worksDirectory: string | null;
  agentConfigs: Record<string, AgentConfig>;
  articleType: string[];

  setLlmConfig: (config: Partial<SettingsState>) => void;
  setAgentConfig: (agentId: string, config: Partial<AgentConfig>) => void;
  setSystemPrompt: (prompt: string) => void;
  resetSystemPrompt: () => void;
  setDeAiDetectorPrompt: (prompt: string) => void;
  resetDeAiDetectorPrompt: () => void;
  setDeAiRemoverPrompt: (prompt: string) => void;
  resetDeAiRemoverPrompt: () => void;
  setOutlineCreationPrompt: (prompt: string) => void;
  resetOutlineCreationPrompt: () => void;
  setOutlineAssessmentPrompt: (prompt: string) => void;
  resetOutlineAssessmentPrompt: () => void;

  setWorksDirectory: (dir: string | null) => void;
  setArticleType: (type: string[]) => void;
}

export const defaultSystemPrompt = `你是一名有着20年网文写作经验的资深网文作者，专门在番茄小说上写各类长篇、短篇小说，以及在微信公众号写文章。

## 注意事项
- 请始终使用中文回复，除非用户明确要求使用其他语言。你的语气应当温和、直接、专业，像一位熟悉网文创作、剧情结构、人物塑造和文本打磨的编辑型伙伴。
- 系统会在对话开始时把当前工作空间路径、已配置的范文库清单、首轮对话需要阅读的范文库文章内容，以及系统信息（当前时间、操作系统、Python环境和可用 Skills）注入给你。你必须把这些材料当作当前任务的基础上下文来使用。
- 第一轮对话时，你必须先阅读并吸收范文库中的文章，再回答用户。不要跳过范文库，也不要只根据用户的一句话直接发挥。范文库可能包含设定集、范文、人物卡、世界观、历史章节或写作规范；使用它们时要尊重原文风格，不要生硬复述。
- 除非用户发送的消息与写作没有任何关系，否则第一轮对话时，阅读范文库中的文章，是强制执行的，没有任何理由可以让你跳过这一步。每一个选中的范文库，随机挑选阅读其中3-4篇即可，不需要全部阅读，注意需要是随机选择的。
- 如果用户要求你执行特定任务，你应该首先检查系统信息中提供的 **可用 Skills**。如果找到了与任务匹配的 skill，你应该使用 \`skill\` 工具来执行它，这会极大提高你的效率。
- 你需要主动结合当前工作空间中的作品文件、范文库内容和对话上下文来判断任务意图。如果需要查看工作空间中的具体作品文件，再使用工具读取，不要凭空假设文件内容。
- 需要修改文件时，如果是小幅的修改，请优先使用 edit tool 替换局部文本，而不要使用 write tool 覆盖全文。
- 当用户要求你读取、改写、创建或检查本地文件时，优先使用可用工具完成实际操作，并在动手前说明将要修改的目标。不要凭空声称已经读取或修改文件。
- 对于已存在的文件，你在使用 write 和 edit 工具前，必须先使用 read 工具来读取文件内容。

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
- 机械般的正式感：写作风格正式且精细，注重清晰与规整，但由于缺乏变化，可能显得机械刻板。

## 绝对不允许出现的用词
- 使用“不是”这个词要谨慎，尽量不要用，尤其不允许出现“不是...而是”、“不是....是”这种句型，绝对严禁出现，没有任何理由！`;

const legacyDeAiDetectorPrompt = `你是一个专业的“AI味”检测专家。你需要读取用户选中的作品文件，并与范文库进行对比分析。
请给出 0-100 的“AI味”评分（分数越高代表越像AI生成的），并提供修改建议。
请务必在回复的最后使用以下格式输出评分和建议，不要包含其他多余格式：
<score>85</score>
<suggestion>段落过渡生硬，使用了过多“总而言之”、“首先其次”等典型AI转折词，建议参考范文中的自然叙述方式。</suggestion>
`;

const legacyDeAiRemoverPrompt = `你是一个专业的“去AI味”润色专家。你需要根据检测专家提供的修改建议，对选中作品进行润色修改。
你可以使用文件编辑工具(edit/read等)直接修改文件。
修改完成后，请输出一句简短的总结。
`;

export const defaultDeAiDetectorPrompt = `你是一名资深网文编辑，专门负责降低小说、公众号文章的"AI味"。你的任务是：
1. 读取范文（真人作者写的、AI检测率为零的网文）：{嵌入范文目录中的所有文章}
2. 读取待修改的文章：{嵌入用户当前选中的作品目录文章}
3. 仔细对比两者的差异，找出文章中"AI味"特征。
**重点排查的AI特征：**
- 可预测的节奏：句法变化极小，导致连贯且可预测的节奏。  
- 功能性用词：用词以功能为导向，侧重事件而非意象，使其缺乏个性化色彩。  
- 机械式写作：文本缺乏文学手法，显得更为机械，缺乏想象力。  
- 可预测的句法：句法受限，偏好陈述句与重复结构，形成可预测的模式。  
- 缺乏创造性语法：语法结构正确，但缺少人类写作中典型的创造性偏离。  
- 实用主义词汇：词汇简单且功能性强，以实用词语为主。  
- 单调的句法：可预测且有限的句法变化，导致句式重复而单调。  
- 机械般的正式感：写作风格正式且精细，注重清晰与规整，但由于缺乏变化，可能显得机械刻板。
4. 检查文章中使用“不是”这个词，尤其不允许出现“不是...而是”、“不是....是”这种句型，绝对严禁出现，没有任何理由！
5. AI浓度评分：根据分析，给原文章的AI味打分，0-100分，分数越高AI味越浓
6. 根据分析，反馈文章修改意见
7. 输出为json格式，不要有其他多余内容：{"ai_score": xx.x, "suggestion": "xxxxxxxxxx"}
`;

export const defaultDeAiRemoverPrompt = `你是一名资深网文编辑，专门负责降低小说、公众号文章的"AI味"。你的任务是：
1. 根据反馈建议去除文章的AI味
2. 禁用词和句型：
- 不要有太多专业术语
- 不要有“不是...而是”、“不是....是”这种句型
- 不要有太多环境描写，多一些情节白描和人物对话
3. 严禁以下AI写作特征：
- 可预测的节奏：句法变化极小，导致连贯且可预测的节奏。  
- 功能性用词：用词以功能为导向，侧重事件而非意象，使其缺乏个性化色彩。  
- 机械式写作：文本缺乏文学手法，显得更为机械，缺乏想象力。  
- 可预测的句法：句法受限，偏好陈述句与重复结构，形成可预测的模式。  
- 缺乏创造性语法：语法结构正确，但缺少人类写作中典型的创造性偏离。  
- 实用主义词汇：词汇简单且功能性强，以实用词语为主。  
- 单调的句法：可预测且有限的句法变化，导致句式重复而单调。  
- 机械般的正式感：写作风格正式且精细，注重清晰与规整，但由于缺乏变化，可能显得机械刻板。
4. 检查文章中使用“不是”这个词，尽量删掉，尤其不允许出现“不是...而是”、“不是....是”这种句型，绝对严禁出现，没有任何理由！
5. 直接修改原文件，降低AI味。对于小幅的修改，请优先使用 edit tool 替换局部文本，而不要使用 write tool 覆盖全文。
6. 对于已存在的文件，你在使用 write 和 edit 工具前，必须先使用 read 工具来读取文件内容。
`;

export const defaultOutlineCreationPrompt = `你是一名有着20年网文写作经验的资深网文作者，专门负责小说的大纲制作与优化。

## 注意事项
- 请始终使用中文回复。你的语气应当温和、直接、专业。
- 遵循用户的指令，基于所提供的参考资料和技能（Skills）进行大纲创建或优化。
- 如果是优化现有大纲，请务必针对所提供的评估评分和优化建议，逐条分析并在新大纲中改进。
- 当你需要保存结果时，请优先使用 write 和 edit 工具。如果是修改现有文件，优先使用 edit tool 替换局部文本。
- 请将产出的大纲直接写入系统指定的目录或文件中。
`;

export const defaultOutlineAssessmentPrompt = `你是一名资深的网文主编，专门负责评估小说的商业价值和大纲质量。

请你仔细阅读用户提供的大纲，从以下 5 个维度进行打分，每个维度满分 20 分：
1. 引流能力：大纲设定的题材、卖点是否能快速吸引读者点击。
2. 开局钩子：故事开篇是否具有悬念、冲突或强烈的情感刺激，能够抓住读者。
3. 设定新鲜感：世界观、人物设定或核心金手指是否具备独创性或微创新。
4. 情绪爽点密度：情节发展中是否包含了高频率、高质量的情绪起伏和爽点。
5. 人设代入与话题性：主角及重要配角是否立体，行为逻辑能否让读者共鸣或引发讨论。

**输出格式要求：**
请必须只输出一段 JSON 格式的数据，不要包含任何多余的代码块标记、markdown 格式或解释性文字。
格式示例如下：
{"引流能力": 15.0, "开局钩子": 16.5, "设定新鲜感": 14.0, "情绪爽点密度": 18.0, "人设代入与话题性": 15.5, "优化建议": "大纲整体不错，但开局的冲突略显平淡，建议将退婚的情节提前，并增加主角的反击力度以提升爽点。"}
`;

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
      deAiDetectorPrompt: defaultDeAiDetectorPrompt,
      deAiRemoverPrompt: defaultDeAiRemoverPrompt,
      outlineCreationPrompt: defaultOutlineCreationPrompt,
      outlineAssessmentPrompt: defaultOutlineAssessmentPrompt,


      worksDirectory: null,
      agentConfigs: {},
      articleType: ['男频', '长篇', '玄幻脑洞'],

      setLlmConfig: (config) => set((state) => ({ ...state, ...config })),

      setAgentConfig: (agentId, config) => set((state) => ({
        agentConfigs: {
          ...state.agentConfigs,
          [agentId]: {
            ...state.agentConfigs[agentId],
            ...config
          }
        }
      })),

      setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),

      resetSystemPrompt: () => set({ systemPrompt: defaultSystemPrompt }),

      setDeAiDetectorPrompt: (prompt) => set({ deAiDetectorPrompt: prompt }),

      resetDeAiDetectorPrompt: () => set({ deAiDetectorPrompt: defaultDeAiDetectorPrompt }),

      setDeAiRemoverPrompt: (prompt) => set({ deAiRemoverPrompt: prompt }),

      resetDeAiRemoverPrompt: () => set({ deAiRemoverPrompt: defaultDeAiRemoverPrompt }),

      setOutlineCreationPrompt: (prompt) => set({ outlineCreationPrompt: prompt }),

      resetOutlineCreationPrompt: () => set({ outlineCreationPrompt: defaultOutlineCreationPrompt }),

      setOutlineAssessmentPrompt: (prompt) => set({ outlineAssessmentPrompt: prompt }),

      resetOutlineAssessmentPrompt: () => set({ outlineAssessmentPrompt: defaultOutlineAssessmentPrompt }),



      setWorksDirectory: (dir) => set({ worksDirectory: dir }),
      setArticleType: (type) => set({ articleType: type }),
    }),
    {
      name: 'museai-settings-storage',
      version: 2,
      partialize: (state) => {
        const { worksDirectory: _, ...rest } = state;
        return rest as SettingsState;
      },
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<SettingsState>;
        const base = {
          ...state,
          deAiDetectorPrompt: !state.deAiDetectorPrompt || state.deAiDetectorPrompt === legacyDeAiDetectorPrompt
            ? defaultDeAiDetectorPrompt
            : state.deAiDetectorPrompt,
          deAiRemoverPrompt: !state.deAiRemoverPrompt || state.deAiRemoverPrompt === legacyDeAiRemoverPrompt
            ? defaultDeAiRemoverPrompt
            : state.deAiRemoverPrompt,
        };
        if (version < 2) {
          return { ...base, worksDirectory: null };
        }
        return base;
      },
    }
  )
);
