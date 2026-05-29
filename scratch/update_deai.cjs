const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/pages/DeAi.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Remove autoLoop from store destructuring and add selectedHistoricalVersions
content = content.replace(/    isAutoLooping,\n    setIsAutoLooping,\n    autoLoopCount,\n    setAutoLoopCount,\n/g, '    selectedHistoricalVersions,\n    setSelectedHistoricalVersions,\n');

// 2. Add isDetectorOpen & isRemoverSettingsOpen
content = content.replace(
  '  const [isDetectorSettingsOpen, setIsDetectorSettingsOpen] = useState(false);',
  '  const [isDetectorSettingsOpen, setIsDetectorSettingsOpen] = useState(false);\n  const [isDetectorOpen, setIsDetectorOpen] = useState(false);\n  const [isRemoverSettingsOpen, setIsRemoverSettingsOpen] = useState(false);'
);

// 3. Remove useEffect for isAutoLooping
content = content.replace(/  useEffect\(\(\) => \{\n    if \(isAutoLooping[\s\S]*?  \}, \[isAutoLooping, detectorRunning, removerRunning, autoLoopCount, aiScore, detectorReferenceText\]\);\n/g, '');

// 4. Update buildRecentSuggestionText to handle selectedHistoricalVersions
// Wait, buildRecentSuggestionText is used by handleDetectorBeforeStart and handleRemoverBeforeStart.
// Let's change the remover prompt logic inside handleRemoverBeforeStart.

// Replace handleDetectorDone isAutoLooping logic
content = content.replace(/    if \(isAutoLooping && parsedSuggestion[\s\S]*?setIsAutoLooping\(false\);\n    \}\n    \n    detectorTargetVersionIdRef\.current = null;/g, '    detectorTargetVersionIdRef.current = null;');

// Replace handleRemoverDone isAutoLooping logic
content = content.replace(/  const handleRemoverDone = \(_message: string\) => \{\n    if \(isAutoLooping\) \{\n      setAutoLoopCount\(autoLoopCount \+ 1\);\n    \}\n    setRemoverInput\(undefined\);\n  \};\n/g, '  const handleRemoverDone = (_message: string) => {\n    setRemoverInput(undefined);\n  };\n');

// Remove handleStartAutoLoop and handleStopAutoLoop
content = content.replace(/  const handleStartAutoLoop = \(\) => \{[\s\S]*?  const handleStopAutoLoop = \(\) => \{\n    setIsAutoLooping\(false\);\n  \};\n/g, '');

// Update handleRemoverBeforeStart to use custom modal with cards
const handleRemoverBeforeStartNew = `  const handleRemoverBeforeStart = async () => {
    if (!selectedWorkFile) return;
    const confirmedSuggestion = persistedSuggestion;
    if (!confirmedSuggestion) return;
    
    const latestVersions = await refreshVersions(activeVersionId);
    
    // Filter out history suggestions based on selectedHistoricalVersions
    const historySuggestions = latestVersions
      .filter(v => v.suggestion?.trim() && v.suggestion.trim() !== confirmedSuggestion.trim() && selectedHistoricalVersions.includes(v.id))
      .sort((a, b) => b.timestamp - a.timestamp);
      
    const confirmed = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '确认使用以下修改建议？',
        width: 800,
        content: (
          <div className="de-ai-remover-confirm-content" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ padding: 16, background: '#faf9f5', borderRadius: 8, border: '1px solid #e8e8e8' }}>
              <Typography.Text strong>本次优化建议：</Typography.Text>
              <div style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto' }}>
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                  {confirmedSuggestion}
                </Typography.Paragraph>
              </div>
            </div>
            {historySuggestions.length > 0 && (
              <div style={{ padding: 16, background: '#faf9f5', borderRadius: 8, border: '1px solid #e8e8e8' }}>
                <Typography.Text strong>带上的历史版本建议：</Typography.Text>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {historySuggestions.map((v, i) => (
                    <div key={v.id} style={{ padding: 12, background: '#fff', borderRadius: 4, border: '1px solid #f0f0f0' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>版本 {new Date(v.timestamp).toLocaleString()}</Typography.Text>
                      <div style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                          {v.suggestion!.trim()}
                        </Typography.Paragraph>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ),
        okText: '开始任务',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;

    try {
      let recentSuggestionText = '';
      if (historySuggestions.length > 0) {
        recentSuggestionText = historySuggestions.map((v, i) => \`\${i + 1}. 版本 \${new Date(v.timestamp).toLocaleString()}：\\n\${v.suggestion!.trim()}\`).join('\\n\\n');
      }
      
      const newVersion: any = await invoke('create_file_version', { path: selectedWorkFile });
      setVersions([newVersion, ...latestVersions]);
      setActiveVersionId(newVersion.id);
      syncActiveVersionResult(newVersion);
      const newVersionPath = getVersionPath(selectedWorkFile, newVersion.id);
      
      let promptContent = \`请根据以下修改意见，直接修改作品 \${newVersionPath}，降低AI味：\\n\${confirmedSuggestion}\`;
      if (recentSuggestionText) {
        promptContent += \`\\n\\n近3次该文章检测AI味Agent给出的修改建议（含所有版本，不含本次建议），请作为本次改写的避坑参考，防止重复出现旧问题：\\n\${recentSuggestionText}\`;
      }
      promptContent += \`\\n\\n只能修改这个文件：\${newVersionPath}\`;
      
      return {
        content: promptContent,
        allowedWritePaths: [newVersionPath],
      };
    } catch (e) {
      message.error(\`创建新版本失败: \${e}\`);
      throw e;
    }
  };`;

content = content.replace(/  const handleRemoverBeforeStart = async \(\) => \{[\s\S]*?    \} catch \(e\) \{\n      message\.error\(`创建新版本失败: \$\{e\}`\);\n      throw e;\n    \}\n  \};\n/g, handleRemoverBeforeStartNew + '\n');

// Toolbar replacements
const toolbarReplacement = `          {selectedWorkFile ? (
            <div className="de-ai-editor-toolbar__primary">
              <Button
                type={isDetectorOpen ? "default" : "primary"}
                icon={<CheckCircleOutlined />}
                onClick={() => setIsDetectorOpen(!isDetectorOpen)}
                style={{
                  background: isDetectorOpen ? '#fff' : '#d97757',
                  color: isDetectorOpen ? '#333' : '#fff',
                  border: isDetectorOpen ? '1px solid #d9d9d9' : 'none',
                  boxShadow: isDetectorOpen ? 'none' : '0 4px 12px rgba(217, 119, 87, 0.2)'
                }}
              >
                AI浓度检测
              </Button>
            </div>
          ) : <span />}`;

content = content.replace(/          \{selectedWorkFile \? \(\n            <div className="de-ai-editor-toolbar__primary">[\s\S]*?            <\/div>\n          \) : <span \/>\}/, toolbarReplacement);

// Agent replacements (Move detector below markdown editor, and keep remover on the right)
// The right panel starts with `<div style={{ width: agentWidth, minWidth: agentWidth...`
const agentReplacement = `
          {isDetectorOpen && (
            <div style={{ height: 350, borderTop: '1px solid #e8e8e8', background: '#fff' }}>
              <DeAiAgentChat 
                title="检测AI味 Agent"
                agentId="detector"
                systemPrompt={deAiDetectorPrompt}
                allowedTools={['read', 'grep', 'glob']}
                startContent={detectorStartContent}
                onBeforeStart={handleDetectorBeforeStart}
                startDisabled={!selectedWorkFile}
                footerLeft={
                  <Button
                    aria-label="选择检测范文"
                    className="de-ai-agent-settings-button"
                    icon={<SettingOutlined />}
                    onClick={() => setIsDetectorSettingsOpen(true)}
                    shape="circle"
                    title="选择检测范文"
                    type={selectedDetectorReferences.length > 0 ? 'primary' : 'default'}
                  />
                }
                messages={detectorMessages}
                setMessages={setDetectorMessages}
                activeRun={detectorRun}
                setActiveRun={setDetectorRun}
                onRunningChange={setDetectorRunning}
                isRunning={detectorRunning}
                autoTriggerContent={detectorInput}
                onDone={handleDetectorDone}
              />
            </div>
          )}
        </div>
      </div>
      <div style={{ width: agentWidth, minWidth: agentWidth, borderLeft: '1px solid rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: '#fff' }}>
        <div
          aria-label="调整 Agent 宽度"
          aria-orientation="vertical"
          role="separator"
          onMouseDown={() => setIsResizingAgent(true)}
          style={{
            position: 'absolute',
            top: 0,
            left: -3,
            width: 6,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 2,
          }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DeAiAgentChat 
            title="去除AI味 Agent"
            agentId="remover"
            systemPrompt={deAiRemoverPrompt}
            allowedTools={['read', 'edit', 'write']}
            startContent={removerStartContent}
            onBeforeStart={handleRemoverBeforeStart}
            startDisabled={!selectedWorkFile || !persistedSuggestion}
            onStartBlocked={() => {
              message.warning('请先完成AI味检测，获得修改意见后再启动去除AI味Agent');
            }}
            footerLeft={
              <Button
                aria-label="Agent 设置"
                className="de-ai-agent-settings-button"
                icon={<SettingOutlined />}
                onClick={() => setIsRemoverSettingsOpen(true)}
                shape="circle"
                title="Agent 设置"
                type={selectedHistoricalVersions.length > 0 ? 'primary' : 'default'}
              />
            }
            messages={removerMessages}
            setMessages={setRemoverMessages}
            activeRun={removerRun}
            setActiveRun={setRemoverRun}
            onRunningChange={setRemoverRunning}
            isRunning={removerRunning}
            autoTriggerContent={removerInput}
            onDone={handleRemoverDone}
          />
        </div>
      </div>
`;

content = content.replace(/        <\/div>\n      <\/div>\n      <div style={{ width: agentWidth, minWidth: agentWidth, borderLeft: '1px solid rgba\(0, 0, 0, 0\.04\)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>[\s\S]*?      <\/div>\n    <\/div>/, agentReplacement + '    </div>');

// CheckCircleOutlined might need to be imported
if (!content.includes('CheckCircleOutlined')) {
  content = content.replace(/import \{ DeleteOutlined, PlayCircleOutlined, SettingOutlined, StopOutlined \} from '@ant-design\/icons';/, "import { DeleteOutlined, PlayCircleOutlined, SettingOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';");
}

// Add Remover Settings Modal
const removerSettingsModal = `
      <Modal
        title="选择带上的历史版本检测AI味建议"
        open={isRemoverSettingsOpen}
        okText="确定"
        cancelText="取消"
        width={500}
        onCancel={() => setIsRemoverSettingsOpen(false)}
        onOk={() => setIsRemoverSettingsOpen(false)}
      >
        <div className="de-ai-reference-picker" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {versions.filter(v => v.suggestion?.trim()).length > 0 ? (
            <Tree
              blockNode
              checkable
              checkedKeys={selectedHistoricalVersions}
              onCheck={(checkedKeys) => {
                const keys = Array.isArray(checkedKeys) ? checkedKeys : checkedKeys.checked;
                setSelectedHistoricalVersions(keys.map(String));
              }}
              selectable={false}
              treeData={versions.filter(v => v.suggestion?.trim()).map((v) => ({
                title: \`版本 \${new Date(v.timestamp).toLocaleString()}\`,
                key: v.id,
              }))}
            />
          ) : (
            <Empty description="暂无可用的历史版本建议" />
          )}
        </div>
      </Modal>
`;

content = content.replace('      <Modal\n        title="选择检测范文"', removerSettingsModal + '      <Modal\n        title="选择检测范文"');

fs.writeFileSync(file, content);
console.log('Update complete.');
