import { TAB_USER, TAB_WORLDBOOK } from '../constants.js';

const GENERIC_USER_LABEL = '用户';

function toText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function toField(label, value) {
    return `${label}：${toText(value)}`;
}

function buildCharacterNameLine(name) {
    return toText(name) || '由你命名';
}

function buildCharacterPrompt(input) {
    return `## 创作任务

角色方向：${toText(input.concept)}
角色名：${buildCharacterNameLine(input.name)}

---

### name
${toText(input.name)
        ? '严格使用输入中的角色名，不要改字。'
        : '为这个角色命名，命名后所有字段统一使用该名字。'}

### personality
用1-2句话概括角色的核心气质与性格本质，写给 AI 看，不是卡面文案。抓最底层的心理特征，不写表面标签。

### description
按以下八个模块顺序书写，每个模块标题加方括号，每个模块必须有实质内容。

八个模块是同一个人的横截面，不是八道填空题——[内在冲突]必须能解释[惯常反应]，[惯常反应]必须能解释[说话风格]里的例句，三者之间没有明显因果就重写。

[人物底色]
性别、年龄、体型轮廓。外貌只抓最具辨识度的1-2个特征。

[当下处境]
角色现在是谁、在哪、处于什么状态。写当下，不写履历。

[内在冲突]
角色真正缺什么，因此追求什么、抓住什么、回避什么。这是一切行为的根源。

[惯常反应]
面对亲近、威胁、失控、嫉妒时，角色具体会怎么做。写行为，不写形容词。

[关系结构]
角色如何看待${GENERIC_USER_LABEL}，初始态度，哪些行为让他靠近或退缩，突破戒备需要经历什么。

[说话风格]
句子节奏、常用句式、情绪激动时的变化、沉默的时机。附2-3个典型例句。

[禁区]
哪些话题或行为会触发强烈反应，触发后角色具体怎么处理。

[悬而未决]
写3件当下正在发生的具体事，每件事都可能因${GENERIC_USER_LABEL}的某个行为而改变走向。不写抽象悬念，写有进度条的麻烦或牵挂。

### greetings
共5条开场白，输出为字符串数组。

所有开场白遵守同一套格式标准：
- 场景直接展开，不以对白或自我介绍开场
- 叙事段落只写可以被看见的动作和环境，不写角色内心独白
- 对白用「」包裹，占比约40%，动作与对白交替
- 300字以上
- 把${GENERIC_USER_LABEL}自然带入关系张力中，体现角色说话风格

5条场景与情绪基调严格对应以下指定，不可互换：
第1条：初次相遇。两人刚认识，关系陌生或带有试探，气氛中有轻微戒备与好奇。
第2条：热恋约会。关系已进展，两人独处，有亲近和轻松，但角色性格的棱角仍在。
第3条：夜晚暧昧。场景在深夜，情绪克制而暗涌，张力来自说了什么和没说什么之间。
第4条：裂缝时刻。两人之间出现了某个小摩擦或误解，气氛微妙，谁都没有挑明。
第5条：日常切片。普通的某一天，没有戏剧冲突，但角色的存在感和细节让场景有重量。

### mes_example
至少3条，输出为字符串数组。每条是双方完整往返对话，至少2轮。
用户发言以「[用户]:」开头，角色发言以「[角色]:」开头。
每条体现角色稳定的说话风格、关系张力或边界反应，组间不大量重叠，不与任何开场白大量重复。

### creator_notes
一句话，写给使用者的卡面备注。

## 禁止
- 不写悬浮宏大世界观，只写对对话有用的设定
- 不写霸总腔、病娇流水线、日系中二独白
- 各字段之间不大量互相复述
- mes_example 必须是可读的双方对话，不能写成设定说明`;
}

function buildCharacterContext(input) {
    return `## 当前角色卡

${toField('角色名', input.characterName)}
${toField('性格（personality）', input.characterPersonality)}
${toField('角色描述（description）', input.characterDescription)}
${toField('第一条消息（first_mes）', input.firstMessage)}
${toField('创作者注释（creator_notes）', input.creatorNotes)}
${toField('当前世界书', input.worldName || '未绑定')}
${toField('补充要求', input.worldbookPrompt || '无')}`;
}

function buildWorldbookPrompt(input) {
    return `${buildCharacterContext(input)}

---

## 补充要求

${toText(input.worldbookPrompt) || '无'}

---

## 生成任务

基于以上角色卡，生成 world_book_entries。补充要求若与下方默认规则冲突，以补充要求为准。

### 条目数量与分工
至少7条，覆盖以下6个维度，每个维度至少1条，维度之间不能互相大量复述：

1. 两人关系的基本框架：角色与${GENERIC_USER_LABEL}当前处于什么关系节点，角色对${GENERIC_USER_LABEL}的基本态度和核心行为模式。此条通常需要设为 constant: true。
2. 角色的核心场域：角色日常活动的主要空间、该空间的规则或压力，以及这些如何具体塑造角色行为。
3. 角色的持续性事件：当前正在发生、尚未结束、会因${GENERIC_USER_LABEL}行为而改变走向的具体麻烦或牵挂。每件事单独一条。
4. 重要配角或冲突源：对角色构成压力、威胁或情感纠葛的人。角色卡中有明确人物时直接使用；没有明确人物时，从角色卡已知的处境中提取或合理推导一个具体的人，写清楚他们与角色的关系以及可能引发的对话走向。此维度不可跳过。
5. 角色的触发反应模式：在什么具体情境下角色会出现强烈的情绪或行为变化，变化的具体表现是什么。
6. 关系推进节点：${GENERIC_USER_LABEL}做出哪些具体行为会让角色与${GENERIC_USER_LABEL}的关系发生实质性变化，以及变化后角色态度的具体表现。

### 字段填写规则

**keys**
2-6个主触发关键词。设计原则：填「用户在聊天里自然说出来的词」，而不是「这条设定的主题词」。比如描述脚踝旧伤的条目，keys 应该是「比赛、选拔、训练、跑步、受伤」，而不是「旧伤、脚踝」。中文关键词尽量简短（2-4字），覆盖口语变体。

**secondary_keys**
用作 AND 过滤，只填「必须同时出现、才能精准区分触发场景」的词。判断标准：如果只靠 keys 里的词就已经足够精准，留空数组。如果 keys 太宽泛容易误触发，才在这里加收窄条件。不要把 keys 的同义词或近义词塞进来。

**constant**
两类条目的本质区别：
- constant: true → 无论聊什么话题、有没有关键词出现，缺了这条 content AI 都会立刻演错角色。适合「两人关系的基本框架」这类前提性设定。true 的条目最多1-2条，因为它始终占用 token 预算。
- constant: false → 只在特定情境下才需要激活的细节，平时不需要占用上下文。绝大多数条目属于此类。
判断方式：把这条 content 从 prompt 里拿掉，AI 在任意一段对话里会不会立刻演错角色？会→true，不会→false。

**content**
这是唯一会进入 prompt 的字段，每条不超过150字。

写法标准是「行为指令」而不是「设定描述」。区别在于：设定描述告诉 AI「角色是什么」，行为指令告诉 AI「在这个情境下角色会做什么、说什么、怎么反应」。

✗ 错误示范——设定描述体：
「梁明月有脚踝旧伤，她不想让别人知道，受伤后会转移话题。」

✓ 正确示范——行为指令体：
「梁明月脚踝正隐隐作痛，她不会主动提起。训练强度被提及、或${GENERIC_USER_LABEL}注意到她动作异常时，她会下意识按压脚踝再迅速放开，随即用更大声的话题盖过去。如果被直接追问，她先摇头否认，犹豫片刻后用『反正没事』敷衍收尾，眼神会短暂飘开。」

额外检查：content 里不能出现纯粹的事实陈述句而没有触发时机。每一个行为描述前面都应该能看到「当……时」「一旦……」「如果……」这类触发条件。

检查标准：这条 content 进入 prompt 后，AI 的下一句回复应该能感受到它的存在。如果感受不到，重写。

## 禁止
- content 不能是角色卡原文的复制粘贴，必须转化为行为指令
- content 不能只写事实陈述，每个行为必须带触发条件
- 不同条目不能只是同一设定换说法
- secondary_keys 不能是 keys 的同义词或近义词重复
- 维度4不可跳过，角色卡没有明确配角时必须从已知处境中推导
- comment 只写一眼能看懂的内容标题（如「房东逼租危机」「紫檀木戒指」），不写「维度1：」「维度2：」这类结构标注`;
}

function buildUserPrompt(input) {
    return `## 当前角色卡

${toField('角色名', input.characterName)}
${toField('性格（personality）', input.characterPersonality)}
${toField('角色描述（description）', input.characterDescription)}
${toField('第一条消息（first_mes）', input.firstMessage)}

---

## 用户输入

${toField('用户名', input.userName)}
${toField('用户方向', input.userDescription)}

---

## 生成任务

只生成 user_persona，格式固定为以下两个模块：

[身份与处境]
用户现在是谁、在哪、处于什么状态。写当下，不写履历。2-4句话，只交代能影响两人相处的基本前提。

[与角色相关的气质]
用户身上有什么特质，会让角色产生反应——可能是吸引，可能是戒备，可能是误判。不写性格定论，只写气质方向和模糊轮廓，给扮演者留足空间。2-3句话。

## 写作要求
- 两个模块加起来不超过150字
- 只写会影响角色行为的信息，其余一律省略
- 不规定用户的说话方式、行为习惯、情绪反应
- 不写「用户会怎么做」，只写「用户大概是什么样的人」
- 留白比填满更重要`;
}

export function buildGenerationPrompt(mode, input) {
    if (mode === TAB_WORLDBOOK) {
        return buildWorldbookPrompt(input);
    }
    if (mode === TAB_USER) {
        return buildUserPrompt(input);
    }
    return buildCharacterPrompt(input);
}
