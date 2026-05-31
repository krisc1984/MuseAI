import { describe, it, expect } from 'vitest';
import {
  defaultSystemPrompt,
  defaultDeAiDetectorPrompt,
  defaultDeAiRemoverPrompt,
  defaultWorkSummaryPrompt,
  defaultOutlineCreationPrompt,
  defaultOutlineAssessmentPrompt,
  defaultPartnerChatPrompt,
  defaultStoryAgentPrompt,
} from '../stores/useSettingsStore';

describe('Settings store default exports', () => {
  it('defaultSystemPrompt should contain Chinese writing instructions', () => {
    expect(defaultSystemPrompt).toContain('你是一名有着20年网文写作经验的资深网文作者');
    expect(defaultSystemPrompt).toContain('请始终使用中文回复');
  });

  it('defaultDeAiDetectorPrompt should contain scoring criteria', () => {
    expect(defaultDeAiDetectorPrompt).toContain('可预测的节奏');
    expect(defaultDeAiDetectorPrompt).toContain('功能性用词');
    expect(defaultDeAiDetectorPrompt).toContain('机械式写作');
  });

  it('defaultDeAiRemoverPrompt should contain editing instructions', () => {
    expect(defaultDeAiRemoverPrompt).toContain('AI味');
    expect(defaultDeAiRemoverPrompt).toContain('禁用词和句型');
  });

  it('defaultWorkSummaryPrompt should contain summary requirements', () => {
    expect(defaultWorkSummaryPrompt).toContain('总结关键人物');
    expect(defaultWorkSummaryPrompt).toContain('分章节剧情总结');
  });

  it('defaultOutlineCreationPrompt should contain outline structure', () => {
    expect(defaultOutlineCreationPrompt).toContain('短篇小说大纲的一般结构');
    expect(defaultOutlineCreationPrompt).toContain('长篇小说大纲的一般结构');
  });

  it('defaultOutlineAssessmentPrompt should contain scoring dimensions', () => {
    expect(defaultOutlineAssessmentPrompt).toContain('引流能力');
    expect(defaultOutlineAssessmentPrompt).toContain('开局钩子');
    expect(defaultOutlineAssessmentPrompt).toContain('设定新鲜感');
  });

  it('defaultPartnerChatPrompt should contain roleplay constraints', () => {
    expect(defaultPartnerChatPrompt).toContain('严格扮演角色');
    expect(defaultPartnerChatPrompt).toContain('口语化与对话感');
  });

  it('defaultStoryAgentPrompt should contain DM narrative constraints', () => {
    expect(defaultStoryAgentPrompt).toContain('沉浸式叙事');
    expect(defaultStoryAgentPrompt).toContain('绝不代替用户角色做决定');
  });
});
